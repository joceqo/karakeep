import { and, eq, sql } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import cron from "node-cron";
import { buildImpersonatingTRPCClient } from "trpc";
import { withWorkerTracing } from "workerTracing";

import type { ZGithubSyncRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  bookmarkLinks,
  bookmarks,
  bookmarkTags,
  githubActivityEvents,
  githubRepoMeta,
  githubSyncState,
  githubWatchedRepos,
  tagsOnBookmarks,
  users,
} from "@karakeep/db/schema";
import {
  extractFirstReadmeImage,
  fetchRepoEvents,
  fetchRepoReadme,
  fetchStarredPage,
  getGithubToken,
  GithubApiError,
  GithubSyncQueue,
  isRelevantEvent,
  QuotaService,
  summarizeEvent,
  zGithubSyncRequestSchema,
} from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const STARS_PAGE_SIZE = 100;
// Safety cap: stop after this many pages in one run so the worker can yield
// and another run picks up the rest. README fetch + DB writes are the slow
// part (~500ms/star), so 2 pages (~100s) fits comfortably under the 120s
// worker timeout.
const MAX_STARS_PAGES_PER_RUN = 2;
// Time budget per run in ms (used in addition to the page cap).
const STARS_RUN_BUDGET_MS = 80_000;

async function upsertSyncState(
  userId: string,
  update: Partial<typeof githubSyncState.$inferInsert>,
) {
  await db
    .insert(githubSyncState)
    .values({ userId, ...update })
    .onConflictDoUpdate({
      target: githubSyncState.userId,
      set: update,
    });
}

async function syncStars(userId: string, jobId: string) {
  const tokenInfo = await getGithubToken(userId);
  if (!tokenInfo) {
    logger.warn(
      `[github][${jobId}] No GitHub token for user ${userId}; skipping stars sync`,
    );
    await upsertSyncState(userId, {
      starsSyncStatus: "failure",
      starsSyncError: "No GitHub token available",
      lastStarsSyncAt: new Date(),
    });
    return;
  }

  const prevState = await db.query.githubSyncState.findFirst({
    where: eq(githubSyncState.userId, userId),
  });
  const startPage = Math.max(
    1,
    parseInt(prevState?.lastStarsCursor ?? "1", 10) || 1,
  );
  const runStartMs = Date.now();

  await upsertSyncState(userId, {
    starsSyncStatus: "running",
    starsSyncError: null,
  });

  const trpc = await buildImpersonatingTRPCClient(userId);
  let page = startPage;
  let pagesThisRun = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let done = false;

  try {
    while (pagesThisRun < MAX_STARS_PAGES_PER_RUN) {
      if (Date.now() - runStartMs > STARS_RUN_BUDGET_MS) {
        logger.info(
          `[github][${jobId}] Time budget reached at page ${page}; will resume in next run`,
        );
        break;
      }
      const quotaResult = await QuotaService.canCreateBookmark(db, userId);
      if (!quotaResult.result) {
        logger.info(
          `[github][${jobId}] User ${userId} hit bookmark quota, stopping stars sync`,
        );
        break;
      }
      const stars = await fetchStarredPage(
        tokenInfo.token,
        page,
        STARS_PAGE_SIZE,
      );
      if (stars.length === 0) break;

      logger.info(
        `[github][${jobId}] Fetched page ${page} (${stars.length} stars) for user ${userId}`,
      );

      for (const star of stars) {
        try {
          const repo = star.repo;
          const starredAt = new Date(star.starred_at);
          const result = await trpc.bookmarks.createBookmark({
            type: BookmarkTypes.LINK,
            url: repo.html_url,
            title: repo.full_name,
            source: "github",
            createdAt: starredAt,
          });
          if (result.alreadyExists) {
            totalSkipped++;
          } else {
            totalCreated++;
          }
          const readmeMd = await fetchRepoReadme(
            tokenInfo.token,
            repo.owner.login,
            repo.name,
          );
          const readmeImage = readmeMd
            ? extractFirstReadmeImage(readmeMd, repo.owner.login, repo.name)
            : null;
          await db
            .update(bookmarkLinks)
            .set({
              title: repo.full_name,
              description: repo.description,
              author: repo.owner.login,
              publisher: "GitHub",
              imageUrl: readmeImage ?? repo.owner.avatar_url,
              favicon: "https://github.com/favicon.ico",
              datePublished: new Date(repo.updated_at),
              crawledAt: new Date(),
              crawlStatus: "success",
              crawlStatusCode: 200,
            })
            .where(eq(bookmarkLinks.id, result.id));
          await db
            .update(bookmarks)
            .set({ taggingStatus: "success", summarizationStatus: "success" })
            .where(eq(bookmarks.id, result.id));
          const metaValues = {
            bookmarkId: result.id,
            githubId: repo.id,
            owner: repo.owner.login,
            repo: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            homepage: repo.homepage,
            language: repo.language,
            topics: repo.topics ? JSON.stringify(repo.topics) : null,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            openIssues: 0,
            archived: repo.archived,
            fork: repo.fork,
            pushedAt: new Date(repo.pushed_at),
            repoUpdatedAt: new Date(repo.updated_at),
            starredAt,
            syncedAt: new Date(),
          };
          await db
            .insert(githubRepoMeta)
            .values(metaValues)
            .onConflictDoUpdate({
              target: githubRepoMeta.bookmarkId,
              set: metaValues,
            });
          const tagNames = [
            ...(repo.topics ?? []),
            ...(repo.language ? [repo.language.toLowerCase()] : []),
          ].slice(0, 20);
          for (const name of tagNames) {
            const [tag] = await db
              .insert(bookmarkTags)
              .values({ userId, name })
              .onConflictDoUpdate({
                target: [bookmarkTags.userId, bookmarkTags.name],
                set: { name },
              })
              .returning({ id: bookmarkTags.id });
            if (tag) {
              await db
                .insert(tagsOnBookmarks)
                .values({
                  bookmarkId: result.id,
                  tagId: tag.id,
                  attachedBy: "ai",
                })
                .onConflictDoNothing();
            }
          }
        } catch (err) {
          logger.warn(
            `[github][${jobId}] Failed to create bookmark for ${star.repo.full_name}: ${err}`,
          );
        }
      }

      pagesThisRun++;
      if (stars.length < STARS_PAGE_SIZE) {
        done = true;
        break;
      }
      page++;
    }

    if (done) {
      await upsertSyncState(userId, {
        starsSyncStatus: "success",
        starsSyncError: null,
        lastStarsSyncAt: new Date(),
        lastStarsCursor: null,
      });
      logger.info(
        `[github][${jobId}] Stars sync complete: created=${totalCreated} skipped=${totalSkipped} (final page ${page})`,
      );
    } else {
      const nextPage = page + 1;
      await upsertSyncState(userId, {
        starsSyncStatus: "running",
        starsSyncError: null,
        lastStarsSyncAt: new Date(),
        lastStarsCursor: String(nextPage),
      });
      await GithubSyncQueue.enqueue(
        { kind: "stars", userId },
        {
          groupId: userId,
          idempotencyKey: `github-stars-${userId}-resume-${nextPage}`,
        },
      );
      logger.info(
        `[github][${jobId}] Stars sync chunk done: created=${totalCreated} skipped=${totalSkipped}; next page ${nextPage} enqueued`,
      );
    }
  } catch (err) {
    const msg =
      err instanceof GithubApiError
        ? `GitHub API error ${err.status}: ${err.message}`
        : String(err);
    await upsertSyncState(userId, {
      starsSyncStatus: "failure",
      starsSyncError: msg,
      lastStarsSyncAt: new Date(),
    });
    throw err;
  }
}

async function syncActivity(
  userId: string,
  jobId: string,
  specificRepoId?: string,
) {
  const tokenInfo = await getGithubToken(userId);
  if (!tokenInfo) {
    logger.warn(
      `[github][${jobId}] No GitHub token for user ${userId}; skipping activity sync`,
    );
    return;
  }

  const repos = await db.query.githubWatchedRepos.findMany({
    where: specificRepoId
      ? and(
          eq(githubWatchedRepos.userId, userId),
          eq(githubWatchedRepos.id, specificRepoId),
        )
      : eq(githubWatchedRepos.userId, userId),
  });

  if (repos.length === 0) {
    logger.info(
      `[github][${jobId}] User ${userId} has no watched repos; skipping activity sync`,
    );
    return;
  }

  let totalInserted = 0;
  for (const repo of repos) {
    try {
      const events = await fetchRepoEvents(
        tokenInfo.token,
        repo.owner,
        repo.repo,
      );
      const relevantEvents = events.filter((e) => isRelevantEvent(e.type));
      if (relevantEvents.length === 0) {
        await db
          .update(githubWatchedRepos)
          .set({ lastFetchedAt: new Date() })
          .where(eq(githubWatchedRepos.id, repo.id));
        continue;
      }
      const values = relevantEvents.map((e) => {
        const summary = summarizeEvent(e);
        return {
          userId,
          watchedRepoId: repo.id,
          githubEventId: e.id,
          eventType: e.type,
          owner: repo.owner,
          repo: repo.repo,
          actor: e.actor.login,
          actorAvatarUrl: e.actor.avatar_url,
          title: summary.title,
          url: summary.url,
          payload: JSON.stringify(e.payload).slice(0, 10_000),
          occurredAt: new Date(e.created_at),
        };
      });
      const inserted = await db
        .insert(githubActivityEvents)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: githubActivityEvents.id });
      totalInserted += inserted.length;
      await db
        .update(githubWatchedRepos)
        .set({ lastFetchedAt: new Date() })
        .where(eq(githubWatchedRepos.id, repo.id));
    } catch (err) {
      logger.warn(
        `[github][${jobId}] Failed to fetch events for ${repo.owner}/${repo.repo}: ${err}`,
      );
    }
  }

  await upsertSyncState(userId, {
    lastActivitySyncAt: new Date(),
  });
  logger.info(
    `[github][${jobId}] Activity sync for user ${userId}: inserted ${totalInserted} new events across ${repos.length} repos`,
  );
}

async function run(req: DequeuedJob<ZGithubSyncRequest>) {
  const jobId = req.id;
  const parsed = zGithubSyncRequestSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new Error(
      `[github][${jobId}] Malformed job: ${parsed.error.toString()}`,
    );
  }
  if (parsed.data.kind === "stars") {
    await syncStars(parsed.data.userId, jobId);
  } else {
    await syncActivity(parsed.data.userId, jobId, parsed.data.watchedRepoId);
  }
}

export class GithubSyncWorker {
  static async build() {
    logger.info("Starting github sync worker ...");
    const worker = (await getQueueClient())!.createRunner<ZGithubSyncRequest>(
      GithubSyncQueue,
      {
        run: withWorkerTracing("githubWorker.run", run),
        onComplete: (job) => {
          workerStatsCounter.labels("github", "completed").inc();
          logger.info(`[github][${job.id}] Completed successfully`);
          return Promise.resolve();
        },
        onError: (job) => {
          workerStatsCounter.labels("github", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("github", "failed_permanent").inc();
          }
          logger.error(
            `[github][${job.id}] github sync job failed: ${job.error}\n${job.error.stack}`,
          );
          return Promise.resolve();
        },
      },
      {
        concurrency: 1,
        pollIntervalMs: 1000,
        timeoutSecs: 120,
      },
    );
    return worker;
  }
}

export const GithubActivitySchedulingWorker = cron.schedule(
  "*/30 * * * *",
  () => {
    logger.info("[github] Scheduling activity refresh jobs ...");
    db.select({
      userId: sql<string>`DISTINCT ${githubWatchedRepos.userId}`,
    })
      .from(githubWatchedRepos)
      .leftJoin(users, eq(users.id, githubWatchedRepos.userId))
      .then((rows) => {
        for (const row of rows) {
          if (!row.userId) continue;
          GithubSyncQueue.enqueue(
            { kind: "activity", userId: row.userId },
            {
              idempotencyKey: `github-activity-${row.userId}-${
                Math.floor(Date.now() / 1000 / 60 / 30) // 30-minute windows
              }`,
              groupId: row.userId,
            },
          );
        }
      });
  },
  {
    runOnInit: false,
    scheduled: false,
  },
);

import { and, eq, sql } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import cron from "node-cron";
import { buildImpersonatingTRPCClient } from "trpc";
import { withWorkerTracing } from "workerTracing";

import type { ZGithubSyncRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  githubActivityEvents,
  githubSyncState,
  githubWatchedRepos,
  users,
} from "@karakeep/db/schema";
import {
  fetchRepoEvents,
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
const MAX_STARS_PAGES_PER_RUN = 10;

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

  await upsertSyncState(userId, {
    starsSyncStatus: "running",
    starsSyncError: null,
  });

  const trpc = await buildImpersonatingTRPCClient(userId);
  let page = 1;
  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    while (page <= MAX_STARS_PAGES_PER_RUN) {
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
          const result = await trpc.bookmarks.createBookmark({
            type: BookmarkTypes.LINK,
            url: repo.html_url,
            title: repo.full_name,
            source: "github",
          });
          if (result.alreadyExists) {
            totalSkipped++;
          } else {
            totalCreated++;
          }
        } catch (err) {
          logger.warn(
            `[github][${jobId}] Failed to create bookmark for ${star.repo.full_name}: ${err}`,
          );
        }
      }

      if (stars.length < STARS_PAGE_SIZE) break;
      page++;
    }

    await upsertSyncState(userId, {
      starsSyncStatus: "success",
      starsSyncError: null,
      lastStarsSyncAt: new Date(),
    });
    logger.info(
      `[github][${jobId}] Stars sync for user ${userId} complete: created=${totalCreated} skipped=${totalSkipped}`,
    );
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

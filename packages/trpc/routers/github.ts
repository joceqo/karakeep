import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  bookmarkLinks,
  bookmarks,
  githubActivityEvents,
  githubSyncState,
  githubWatchedRepos,
} from "@karakeep/db/schema";
import {
  fetchGist,
  fetchRepoReadme,
  getGithubToken,
  searchRepos as ghSearchRepos,
  GithubApiError,
  GithubSyncQueue,
  parseGistUrl,
} from "@karakeep/shared-server";

import { authedProcedure, router } from "../index";

const zGithubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  htmlUrl: z.string(),
  stars: z.number(),
  forks: z.number(),
  language: z.string().nullable(),
  topics: z.array(z.string()).optional(),
  ownerLogin: z.string(),
  ownerAvatarUrl: z.string(),
  updatedAt: z.string(),
  archived: z.boolean(),
  fork: z.boolean(),
});

const zGistFileSchema = z.object({
  filename: z.string(),
  language: z.string().nullable(),
  content: z.string(),
  size: z.number(),
  truncated: z.boolean(),
});

const zGistSchema = z.object({
  id: z.string(),
  htmlUrl: z.string(),
  description: z.string().nullable(),
  public: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ownerLogin: z.string().nullable(),
  ownerAvatarUrl: z.string().nullable(),
  files: z.array(zGistFileSchema),
});

const zConnectionStatusSchema = z.object({
  connected: z.boolean(),
  scope: z.string().nullable(),
  starsSyncStatus: z.enum(["idle", "running", "success", "failure"]).nullable(),
  starsSyncError: z.string().nullable(),
  lastStarsSyncAt: z.date().nullable(),
  lastActivitySyncAt: z.date().nullable(),
});

async function requireGithubToken(userId: string): Promise<string> {
  const tokenInfo = await getGithubToken(userId);
  if (!tokenInfo) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "GitHub is not connected. Please sign in with GitHub via the OIDC provider.",
    });
  }
  return tokenInfo.token;
}

export const githubAppRouter = router({
  status: authedProcedure
    .output(zConnectionStatusSchema)
    .query(async ({ ctx }) => {
      const tokenInfo = await getGithubToken(ctx.user.id).catch(() => null);
      const state = await ctx.db.query.githubSyncState.findFirst({
        where: eq(githubSyncState.userId, ctx.user.id),
      });
      return {
        connected: !!tokenInfo,
        scope: tokenInfo?.scope ?? null,
        starsSyncStatus: state?.starsSyncStatus ?? null,
        starsSyncError: state?.starsSyncError ?? null,
        lastStarsSyncAt: state?.lastStarsSyncAt ?? null,
        lastActivitySyncAt: state?.lastActivitySyncAt ?? null,
      };
    }),
  syncStars: authedProcedure.mutation(async ({ ctx }) => {
    await requireGithubToken(ctx.user.id);
    await GithubSyncQueue.enqueue(
      { kind: "stars", userId: ctx.user.id },
      {
        groupId: ctx.user.id,
        idempotencyKey: `github-stars-${ctx.user.id}-${Math.floor(
          Date.now() / 1000 / 60,
        )}`,
      },
    );
    await ctx.db
      .insert(githubSyncState)
      .values({
        userId: ctx.user.id,
        starsSyncStatus: "running",
      })
      .onConflictDoUpdate({
        target: githubSyncState.userId,
        set: { starsSyncStatus: "running", starsSyncError: null },
      });
    return { enqueued: true };
  }),
  searchRepos: authedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        page: z.number().int().min(1).max(20).default(1),
      }),
    )
    .output(
      z.object({
        totalCount: z.number(),
        items: z.array(zGithubRepoSchema),
      }),
    )
    .query(async ({ ctx, input }) => {
      const token = await requireGithubToken(ctx.user.id);
      try {
        const result = await ghSearchRepos(token, input.query, input.page, 20);
        return {
          totalCount: result.total_count,
          items: result.items.map((r) => ({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            description: r.description,
            htmlUrl: r.html_url,
            stars: r.stargazers_count,
            forks: r.forks_count,
            language: r.language,
            topics: r.topics,
            ownerLogin: r.owner.login,
            ownerAvatarUrl: r.owner.avatar_url,
            updatedAt: r.updated_at,
            archived: r.archived,
            fork: r.fork,
          })),
        };
      } catch (err) {
        if (err instanceof GithubApiError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: err.message,
          });
        }
        throw err;
      }
    }),
  fetchGist: authedProcedure
    .input(
      z.object({
        gistIdOrUrl: z.string().min(1),
      }),
    )
    .output(zGistSchema)
    .query(async ({ ctx, input }) => {
      const token = await requireGithubToken(ctx.user.id);
      const parsed = parseGistUrl(input.gistIdOrUrl);
      const gistId = parsed?.gistId ?? input.gistIdOrUrl;
      try {
        const gist = await fetchGist(token, gistId);
        return {
          id: gist.id,
          htmlUrl: gist.html_url,
          description: gist.description,
          public: gist.public,
          createdAt: gist.created_at,
          updatedAt: gist.updated_at,
          ownerLogin: gist.owner?.login ?? null,
          ownerAvatarUrl: gist.owner?.avatar_url ?? null,
          files: Object.values(gist.files).map((f) => ({
            filename: f.filename,
            language: f.language,
            content: f.content ?? "",
            size: f.size,
            truncated: f.truncated ?? false,
          })),
        };
      } catch (err) {
        if (err instanceof GithubApiError) {
          throw new TRPCError({
            code: err.status === 404 ? "NOT_FOUND" : "BAD_GATEWAY",
            message: err.message,
          });
        }
        throw err;
      }
    }),
  listWatchedRepos: authedProcedure
    .output(
      z.object({
        repos: z.array(
          z.object({
            id: z.string(),
            owner: z.string(),
            repo: z.string(),
            createdAt: z.date(),
            lastFetchedAt: z.date().nullable(),
          }),
        ),
      }),
    )
    .query(async ({ ctx }) => {
      const repos = await ctx.db.query.githubWatchedRepos.findMany({
        where: eq(githubWatchedRepos.userId, ctx.user.id),
        orderBy: [desc(githubWatchedRepos.createdAt)],
      });
      return { repos };
    }),
  watchRepo: authedProcedure
    .input(
      z.object({
        owner: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z0-9_.-]+$/),
        repo: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z0-9_.-]+$/),
      }),
    )
    .output(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.githubWatchedRepos.findFirst({
        where: and(
          eq(githubWatchedRepos.userId, ctx.user.id),
          eq(githubWatchedRepos.owner, input.owner),
          eq(githubWatchedRepos.repo, input.repo),
        ),
      });
      if (existing) {
        return { id: existing.id };
      }
      const [row] = await ctx.db
        .insert(githubWatchedRepos)
        .values({
          userId: ctx.user.id,
          owner: input.owner,
          repo: input.repo,
        })
        .returning({ id: githubWatchedRepos.id });
      await GithubSyncQueue.enqueue(
        {
          kind: "activity",
          userId: ctx.user.id,
          watchedRepoId: row.id,
        },
        { groupId: ctx.user.id },
      );
      return { id: row.id };
    }),
  unwatchRepo: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(githubWatchedRepos)
        .where(
          and(
            eq(githubWatchedRepos.id, input.id),
            eq(githubWatchedRepos.userId, ctx.user.id),
          ),
        );
      return { ok: true };
    }),
  refreshActivity: authedProcedure.mutation(async ({ ctx }) => {
    await requireGithubToken(ctx.user.id);
    await GithubSyncQueue.enqueue(
      { kind: "activity", userId: ctx.user.id },
      {
        groupId: ctx.user.id,
        idempotencyKey: `github-activity-${ctx.user.id}-${Math.floor(
          Date.now() / 1000 / 60,
        )}`,
      },
    );
    return { enqueued: true };
  }),
  getActivity: authedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .output(
      z.object({
        events: z.array(
          z.object({
            id: z.string(),
            eventType: z.string(),
            owner: z.string(),
            repo: z.string(),
            actor: z.string().nullable(),
            actorAvatarUrl: z.string().nullable(),
            title: z.string().nullable(),
            url: z.string().nullable(),
            occurredAt: z.date(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      const events = await ctx.db.query.githubActivityEvents.findMany({
        where: eq(githubActivityEvents.userId, ctx.user.id),
        orderBy: [desc(githubActivityEvents.occurredAt)],
        limit: input.limit,
      });
      return {
        events: events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          owner: e.owner,
          repo: e.repo,
          actor: e.actor,
          actorAvatarUrl: e.actorAvatarUrl,
          title: e.title,
          url: e.url,
          occurredAt: e.occurredAt,
        })),
      };
    }),
  getRepoReadmeMarkdown: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(
      z.object({
        markdown: z.string().nullable(),
        owner: z.string().nullable(),
        repo: z.string().nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const row = await ctx.db
        .select({
          source: bookmarks.source,
          url: bookmarkLinks.url,
        })
        .from(bookmarks)
        .innerJoin(bookmarkLinks, eq(bookmarkLinks.id, bookmarks.id))
        .where(
          and(
            eq(bookmarks.id, input.bookmarkId),
            eq(bookmarks.userId, ctx.user.id),
          ),
        )
        .get();
      if (!row || row.source !== "github") {
        return { markdown: null, owner: null, repo: null };
      }
      const match = row.url.match(
        /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/i,
      );
      if (!match) return { markdown: null, owner: null, repo: null };
      const [, owner, repo] = match;
      const token = await requireGithubToken(ctx.user.id);
      const md = await fetchRepoReadme(token, owner, repo);
      return { markdown: md, owner, repo };
    }),
});

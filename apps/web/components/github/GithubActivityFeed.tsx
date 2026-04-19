"use client";

import React from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/trpc";
import {
  Activity,
  ExternalLink,
  GitPullRequest,
  MessageSquare,
  Package,
  RefreshCw,
  Tag as TagIcon,
  Upload,
} from "lucide-react";

function relativeTime(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

function EventIcon({ type }: { type: string }) {
  const props = { className: "size-4 text-muted-foreground" };
  switch (type) {
    case "PullRequestEvent":
    case "PullRequestReviewEvent":
      return <GitPullRequest {...props} />;
    case "IssuesEvent":
      return <MessageSquare {...props} />;
    case "ReleaseEvent":
      return <Package {...props} />;
    case "PushEvent":
      return <Upload {...props} />;
    case "CreateEvent":
      return <TagIcon {...props} />;
    default:
      return <Activity {...props} />;
  }
}

export default function GithubActivityFeed() {
  const apiUtils = api.useUtils();
  const { data, isLoading } = api.github.getActivity.useQuery({ limit: 50 });
  const { mutateAsync: refresh, isPending: isRefreshing } =
    api.github.refreshActivity.useMutation({
      onSuccess: () => {
        toast({ description: "Activity refresh enqueued." });
        setTimeout(() => apiUtils.github.getActivity.invalidate(), 3000);
      },
      onError: (err) =>
        toast({ description: err.message, variant: "destructive" }),
    });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-6" />
          <h1 className="text-2xl font-medium">GitHub Activity</h1>
        </div>
        <ActionButton
          variant="outline"
          loading={isRefreshing}
          onClick={() => refresh()}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </ActionButton>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading events...</div>
      )}

      {!isLoading && (!data || data.events.length === 0) && (
        <div className="rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
          No activity yet. Add repositories to watch in{" "}
          <Link href="/settings/github" className="underline">
            GitHub settings
          </Link>
          .
        </div>
      )}

      <div className="flex flex-col gap-2">
        {data?.events.map((e) => (
          <div
            key={e.id}
            className="flex items-start gap-3 rounded-md border bg-card p-3 hover:bg-accent"
          >
            {e.actorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={e.actorAvatarUrl}
                alt=""
                className="size-8 rounded-full"
              />
            ) : (
              <div className="size-8 rounded-full bg-muted" />
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <EventIcon type={e.eventType} />
                <span className="font-medium">{e.actor}</span>
                <span className="text-muted-foreground">in</span>
                <Link
                  href={`https://github.com/${e.owner}/${e.repo}`}
                  target="_blank"
                  className="font-medium hover:underline"
                >
                  {e.owner}/{e.repo}
                </Link>
                <span className="text-muted-foreground">
                  · {relativeTime(new Date(e.occurredAt))}
                </span>
              </div>
              {e.title && (
                <div className="mt-1 text-sm">
                  {e.url ? (
                    <Link
                      href={e.url}
                      target="_blank"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {e.title}
                      <ExternalLink className="size-3" />
                    </Link>
                  ) : (
                    e.title
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

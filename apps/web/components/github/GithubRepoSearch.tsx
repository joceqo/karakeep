"use client";

import React from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/trpc";
import {
  BookmarkPlus,
  ExternalLink,
  GitFork,
  Github,
  Search,
  Star,
} from "lucide-react";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

export default function GithubRepoSearch() {
  const [input, setInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  const { data, isFetching, error } = api.github.searchRepos.useQuery(
    { query, page },
    { enabled: query.length > 0 },
  );

  const { mutate: saveBookmark, isPending: isSaving } =
    api.bookmarks.createBookmark.useMutation({
      onSuccess: (res) => {
        toast({
          description: res.alreadyExists
            ? "Already bookmarked."
            : "Saved to bookmarks.",
        });
      },
      onError: (err) =>
        toast({ description: err.message, variant: "destructive" }),
    });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Github className="size-6" />
        <h1 className="text-2xl font-medium">Search GitHub repositories</h1>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(input.trim());
        }}
      >
        <Input
          placeholder="e.g. drizzle language:typescript stars:>1000"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <ActionButton
          type="submit"
          loading={isFetching && query.length > 0}
          disabled={!input.trim()}
        >
          <Search className="mr-2 size-4" />
          Search
        </ActionButton>
      </form>

      {error && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
          {error.message}
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            {data.totalCount.toLocaleString()} results
          </div>
          {data.items.map((r) => (
            <div
              key={r.id}
              className="rounded-md border bg-card p-4 hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <Link
                    href={r.htmlUrl}
                    target="_blank"
                    className="inline-flex items-center gap-2 text-lg font-medium hover:underline"
                  >
                    {r.fullName}
                    <ExternalLink className="size-4" />
                  </Link>
                  {r.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {r.language && <span>{r.language}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3" />
                      {r.stars.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GitFork className="size-3" />
                      {r.forks.toLocaleString()}
                    </span>
                    {r.archived && (
                      <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-yellow-600">
                        archived
                      </span>
                    )}
                    {r.fork && <span>fork</span>}
                  </div>
                </div>
                <ActionButton
                  variant="outline"
                  loading={isSaving}
                  onClick={() =>
                    saveBookmark({
                      type: BookmarkTypes.LINK,
                      url: r.htmlUrl,
                      title: r.fullName,
                      source: "github",
                    })
                  }
                >
                  <BookmarkPlus className="mr-2 size-4" />
                  Save
                </ActionButton>
              </div>
            </div>
          ))}

          {data.items.length === 0 && query && (
            <div className="text-sm text-muted-foreground">
              No repositories found.
            </div>
          )}

          {data.items.length > 0 && (
            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="self-center text-sm text-muted-foreground">
                Page {page}
              </span>
              <Button
                variant="ghost"
                disabled={data.items.length < 20}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

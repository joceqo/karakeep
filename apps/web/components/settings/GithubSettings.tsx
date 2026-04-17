"use client";

import React from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle,
  ExternalLink,
  Github,
  RefreshCw,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const watchRepoSchema = z.object({
  input: z
    .string()
    .min(3)
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Expected format: owner/repo"),
});

function formatDate(value: Date | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function ConnectionStatusCard() {
  const { data, isLoading, refetch } = api.github.status.useQuery();
  const apiUtils = api.useUtils();
  const { mutateAsync: syncStars, isPending: isSyncing } =
    api.github.syncStars.useMutation({
      onSuccess: () => {
        toast({ description: "Stars sync enqueued." });
        apiUtils.github.status.invalidate();
      },
      onError: (err) => {
        toast({ description: err.message, variant: "destructive" });
      },
    });

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Github className="size-6" />
          <div>
            <h3 className="text-lg font-medium">GitHub Connection</h3>
            <p className="text-sm text-muted-foreground">
              Connect via Logto GitHub sign-in to sync stars, gists, and
              activity.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          {isLoading || !data ? (
            <>
              <RefreshCw className="size-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Checking…</span>
            </>
          ) : data.connected ? (
            <>
              <CheckCircle className="size-4 text-green-500" />
              <span>Connected to GitHub</span>
            </>
          ) : (
            <>
              <XCircle className="size-4 text-red-500" />
              <span>Not connected. Sign in with GitHub via the OIDC flow.</span>
            </>
          )}
        </div>
        {data?.scope && (
          <div className="text-xs text-muted-foreground">
            Scope: {data.scope}
          </div>
        )}
        <div className="text-muted-foreground">
          Last stars sync: {formatDate(data?.lastStarsSyncAt)}
          {data?.starsSyncStatus ? ` (${data.starsSyncStatus})` : ""}
        </div>
        {data?.starsSyncError && (
          <div className="text-xs text-red-500">
            Error: {data.starsSyncError}
          </div>
        )}
        <div className="text-muted-foreground">
          Last activity sync: {formatDate(data?.lastActivitySyncAt)}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <ActionButton
          loading={isSyncing}
          onClick={() => syncStars()}
          disabled={!data?.connected}
        >
          <Star className="mr-2 size-4" />
          Sync starred repos
        </ActionButton>
        <Button asChild variant="outline">
          <Link href="/dashboard/github/search">
            <Github className="mr-2 size-4" />
            Search repos
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/github/activity">Activity feed</Link>
        </Button>
      </div>
    </div>
  );
}

function WatchedReposCard() {
  const apiUtils = api.useUtils();
  const { data, isLoading } = api.github.listWatchedRepos.useQuery();
  const { mutateAsync: watchRepo, isPending: isAdding } =
    api.github.watchRepo.useMutation({
      onSuccess: () => {
        toast({ description: "Repo added to watch list." });
        apiUtils.github.listWatchedRepos.invalidate();
      },
      onError: (err) => {
        toast({ description: err.message, variant: "destructive" });
      },
    });
  const { mutateAsync: unwatchRepo } = api.github.unwatchRepo.useMutation({
    onSuccess: () => {
      apiUtils.github.listWatchedRepos.invalidate();
    },
  });
  const { mutateAsync: refreshActivity, isPending: isRefreshing } =
    api.github.refreshActivity.useMutation({
      onSuccess: () => toast({ description: "Activity refresh enqueued." }),
      onError: (err) =>
        toast({ description: err.message, variant: "destructive" }),
    });

  const form = useForm<z.infer<typeof watchRepoSchema>>({
    resolver: zodResolver(watchRepoSchema),
    defaultValues: { input: "" },
  });

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Watched repositories</h3>
        <ActionButton
          variant="outline"
          loading={isRefreshing}
          onClick={() => refreshActivity()}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh activity
        </ActionButton>
      </div>

      <Form {...form}>
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={form.handleSubmit(async ({ input }) => {
            const [owner, repo] = input.split("/");
            await watchRepo({ owner, repo });
            form.reset();
          })}
        >
          <FormField
            control={form.control}
            name="input"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Add repository</FormLabel>
                <FormControl>
                  <Input placeholder="owner/repo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <ActionButton type="submit" loading={isAdding}>
            Watch
          </ActionButton>
        </form>
      </Form>

      <div className="mt-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : data?.repos.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No repositories watched yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Last fetched</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.repos.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`https://github.com/${r.owner}/${r.repo}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {r.owner}/{r.repo}
                      <ExternalLink className="size-3" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(r.lastFetchedAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unwatchRepo({ id: r.id })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

export default function GithubSettings() {
  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <span className="text-2xl">GitHub Integration</span>
      </div>
      <ConnectionStatusCard />
      <WatchedReposCard />
    </div>
  );
}

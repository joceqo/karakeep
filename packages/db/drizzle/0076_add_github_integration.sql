CREATE TABLE `githubActivityEvents` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`watchedRepoId` text,
	`githubEventId` text NOT NULL,
	`eventType` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`actor` text,
	`actorAvatarUrl` text,
	`title` text,
	`url` text,
	`payload` text,
	`occurredAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`watchedRepoId`) REFERENCES `githubWatchedRepos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `githubActivityEvents_userId_occurredAt_idx` ON `githubActivityEvents` (`userId`,`occurredAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `githubActivityEvents_userId_githubEventId_unique` ON `githubActivityEvents` (`userId`,`githubEventId`);--> statement-breakpoint
CREATE TABLE `githubSyncState` (
	`userId` text PRIMARY KEY NOT NULL,
	`lastStarsSyncAt` integer,
	`lastStarsCursor` text,
	`starsSyncStatus` text DEFAULT 'idle' NOT NULL,
	`starsSyncError` text,
	`lastActivitySyncAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `githubWatchedRepos` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastFetchedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `githubWatchedRepos_userId_idx` ON `githubWatchedRepos` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `githubWatchedRepos_userId_owner_repo_unique` ON `githubWatchedRepos` (`userId`,`owner`,`repo`);
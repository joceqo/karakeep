CREATE TABLE `githubRepoMeta` (
	`bookmarkId` text PRIMARY KEY NOT NULL,
	`githubId` integer NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`fullName` text NOT NULL,
	`description` text,
	`homepage` text,
	`language` text,
	`topics` text,
	`stars` integer DEFAULT 0 NOT NULL,
	`forks` integer DEFAULT 0 NOT NULL,
	`openIssues` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`fork` integer DEFAULT false NOT NULL,
	`pushedAt` integer,
	`repoUpdatedAt` integer,
	`starredAt` integer,
	`syncedAt` integer NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `githubRepoMeta_stars_idx` ON `githubRepoMeta` (`stars`);--> statement-breakpoint
CREATE INDEX `githubRepoMeta_language_idx` ON `githubRepoMeta` (`language`);--> statement-breakpoint
CREATE INDEX `githubRepoMeta_owner_idx` ON `githubRepoMeta` (`owner`);
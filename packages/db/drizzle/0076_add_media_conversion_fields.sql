ALTER TABLE `assets` ADD `conversionStatus` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `conversionProgress` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `assets` ADD `conversionJobId` text;
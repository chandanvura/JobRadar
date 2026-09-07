ALTER TABLE `companies` ADD `jobs_found` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `candidate_jobs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `eligible_jobs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `warning` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `posted_label` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `posted_precision` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `reported_age_hours` real;--> statement-breakpoint
ALTER TABLE `jobs` ADD `is_eligible` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `eligibility_reason` text DEFAULT 'Not evaluated' NOT NULL;--> statement-breakpoint
ALTER TABLE `scraper_runs` ADD `candidate_jobs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scraper_runs` ADD `companies_empty` integer DEFAULT 0 NOT NULL;
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`careers_url` text NOT NULL,
	`ats_provider` text NOT NULL,
	`ats_identifier` text NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_checked_at` text,
	`last_success_at` text,
	`last_job_found_at` text,
	`error_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_ats_key` ON `companies` (`ats_provider`,`ats_identifier`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_job_id` text NOT NULL,
	`company_id` integer,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`role_category` text NOT NULL,
	`location` text NOT NULL,
	`normalized_location` text NOT NULL,
	`city` text,
	`employment_type` text,
	`experience_min` real,
	`experience_max` real,
	`experience_label` text DEFAULT 'Unknown' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`ats_provider` text NOT NULL,
	`source` text NOT NULL,
	`job_url` text NOT NULL,
	`application_url` text NOT NULL,
	`career_page_url` text NOT NULL,
	`posted_at` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`relevance_score` integer NOT NULL,
	`freshness_score` integer NOT NULL,
	`priority_score` integer NOT NULL,
	`hiring_signal` text,
	`applicant_count` integer,
	`application_status` text DEFAULT 'New' NOT NULL,
	`applied_at` text,
	`notes` text,
	`referral_status` text,
	`recruiter_name` text,
	`recruiter_contact` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_source_key` ON `jobs` (`ats_provider`,`external_job_id`);--> statement-breakpoint
CREATE INDEX `jobs_freshness_idx` ON `jobs` (`first_seen_at`);--> statement-breakpoint
CREATE INDEX `jobs_score_idx` ON `jobs` (`relevance_score`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`sent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`error` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_once` ON `notifications` (`job_id`,`channel`);--> statement-breakpoint
CREATE TABLE `scraper_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`companies_checked` integer DEFAULT 0 NOT NULL,
	`companies_successful` integer DEFAULT 0 NOT NULL,
	`companies_failed` integer DEFAULT 0 NOT NULL,
	`jobs_scanned` integer DEFAULT 0 NOT NULL,
	`new_jobs` integer DEFAULT 0 NOT NULL,
	`matching_jobs` integer DEFAULT 0 NOT NULL,
	`notifications_sent` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL
);

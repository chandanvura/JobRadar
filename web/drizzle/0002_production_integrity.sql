UPDATE `jobs` SET `company_id` = NULL
WHERE `company_id` IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY lower(`name`)
      ORDER BY `enabled` DESC, `jobs_found` DESC, `candidate_jobs` DESC,
               COALESCE(`last_checked_at`, '') DESC, `id` DESC
    ) AS `rank`
    FROM `companies`
  ) WHERE `rank` > 1
);--> statement-breakpoint
DELETE FROM `companies`
WHERE `id` NOT IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY lower(`name`)
      ORDER BY `enabled` DESC, `jobs_found` DESC, `candidate_jobs` DESC,
               COALESCE(`last_checked_at`, '') DESC, `id` DESC
    ) AS `rank`
    FROM `companies`
  ) WHERE `rank` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_name_key` ON `companies` (`name` COLLATE NOCASE);--> statement-breakpoint
DROP INDEX `jobs_source_key`;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_source_key` ON `jobs` (`company` COLLATE NOCASE,`ats_provider`,`external_job_id`);--> statement-breakpoint
DELETE FROM `scraper_runs`
WHERE `id` NOT IN (
  SELECT max(`id`) FROM `scraper_runs` GROUP BY `started_at`
);--> statement-breakpoint
CREATE UNIQUE INDEX `scraper_runs_started_key` ON `scraper_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `jobs_active_city_id_idx` ON `jobs` (`is_active`,`city`,`id`);--> statement-breakpoint
CREATE INDEX `companies_enabled_priority_name_idx` ON `companies` (`enabled`,`priority`,`name`);--> statement-breakpoint
CREATE INDEX `notifications_sent_at_idx` ON `notifications` (`sent_at`);--> statement-breakpoint
CREATE INDEX `scraper_runs_finished_idx` ON `scraper_runs` (`finished_at`);

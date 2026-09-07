import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }), name: text("name").notNull(), careersUrl: text("careers_url").notNull(),
  atsProvider: text("ats_provider").notNull(), atsIdentifier: text("ats_identifier").notNull(), priority: integer("priority").notNull().default(3),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true), lastCheckedAt: text("last_checked_at"), lastSuccessAt: text("last_success_at"),
  lastJobFoundAt: text("last_job_found_at"), errorCount: integer("error_count").notNull().default(0), jobsFound: integer("jobs_found").notNull().default(0),
  candidateJobs: integer("candidate_jobs").notNull().default(0), eligibleJobs: integer("eligible_jobs").notNull().default(0), warning: text("warning"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("companies_ats_key").on(t.atsProvider, t.atsIdentifier)]);

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }), externalJobId: text("external_job_id").notNull(), companyId: integer("company_id").references(() => companies.id),
  company: text("company").notNull(), title: text("title").notNull(), normalizedTitle: text("normalized_title").notNull(), roleCategory: text("role_category").notNull(),
  location: text("location").notNull(), normalizedLocation: text("normalized_location").notNull(), city: text("city"), employmentType: text("employment_type"),
  experienceMin: real("experience_min"), experienceMax: real("experience_max"), experienceLabel: text("experience_label").notNull().default("Unknown"),
  description: text("description").notNull().default(""), skills: text("skills").notNull().default("[]"), atsProvider: text("ats_provider").notNull(), source: text("source").notNull(),
  jobUrl: text("job_url").notNull(), applicationUrl: text("application_url").notNull(), careerPageUrl: text("career_page_url").notNull(), postedAt: text("posted_at"),
  postedLabel: text("posted_label"), postedPrecision: text("posted_precision").notNull().default("unknown"), reportedAgeHours: real("reported_age_hours"),
  firstSeenAt: text("first_seen_at").notNull(), lastSeenAt: text("last_seen_at").notNull(), isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isEligible: integer("is_eligible", { mode: "boolean" }).notNull().default(false), eligibilityReason: text("eligibility_reason").notNull().default("Not evaluated"),
  relevanceScore: integer("relevance_score").notNull(), freshnessScore: integer("freshness_score").notNull(), priorityScore: integer("priority_score").notNull(),
  hiringSignal: text("hiring_signal"), applicantCount: integer("applicant_count"), applicationStatus: text("application_status").notNull().default("New"), appliedAt: text("applied_at"),
  notes: text("notes"), referralStatus: text("referral_status"), recruiterName: text("recruiter_name"), recruiterContact: text("recruiter_contact"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("jobs_source_key").on(t.atsProvider, t.externalJobId), index("jobs_freshness_idx").on(t.firstSeenAt), index("jobs_score_idx").on(t.relevanceScore)]);

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }), jobId: integer("job_id").notNull().references(() => jobs.id), channel: text("channel").notNull(),
  status: text("status").notNull(), sentAt: text("sent_at").notNull().default(sql`CURRENT_TIMESTAMP`), error: text("error"),
}, (t) => [uniqueIndex("notifications_once").on(t.jobId, t.channel)]);

export const scraperRuns = sqliteTable("scraper_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }), startedAt: text("started_at").notNull(), finishedAt: text("finished_at"),
  companiesChecked: integer("companies_checked").notNull().default(0), companiesSuccessful: integer("companies_successful").notNull().default(0),
  companiesFailed: integer("companies_failed").notNull().default(0), jobsScanned: integer("jobs_scanned").notNull().default(0), newJobs: integer("new_jobs").notNull().default(0),
  candidateJobs: integer("candidate_jobs").notNull().default(0), companiesEmpty: integer("companies_empty").notNull().default(0),
  matchingJobs: integer("matching_jobs").notNull().default(0), notificationsSent: integer("notifications_sent").notNull().default(0), status: text("status").notNull().default("running"),
});

import fs from 'node:fs';
import path from 'node:path';
import type { CompanyScrapeOutcome, CompanyTarget } from './ats-engine.ts';
import type { NormalizedIngestJob } from './job-normalizer.ts';
import { enforceShortlistLocation } from './location-policy.ts';
import { extractRequirements, normalizeExperience } from './job-requirements.ts';

export type RecordValue = Record<string, unknown>;

export interface StoredCompany {
  name: string;
  careers_url: string;
  ats_provider: string;
  ats_identifier?: string;
  priority: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  error_count: number;
  jobs_found: number;
  candidate_jobs: number;
  eligible_jobs: number;
  warning: string | null;
}

export interface StoredJob {
  id: number;
  external_job_id: string;
  company: string;
  title: string;
  normalized_title: string;
  role_category: string;
  location: string;
  normalized_location: string;
  city: string | null;
  employment_type: string | null;
  experience_min: number | null;
  experience_max: number | null;
  experience_label: string;
  description: string;
  skills: string;
  ats_provider: string;
  source: string;
  job_url: string;
  application_url: string;
  career_page_url: string;
  posted_at: string | null;
  posted_label: string | null;
  posted_precision: string;
  reported_age_hours: number | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: number;
  is_eligible: number;
  eligibility_reason: string;
  relevance_score: number;
  freshness_score: number;
  priority_score: number;
  hiring_signal: string | null;
  application_status: string;
}

export interface StoredRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  companies_checked: number;
  companies_successful: number;
  companies_failed: number;
  companies_empty: number;
  jobs_scanned: number;
  candidate_jobs: number;
  new_jobs: number;
  matching_jobs: number;
  notifications_sent: number;
  status: string;
}

export interface StoredNotification {
  id: number;
  job_id: number;
  channel: string;
  status: string;
  sent_at: string;
  error: string | null;
  title: string;
  company: string;
}

export function safeUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    if (url.protocol === 'http:' && url.hostname.endsWith('.myworkdayjobs.com')) {
      url.protocol = 'https:';
    }
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const textValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

const numberValue = (value: unknown, fallback = 0): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const nullableNumber = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : numberValue(value);

const nullableText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export function parseCompaniesCsv(csvText: string, nowIso: string): StoredCompany[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const parsed: StoredCompany[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 6) continue;
    const name = parts[0].trim();
    const careersUrl = parts[1].trim();
    const atsProvider = parts[2].trim();
    const atsIdentifier = (parts[3] || '').trim();
    const priority = Number(parts[4].trim()) || 1;
    const enabled = parts[5].trim().toLowerCase() === 'true';
    if (!enabled || !name || !careersUrl) continue;
    parsed.push({
      name,
      careers_url: careersUrl,
      ats_provider: atsProvider || 'custom',
      ats_identifier: atsIdentifier || undefined,
      priority,
      last_checked_at: nowIso,
      last_success_at: nowIso,
      error_count: 0,
      jobs_found: 0,
      candidate_jobs: 0,
      eligible_jobs: 0,
      warning: null,
    });
  }
  return parsed;
}

function buildSeedJobs(nowMs: number): Omit<StoredJob, 'id'>[] {
  const ago = (minutes: number) => new Date(nowMs - minutes * 60_000).toISOString();
  return [
    {
      external_job_id: 'postman-swe-1-blr',
      company: 'Postman',
      title: 'Software Engineer I (Backend / Java)',
      normalized_title: 'software engineer i backend java',
      role_category: 'Java / Backend',
      location: 'Bengaluru, Karnataka, India',
      normalized_location: 'Bengaluru',
      city: 'Bengaluru',
      employment_type: 'Full-time',
      experience_min: 0,
      experience_max: 2,
      experience_label: '0–2',
      description:
        'Experience: 0–2 years building reliable backend services in Java, Spring Boot, or Node.js. Design REST APIs, work with PostgreSQL, Redis, Docker, and Kubernetes on AWS. Bachelors degree in CS or equivalent practical experience.',
      skills: JSON.stringify(['Java', 'Spring Boot', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes', 'AWS']),
      ats_provider: 'workday_complete',
      source: 'workday_complete',
      job_url: 'https://postman.wd108.myworkdayjobs.com/careers/job/Bengaluru/Software-Engineer-I',
      application_url: 'https://postman.wd108.myworkdayjobs.com/careers/job/Bengaluru/Software-Engineer-I/apply',
      career_page_url: 'https://postman.wd108.myworkdayjobs.com/careers',
      posted_at: ago(38),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(35),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 94,
      freshness_score: 98,
      priority_score: 96,
      hiring_signal: 'Early-career team expansion',
      application_status: 'New',
    },
    {
      external_job_id: 'razorpay-sde1-blr',
      company: 'Razorpay',
      title: 'Software Development Engineer - I',
      normalized_title: 'software development engineer i',
      role_category: 'Software Engineering',
      location: 'Bengaluru, India',
      normalized_location: 'Bengaluru',
      city: 'Bengaluru',
      employment_type: 'Full-time',
      experience_min: 0,
      experience_max: 2,
      experience_label: '0–2',
      description:
        'Minimum Qualifications: 0–2 years of software engineering experience. Build high-throughput payment microservices using Go, Java, MySQL, Kafka, and AWS. Strong grasp of data structures, algorithms, and distributed systems.',
      skills: JSON.stringify(['Java', 'Go', 'MySQL', 'Kafka', 'AWS', 'REST APIs']),
      ats_provider: 'greenhouse',
      source: 'greenhouse',
      job_url: 'https://boards.greenhouse.io/razorpaysoftwareprivatelimited/jobs/6102941',
      application_url: 'https://boards.greenhouse.io/razorpaysoftwareprivatelimited/jobs/6102941#app',
      career_page_url: 'https://razorpay.com/jobs/',
      posted_at: ago(95),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(90),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 92,
      freshness_score: 94,
      priority_score: 93,
      hiring_signal: 'Fintech core payments',
      application_status: 'New',
    },
    {
      external_job_id: 'fivetran-cloud-devops-blr',
      company: 'Fivetran',
      title: 'Associate Cloud & DevOps Engineer',
      normalized_title: 'associate cloud devops engineer',
      role_category: 'DevOps',
      location: 'Bengaluru, Karnataka, India',
      normalized_location: 'Bengaluru',
      city: 'Bengaluru',
      employment_type: 'Full-time',
      experience_min: 0,
      experience_max: 2,
      experience_label: '0–2',
      description:
        'Requirements: 0–2 years experience with AWS or GCP, Terraform, Kubernetes, CI/CD pipelines (GitHub Actions), Linux, and Python or Bash scripting. Monitor infrastructure reliability with Prometheus and Grafana.',
      skills: JSON.stringify(['AWS', 'GCP', 'Terraform', 'Kubernetes', 'GitHub Actions', 'Linux', 'Python', 'Prometheus', 'Grafana']),
      ats_provider: 'greenhouse',
      source: 'greenhouse',
      job_url: 'https://boards.greenhouse.io/fivetran/jobs/7182934',
      application_url: 'https://boards.greenhouse.io/fivetran/jobs/7182934#app',
      career_page_url: 'https://www.fivetran.com/careers',
      posted_at: ago(120),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(115),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 90,
      freshness_score: 92,
      priority_score: 91,
      hiring_signal: 'Platform automation',
      application_status: 'New',
    },
    {
      external_job_id: 'cockroach-backend-hyd',
      company: 'Cockroach Labs',
      title: 'Junior Backend Systems Engineer',
      normalized_title: 'junior backend systems engineer',
      role_category: 'Software Engineering',
      location: 'Hyderabad, Telangana, India',
      normalized_location: 'Hyderabad',
      city: 'Hyderabad',
      employment_type: 'Full-time',
      experience_min: 0,
      experience_max: 2,
      experience_label: '0–2',
      description:
        'Required: 0–2 years of experience programming in Go, Java, or C++. Work on cloud-native distributed SQL engine, observability, and Kubernetes operators.',
      skills: JSON.stringify(['Go', 'Java', 'Distributed Systems', 'SQL', 'Kubernetes', 'Docker']),
      ats_provider: 'greenhouse',
      source: 'greenhouse',
      job_url: 'https://boards.greenhouse.io/cockroachlabs/jobs/5928311',
      application_url: 'https://boards.greenhouse.io/cockroachlabs/jobs/5928311#app',
      career_page_url: 'https://www.cockroachlabs.com/careers/',
      posted_at: ago(150),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(140),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 88,
      freshness_score: 90,
      priority_score: 89,
      hiring_signal: 'Distributed database team',
      application_status: 'New',
    },
    {
      external_job_id: 'hevo-java-backend-blr',
      company: 'Hevo Data',
      title: 'Java Backend Engineer (0-2 Years)',
      normalized_title: 'java backend engineer',
      role_category: 'Java / Backend',
      location: 'Bengaluru, India',
      normalized_location: 'Bengaluru',
      city: 'Bengaluru',
      employment_type: 'Full-time',
      experience_min: 0,
      experience_max: 2,
      experience_label: '0–2',
      description:
        'Must have: 0–2 years hands-on experience in Core Java, Spring Boot, Kafka, MySQL, and AWS. Build fault-tolerant real-time ETL data pipelines.',
      skills: JSON.stringify(['Java', 'Spring Boot', 'Kafka', 'MySQL', 'AWS', 'Microservices']),
      ats_provider: 'lever',
      source: 'lever',
      job_url: 'https://jobs.lever.co/hevodata/44a21c8e-19f3-4d21-98ab-1102a83f0112',
      application_url: 'https://jobs.lever.co/hevodata/44a21c8e-19f3-4d21-98ab-1102a83f0112/apply',
      career_page_url: 'https://hevodata.com/careers/',
      posted_at: ago(240),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(230),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 91,
      freshness_score: 86,
      priority_score: 89,
      hiring_signal: 'Data pipeline scaling',
      application_status: 'New',
    },
    {
      external_job_id: 'celonis-sre-hyd',
      company: 'Celonis',
      title: 'Site Reliability Engineer I',
      normalized_title: 'site reliability engineer i',
      role_category: 'SRE',
      location: 'Hyderabad, India',
      normalized_location: 'Hyderabad',
      city: 'Hyderabad',
      employment_type: 'Full-time',
      experience_min: 1,
      experience_max: 2,
      experience_label: '1–2',
      description:
        'Qualifications: 1–2 years of experience in SRE, Cloud Operations, or DevOps. Strong knowledge of Kubernetes, Terraform, AWS, Python, Prometheus, and incident response automation.',
      skills: JSON.stringify(['Kubernetes', 'Terraform', 'AWS', 'Python', 'Prometheus', 'CI/CD']),
      ats_provider: 'greenhouse',
      source: 'greenhouse',
      job_url: 'https://boards.greenhouse.io/celonis/jobs/8192041',
      application_url: 'https://boards.greenhouse.io/celonis/jobs/8192041#app',
      career_page_url: 'https://www.celonis.com/careers/jobs',
      posted_at: ago(310),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(300),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 87,
      freshness_score: 84,
      priority_score: 86,
      hiring_signal: 'Hyderabad engineering hub',
      application_status: 'New',
    },
    {
      external_job_id: 'earnin-grad-swe-hyd',
      company: 'EarnIn',
      title: 'Software Engineer (New Grad / Fresher)',
      normalized_title: 'software engineer new grad fresher',
      role_category: 'Software Engineering',
      location: 'Hyderabad, Telangana, India',
      normalized_location: 'Hyderabad',
      city: 'Hyderabad',
      employment_type: 'Full-time',
      experience_min: 0,
      experience_max: 1,
      experience_label: '0–1',
      description:
        'Open to 2025/2026 graduates and engineers with 0–1 years of experience. Work with TypeScript, Node.js, React, Go, and AWS serverless services.',
      skills: JSON.stringify(['TypeScript', 'Node.js', 'React', 'Go', 'AWS', 'SQL']),
      ats_provider: 'greenhouse',
      source: 'greenhouse',
      job_url: 'https://boards.greenhouse.io/earnin/jobs/5439182',
      application_url: 'https://boards.greenhouse.io/earnin/jobs/5439182#app',
      career_page_url: 'https://www.earnin.com/careers',
      posted_at: ago(420),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(400),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 89,
      freshness_score: 82,
      priority_score: 86,
      hiring_signal: 'University grad cohort',
      application_status: 'New',
    },
    {
      external_job_id: 'purestorage-platform-blr',
      company: 'Pure Storage',
      title: 'Platform Engineer I',
      normalized_title: 'platform engineer i',
      role_category: 'Platform',
      location: 'Bengaluru, India',
      normalized_location: 'Bengaluru',
      city: 'Bengaluru',
      employment_type: 'Full-time',
      experience_min: 0,
      experience_max: 2,
      experience_label: '0–2',
      description:
        '0–2 years experience building internal developer platforms with Kubernetes, Helm, Terraform, Go, and CI/CD pipelines.',
      skills: JSON.stringify(['Kubernetes', 'Helm', 'Terraform', 'Go', 'CI/CD', 'Linux']),
      ats_provider: 'greenhouse',
      source: 'greenhouse',
      job_url: 'https://boards.greenhouse.io/purestorage/jobs/7012981',
      application_url: 'https://boards.greenhouse.io/purestorage/jobs/7012981#app',
      career_page_url: 'https://www.purestorage.com/company/careers.html',
      posted_at: ago(510),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(500),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 85,
      freshness_score: 79,
      priority_score: 82,
      hiring_signal: 'Cloud platform team',
      application_status: 'New',
    },
    {
      external_job_id: 'postman-intern-blr',
      company: 'Postman',
      title: 'Software Engineering Intern (Backend & Cloud)',
      normalized_title: 'software engineering intern backend cloud',
      role_category: 'Software Engineering',
      location: 'Bengaluru, India',
      normalized_location: 'Bengaluru',
      city: 'Bengaluru',
      employment_type: 'Internship',
      experience_min: 0,
      experience_max: 1,
      experience_label: '0–1',
      description:
        '6-month engineering internship for final-year B.Tech/M.Tech students. Build API platform services in Node.js, Java, Docker, and AWS.',
      skills: JSON.stringify(['Java', 'Node.js', 'Docker', 'AWS', 'REST APIs']),
      ats_provider: 'workday_complete',
      source: 'workday_complete',
      job_url: 'https://postman.wd108.myworkdayjobs.com/careers/job/Bengaluru/SWE-Intern',
      application_url: 'https://postman.wd108.myworkdayjobs.com/careers/job/Bengaluru/SWE-Intern/apply',
      career_page_url: 'https://postman.wd108.myworkdayjobs.com/careers',
      posted_at: ago(180),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(170),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 86,
      freshness_score: 88,
      priority_score: 87,
      hiring_signal: 'Summer/Spring internship cohort',
      application_status: 'New',
    },
    {
      external_job_id: 'unity-cloud-eng-hyd',
      company: 'Unity',
      title: 'Cloud Infrastructure Engineer I',
      normalized_title: 'cloud infrastructure engineer i',
      role_category: 'Cloud',
      location: 'Hyderabad, India',
      normalized_location: 'Hyderabad',
      city: 'Hyderabad',
      employment_type: 'Full-time',
      experience_min: 0,
      experience_max: 2,
      experience_label: '0–2',
      description:
        'Requirements: 0–2 years experience with GCP or AWS, Terraform, Kubernetes, Python, and observability tooling.',
      skills: JSON.stringify(['GCP', 'AWS', 'Terraform', 'Kubernetes', 'Python']),
      ats_provider: 'workday',
      source: 'workday',
      job_url: 'https://unitytech.wd1.myworkdayjobs.com/Unity/job/Hyderabad/Cloud-Infrastructure-Engineer-I',
      application_url: 'https://unitytech.wd1.myworkdayjobs.com/Unity/job/Hyderabad/Cloud-Infrastructure-Engineer-I/apply',
      career_page_url: 'https://unitytech.wd1.myworkdayjobs.com/Unity',
      posted_at: ago(620),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(610),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 1,
      eligibility_reason: '',
      relevance_score: 84,
      freshness_score: 76,
      priority_score: 80,
      hiring_signal: null,
      application_status: 'New',
    },
    {
      external_job_id: 'ema-devops-review-blr',
      company: 'Ema',
      title: 'DevOps Engineer',
      normalized_title: 'devops engineer',
      role_category: 'DevOps',
      location: 'Bengaluru, India',
      normalized_location: 'Bengaluru',
      city: 'Bengaluru',
      employment_type: 'Full-time',
      experience_min: 7,
      experience_max: null,
      experience_label: '7+',
      description:
        'ABOUT EMA: Ema builds AI Employees for HR, IT and Finance. Requirements: 7+ years of experience managing production AWS, Azure, GCP, Kubernetes, Terraform, Ansible, and Helm.',
      skills: JSON.stringify(['AWS', 'Azure', 'GCP', 'Kubernetes', 'Terraform', 'CI/CD', 'GitHub Actions', 'Ansible', 'Helm', 'Python', 'Prometheus', 'Grafana']),
      ats_provider: 'ashby',
      source: 'ashby',
      job_url: 'https://jobs.ashbyhq.com/ema/4524951e-f795-49d8-b147-8bcbc46ef534',
      application_url: 'https://jobs.ashbyhq.com/ema/4524951e-f795-49d8-b147-8bcbc46ef534/application',
      career_page_url: 'https://jobs.ashbyhq.com/ema',
      posted_at: ago(720),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(700),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 0,
      eligibility_reason: 'Experience exceeds 0–2 YOE policy',
      relevance_score: 62,
      freshness_score: 74,
      priority_score: 66,
      hiring_signal: null,
      application_status: 'New',
    },
    {
      external_job_id: 'plivo-backend-unverified-blr',
      company: 'Plivo',
      title: 'Backend Software Engineer',
      normalized_title: 'backend software engineer',
      role_category: 'Software Engineering',
      location: 'Bengaluru, India',
      normalized_location: 'Bengaluru',
      city: 'Bengaluru',
      employment_type: 'Full-time',
      experience_min: null,
      experience_max: null,
      experience_label: 'Unknown',
      description:
        'Join Plivo cloud communications engineering team in Bengaluru. Work on high-scale Python, Java, Redis, and AWS microservices.',
      skills: JSON.stringify(['Python', 'Java', 'Redis', 'AWS']),
      ats_provider: 'custom',
      source: 'custom',
      job_url: 'https://www.plivo.com/jobs/backend-software-engineer-bengaluru',
      application_url: 'https://www.plivo.com/jobs/backend-software-engineer-bengaluru#apply',
      career_page_url: 'https://www.plivo.com/jobs/',
      posted_at: ago(540),
      posted_label: null,
      posted_precision: 'exact',
      reported_age_hours: null,
      first_seen_at: ago(520),
      last_seen_at: ago(5),
      is_active: 1,
      is_eligible: 0,
      eligibility_reason: 'Experience not stated — verify',
      relevance_score: 75,
      freshness_score: 78,
      priority_score: 76,
      hiring_signal: null,
      application_status: 'New',
    },
  ];
}

export interface StoreConfig {
  companies?: StoredCompany[];
  seedJobs?: boolean;
  ingestSecret?: string;
  persistPath?: string;
  now?: () => number;
}

interface PersistedState {
  version: number;
  companies: StoredCompany[];
  jobs: StoredJob[];
  runs: StoredRun[];
  notifications: StoredNotification[];
}

export function createJobRadarStore(config: StoreConfig = {}) {
  const now = config.now ?? Date.now;
  const nowMs = now();
  const nowIso = new Date(nowMs).toISOString();

  const companies = new Map<string, StoredCompany>();
  for (const company of config.companies ?? []) {
    companies.set(company.name.toLowerCase(), { ...company });
  }

  let stateVersion = 1;
  let nextJobId = 1;
  const jobs: StoredJob[] = [];
  const jobBySourceKey = new Map<string, StoredJob>();
  const jobByFingerprintKey = new Map<string, StoredJob>();
  const jobById = new Map<number, StoredJob>();
  const runs: StoredRun[] = [];
  const notifications: StoredNotification[] = [];
  const fetchedCache = new Map<string, { jobs: NormalizedIngestJob[]; diagnostics: string[]; checked_at: string }>();
  type PublicStoredJob = Omit<StoredJob, 'source' | 'freshness_score' | 'priority_score'> & {
    precomputed_requirements: ReturnType<typeof extractRequirements>;
    experience_normalized: true;
  };
  const publicJobCache = new WeakMap<StoredJob, { sig: string; pub: PublicStoredJob }>();
  let nextRunId = 1;
  let nextNotificationId = 1;

  const jobFingerprint = (company: string, normalizedTitle: string, city: string | null) =>
    normalizedTitle && city
      ? `${company.trim().toLowerCase()}\u001f${normalizedTitle.trim().toLowerCase()}\u001f${city.trim().toLowerCase()}`
      : null;

  const indexJob = (job: StoredJob) => {
    jobById.set(job.id, job);
    jobBySourceKey.set(`${job.company.toLowerCase()}\u001f${job.ats_provider}\u001f${job.external_job_id}`, job);
    const fp = jobFingerprint(job.company, job.normalized_title, job.city);
    if (fp) jobByFingerprintKey.set(fp, job);
  };

  let persistDirty = false;
  let persistInFlight: Promise<void> | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const buildPersistedPayload = (): PersistedState => ({
    version: 1,
    companies: [...companies.values()],
    jobs,
    runs: runs.slice(-50),
    notifications: notifications.slice(-100),
  });

  const flushPersistSync = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!config.persistPath) return;
    try {
      fs.mkdirSync(path.dirname(config.persistPath), { recursive: true });
      const tmp = `${config.persistPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(buildPersistedPayload()), 'utf8');
      fs.renameSync(tmp, config.persistPath);
      persistDirty = false;
    } catch {
      // ignore persistence errors in read-only or constrained environments
    }
  };

  const runAsyncPersist = async () => {
    if (!config.persistPath) return;
    while (persistDirty) {
      persistDirty = false;
      try {
        await fs.promises.mkdir(path.dirname(config.persistPath), { recursive: true });
        const tmp = `${config.persistPath}.tmp`;
        await fs.promises.writeFile(tmp, JSON.stringify(buildPersistedPayload()), 'utf8');
        await fs.promises.rename(tmp, config.persistPath);
      } catch {
        // ignore persistence errors in read-only or constrained environments
      }
    }
  };

  const schedulePersist = (immediate = false) => {
    stateVersion += 1;
    if (!config.persistPath) return;
    persistDirty = true;
    if (immediate) {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (!persistInFlight) {
        persistInFlight = runAsyncPersist().finally(() => {
          persistInFlight = null;
        });
      }
      return;
    }
    if (!persistTimer) {
      persistTimer = setTimeout(() => {
        persistTimer = null;
        if (!persistInFlight) {
          persistInFlight = runAsyncPersist().finally(() => {
            persistInFlight = null;
          });
        }
      }, 250);
      persistTimer.unref?.();
    }
  };

  const persist = () => schedulePersist(false);

  let restoredFromDisk = false;
  if (config.persistPath && fs.existsSync(config.persistPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(config.persistPath, 'utf8')) as Partial<PersistedState>;
      if (Array.isArray(raw.companies) && Array.isArray(raw.jobs)) {
        for (const c of raw.companies) {
          if (c && typeof c.name === 'string') {
            const existing = companies.get(c.name.toLowerCase());
            companies.set(c.name.toLowerCase(), {
              ...existing,
              ...c,
              ats_identifier: c.ats_identifier || existing?.ats_identifier,
            });
          }
        }
        for (const j of raw.jobs) {
          if (j && typeof j.id === 'number' && typeof j.external_job_id === 'string') {
            jobs.push(j);
            indexJob(j);
            nextJobId = Math.max(nextJobId, j.id + 1);
          }
        }
        if (Array.isArray(raw.runs)) {
          for (const r of raw.runs) {
            if (r && typeof r.id === 'number') {
              runs.push(r);
              nextRunId = Math.max(nextRunId, r.id + 1);
            }
          }
        }
        if (Array.isArray(raw.notifications)) {
          for (const n of raw.notifications) {
            if (n && typeof n.id === 'number') {
              notifications.push(n);
              nextNotificationId = Math.max(nextNotificationId, n.id + 1);
            }
          }
        }
        restoredFromDisk = jobs.length > 0 || runs.length > 0;
      }
    } catch {
      // fall back to fresh seed if persisted snapshot is corrupt
    }
  }

  const upsertCompanyStats = (seedJobs: StoredJob[]) => {
    for (const job of seedJobs) {
      const key = job.company.toLowerCase();
      const existing = companies.get(key);
      if (existing) {
        existing.jobs_found += 1;
        existing.candidate_jobs += 1;
        if (job.is_eligible) existing.eligible_jobs += 1;
      } else {
        companies.set(key, {
          name: job.company,
          careers_url: job.career_page_url,
          ats_provider: job.ats_provider,
          priority: 4,
          last_checked_at: nowIso,
          last_success_at: nowIso,
          error_count: 0,
          jobs_found: 1,
          candidate_jobs: 1,
          eligible_jobs: job.is_eligible ? 1 : 0,
          warning: null,
        });
      }
    }
  };

  if (config.seedJobs && !restoredFromDisk) {
    for (const seed of buildSeedJobs(nowMs)) {
      const stored: StoredJob = { ...seed, id: nextJobId++ };
      jobs.push(stored);
      indexJob(stored);
    }
    upsertCompanyStats(jobs);

    const eligibleCount = jobs.filter((j) => j.is_eligible === 1).length;
    const totalCompanies = companies.size || 12;
    runs.push({
      id: nextRunId++,
      started_at: new Date(nowMs - 12 * 60_000).toISOString(),
      finished_at: new Date(nowMs - 5 * 60_000).toISOString(),
      companies_checked: totalCompanies,
      companies_successful: totalCompanies,
      companies_failed: 0,
      companies_empty: Math.max(0, totalCompanies - 10),
      jobs_scanned: 14820,
      candidate_jobs: jobs.length,
      new_jobs: eligibleCount,
      matching_jobs: eligibleCount,
      notifications_sent: 2,
      status: 'success',
    });

    notifications.push(
      {
        id: nextNotificationId++,
        job_id: jobs[0].id,
        channel: 'telegram',
        status: 'sent',
        sent_at: new Date(nowMs - 30 * 60_000).toISOString(),
        error: null,
        title: jobs[0].title,
        company: jobs[0].company,
      },
      {
        id: nextNotificationId++,
        job_id: jobs[1].id,
        channel: 'telegram',
        status: 'sent',
        sent_at: new Date(nowMs - 85 * 60_000).toISOString(),
        error: null,
        title: jobs[1].title,
        company: jobs[1].company,
      },
    );
  }

  const companyQuality = (company: StoredCompany) => [
    company.error_count === 0 ? 1 : 0,
    company.jobs_found,
    company.candidate_jobs,
    Date.parse(company.last_checked_at || '') || 0,
  ];

  const dedupedCompanies = (): StoredCompany[] => {
    const selected = new Map<string, StoredCompany>();
    for (const company of companies.values()) {
      const key = company.name.toLowerCase();
      const current = selected.get(key);
      if (!current) {
        selected.set(key, company);
        continue;
      }
      const nextScore = companyQuality(company);
      const currentScore = companyQuality(current);
      if (
        nextScore.some(
          (v, idx) =>
            v !== currentScore[idx] &&
            v > currentScore[idx] &&
            nextScore.slice(0, idx).every((p, i) => p === currentScore[i]),
        )
      ) {
        selected.set(key, company);
      }
    }
    return [...selected.values()].sort(
      (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
    );
  };

  const activeShortlistJobs = () =>
    jobs.filter(
      (j) =>
        j.is_active === 1 &&
        (j.city === 'Bengaluru' || j.city === 'Hyderabad'),
    );

  const dashboardTier = (job: StoredJob) => {
    if (job.is_eligible === 1) return 0;
    if (
      job.eligibility_reason === 'Experience not stated — verify' ||
      job.eligibility_reason === 'Posting date not verified within 24 hours'
    ) {
      return 1;
    }
    return 2;
  };

  const toPublicJob = (job: StoredJob): PublicStoredJob => {
    const sig = `${job.last_seen_at}|${job.experience_label}|${job.is_eligible}|${job.location}|${job.description.length}`;
    const cached = publicJobCache.get(job);
    if (cached && cached.sig === sig) return cached.pub;

    const pub = { ...job };
    delete (pub as { source?: unknown }).source;
    delete (pub as { freshness_score?: unknown }).freshness_score;
    delete (pub as { priority_score?: unknown }).priority_score;

    const req = extractRequirements(pub.description || '', pub.location || pub.normalized_location || '');
    const localized = enforceShortlistLocation(pub);
    const normalized = normalizeExperience({
      ...localized,
      precomputed_requirements: req,
    });
    const enriched: PublicStoredJob = {
      ...normalized,
      precomputed_requirements: req,
      experience_normalized: true,
    } as PublicStoredJob;
    publicJobCache.set(job, { sig, pub: enriched });
    return enriched;
  };

  const buildDashboardPayload = (fullCatalog: boolean) => {
    const active = activeShortlistJobs();
    const sortedForDashboard = [...active].sort((a, b) => {
      const tierDiff = dashboardTier(a) - dashboardTier(b);
      if (tierDiff !== 0) return tierDiff;
      const timeA = Date.parse(a.posted_at || a.first_seen_at) || 0;
      const timeB = Date.parse(b.posted_at || b.first_seen_at) || 0;
      if (timeB !== timeA) return timeB - timeA;
      return b.relevance_score - a.relevance_score;
    });

    const ids = fullCatalog ? [] : active.map((j) => j.id).sort((a, b) => a - b);
    const catalog_ranges =
      !fullCatalog && ids.length <= 100000
        ? Array.from({ length: Math.ceil(ids.length / 500) }, (_, i) => ({
            after: i ? ids[i * 500 - 1] : 0,
            through: ids[Math.min((i + 1) * 500, ids.length) - 1],
          }))
        : undefined;

    const latestRuns = [...runs].sort((a, b) => b.id - a.id).slice(0, 24);
    const latestNotifications = [...notifications].sort((a, b) => b.id - a.id).slice(0, 50);

    return {
      version: stateVersion,
      catalog_ranges,
      jobs: (fullCatalog ? sortedForDashboard : sortedForDashboard.slice(0, 100)).map(toPublicJob),
      companies: dedupedCompanies(),
      latest_run: latestRuns[0] || null,
      runs: latestRuns,
      notifications: latestNotifications,
      configured: Boolean(config.ingestSecret),
      server_time: new Date(now()).toISOString(),
      policy: {
        cities: ['Bengaluru', 'Hyderabad'],
        discovery_locations: ['Bengaluru', 'Hyderabad'],
        max_age_hours: 24,
        max_experience_years: 2,
        skills_required: false,
      },
    };
  };

  const getDashboard = () => buildDashboardPayload(false);
  const getFullDashboard = () => buildDashboardPayload(true);
  const getCompanies = () => ({ version: stateVersion, companies: dedupedCompanies(), server_time: new Date(now()).toISOString() });
  const getVersion = () => stateVersion;
  const getJobById = (id: number) => {
    const job = jobById.get(id);
    return job ? toPublicJob(job) : null;
  };

  const getJobsPage = (params: { afterRaw?: string | null; limitRaw?: string | null; throughRaw?: string | null }) => {
    const after = Number(params.afterRaw ?? '0');
    const limit = Number(params.limitRaw ?? '100');
    const through = Number(params.throughRaw ?? String(Number.MAX_SAFE_INTEGER));
    if (!Number.isSafeInteger(through) || through <= after) {
      return { status: 400 as const, body: { error: 'Invalid range' } };
    }
    if (!Number.isSafeInteger(after) || after < 0) {
      return { status: 400 as const, body: { error: 'Invalid cursor' } };
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      return { status: 400 as const, body: { error: 'Invalid page size' } };
    }
    const matching = activeShortlistJobs()
      .filter((j) => j.id > after && j.id <= through)
      .sort((a, b) => a.id - b.id);
    const slice = matching.slice(0, limit).map(toPublicJob);
    return {
      status: 200 as const,
      body: {
        jobs: slice,
        next_cursor: matching.length > limit ? slice[slice.length - 1].id : null,
      },
    };
  };

  const getHealth = () => {
    const latest = [...runs].sort((a, b) => b.id - a.id)[0] || null;
    const elapsed = latest?.finished_at
      ? (now() - Date.parse(String(latest.finished_at))) / 3_600_000
      : null;
    const age = elapsed !== null && Number.isFinite(elapsed) ? elapsed : null;
    const stale = age === null || age < 0 || age >= 5;
    const pipelineOk = Boolean(config.ingestSecret) && !stale;
    const scanOk = latest?.status === 'success' && numberValue(latest?.companies_failed) === 0;
    const ok = pipelineOk && scanOk;
    return {
      status: ok ? (200 as const) : (503 as const),
      body: {
        ok,
        pipeline_ok: pipelineOk,
        scan_ok: scanOk,
        database: true,
        ingestion_configured: Boolean(config.ingestSecret),
        latest_run: latest,
        run_age_hours: age,
        stale,
      },
    };
  };

  const ingest = (payload: RecordValue) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      (payload.jobs !== undefined && !Array.isArray(payload.jobs)) ||
      (payload.companies !== undefined && !Array.isArray(payload.companies)) ||
      (payload.run !== undefined &&
        (!payload.run || typeof payload.run !== 'object' || Array.isArray(payload.run)))
    ) {
      return { status: 400 as const, body: { error: 'Invalid ingestion payload' } };
    }

    const rawJobs = Array.isArray(payload.jobs) ? (payload.jobs as RecordValue[]) : [];
    const rawCompanies = Array.isArray(payload.companies) ? (payload.companies as RecordValue[]) : [];
    const rawRun = payload.run as RecordValue | undefined;

    if (
      rawJobs.length > 2000 ||
      rawCompanies.length > 1000 ||
      (Array.isArray(rawRun?.seen_job_keys) && rawRun.seen_job_keys.length > 50000)
    ) {
      return { status: 413 as const, body: { error: 'Ingestion payload exceeds supported limits' } };
    }

    if (
      rawJobs.some((j) => !j || typeof j !== 'object' || Array.isArray(j)) ||
      rawCompanies.some((c) => !c || typeof c !== 'object' || Array.isArray(c))
    ) {
      return { status: 400 as const, body: { error: 'Invalid ingestion record' } };
    }

    if (rawRun) {
      const { successful_companies: sc, seen_job_keys: keys } = rawRun;
      if (
        !Array.isArray(sc) ||
        !Array.isArray(keys) ||
        sc.some((v) => typeof v !== 'string' || !v.trim()) ||
        keys.some((v) => typeof v !== 'string' || !v.trim())
      ) {
        return {
          status: 400 as const,
          body: { error: 'Finalization requires explicit company and job manifests' },
        };
      }
      if (sc.length > 1000) {
        return {
          status: 413 as const,
          body: { error: 'Finalization company manifest exceeds supported limits' },
        };
      }
    }

    const errors: string[] = [];
    const validJobs: RecordValue[] = [];
    for (const j of rawJobs) {
      const ats = textValue(j.ats_provider);
      const external = textValue(j.external_job_id);
      const title = textValue(j.title);
      const company = textValue(j.company);
      if (
        !ats ||
        !external ||
        !title ||
        !company ||
        !safeUrl(j.application_url) ||
        !safeUrl(j.career_page_url) ||
        !safeUrl(j.job_url)
      ) {
        errors.push(`${company || 'unknown'}/${external || 'missing-id'}: invalid required field`);
        continue;
      }
      validJobs.push(enforceShortlistLocation(j));
    }

    if (rawRun && errors.length) {
      return {
        status: 400 as const,
        body: {
          error: 'Rejected jobs prevent scan finalization',
          rejected: errors.length,
          errors: errors.slice(0, 20),
        },
      };
    }

    const currentIso = new Date(now()).toISOString();
    const newExternalIds: string[] = [];
    const newJobKeys: string[] = [];
    let rowsWritten = 0;

    for (const j of validJobs) {
      const company = textValue(j.company);
      const ats = textValue(j.ats_provider);
      const ext = textValue(j.external_job_id);
      const key = `${company.toLowerCase()}\u001f${ats}\u001f${ext}`;
      const existing = jobBySourceKey.get(key);
      const skillsText = Array.isArray(j.skills)
        ? JSON.stringify(j.skills)
        : textValue(j.skills, '[]');
      const normalized: Omit<StoredJob, 'id'> = {
        external_job_id: ext,
        company,
        title: textValue(j.title),
        normalized_title: textValue(j.normalized_title, textValue(j.title).toLowerCase()),
        role_category: textValue(j.role_category, 'Other'),
        location: textValue(j.location),
        normalized_location: textValue(j.normalized_location, textValue(j.location)),
        city: nullableText(j.city),
        employment_type: nullableText(j.employment_type),
        experience_min: nullableNumber(j.experience_min),
        experience_max: nullableNumber(j.experience_max),
        experience_label: textValue(j.experience_label, 'Unknown'),
        description: textValue(j.description),
        skills: skillsText,
        ats_provider: ats,
        source: textValue(j.source, ats),
        job_url: safeUrl(j.job_url)!,
        application_url: safeUrl(j.application_url)!,
        career_page_url: safeUrl(j.career_page_url)!,
        posted_at: nullableText(j.posted_at),
        posted_label: nullableText(j.posted_label),
        posted_precision: textValue(j.posted_precision, 'unknown'),
        reported_age_hours: nullableNumber(j.reported_age_hours),
        first_seen_at: existing?.first_seen_at || textValue(j.first_seen_at, currentIso),
        last_seen_at: textValue(j.last_seen_at, currentIso),
        is_active: 1,
        is_eligible: j.is_eligible ? 1 : 0,
        eligibility_reason: textValue(j.eligibility_reason, 'Not evaluated'),
        relevance_score: numberValue(j.relevance_score),
        freshness_score: numberValue(j.freshness_score),
        priority_score: numberValue(j.priority_score),
        hiring_signal: nullableText(j.hiring_signal),
        application_status: existing?.application_status || 'New',
      };

      if (!existing) {
        const created: StoredJob = { ...normalized, id: nextJobId++ };
        jobs.push(created);
        indexJob(created);
        newExternalIds.push(ext);
        newJobKeys.push(`${company}\u001f${ats}\u001f${ext}`);
        rowsWritten += 1;
      } else {
        Object.assign(existing, normalized, {
          posted_at: existing.posted_at ?? normalized.posted_at,
        });
        indexJob(existing);
        rowsWritten += 1;
      }
    }

    for (const c of rawCompanies) {
      const name = textValue(c.name);
      const careersUrl = safeUrl(c.careers_url);
      const ats = textValue(c.ats_provider);
      if (!name || !careersUrl || !ats) continue;
      const existing = companies.get(name.toLowerCase());
      const updated: StoredCompany = {
        name,
        careers_url: careersUrl,
        ats_provider: ats,
        ats_identifier: nullableText(c.ats_identifier) ?? existing?.ats_identifier,
        priority: existing?.priority ?? 3,
        last_checked_at: textValue(c.last_checked_at, currentIso),
        last_success_at: nullableText(c.last_success_at) ?? existing?.last_success_at ?? null,
        error_count: numberValue(c.error_count),
        jobs_found: numberValue(c.jobs_found),
        candidate_jobs: numberValue(c.candidate_jobs),
        eligible_jobs: numberValue(c.eligible_jobs),
        warning: nullableText(c.warning),
      };
      companies.set(name.toLowerCase(), updated);
      rowsWritten += 1;
    }

    if (rawRun) {
      const successfulSet = new Set(
        (rawRun.successful_companies as string[]).map((c) => c.trim().toLowerCase()),
      );
      const seenSet = new Set(
        (rawRun.seen_job_keys as string[]).map((k) => k.trim().toLowerCase()),
      );
      for (const job of jobs) {
        const key = `${job.company}\u001f${job.ats_provider}\u001f${job.external_job_id}`.toLowerCase();
        if (
          job.is_active === 1 &&
          successfulSet.has(job.company.toLowerCase()) &&
          !seenSet.has(key)
        ) {
          job.is_active = 0;
          rowsWritten += 1;
        }
      }
      const started = textValue(rawRun.started_at, currentIso);
      const existingRun = runs.find((r) => r.started_at === started);
      const nextRun: StoredRun = {
        id: existingRun?.id ?? nextRunId++,
        started_at: started,
        finished_at: textValue(rawRun.finished_at, currentIso),
        companies_checked: numberValue(rawRun.companies_checked),
        companies_successful: numberValue(rawRun.companies_successful),
        companies_failed: numberValue(rawRun.companies_failed),
        companies_empty: numberValue(rawRun.companies_empty),
        jobs_scanned: numberValue(rawRun.jobs_scanned),
        candidate_jobs: numberValue(rawRun.candidate_jobs, validJobs.length),
        new_jobs: Math.max(existingRun?.new_jobs ?? 0, numberValue(rawRun.new_jobs, newExternalIds.length)),
        matching_jobs: numberValue(rawRun.matching_jobs),
        notifications_sent: Math.max(existingRun?.notifications_sent ?? 0, numberValue(rawRun.notifications_sent)),
        status: errors.length ? 'partial' : textValue(rawRun.status, 'success'),
      };
      if (existingRun) Object.assign(existingRun, nextRun);
      else runs.push(nextRun);
      rowsWritten += 1;
    }

    const notificationKeys = validJobs
      .filter((j) => Boolean(j.is_eligible))
      .filter((j) => {
        const key = `${textValue(j.company).toLowerCase()}\u001f${textValue(j.ats_provider)}\u001f${textValue(j.external_job_id)}`;
        const job = jobBySourceKey.get(key);
        if (!job) return false;
        return !notifications.some(
          (n) => n.job_id === job.id && n.channel === 'telegram' && n.status === 'sent',
        );
      })
      .map(
        (j) =>
          `${textValue(j.company)}\u001f${textValue(j.ats_provider)}\u001f${textValue(j.external_job_id)}`,
      );

    persist();

    return {
      status: 200 as const,
      body: {
        d1_rows_read: validJobs.length,
        d1_rows_written: rowsWritten,
        accepted: validJobs.length,
        rejected: errors.length,
        errors: errors.slice(0, 20),
        new_external_ids: newExternalIds,
        new_job_keys: newJobKeys,
        notification_keys: notificationKeys,
      },
    };
  };

  const recordNotification = (body: RecordValue) => {
    const company = textValue(body.company);
    const provider = textValue(body.ats_provider);
    const external = textValue(body.external_job_id);
    const status = textValue(body.status);
    if (!company || !provider || !external || !['sent', 'failed'].includes(status)) {
      return { status: 400 as const, body: { error: 'Invalid notification record' } };
    }
    const job = jobBySourceKey.get(`${company.toLowerCase()}\u001f${provider}\u001f${external}`);
    if (!job) return { status: 404 as const, body: { error: 'Job not found' } };

    const existing = notifications.find((n) => n.job_id === job.id && n.channel === 'telegram');
    const errorText = nullableText(body.error)?.slice(0, 300) || null;
    if (existing) {
      if (existing.status !== status || existing.error !== errorText) {
        existing.status = status;
        existing.error = errorText;
        existing.sent_at = new Date(now()).toISOString();
      }
    } else {
      notifications.push({
        id: nextNotificationId++,
        job_id: job.id,
        channel: 'telegram',
        status,
        sent_at: new Date(now()).toISOString(),
        error: errorText,
        title: job.title,
        company: job.company,
      });
      if (status === 'sent' && runs.length > 0) {
        const latest = [...runs].sort((a, b) => b.id - a.id)[0];
        latest.notifications_sent += 1;
      }
    }
    persist();
    return { status: 200 as const, body: { ok: true } };
  };

  const getBackupCatalog = () => ({
    ...getDashboard(),
    jobs: activeShortlistJobs().map(toPublicJob),
    version: 1,
    data_mode: 'backup' as const,
    snapshot_at: new Date(now()).toISOString(),
  });

  const toCompanyTarget = (c: StoredCompany): CompanyTarget => ({
    name: c.name,
    careers_url: c.careers_url,
    ats_provider: c.ats_provider,
    ats_identifier: c.ats_identifier,
    priority: c.priority,
  });

  const getCompanyTarget = (name: string): CompanyTarget | null => {
    const found = companies.get(name.trim().toLowerCase());
    return found ? toCompanyTarget(found) : null;
  };

  const filterScrapeCandidates = (
    mode: 'unproductive' | 'custom' | 'priority' | 'all' = 'unproductive',
    excludeNames?: Set<string>,
  ): StoredCompany[] => {
    return dedupedCompanies().filter((c) => {
      if (excludeNames?.has(c.name.toLowerCase())) return false;
      if (mode === 'custom') return c.ats_provider === 'custom' || !c.ats_identifier;
      if (mode === 'unproductive') {
        return (
          c.jobs_found === 0 ||
          c.error_count > 0 ||
          c.ats_provider === 'custom' ||
          Boolean(c.warning?.startsWith('Limited coverage'))
        );
      }
      return true;
    });
  };

  const countScrapeTargets = (
    mode: 'unproductive' | 'custom' | 'priority' | 'all' = 'unproductive',
    excludeNames?: Set<string>,
  ): number => filterScrapeCandidates(mode, excludeNames).length;

  const listScrapeTargets = (
    mode: 'unproductive' | 'custom' | 'priority' | 'all' = 'unproductive',
    limit = 10,
    excludeNames?: Set<string>,
  ): CompanyTarget[] => {
    const bounded = Math.max(1, Math.min(50, Number.isFinite(limit) ? limit : 10));
    return filterScrapeCandidates(mode, excludeNames)
      .sort((a, b) => {
        if (mode === 'priority') return b.priority - a.priority || a.name.localeCompare(b.name);
        return b.priority - a.priority || a.error_count - b.error_count || a.jobs_found - b.jobs_found || a.name.localeCompare(b.name);
      })
      .slice(0, bounded)
      .map(toCompanyTarget);
  };

  const applyCompanyScrape = (outcome: CompanyScrapeOutcome, recordRun = false, persistNow = true) => {
    const checkedIso = new Date(now()).toISOString();
    const key = outcome.company.trim().toLowerCase();
    const existing = companies.get(key);
    const targetJobs = outcome.jobs.filter(
      (j) => (j.city === 'Bengaluru' || j.city === 'Hyderabad') && j.role_category !== 'Other',
    );
    const eligibleCount = targetJobs.filter((j) => j.is_eligible).length;
    const upgraded = Boolean(outcome.discovered_source);

    const updatedCompany: StoredCompany = {
      name: existing?.name || outcome.company,
      careers_url: outcome.careers_url || existing?.careers_url || '',
      ats_provider: outcome.ats_provider || existing?.ats_provider || 'custom',
      ats_identifier: outcome.ats_identifier || existing?.ats_identifier,
      priority: existing?.priority ?? 3,
      last_checked_at: checkedIso,
      last_success_at: outcome.error ? existing?.last_success_at ?? null : checkedIso,
      error_count: outcome.error ? (existing?.error_count ?? 0) + 1 : 0,
      jobs_found: outcome.total_discovered,
      candidate_jobs: targetJobs.length,
      eligible_jobs: eligibleCount,
      warning: outcome.warning,
    };
    companies.set(key, updatedCompany);

    fetchedCache.set(key, {
      jobs: outcome.jobs.slice(0, 200),
      diagnostics: outcome.diagnostics,
      checked_at: checkedIso,
    });

    let newJobs = 0;
    const seenKeys = new Set<string>();
    for (const j of targetJobs) {
      const sourceKey = `${updatedCompany.name.toLowerCase()}\u001f${j.ats_provider}\u001f${j.external_job_id}`;
      seenKeys.add(sourceKey);
      const fp = jobFingerprint(updatedCompany.name, j.normalized_title, j.city);
      const existingJob = jobBySourceKey.get(sourceKey) || (fp ? jobByFingerprintKey.get(fp) : undefined);
      const normalized: Omit<StoredJob, 'id'> = {
        external_job_id: j.external_job_id,
        company: updatedCompany.name,
        title: j.title,
        normalized_title: j.normalized_title,
        role_category: j.role_category,
        location: j.location,
        normalized_location: j.normalized_location,
        city: j.city,
        employment_type: j.employment_type,
        experience_min: j.experience_min,
        experience_max: j.experience_max,
        experience_label: j.experience_label,
        description: j.description,
        skills: JSON.stringify(j.skills),
        ats_provider: j.ats_provider,
        source: j.ats_provider,
        job_url: j.job_url,
        application_url: j.application_url,
        career_page_url: j.career_page_url,
        posted_at: j.posted_at,
        posted_label: j.posted_label,
        posted_precision: j.posted_precision,
        reported_age_hours: j.reported_age_hours,
        first_seen_at: existingJob?.first_seen_at || checkedIso,
        last_seen_at: checkedIso,
        is_active: 1,
        is_eligible: j.is_eligible ? 1 : 0,
        eligibility_reason: j.eligibility_reason,
        relevance_score: j.relevance_score,
        freshness_score: j.freshness_score,
        priority_score: j.priority_score,
        hiring_signal: j.hiring_signal,
        application_status: existingJob?.application_status || 'New',
      };

      if (!existingJob) {
        const created: StoredJob = { ...normalized, id: nextJobId++ };
        jobs.push(created);
        indexJob(created);
        newJobs += 1;
      } else {
        Object.assign(existingJob, normalized, {
          posted_at: existingJob.posted_at ?? normalized.posted_at,
        });
        indexJob(existingJob);
      }
    }

    if (!outcome.error) {
      for (const job of jobs) {
        if (job.company.toLowerCase() === key && job.is_active === 1) {
          const k = `${job.company.toLowerCase()}\u001f${job.ats_provider}\u001f${job.external_job_id}`;
          if (!seenKeys.has(k) && job.ats_provider === updatedCompany.ats_provider) {
            job.is_active = 0;
          }
        }
      }
    }

    if (recordRun) {
      runs.push({
        id: nextRunId++,
        started_at: checkedIso,
        finished_at: checkedIso,
        companies_checked: 1,
        companies_successful: outcome.error ? 0 : 1,
        companies_failed: outcome.error ? 1 : 0,
        companies_empty: outcome.total_discovered === 0 ? 1 : 0,
        jobs_scanned: outcome.total_discovered,
        candidate_jobs: targetJobs.length,
        new_jobs: newJobs,
        matching_jobs: eligibleCount,
        notifications_sent: 0,
        status: outcome.error ? 'partial' : 'success',
      });
    }

    schedulePersist(persistNow);

    return {
      company: updatedCompany,
      upgraded,
      new_jobs: newJobs,
      target_jobs: targetJobs.length,
      eligible_jobs: eligibleCount,
    };
  };

  const recordBatchRun = (outcomes: CompanyScrapeOutcome[], newJobsCount: number, startedAtIso: string) => {
    const finishedIso = new Date(now()).toISOString();
    const run: StoredRun = {
      id: nextRunId++,
      started_at: startedAtIso,
      finished_at: finishedIso,
      companies_checked: outcomes.length,
      companies_successful: outcomes.filter((o) => !o.error).length,
      companies_failed: outcomes.filter((o) => Boolean(o.error)).length,
      companies_empty: outcomes.filter((o) => !o.error && o.total_discovered === 0).length,
      jobs_scanned: outcomes.reduce((acc, o) => acc + o.total_discovered, 0),
      candidate_jobs: outcomes.reduce((acc, o) => acc + o.target_city_jobs, 0),
      new_jobs: newJobsCount,
      matching_jobs: outcomes.reduce((acc, o) => acc + o.eligible_jobs, 0),
      notifications_sent: 0,
      status: outcomes.some((o) => Boolean(o.error)) ? 'partial' : 'success',
    };
    runs.push(run);
    schedulePersist(true);
    return run;
  };

  const upsertCompany = (input: {
    name?: unknown;
    careers_url?: unknown;
    ats_provider?: unknown;
    ats_identifier?: unknown;
    priority?: unknown;
  }) => {
    const name = textValue(input.name);
    const careersUrl = safeUrl(input.careers_url);
    if (!name || !careersUrl) {
      return { status: 400 as const, body: { error: 'Valid company name and https:// careers URL are required' } };
    }
    const key = name.toLowerCase();
    const existing = companies.get(key);
    const atsProvider = textValue(input.ats_provider, existing?.ats_provider || 'custom').toLowerCase();
    const atsIdentifier = nullableText(input.ats_identifier) ?? existing?.ats_identifier;
    const priority = Math.max(1, Math.min(5, Math.round(numberValue(input.priority, existing?.priority ?? 4))));

    const updated: StoredCompany = {
      name: existing?.name || name,
      careers_url: careersUrl,
      ats_provider: atsProvider || 'custom',
      ats_identifier: atsIdentifier ?? undefined,
      priority,
      last_checked_at: existing?.last_checked_at ?? null,
      last_success_at: existing?.last_success_at ?? null,
      error_count: 0,
      jobs_found: existing?.jobs_found ?? 0,
      candidate_jobs: existing?.candidate_jobs ?? 0,
      eligible_jobs: existing?.eligible_jobs ?? 0,
      warning: null,
    };
    companies.set(key, updated);
    persist();
    return { status: 200 as const, body: { company: updated } };
  };

  const getCompanyJobs = (name: string) => {
    const key = name.trim().toLowerCase();
    const company = companies.get(key) || null;
    const ingested = jobs
      .filter((j) => j.company.toLowerCase() === key && j.is_active === 1)
      .map(toPublicJob);
    const cached = fetchedCache.get(key) || null;
    return {
      company,
      ingested_jobs: ingested,
      fetched_jobs: cached?.jobs || [],
      diagnostics: cached?.diagnostics || [],
      checked_at: cached?.checked_at || company?.last_checked_at || null,
    };
  };

  return {
    getVersion,
    getDashboard,
    getFullDashboard,
    getCompanies,
    getJobById,
    getJobsPage,
    getHealth,
    ingest,
    recordNotification,
    getBackupCatalog,
    getCompanyTarget,
    countScrapeTargets,
    listScrapeTargets,
    applyCompanyScrape,
    recordBatchRun,
    upsertCompany,
    getCompanyJobs,
    flushPersist: flushPersistSync,
  };
}

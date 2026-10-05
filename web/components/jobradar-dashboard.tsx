"use client";
import { loadPublicCatalog } from "@/lib/public-catalog";
import { JobSearchStrategy } from "./job-search-strategy";
import { hiringManagerDraft } from "@/lib/job-search-strategy";
import { ThemeToggle } from "./theme-toggle";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  CircleGauge,
  Cloud,
  Code2,
  Download,
  ExternalLink,
  Filter,
  Flame,
  History,
  GraduationCap,
  Copy,
  LoaderCircle,
  Mail,
  MapPin,
  Menu,
  Radar,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { postingAge, currentPosting } from "@/lib/job-time";
const ProfilePanel = lazy(() => import("./profile-panel").then(module => ({default: module.ProfilePanel})));
const ResumeWorkspace = lazy(() => import("./resume-workspace").then(module => ({default: module.ResumeWorkspace})));
import {
  cleanSearch,
  profileId,
  safeTracking,
  trackingIdentity,
  readPrivate,
  writePrivate,
  removePrivate,
} from "@/lib/private-profile";
import { Progress } from "@/components/ui/progress";
import { feedbackByFamily, opportunityPriority, personalMatch } from "@/lib/job-match";
import { diversifyFeed, groupDuplicateJobs } from "@/lib/job-feed";
import { fresherRole, internshipRole as isInternship, technicalInternshipRole } from "@/lib/job-sections";

type ApiJob = {
  description?: string;
  id: number;
  external_job_id: string;
  title: string;
  company: string;
  location: string;
  normalized_location: string;
  employment_type: string | null;
  experience_min: number | null;
  experience_max: number | null;
  experience_label: string;
  skills: string;
  ats_provider: string;
  application_url: string;
  career_page_url: string;
  posted_at: string | null;
  posted_label: string | null;
  posted_precision: string;
  reported_age_hours: number | null;
  first_seen_at: string;
  last_seen_at: string;
  relevance_score: number;
  role_category: string;
  hiring_signal: string | null;
  application_status: string;
  is_active: number;
  is_eligible: number;
  eligibility_reason: string;
};
type Company = {
  name: string;
  careers_url: string;
  ats_provider: string;
  last_checked_at: string | null;
  last_success_at: string | null;
  error_count: number;
  jobs_found: number;
  candidate_jobs: number;
  eligible_jobs: number;
  warning: string | null;
};
type Run = {
  id?: number;
  started_at?: string;
  finished_at?: string;
  companies_checked?: number;
  companies_successful?: number;
  companies_failed?: number;
  companies_empty?: number;
  jobs_scanned?: number;
  candidate_jobs?: number;
  new_jobs?: number;
  matching_jobs?: number;
  notifications_sent?: number;
  status?: string;
};
type Notification = {
  id: number;
  channel: string;
  status: string;
  sent_at: string;
  error: string | null;
  title: string;
  company: string;
};
type Payload = {
  data_mode?: "backup";
  snapshot_at?: string;
  coverage?: "partial";
  jobs: ApiJob[];
  companies: Company[];
  latest_run: Run | null;
  runs: Run[];
  notifications: Notification[];
  configured: boolean;
  server_time: string;
  policy: {
    cities: string[];
    max_age_hours: number;
    max_experience_years: number;
    skills_required: boolean;
  };
};
type Tracking = {
  saved: boolean;
  status: string;
  updated_at: string;
  job: ApiJob;
  notes?: string;
  referralStatus?: string;
  appliedAt?: string;
};
type NoticeState = {
  tone: "error" | "success" | "warning";
  title: string;
  text: string;
} | null;
type SearchPreferences = {
  titles: string[];
  skills: string[];
  experienceMin: number;
  experienceMax: number;
  locations: string[];
};

const nav = [
  ["Dashboard", CircleGauge],
  ["Recommended", Radar],
  ["Ultra Fresh", Flame],
  ["Latest Jobs", Sparkles],
  ["All Jobs", History],
  ["Needs Review", AlertTriangle],
  ["DevOps & Cloud", Cloud],
  ["Software Engineering", Code2],
  ["Java / Backend", Code2],
  ["Internships", GraduationCap],
  ["Fresher Roles", GraduationCap],
  ["Job Boards", ExternalLink],
  ["Saved", Bookmark],
  ["Applications", BriefcaseBusiness],
  ["Outreach", Users],
  ["Companies", Building2],
  ["Scraper Health", ShieldCheck],
  ["Notifications", Bell],
  ["Resume Studio", Code2],
  ["Settings", Settings],
] as const;
const primaryNav = new Set([
  "Internships",
  "Fresher Roles",
  "Dashboard",
  "Recommended",
  "All Jobs",
  "Needs Review",
  "Saved",
  "Applications",
]);
const exploreNav = new Set([
  "Latest Jobs",
  "Ultra Fresh",
  "DevOps & Cloud",
  "Software Engineering",
  "Java / Backend",
]);
const toolsNav = new Set(["Outreach", "Companies", "Job Boards", "Resume Studio"]);
const operationsNav = new Set(["Scraper Health", "Notifications", "Settings"]);
const jobViews = new Set([
  "Fresher Roles",
  "Dashboard",
  "Recommended",
  "Ultra Fresh",
  "Latest Jobs",
  "All Jobs",
  "Needs Review",
  "DevOps & Cloud",
  "Software Engineering",
  "Java / Backend",
  "Internships",
  "Saved",
  "Applications",
]);
const statuses = [
  "New",
  "Viewed",
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Ignored",
];
const referralStatuses = [
  "Not started",
  "Looking for referral",
  "Referral requested",
  "Referred",
  "No referral needed",
];
const sortOptions = [
  "Best match",
  "Newest posting",
  "Recently discovered",
  "Company A–Z",
];
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const labelBySlug = new Map(nav.map(([label]) => [slug(label), label]));
const relative = (iso: string | null | undefined) => {
  if (!iso) return "Unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "Unknown";
  const min = Math.max(0, Math.floor(ms / 60000));
  return min < 1
    ? "just now"
    : min < 60
      ? `${min} min ago`
      : min < 1440
        ? `${Math.floor(min / 60)}h ago`
        : `${Math.floor(min / 1440)}d ago`;
};
const exactAge = (iso: string | null | undefined) => {
  if (!iso) return null;
  const age = (Date.now() - new Date(iso).getTime()) / 3600000;
  return Number.isFinite(age) ? Math.max(0, age) : null;
};
const freshnessAge = (job: ApiJob) => postingAge(job);
const postingText = (job: ApiJob) =>
  job.posted_label ||
  (job.posted_at
    ? `Posted ${relative(job.posted_at)}`
    : "Posting time unknown");
const postedToday = (job: ApiJob) =>
  job.posted_precision === "day" &&
  job.posted_at !== null &&
  new Date(job.posted_at).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }) === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const postingStillCurrent = (job: ApiJob) => currentPosting(job);
const parseSkills = (value: string) => {
  try {
    const x = JSON.parse(value);
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
};
const trackingKey = (job: ApiJob) => trackingIdentity(job);
const initialView = () =>
  typeof window === "undefined"
    ? "Dashboard"
    : labelBySlug.get(window.location.hash.slice(1)) || "Dashboard";
const initialTracking = () => {
  if (typeof window === "undefined") return {};
  try {
    return safeTracking(
      JSON.parse(readPrivate("jobradar-tracking-v2") || "{}"),
    ) as Record<string, Tracking>;
  } catch {
    return {};
  }
};
const defaultPreferences: SearchPreferences = {
  titles: [],
  skills: [],
  experienceMin: 0,
  experienceMax: 3,
  locations: ["Bengaluru", "Hyderabad"],
};
const TARGET_CITIES = ["Bengaluru", "Hyderabad"];
const DEFAULT_JOB_TITLES = [
  "Software Engineer", "Associate Software Engineer", "Graduate Engineer Trainee",
  "Java Developer", "Backend Engineer", "Full Stack Developer", "Python Developer",
  "Golang Developer", "Data Engineer", "DevOps Engineer", "Site Reliability Engineer",
  "Platform Engineer", "Cloud Engineer", "Infrastructure Engineer", "Production Engineer",
  "Systems Engineer", "Linux Engineer", "Build and Release Engineer", "SDET",
  "QA Automation Engineer", "Security Engineer", "Technical Support Engineer",
];
const OFFICIAL_ATS_DOMAINS = "site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:icims.com OR site:jobs.jobvite.com OR site:ashbyhq.com OR site:smartrecruiters.com";
const AGGREGATOR_DOMAINS = [
  ["LinkedIn", "site:linkedin.com/jobs/view"],
  ["Indeed", "site:in.indeed.com/viewjob"],
  ["Glassdoor", "site:glassdoor.co.in/job-listing"],
  ["Naukri", "site:naukri.com/job-listings"],
] as const;
const googleJobsUrl = (query: string) =>
  `https://www.google.com/search?tbs=qdr:d&q=${encodeURIComponent(query)}`;
const fallbackTerms = (preferences: SearchPreferences) =>
  (preferences.titles.length ? preferences.titles : DEFAULT_JOB_TITLES)
    .slice(0, 8)
    .map((title) => `"${title}"`)
    .join(" OR ");
const companyFallbackLinks = (
  company: string,
  preferences: SearchPreferences,
) => {
  const query = `"${company}" (${fallbackTerms(preferences)}) (Bengaluru OR Bangalore OR Hyderabad)`;
  return [
    ...AGGREGATOR_DOMAINS.map(([name, domain]) => ({
      name,
      url: googleJobsUrl(`${domain} ${query}`),
    })),
    {
      name: "Official ATS",
      url: googleJobsUrl(`(${OFFICIAL_ATS_DOMAINS}) ${query}`),
    },
  ];
};
const initialPreferences = () => {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    return cleanSearch(
      JSON.parse(readPrivate("jobradar-search-preferences-v1") || "{}"),
    );
  } catch {
    return defaultPreferences;
  }
};
const splitTerms = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  );
const locationPath = (params: URLSearchParams) =>
  `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
const firstRun = () =>
  typeof window !== "undefined" &&
  readPrivate("jobradar-onboarded-v1") !== "true";

export function JobRadarDashboard() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? <DashboardContent /> : <Loading />;
}
function DashboardContent() {
  const [active, setActive] = useState<string>(initialView),
    [location, setLocation] = useState("All cities"),
    [freshness, setFreshness] = useState(() =>
      ["Dashboard", "Recommended", "Ultra Fresh"].includes(initialView()) ? "24 hours" : "Any date"
    ),
    [role, setRole] = useState("All roles"),
    [ats, setAts] = useState("All ATS"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("Best match"),
    [matchMode, setMatchMode] = useState("Recommended"),
    [applicationStage, setApplicationStage] = useState("All stages"),
    [mobile, setMobile] = useState(false),
    [data, setData] = useState<Payload | null>(null),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState<NoticeState>(null),
    [tracking, setTracking] =
      useState<Record<string, Tracking>>(initialTracking),
    [preferences, setPreferences] =
      useState<SearchPreferences>(initialPreferences),
    [editingSearch, setEditingSearch] = useState(false),
    [showWelcome, setShowWelcome] = useState(false),
    [showExplore, setShowExplore] = useState(false),
    [showMoreFilters, setShowMoreFilters] = useState(false),
    [showOperations, setShowOperations] = useState(false),
    [showTools, setShowTools] = useState(false);
  const loadGeneration = useRef(0);
  const activeLoad = useRef<AbortController | null>(null);
  const load = useCallback(async (silent = false) => {
    const generation = ++loadGeneration.current;
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    if (!silent) setLoading(true);
    try {
      const payload = await loadPublicCatalog<Payload>((initial) => {
        if (generation === loadGeneration.current) {
          setData(initial);
          if (!silent) setLoading(false);
        }
      }, fetch, controller.signal);
      if (generation !== loadGeneration.current || controller.signal.aborted) return;
      setData(payload);
      if (!silent) setNotice(null);
    } catch (e) {
      if (generation !== loadGeneration.current || controller.signal.aborted) return;
      setNotice({tone:"error",title:"Dashboard could not refresh",text:e instanceof Error?e.message:"Unable to load JobRadar"});
    } finally {
      if (generation === loadGeneration.current && !silent) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setShowWelcome(firstRun());
    const syncHash = () => {
      const found = labelBySlug.get(window.location.hash.slice(1));
      if (found) {
        setActive(found);
        setFreshness(["Dashboard", "Recommended", "Ultra Fresh"].includes(found) ? "24 hours" : "Any date");
      }
    };
    window.addEventListener("hashchange", syncHash);
    const kickoff = window.setTimeout(() => void load(), 0),
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void load(true);
      }, 300000);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
      activeLoad.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("search");
    const isInvite = params.get("newWorkspace") === "1";
    const explicitWorkspace = params.get("profile");
    if (shared && (isInvite || (explicitWorkspace && explicitWorkspace !== "default"))) {
      try {
        const next = cleanSearch(JSON.parse(shared));
        setPreferences(next);
        writePrivate("jobradar-search-preferences-v1", JSON.stringify(next));
      } catch {
        setNotice({
          tone: "warning",
          title: "Invalid search link",
          text: "Default search preferences are available.",
        });
      }
      if (isInvite) params.set("profile", profileId());
      params.delete("search");
      params.delete("newWorkspace");
      history.replaceState(null, "", locationPath(params));
    } else if (shared) {
      params.delete("search");
      params.delete("newWorkspace");
      history.replaceState(null, "", locationPath(params));
      setNotice({
        tone: "warning",
        title: "Original workspace protected",
        text: "Shared search choices were not imported into this browser’s original workspace. Open a fresh invite or create a separate workspace first.",
      });
    }
    const storageError = () =>
      setNotice({
        tone: "error",
        title: "Browser storage is unavailable or full",
        text: "Export your tracking before leaving. Changes may not survive a refresh.",
      });
    const resume = (event: Event) => {
      const job = (event as CustomEvent<ApiJob>).detail;
      writePrivate(
        "jobradar-tailor-request-v1",
        JSON.stringify({
          key: trackingKey(job),
          title: job.title,
          company: job.company,
          jd: job.description || "",
        }),
      );
      setActive("Resume Studio");
      history.pushState(null, "", "#resume-studio");
    };
    window.addEventListener("jobradar-storage-error", storageError);
    window.addEventListener("jobradar-resume", resume);
    return () => {
      window.removeEventListener("jobradar-storage-error", storageError);
      window.removeEventListener("jobradar-resume", resume);
    };
  }, []);
  const navigate = (label: string) => {
    setActive(label);
    setFreshness(["Dashboard", "Recommended", "Ultra Fresh"].includes(label) ? "24 hours" : "Any date");
    setMobile(false);
    history.pushState(null, "", `#${slug(label)}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  const saveTracking = (job: ApiJob, patch: Partial<Tracking>) =>
    setTracking((current) => {
      const key = trackingKey(job),
        prior = current[key] || {
          saved: false,
          status: "New",
          updated_at: new Date().toISOString(),
          job,
        };
      const next = {
        ...current,
        [key]: {
          ...prior,
          ...patch,
          job,
          updated_at: new Date().toISOString(),
        },
      };
      writePrivate("jobradar-tracking-v2", JSON.stringify(next));
      return next;
    });
  const currentJobs = useMemo(() => data?.jobs || [], [data?.jobs]);
  const mergedJobs = useMemo(() => {
    const map = new Map(currentJobs.map((j) => [trackingKey(j), j]));
    Object.values(tracking).forEach((t) => {
      if (!map.has(trackingKey(t.job)))
        map.set(trackingKey(t.job), { ...t.job, is_active: 0 });
    });
    return [...map.values()];
  }, [currentJobs, tracking]);
  const jobTracking = useCallback(
    (job: ApiJob) =>
      tracking[trackingKey(job)] || {
        saved: false,
        status: "New",
        updated_at: "",
        job,
      },
    [tracking],
  );
  const atsOptions = useMemo(
    () => [
      "All ATS",
      ...Array.from(new Set(currentJobs.map((j) => j.ats_provider))).sort(),
    ],
    [currentJobs],
  );
  const [rankingNow, setRankingNow] = useState(() => Date.now());
  useEffect(() => {setRankingNow(Date.now());}, [data]);
  const ranking = useMemo(() => {
    const now = rankingNow;
    const feedback = feedbackByFamily(Object.values(tracking));
    return new Map(mergedJobs.map(job => {
      const match = personalMatch(job, preferences);
      const opportunity = opportunityPriority(job, preferences, now, match);
      return [trackingKey(job), {match, priority: opportunity.score + (feedback.get(job.role_category) || 0)}];
    }));
  }, [mergedJobs, preferences, tracking, rankingNow]);
  const filtered = useMemo(() => {
    const reviewView = ["Needs Review", "Internships"].includes(active);
    const result = mergedJobs.filter((j) => {
      const track = jobTracking(j),
        q =
          `${j.title} ${j.company} ${j.skills} ${j.role_category} ${j.ats_provider}`.toLowerCase(),
        match = ranking.get(trackingKey(j))!.match;
      if (query && !q.includes(query.toLowerCase())) return false;
      if (active === "Internships" && !isInternship(j)) return false;
      if (active === "Internships" && !technicalInternshipRole(j)) return false;
      if (active === "Fresher Roles" && !fresherRole(j)) return false;
      if (active === "Needs Review" && (isInternship(j) || /\b(?:senior|staff|principal|lead|manager|experienced)\b/i.test(j.title) || !["Experience not stated — verify", "Posting date not verified within 24 hours"].includes(j.eligibility_reason))) return false;
      if (
        active !== "Internships" &&
        !["Saved", "Applications"].includes(active) &&
        isInternship(j)
      )
        return false;
      if (!["Saved", "Applications"].includes(active)) {
        if (location !== "All cities" && !j.normalized_location.includes(location))
          return false;
        if (
          !preferences.locations.some((city) =>
            j.normalized_location.includes(city),
          )
        )
          return false;
        if (
          matchMode === "Exact" &&
          preferences.titles.length &&
          !match.titleMatch
        )
          return false;
        if (
          matchMode === "Exact" &&
          preferences.skills.length &&
          !match.skillMatch
        )
          return false;
        if (!["All Jobs", "Internships"].includes(active) && match.experienceMatch === false) return false;
        if (match.experienceMatch === null && !reviewView && !["All Jobs", "Latest Jobs", "DevOps & Cloud", "Software Engineering", "Java / Backend"].includes(active)) return false;
      }
      if (
        !["Saved", "Applications"].includes(active) &&
        ats !== "All ATS" &&
        j.ats_provider !== ats
      )
        return false;
      if (
        !["Saved", "Applications"].includes(active) &&
        role !== "All roles" &&
        j.role_category !== role
      )
        return false;
      if (
        !reviewView &&
        active !== "Saved" &&
        active !== "Applications" &&
        ["Dashboard", "Recommended", "Ultra Fresh"].includes(active) &&
        !postingStillCurrent(j)
      )
        return false;
      if (active !== "Saved" && active !== "Applications" && !j.is_active)
        return false;
      if (["Dashboard", "Recommended"].includes(active) && !j.is_eligible)
        return false;
      if (active === "Ultra Fresh") {
        const age = freshnessAge(j);
        if (age === null || age >= 3 || j.posted_precision === "day")
          return false;
      }
      if (active === "Recommended" && match.score < 30) return false;
      if (
        active === "DevOps & Cloud" &&
        !/DevOps|Cloud|SRE|Platform|Infrastructure/.test(j.role_category)
      )
        return false;
      if (
        active === "Software Engineering" &&
        j.role_category !== "Software Engineering"
      )
        return false;
      if (active === "Java / Backend" && j.role_category !== "Java / Backend")
        return false;
      if (active === "Saved" && !track.saved) return false;
      if (
        active === "Applications" &&
        !["Applied", "Interview", "Offer", "Rejected"].includes(track.status)
      )
        return false;
      if (
        active === "Applications" &&
        applicationStage !== "All stages" &&
        track.status !== applicationStage
      )
        return false;
      if (!reviewView && !["Saved", "Applications"].includes(active)) {
        const age = freshnessAge(j);
        if (
          freshness === "24 hours" &&
          !["Dashboard", "Recommended", "Ultra Fresh"].includes(active) &&
          !postingStillCurrent(j)
        ) return false;
        if (
          freshness === "3 hours" &&
          (age === null || age > 3 || j.posted_precision === "day")
        )
          return false;
        if (
          freshness === "6 hours" &&
          (age === null || age > 6 || j.posted_precision === "day")
        )
          return false;
      }
      return true;
    });
    const compare = (a: ApiJob, b: ApiJob) =>
      sort === "Newest posting"
        ? (freshnessAge(a) ?? 999) - (freshnessAge(b) ?? 999)
        : sort === "Recently discovered" || (active === "Latest Jobs" && sort === "Best match")
          ? new Date(b.first_seen_at).getTime() -
            new Date(a.first_seen_at).getTime()
          : sort === "Company A–Z"
            ? a.company.localeCompare(b.company)
        : ranking.get(trackingKey(b))!.priority - ranking.get(trackingKey(a))!.priority ||
              ranking.get(trackingKey(b))!.match.score - ranking.get(trackingKey(a))!.match.score ||
              trackingKey(a).localeCompare(trackingKey(b));
    result.sort(compare);
    // Saved/application views retain each original source and tracking identity.
    const unique = ["Saved", "Applications"].includes(active) ? result : groupDuplicateJobs(result).map(group => group.job).sort(compare);
    const ordered = sort === "Best match" && active !== "Latest Jobs"
      ? diversifyFeed(unique, job => ranking.get(trackingKey(job))!.priority) : unique;
    return active === "Dashboard" ? ordered.slice(0, 20) : ordered;
  }, [
    mergedJobs,
    jobTracking,
    query,
    location,
    ats,
    role,
    active,
    freshness,
    preferences,
    sort,
    applicationStage,
    matchMode,
    ranking,
  ]);
  const applyPreferences = (next: SearchPreferences) => {
    setPreferences(next);
    writePrivate("jobradar-search-preferences-v1", JSON.stringify(next));
    setLocation(next.locations.length === 1 ? next.locations[0] : "All cities");
    setEditingSearch(false);
    navigate("All Jobs");
    setNotice({
      tone: "success",
      title: "Search preferences saved",
      text: `Ranking ${next.locations.join(" + ")} roles for ${next.experienceMin}–${next.experienceMax} YOE${next.titles.length ? ` using ${next.titles.length} preferred titles` : ""}${next.skills.length ? ` and ${next.skills.length} preferred skills` : ""}.`,
    });
  };
  const eligible = currentJobs.filter(
      (j) => j.is_eligible && j.is_active && postingStillCurrent(j) && !isInternship(j),
    ),
    reviewPreview = currentJobs.filter(
      (j) => j.is_active && !isInternship(j) &&
        !/\b(?:senior|staff|principal|lead|manager|experienced)\b/i.test(j.title) &&
        ["Experience not stated — verify", "Posting date not verified within 24 hours"].includes(j.eligibility_reason) &&
        personalMatch(j, preferences).experienceMatch !== false &&
        preferences.locations.some((city) => j.normalized_location.includes(city)) &&
        (location === "All cities" || j.normalized_location.includes(location)) &&
        (role === "All roles" || j.role_category === role) &&
        (ats === "All ATS" || j.ats_provider === ats) &&
        (!query || `${j.title} ${j.company} ${j.skills} ${j.role_category} ${j.ats_provider}`.toLowerCase().includes(query.toLowerCase())) &&
        (matchMode !== "Exact" || ((!preferences.titles.length || personalMatch(j, preferences).titleMatch) &&
          (!preferences.skills.length || personalMatch(j, preferences).skillMatch))),
    ).slice(0, 20),
    internships = currentJobs.filter(
      (j) => j.is_active && technicalInternshipRole(j),
    ),
    ultra = eligible.filter((j) => {
      const age = freshnessAge(j);
      return age !== null && age < 3 && j.posted_precision !== "day";
    }),
    internshipUltra = internships.filter((j) => {
      const age = freshnessAge(j);
      return age !== null && age < 3 && j.posted_precision !== "day";
    });
  const exportTracking = () => {
    const blob = new Blob([JSON.stringify(tracking, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `jobradar-tracking-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const clearTracking = () => {
    if (
      !window.confirm(
        "Clear all saved jobs and application tracking from this browser?",
      )
    )
      return;
    removePrivate("jobradar-tracking-v2");
    setTracking({});
    setNotice({
      tone: "success",
      title: "Private tracking cleared",
      text: "Saved jobs and application stages were removed from this browser.",
    });
  };
  const dismissWelcome = (edit = false) => {
    writePrivate("jobradar-onboarded-v1", "true");
    setShowWelcome(false);
    if (edit) {
      setEditingSearch(true);
      navigate("All Jobs");
    }
  };
  const clearQuickFilters = () => {
    setQuery("");
    setLocation(
      preferences.locations.length === 1 ? preferences.locations[0] : "All cities",
    );
    setFreshness(["Dashboard", "Recommended", "Ultra Fresh"].includes(active) ? "24 hours" : "Any date");
    setRole("All roles");
    setAts("All ATS");
    setSort("Best match");
    setMatchMode("Recommended");
    setApplicationStage("All stages");
  };
  const showJobs = jobViews.has(active),
    companySearch = active === "Companies" ? query : "";
  const visibleJobs = ["Dashboard", "Recommended"].includes(active) && !filtered.length ? reviewPreview : filtered;
  const navGroup = (title: string, items: Set<string>) => (
    <div className="mb-4">
      <p className="mb-1 px-4 text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground">
        {title}
      </p>
      {nav.filter(([label]) => items.has(label)).map(([label, Icon]) => (
        <button
          key={label}
          aria-current={active === label ? "page" : undefined}
          onClick={() => navigate(label)}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold ${active === label ? "bg-success-soft text-success" : "text-muted-foreground hover:bg-muted"}`}
        >
          <Icon size={18} />
          {label}
          {label === "Ultra Fresh" && ultra.length > 0 && (
            <span className="ml-auto rounded-full bg-[#ff5c45] px-2 py-0.5 text-[10px] text-white">{ultra.length}</span>
          )}
          {label === "Internships" && internships.length > 0 && (
            <span className="ml-auto rounded-full bg-[#7651c9] px-2 py-0.5 text-[10px] text-white">{internships.length}</span>
          )}
        </button>
      ))}
    </div>
  );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={`${mobile ? "flex" : "hidden"} fixed inset-y-0 left-0 z-40 w-72 flex-col border-r border-border bg-sidebar lg:flex`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-border px-6">
          <div className="grid size-10 place-items-center rounded-xl bg-hero text-white">
            <Radar size={22} />
          </div>
          <div>
            <p className="text-lg font-black">JOBRADAR</p>
            <p className="text-[10px] font-bold uppercase tracking-[.22em] text-muted-foreground">
              Official sources · truthful dates
            </p>
          </div>
          <button
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
            className="ml-auto lg:hidden"
          >
            <X />
          </button>
        </div>
        <nav
          aria-label="JobRadar views"
          className="flex-1 space-y-1 overflow-y-auto p-4"
        >
          {navGroup("Find work", primaryNav)}
          <button
            type="button"
            aria-expanded={showExplore}
            onClick={() => setShowExplore((value) => !value)}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <Filter size={18} /> Browse by role
            {showExplore ? <ChevronUp className="ml-auto" size={16} /> : <ChevronDown className="ml-auto" size={16} />}
          </button>
          {(showExplore || exploreNav.has(active)) && navGroup("Role views", exploreNav)}
          <button type="button" aria-expanded={showTools} onClick={() => setShowTools(value => !value)} className="mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted">
            <BriefcaseBusiness size={18} /> Career tools
            {showTools ? <ChevronUp className="ml-auto" size={16} /> : <ChevronDown className="ml-auto" size={16} />}
          </button>
          {(showTools || toolsNav.has(active)) && navGroup("Career tools", toolsNav)}
          <button
            type="button"
            aria-expanded={showOperations}
            onClick={() => setShowOperations((value) => !value)}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
          >
            <ShieldCheck size={18} /> System & privacy
            {showOperations ? <ChevronUp className="ml-auto" size={16} /> : <ChevronDown className="ml-auto" size={16} />}
          </button>
          {(showOperations || operationsNav.has(active)) && navGroup("Operations", operationsNav)}
        </nav>
        <SystemCard data={data} loading={loading} />
      </aside>
      <main className="pb-20 lg:pb-0 lg:pl-72">
        <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-border bg-card/90 px-4 backdrop-blur-xl md:px-8">
          <button
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
            className="lg:hidden"
          >
            <Menu />
          </button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-muted-foreground">
              Discover → verify → apply
            </p>
            <h1 className="text-xl font-black">{active}</h1>
          </div>
          <div className="ml-auto hidden w-80 md:block">
            <SearchBox
              value={query}
              setValue={setQuery}
              placeholder={
                active === "Companies"
                  ? "Search companies or ATS..."
                  : "Search jobs, skills, companies..."
              }
            />
          </div>
          <ThemeToggle />
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />{" "}
            Refresh
          </Button>
        </header>
        <div className="mx-auto max-w-[1500px] p-4 md:p-8">
          <div className="mb-4 md:hidden">
            <SearchBox
              value={query}
              setValue={setQuery}
              placeholder={
                active === "Companies"
                  ? "Search companies or ATS..."
                  : "Search jobs, skills, companies..."
              }
            />
          </div>
          {showWelcome && (
            <WelcomeCard
              setup={() => dismissWelcome(true)}
              dismiss={() => dismissWelcome(false)}
            />
          )}{" "}
          {notice && <Notice {...notice} close={() => setNotice(null)} />}{" "}
          {data?.data_mode === "backup" && (
            <div role="status" className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft p-5 text-warning">
              <h2 className="font-bold">Backup mode — saved job catalog</h2>
              <p className="mt-2 text-sm">Live data is temporarily unavailable. Showing the catalog saved {data.snapshot_at ? new Date(data.snapshot_at).toLocaleString() : "earlier"}. {data.coverage === "partial" ? "This backup contains a limited selection of jobs. " : ""}Listings and scan history may be outdated; verify openings on the employer site. Saving jobs, notes and application tracking still work in this browser. Refresh retries live data automatically.</p>
            </div>
          )}
          {!notice && !data?.configured && !loading && (
            <Notice
              tone="warning"
              title="Automation is not connected"
              text="The database exists, but ingestion is not configured."
              close={() => setNotice(null)}
            />
          )}
          {showJobs && (
            <>
              {active === "Dashboard" && !showWelcome && (
                <ProductPromise
                  sources={data?.companies.length || 0}
                  lastScan={data?.latest_run?.finished_at}
                  setup={() => setEditingSearch(true)}
                  internships={() => navigate("Internships")}
                />
              )}
              <section className="mb-6 rounded-3xl bg-hero p-6 text-white md:p-8">
                <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
                  <div>
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-white/80">
                      <Radar size={16} />
                      Opportunity radar
                    </div>
                    <h2 className="text-3xl font-black md:text-4xl">
                      {loading
                        ? "Checking live jobs…"
                        : ["Dashboard", "Recommended"].includes(active) && !filtered.length && reviewPreview.length
                          ? `${reviewPreview.length} roles to review`
                          : `${filtered.length} ${active === "Internships" ? "internships" : "jobs"} in this view`}
                    </h2>
                    <p className="mt-2 text-sm text-white/80">
                      {preferences.locations.join(" + ")} ·{" "}
                      {preferences.experienceMin}–{preferences.experienceMax}{" "}
                      YOE ·{" "}
                      {preferences.skills.length
                        ? `${preferences.skills.length} preferred skills`
                        : "skills optional"}{" "}
                      · official links
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Metric value={active === "Internships" ? internshipUltra.length : ["Dashboard", "Recommended"].includes(active) && !filtered.length ? reviewPreview.length : ultra.length} label={["Dashboard", "Recommended"].includes(active) && !filtered.length ? "Review leads" : "Verified < 3h"} />
                    <Metric value={visibleJobs.filter(j => j.normalized_location.includes("Bengaluru")).length} label="Bengaluru" />
                    <Metric value={visibleJobs.filter(j => j.normalized_location.includes("Hyderabad")).length} label="Hyderabad" />
                  </div>
                </div>
              </section>
              <section className="mb-5 flex flex-col flex-wrap gap-3 rounded-2xl border border-border bg-card p-3 xl:flex-row xl:items-center">
                <div className="flex items-center gap-2 px-2 text-sm font-bold">
                  <Filter size={17} />
                  Filters
                </div>
                <Pills
                  items={["All cities", ...TARGET_CITIES]}
                  value={location}
                  setValue={setLocation}
                />
                <Pills
                  items={["Any date", "3 hours", "6 hours", "24 hours"]}
                  value={freshness}
                  setValue={setFreshness}
                />
                <Button
                  variant="outline"
                  aria-expanded={showMoreFilters}
                  onClick={() => setShowMoreFilters((value) => !value)}
                  className="rounded-xl"
                >
                  <Filter size={15} /> More filters
                  {showMoreFilters ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </Button>
                <Button
                  onClick={() => setEditingSearch((x) => !x)}
                  className="rounded-xl bg-primary"
                >
                  <Settings size={15} /> Edit search
                </Button>
                <button
                  onClick={clearQuickFilters}
                  className="px-2 text-xs font-bold text-muted-foreground hover:text-success"
                >
                  Clear
                </button>
                <span className="ml-auto text-xs font-bold text-muted-foreground">
                  {visibleJobs.length} results
                </span>
                {showMoreFilters && (
                  <div className="flex w-full flex-wrap items-center gap-3 border-t border-border px-2 pt-3">
                    <Pills
                      items={["Recommended", "Exact"]}
                      value={matchMode}
                      setValue={setMatchMode}
                    />
                    <select
                      aria-label="Role filter"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="h-10 rounded-xl border bg-card px-3 text-xs font-bold"
                    >
                      <option>All roles</option>
                      <option>DevOps</option>
                      <option>Cloud</option>
                      <option>SRE</option>
                      <option>Platform</option>
                      <option>Infrastructure / Operations</option>
                      <option>Software Engineering</option>
                      <option>Java / Backend</option>
                      <option>Quality Engineering</option>
                      <option>Technical Support</option>
                    </select>
                    <select
                      aria-label="ATS filter"
                      value={ats}
                      onChange={(e) => setAts(e.target.value)}
                      className="h-10 rounded-xl border bg-card px-3 text-xs font-bold"
                    >
                      {atsOptions.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Sort jobs"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      className="h-10 rounded-xl border bg-card px-3 text-xs font-bold"
                    >
                      {sortOptions.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
                )}
              </section>
              {editingSearch && (
                <SearchPreferencesPanel
                  value={preferences}
                  apply={applyPreferences}
                  close={() => setEditingSearch(false)}
                />
              )}{" "}
              {active === "Applications" && (
                <ApplicationSummary
                  tracking={tracking}
                  stage={applicationStage}
                  setStage={setApplicationStage}
                />
              )}
              {active === "Internships" && (
                <InternshipDiscovery preferences={preferences} lastScan={data?.latest_run?.finished_at} count={filtered.length} freshCount={filtered.filter(job => postingStillCurrent(job)).length} />
              )}
              {active === "Fresher Roles" && (
                <section className="mb-5 rounded-2xl border border-info/40 bg-info-soft p-5 text-sm text-info">
                  Full-time roles explicitly accepting zero experience, or graduate/trainee titles when no minimum is stated. Internships and apprenticeships have their own section. Entry-level title labels are inferred from the title; verify the employer requirements. Roles requiring 1–3 years remain in All Jobs.
                </section>
              )}
              {active === "Latest Jobs" && (
                <section className="mb-5 rounded-2xl border border-info/40 bg-info-soft p-5 text-sm text-info">
                  Sorted by when JobRadar first discovered each active listing. Employer posting dates may be older or unavailable; check the date shown on each card.
                </section>
              )}
              {active === "All Jobs" && (
                <section className="mb-5 rounded-2xl border border-info/40 bg-info-soft p-5 text-sm text-info">
                  All active target-city listings, including roles outside your experience range. Review each card’s eligibility reason before applying.
                </section>
              )}
              {active === "Needs Review" && (
                <section className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft p-5">
                  <h3 className="font-black text-warning">Date or experience needs verification</h3>
                  <p className="mt-1 text-sm leading-6 text-warning/80">
                    These active postings lack a verified 24-hour date or an experience range. They stay separate from confirmed matches and never trigger automatic alerts. Check the official description before applying.
                  </p>
                </section>
              )}
            </>
          )}
          {active === "Settings" && <Suspense fallback={<Loading />}><ProfilePanel /></Suspense>}
          {active === "Resume Studio" ? (
            <Suspense fallback={<Loading />}><ResumeWorkspace /></Suspense>
          ) : loading ? (
            <Loading />
          ) : showJobs ? (
            <>
              {["Dashboard", "Recommended"].includes(active) && !filtered.length && reviewPreview.length > 0 && (
                <section className="mb-5 rounded-2xl border border-warning/40 bg-warning-soft p-5">
                  <h3 className="font-black text-warning">No verified 24-hour matches right now</h3>
                  <p className="mt-1 text-sm leading-6 text-warning/80">
                    These roles were seen in the latest employer feeds, but their posting date or experience range needs checking. They are not counted as fresh matches and will not trigger alerts. Open the official listing before applying.
                  </p>
                </section>
              )}
              <JobList
                now={rankingNow}
                jobs={visibleJobs}
                preferences={preferences}
                getTracking={jobTracking}
                saveTracking={saveTracking}
              />
            </>
          ) : active === "Job Boards" ? (
            <JobBoardsView preferences={preferences} />
          ) : active === "Outreach" ? (
            <OutreachView data={data} jobs={currentJobs} preferences={preferences} />
          ) : active === "Companies" ? (
            <CompaniesView data={data} query={companySearch} preferences={preferences} />
          ) : active === "Scraper Health" ? (
            <HealthView data={data} />
          ) : active === "Notifications" ? (
            <NotificationsView data={data} />
          ) : (
            <SettingsView
              data={data}
              tracking={tracking}
              exportTracking={exportTracking}
              clearTracking={clearTracking}
            />
          )}
        </div>
      </main>
      <nav
        aria-label="Quick navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(18,63,44,.08)] backdrop-blur lg:hidden"
      >
        {([
          ["Dashboard", Radar],
          ["All Jobs", Search],
          ["Saved", Bookmark],
          ["Applications", BriefcaseBusiness],
        ] as const).map(([label, Icon]) => (
          <button
            key={label}
            onClick={() => navigate(label)}
            aria-current={active === label ? "page" : undefined}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ${active === label ? "text-success" : "text-muted-foreground"}`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function WelcomeCard({
  setup,
  dismiss,
}: {
  setup: () => void;
  dismiss: () => void;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
        <div>
          <Badge className="bg-success-soft text-success">
            WELCOME TO JOBRADAR
          </Badge>
          <h2 className="mt-4 text-2xl font-black md:text-3xl">
            Your job search, organized in one place.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Set your titles, skills, experience, and cities once. Review fresh
            official openings, save the strongest matches, apply on the employer
            site, and track every application here.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={setup} className="h-11 rounded-xl bg-primary">
              <Settings size={16} /> Set up my search
            </Button>
            <Button
              onClick={dismiss}
              variant="outline"
              className="h-11 rounded-xl"
            >
              Use 0–3 YOE defaults
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          <OnboardingStep number="1" text="Choose your search" />
          <OnboardingStep number="2" text="Apply on official pages" />
          <OnboardingStep number="3" text="Track your progress" />
        </div>
      </div>
    </section>
  );
}

function ProductPromise({
  sources,
  lastScan,
  setup,
  internships,
}: {
  sources: number;
  lastScan?: string;
  setup: () => void;
  internships: () => void;
}) {
  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr] lg:p-8">
        <div>
          <Badge className="bg-success-soft text-success">
            EARLY-CAREER OPPORTUNITY RADAR
          </Badge>
          <h2 className="mt-4 max-w-3xl text-2xl font-black leading-tight md:text-3xl">
            Skip stale reposts. Find verified roles where you can actually apply.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            JobRadar checks official employer career pages, verifies posting age and
            experience evidence, explains every match, and takes you to the original
            application—not a copied listing.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={setup} className="h-11 rounded-xl bg-primary px-5">
              <Radar size={16} /> Personalize my radar
            </Button>
            <Button onClick={internships} variant="outline" className="h-11 rounded-xl">
              <GraduationCap size={16} /> Explore internships
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <PromiseLine
            title={`${sources || "600+"} official sources`}
            text="Employer pages and supported ATS feeds—not copied job-board results."
          />
          <PromiseLine
            title="Evidence before recommendation"
            text="Freshness, location and 0–3 YOE eligibility stay visible and explainable."
          />
          <PromiseLine
            title="Private by default"
            text={`Saved jobs and application stages stay in your browser · scan ${lastScan ? relative(lastScan) : "pending"}.`}
          />
        </div>
      </div>
    </section>
  );
}

function PromiseLine({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-muted p-4">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success">
        <Check size={15} />
      </span>
      <div>
        <p className="text-sm font-black">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function OnboardingStep({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
        {number}
      </span>
      <span className="text-sm font-bold">{text}</span>
    </div>
  );
}

function SearchPreferencesPanel({
  value,
  apply,
  close,
}: {
  value: SearchPreferences;
  apply: (value: SearchPreferences) => void;
  close: () => void;
}) {
  const [titles, setTitles] = useState(value.titles.join(", ")),
    [skills, setSkills] = useState(value.skills.join(", ")),
    [experienceMin, setExperienceMin] = useState(value.experienceMin),
    [experienceMax, setExperienceMax] = useState(value.experienceMax),
    [locations, setLocations] = useState(value.locations);
  const toggleLocation = (city: string) =>
    setLocations((current) =>
      current.includes(city)
        ? current.filter((x) => x !== city)
        : [...current, city],
    );
  const submit = () => {
    const min = Math.max(0, Math.min(10, experienceMin)),
      max = Math.max(min, Math.min(10, experienceMax));
    apply({
      titles: splitTerms(titles),
      skills: splitTerms(skills),
      experienceMin: min,
      experienceMax: max,
      locations: locations.length ? locations : TARGET_CITIES,
    });
  };
  const reset = () => {
    setTitles("");
    setSkills("");
    setExperienceMin(0);
    setExperienceMax(3);
    setLocations(TARGET_CITIES);
  };
  return (
    <section
      aria-label="Edit job search preferences"
      className="mb-5 rounded-3xl border border-border bg-muted p-5 shadow-sm md:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-success">
            My job search
          </p>
          <h2 className="mt-1 text-xl font-black">
            Overwrite search preferences
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Comma-separate multiple titles or skills. They improve ranking in
            Recommended mode; Exact mode can require them.
          </p>
        </div>
        <button
          aria-label="Close search preferences"
          onClick={close}
          className="rounded-lg p-2 hover:bg-success-soft"
        >
          <X size={18} />
        </button>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <label className="text-sm font-bold">
          Job titles
          <textarea
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-y rounded-xl border border-border bg-card p-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            placeholder="DevOps Engineer, Platform Engineer, Java Developer"
          />
        </label>
        <label className="text-sm font-bold">
          Skills
          <textarea
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-y rounded-xl border border-border bg-card p-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            placeholder="AWS, Kubernetes, Java, Spring Boot"
          />
        </label>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]">
        <label className="text-sm font-bold">
          Minimum experience
          <Input
            type="number"
            min={0}
            max={10}
            value={experienceMin}
            onChange={(e) => setExperienceMin(Number(e.target.value))}
            className="mt-2 h-11 bg-card"
          />
        </label>
        <label className="text-sm font-bold">
          Maximum experience
          <Input
            type="number"
            min={0}
            max={10}
            value={experienceMax}
            onChange={(e) => setExperienceMax(Number(e.target.value))}
            className="mt-2 h-11 bg-card"
          />
        </label>
        <fieldset>
          <legend className="text-sm font-bold">Locations</legend>
          <div className="mt-2 flex min-h-11 flex-wrap gap-2">
            {TARGET_CITIES.map((city) => (
              <label
                key={city}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold ${locations.includes(city) ? "border-primary/50 bg-success-soft text-success" : "bg-card"}`}
              >
                <input
                  type="checkbox"
                  checked={locations.includes(city)}
                  onChange={() => toggleLocation(city)}
                  className="size-4 accent-[#155d3a]"
                />
                {city}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={submit} className="h-11 rounded-xl bg-primary px-5">
          <Search size={16} /> Save & search jobs
        </Button>
        <Button onClick={reset} variant="outline" className="h-11 rounded-xl">
          Reset defaults
        </Button>
        <span className="text-xs text-muted-foreground md:ml-auto">
          Saved privately in this browser and applied instantly.
        </span>
      </div>
    </section>
  );
}

function SearchBox({
  value,
  setValue,
  placeholder,
}: {
  value: string;
  setValue: (x: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-2.5 text-muted-foreground" size={18} />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-10 rounded-xl bg-muted pl-10"
        placeholder={placeholder}
      />
    </div>
  );
}
function Notice({
  tone,
  title,
  text,
  close,
}: {
  tone: "error" | "success" | "warning";
  title: string;
  text: string;
  close: () => void;
}) {
  const style =
    tone === "error"
      ? "border-danger/40 bg-danger-soft text-danger"
      : tone === "success"
        ? "border-success/40 bg-success-soft text-success"
        : "border-warning/40 bg-warning-soft text-warning";
  return (
    <div
      role="status"
      className={`mb-5 flex gap-3 rounded-2xl border p-4 ${style}`}
    >
      <AlertTriangle className="shrink-0" size={20} />
      <div>
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-sm opacity-80">{text}</p>
      </div>
      <button
        aria-label="Dismiss message"
        onClick={close}
        className="ml-auto self-start"
      >
        <X size={17} />
      </button>
    </div>
  );
}
function SystemCard({
  data,
  loading,
}: {
  data: Payload | null;
  loading: boolean;
}) {
  const run = data?.latest_run,
    age = exactAge(run?.finished_at),
    stale = !loading && (age === null || age >= 5),
    failed = Number(run?.companies_failed || 0),
    empty = Number(run?.companies_empty || 0),
    backup = data?.data_mode === "backup",
    attention = backup || stale || failed > 0,
    label =
      backup ? "BACKUP MODE" : loading && !run
        ? "LOADING LIVE STATUS"
        : !run
          ? "AWAITING FIRST SCAN"
          : stale
            ? "SCAN OVERDUE"
            : failed
              ? "SCAN FAILED SOURCES"
              : "SCAN HEALTHY";
  return (
    <div
      className={`m-4 rounded-2xl border p-4 ${attention ? "border-warning/40 bg-warning-soft" : "border-border bg-success-soft"}`}
    >
      <div
        className={`mb-2 flex items-center gap-2 text-xs font-bold ${attention ? "text-warning" : "text-success"}`}
      >
        <span
          className={`size-2 rounded-full ${loading && !run ? "animate-pulse bg-slate-400" : attention ? "bg-amber-500" : "bg-[#22a060]"}`}
        />
        {label}
      </div>
      <p className="text-xs text-muted-foreground">
        {loading && !run
          ? "Checking latest run…"
          : run?.finished_at
            ? relative(run.finished_at)
            : "No completed scan"}
      </p>
      {run && (
        <p className="mt-3 text-xs">
          {run.companies_successful}/{run.companies_checked} sources checked ·{" "}
          {empty} empty · {failed} failed
        </p>
      )}
    </div>
  );
}
function Loading() {
  return (
    <div className="grid place-items-center rounded-3xl border bg-card p-20">
      <LoaderCircle className="animate-spin text-success" />
    </div>
  );
}
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-24 rounded-2xl bg-white/10 p-4">
      <span className="text-2xl font-black">{value}</span>
      <p className="mt-1 text-[11px] font-bold uppercase text-white/80">
        {label}
      </p>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}
function Pills({
  items,
  value,
  setValue,
}: {
  items: string[];
  value: string;
  setValue: (x: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
      {items.map((x) => (
        <button
          key={x}
          aria-pressed={value === x}
          onClick={() => setValue(x)}
          className={`rounded-lg px-3 py-2 text-xs font-bold ${value === x ? "bg-card text-success shadow-sm" : "text-muted-foreground"}`}
        >
          {x}
        </button>
      ))}
    </div>
  );
}
function JobList({
  now,
  jobs,
  preferences,
  getTracking,
  saveTracking,
}: {
  now: number;
  jobs: ApiJob[];
  preferences: SearchPreferences;
  getTracking: (j: ApiJob) => Tracking;
  saveTracking: (j: ApiJob, p: Partial<Tracking>) => void;
}) {
  const [limit, setLimit] = useState(30);
  useEffect(() => setLimit(30), [jobs]);
  return (
    <section className="space-y-4">
      {jobs.length ? (
        jobs
          .slice(0, limit)
          .map((j) => (
            <JobCard
              now={now}
              key={trackingKey(j)}
              job={j}
              preferences={preferences}
              tracking={getTracking(j)}
              saveTracking={saveTracking}
            />
          ))
      ) : (
        <Empty />
      )}
      {jobs.length > limit && (
        <button
          onClick={() => setLimit((n) => n + 30)}
          className="w-full rounded-xl border bg-card p-4 font-bold"
        >
          Show more jobs ({jobs.length - limit} remaining)
        </button>
      )}
    </section>
  );
}
function ApplicationSummary({
  tracking,
  stage,
  setStage,
}: {
  tracking: Record<string, Tracking>;
  stage: string;
  setStage: (value: string) => void;
}) {
  const values = Object.values(tracking),
    counts = Object.fromEntries(
      statuses.map((status) => [
        status,
        values.filter((item) => item.status === status).length,
      ]),
    );
  return (
    <section className="mb-5 rounded-3xl border bg-card p-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[.15em] text-muted-foreground">
            Application pipeline
          </p>
          <h2 className="mt-1 text-xl font-black">
            {
              values.filter((x) =>
                ["Applied", "Interview", "Offer", "Rejected"].includes(
                  x.status,
                ),
              ).length
            }{" "}
            active records
          </h2>
        </div>
        <select
          aria-label="Application stage filter"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="h-11 rounded-xl border bg-card px-4 text-sm font-bold"
        >
          <option>All stages</option>
          {["Applied", "Interview", "Offer", "Rejected"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {["Applied", "Interview", "Offer", "Rejected"].map((status) => (
          <button
            key={status}
            onClick={() => setStage(status === stage ? "All stages" : status)}
            className={`rounded-2xl border p-4 text-left ${stage === status ? "border-primary/50 bg-success-soft" : "bg-muted"}`}
          >
            <span className="text-2xl font-black">{counts[status] || 0}</span>
            <p className="mt-1 text-xs font-bold uppercase text-muted-foreground">
              {status}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
function JobCard({
  now,
  job,
  preferences,
  tracking,
  saveTracking,
}: {
  now: number;
  job: ApiJob;
  preferences: SearchPreferences;
  tracking: Tracking;
  saveTracking: (j: ApiJob, p: Partial<Tracking>) => void;
}) {
  const [details, setDetails] = useState(false),
    match = personalMatch(job, preferences),
    opportunity = opportunityPriority(job, preferences, now, match),
    skills = parseSkills(job.skills),
    age = freshnessAge(job),
    fresh = postedToday(job)
      ? "POSTED TODAY"
      : age === null
        ? "DATE UNKNOWN"
        : age < 3
          ? "ULTRA FRESH"
          : age < 6
            ? "FRESH"
            : age < 24
              ? "WITHIN 24H"
              : "OLDER";
  const updateStatus = (status: string) =>
    saveTracking(job, {
      status,
      appliedAt:
        status === "Applied" && !tracking.appliedAt
          ? new Date().toISOString()
          : tracking.appliedAt,
    });
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge
              className={
                job.is_eligible
                  ? "bg-success-soft text-success"
                  : "bg-warning-soft text-warning"
              }
            >
              {job.is_eligible ? fresh : "REVIEW"}
            </Badge>
            <Badge variant="outline">{job.role_category}</Badge>
            {isInternship(job) && (
              <Badge className="bg-info-soft text-info">INTERNSHIP</Badge>
            )}
            {!job.is_eligible && (
              <span className="text-xs text-warning">
                {job.eligibility_reason}
              </span>
            )}
            {!job.is_active && (
              <Badge variant="outline">
                No longer in live feed — verify availability
              </Badge>
            )}
            {tracking.status !== "New" && (
              <Badge className="bg-info-soft text-info">
                {tracking.status}
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              First detected <b>{relative(job.first_seen_at)}</b>
            </span>
          </div>
          <div className="flex gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted font-black text-success">
              {job.company[0]}
            </div>
            <div>
              <h3 className="text-xl font-black">{job.title}</h3>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {job.company}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {job.normalized_location}
                </span>
                <span className="flex items-center gap-1">
                  <BriefcaseBusiness size={14} />
                  {job.experience_label}
                </span>
                <span>{postingText(job)}</span>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {skills.length ? (
              skills.slice(0, 6).map((s: string) => (
                <span
                  key={s}
                  className="rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-bold"
                >
                  {s}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                Skills optional / not specified
              </span>
            )}
            {skills.length > 6 && (
              <button
                type="button"
                onClick={() => setDetails(true)}
                className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground"
              >
                +{skills.length - 6} more
              </button>
            )}
          </div>
        </div>
        <div className="flex min-w-72 flex-col justify-between border-t bg-muted p-5 lg:border-l lg:border-t-0">
          <div>
            <div className="flex items-end justify-between">
              <span className="text-xs font-bold uppercase text-muted-foreground">
                Opportunity priority
              </span>
              <span className="text-3xl font-black text-success">
                {opportunity.score}
                <small className="text-xs">/100</small>
              </span>
            </div>
            <Progress value={opportunity.score} className="mt-3 h-2" />
            <p className="mt-2 text-xs font-semibold">Match: {match.score}/100 · {opportunity.freshness.basis === "discovered" ? "Posting age unknown" : "Employer posting age"}</p>
            {match.missingSkills.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Not in your profile: {match.missingSkills.slice(0, 3).join(", ")}</p>}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {match.reasons.slice(0, 3).join(" · ") || "Target role to review"}
            </p>
            <p className="mt-2 text-[11px] capitalize text-muted-foreground">
              {job.ats_provider} · official source
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <a
              href={job.application_url}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                updateStatus(
                  tracking.status === "New" ? "Viewed" : tracking.status,
                )
              }
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-primary-foreground"
            >
              Apply now <ExternalLink size={15} />
            </a>
            <a
              href={job.career_page_url}
              target="_blank"
              rel="noreferrer"
              className="flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-black"
            >
              Official listing <ExternalLink size={14} />
            </a>
          </div>
          {isInternship(job) && (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in (recruiter OR \"talent acquisition\" OR \"campus hiring\") \"${job.company}\"`)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex h-10 items-center justify-center gap-2 rounded-xl border bg-card text-xs font-bold text-success"
            >
              Find public hiring contacts <ExternalLink size={14} />
            </a>
          )}
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <button
              aria-label={tracking.saved ? "Remove saved job" : "Save job"}
              onClick={() => saveTracking(job, { saved: !tracking.saved })}
              className={`grid size-10 place-items-center rounded-xl border ${tracking.saved ? "bg-danger-soft text-danger" : ""}`}
            >
              <Bookmark
                size={17}
                fill={tracking.saved ? "currentColor" : "none"}
              />
            </button>
            <select
              aria-label={`Application stage for ${job.title}`}
              value={tracking.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="h-10 rounded-xl border bg-card px-3 text-xs font-bold"
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("jobradar-resume", { detail: job }),
              )
            }
            className="mt-3 rounded-xl border py-2 text-xs font-bold"
          >
            Tailor resume for this job
          </button>
          <button
            aria-expanded={details}
            onClick={() => setDetails((x) => !x)}
            className="mt-3 w-full rounded-xl py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
          >
            {details
              ? "Hide application details"
              : "Add notes or referral status"}
          </button>
        </div>
      </div>
      {details && (
        <div className="grid gap-4 border-t bg-muted p-5 md:grid-cols-2">
          {job.description && (
            <div className="md:col-span-2">
              <h4 className="font-bold">Employer description</h4>
              <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
                {job.description}
              </p>
            </div>
          )}
          <label className="text-sm font-bold">
            Referral status
            <select
              value={tracking.referralStatus || "Not started"}
              onChange={(e) =>
                saveTracking(job, { referralStatus: e.target.value })
              }
              className="mt-2 h-11 w-full rounded-xl border bg-card px-3 text-sm font-normal"
            >
              {referralStatuses.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Private notes
            <textarea
              value={tracking.notes || ""}
              onChange={(e) => saveTracking(job, { notes: e.target.value })}
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border bg-card p-3 text-sm font-normal"
              placeholder="Recruiter, referral contact, interview date, follow-up…"
            />
          </label>
          {tracking.appliedAt && (
            <p className="text-xs text-muted-foreground md:col-span-2">
              Marked applied {relative(tracking.appliedAt)}. Stored only in this
              browser.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
function Empty() {
  return (
    <div className="rounded-3xl border border-dashed bg-card p-16 text-center">
      <Radar className="mx-auto mb-4 text-muted-foreground" />
      <h3 className="text-lg font-bold">No jobs in this view</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Change filters or check after the next completed scan.
      </p>
    </div>
  );
}

function InternshipDiscovery({ preferences, lastScan, count, freshCount }: { preferences: SearchPreferences; lastScan?: string; count: number; freshCount: number }) {
  const preferred = preferences.titles.length
    ? preferences.titles.map((title) => /\b(?:intern|internship|apprentice)\b/i.test(title) ? title : `${title} Intern`)
    : ["Software Engineer Intern", "DevOps Intern", "Java Intern", "Cloud Intern", "Data Engineer Intern", "SRE Intern", "Security Intern"];
  const query = encodeURIComponent(preferred.join(" OR "));
  const cities = [
    { name: "Bengaluru", linkedin: "Bengaluru, Karnataka, India", naukri: "bangalore" },
    { name: "Hyderabad", linkedin: "Hyderabad, Telangana, India", naukri: "hyderabad" },
  ];
  const links = cities.flatMap((city) => [
    { name: `LinkedIn internships — ${city.name}`, url: `https://www.linkedin.com/jobs/search/?keywords=${query}&location=${encodeURIComponent(city.linkedin)}&f_TPR=r86400&f_JT=I&f_E=1%2C2&sortBy=DD` },
    { name: `Naukri internships — ${city.name}`, url: `https://www.naukri.com/internship-jobs-in-${city.naukri}?jobAge=1&k=${query}` },
    { name: `Official ATS internships — ${city.name}`, url: `https://www.google.com/search?q=${encodeURIComponent(`(${preferred.map(title=>`"${title}"`).join(" OR ")}) ("${city.name}" OR "${city.name === "Bengaluru" ? "Bangalore" : city.name}") (${OFFICIAL_ATS_DOMAINS})`)}` },
  ]);
  return (
    <section className="mb-5 rounded-3xl border border-info/40 bg-info-soft p-5">
      <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-700 text-white"><GraduationCap size={20} /></div><div><h3 className="font-black text-info">Internship & apprenticeship discovery</h3><p className="mt-1 text-sm leading-6 text-info/75">Kept separate from full-time jobs. JobRadar indexes official employer sources and offers user-initiated LinkedIn, Naukri and official ATS searches; it never scrapes those job boards.</p></div></div>
      <p className="mt-3 text-sm font-semibold">{count} matching listings · {freshCount} with a current employer date · last completed scan: {lastScan ? new Date(lastScan).toLocaleString("en-IN", {timeZone: "Asia/Kolkata"}) + " IST" : "not available"}.</p>
      <p className="mt-2 text-xs text-info/70">Employer sources are checked approximately every four hours. Refresh reloads the latest scan; it does not start a new scan. Older or unknown-date listings stay visible for review and are not presented as newly posted. Full-time experience preferences do not hide internships.</p>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{links.map((link) => <a key={link.name} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-info/40 bg-card p-3 text-sm font-bold text-info hover:border-info/40">{link.name} <ExternalLink size={15} /></a>)}</div>
      <p className="mt-3 text-xs text-info/70">Use the Companies area to open a company-specific public recruiter search. Verify employment before sending a short, personalized referral request; JobRadar collects no personal data.</p>
    </section>
  );
}

function JobBoardsView({ preferences }: { preferences: SearchPreferences }) {
  const terms = preferences.titles.length
    ? preferences.titles
    : DEFAULT_JOB_TITLES;
  const query = encodeURIComponent(terms.join(" OR "));
  const cities = [
    { name: "Bengaluru", linkedin: "Bengaluru, Karnataka, India", naukri: "bangalore" },
    { name: "Hyderabad", linkedin: "Hyderabad, Telangana, India", naukri: "hyderabad" },
  ];
  const links = cities.flatMap((city) => [
    { name: `LinkedIn — ${city.name}`, url: `https://www.linkedin.com/jobs/search/?keywords=${query}&location=${encodeURIComponent(city.linkedin)}&f_TPR=r86400&f_JT=F&f_E=2&sortBy=DD` },
    { name: `Naukri — ${city.name}`, url: `https://www.naukri.com/jobs-in-${city.naukri}?jobAge=1&k=${query}` },
    { name: `Indeed via Google — ${city.name}`, url: googleJobsUrl(`site:in.indeed.com/viewjob (${terms.slice(0, 8).map(title=>`"${title}"`).join(" OR ")}) ("${city.name}" OR "${city.name === "Bengaluru" ? "Bangalore" : city.name}")`) },
    { name: `Glassdoor via Google — ${city.name}`, url: googleJobsUrl(`site:glassdoor.co.in/job-listing (${terms.slice(0, 8).map(title=>`"${title}"`).join(" OR ")}) ("${city.name}" OR "${city.name === "Bengaluru" ? "Bangalore" : city.name}")`) },
    { name: `Google official ATS — ${city.name}`, url: `https://www.google.com/search?q=${encodeURIComponent(`(${terms.map(title=>`"${title}"`).join(" OR ")}) ("${city.name}" OR "${city.name === "Bengaluru" ? "Bangalore" : city.name}") (${OFFICIAL_ATS_DOMAINS})`)}` },
  ]);
  return (
    <div className="space-y-5">
      <JobSearchStrategy titles={preferences.titles} />
      <SectionTitle
        icon={ExternalLink}
        title="Search job boards safely"
        text="One-click searches use your preferred titles and the last-24-hours filter"
      />
      <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
        JobRadar cannot copy these sites automatically without authorized access.
        Fallback searches cover LinkedIn, Naukri, Indeed, Glassdoor and official
        ATS discovery pages. Search date filters do not verify posting dates. Check the employer and posting date, then
        apply through the official employer link. These searches do not write to D1.
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {links.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-2xl border bg-card p-5 font-black text-success shadow-sm hover:border-primary/50"
          >
            {link.name} <ExternalLink size={17} />
          </a>
        ))}
      </div>
    </div>
  );
}

function OutreachView({
  data,
  jobs,
  preferences,
}: {
  data: Payload | null;
  jobs: ApiJob[];
  preferences: SearchPreferences;
}) {
  const companies = useMemo(() => {
    const seen = new Set<string>();
    return (data?.companies || []).filter((company) => {
      const key = company.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data?.companies]);
  const [companyName, setCompanyName] = useState("");
  const [jobKey, setJobKey] = useState("");
  const [copied, setCopied] = useState("");
  const company =
    companies.find((item) => item.name === companyName) || companies[0];
  const companyJobs = jobs
    .filter((job) => job.is_active && job.company === company?.name)
    .sort((a, b) => personalMatch(b, preferences).score - personalMatch(a, preferences).score);
  const selectedJob =
    companyJobs.find((job) => trackingKey(job) === jobKey) || companyJobs[0];
  const role = selectedJob?.title || preferences.titles[0] || "an early-career engineering role";
  const locationText = preferences.locations.join(" or ") || "India";
  let domain = "";
  try {
    domain = company ? new URL(company.careers_url).hostname.replace(/^www\./, "") : "";
  } catch {}
  const recruiterQuery = `site:linkedin.com/in (recruiter OR \"talent acquisition\" OR \"campus hiring\") \"${company?.name || ""}\"`;
  const referralQuery = `site:linkedin.com/in \"${company?.name || ""}\" (${role}) (${locationText})`;
  const emailQuery = `${domain ? `site:${domain} ` : ""}(\"careers@\" OR \"jobs@\" OR \"talent@\" OR \"recruiting@\") \"${company?.name || ""}\"`;
  const subject = `Interest in ${role} at ${company?.name || "your company"}`;
  const recruiterMessage = `Hi [Name], I’m interested in the ${role} opportunity at ${company?.name || "your company"}${selectedJob ? ` (${selectedJob.application_url})` : ""}. My background includes [2 relevant skills] and [one measurable result]. I have applied through the official careers page. If you handle this role, could you please share any guidance on the process? Thank you.`;
  const referralMessage = `Hi [Name], I’m exploring the ${role} role at ${company?.name || "your company"}${selectedJob ? ` (${selectedJob.application_url})` : ""}. I noticed your experience at the company and would value a quick perspective on the team. If my background in [relevant skills] appears suitable, would you be comfortable considering a referral? No worries if not—thank you for your time.`;
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("Copy failed");
    }
  };
  if (!company) return <Empty />;
  const searches = [
    {
      label: "Potential hiring managers",
      detail: "Verify current team ownership before contacting anyone",
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company?.name || ""}" ("engineering manager" OR "team lead" OR "head of engineering")`)}`,
      icon: Users,
    },
    {
      label: "Recruiters on LinkedIn",
      detail: "Public talent-acquisition and campus-hiring profiles",
      url: `https://www.google.com/search?q=${encodeURIComponent(recruiterQuery)}`,
      icon: Users,
    },
    {
      label: "Potential referrers",
      detail: "Public employee profiles aligned to this role",
      url: `https://www.google.com/search?q=${encodeURIComponent(referralQuery)}`,
      icon: Users,
    },
    {
      label: "Public hiring emails",
      detail: "Published role inboxes on the company’s official domain",
      url: `https://www.google.com/search?q=${encodeURIComponent(emailQuery)}`,
      icon: Mail,
    },
    {
      label: "Naukri company roles",
      detail: "Current listings to verify recruiter and role context",
      url: `https://www.naukri.com/jobs-in-india?k=${encodeURIComponent(`${company.name} ${role}`)}&jobAge=1`,
      icon: ExternalLink,
    },
  ];
  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Users}
        title="Recruiter outreach & referrals"
        text="Find public contact paths, verify them, then send a short personalized message"
      />
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-bold">
            Company
            <select
              value={company.name}
              onChange={(event) => { setCompanyName(event.target.value); setJobKey(""); }}
              className="mt-2 h-11 w-full rounded-xl border bg-card px-3 text-sm font-normal"
            >
              {companies.map((item) => <option key={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">
            Role context
            <select
              value={selectedJob ? trackingKey(selectedJob) : ""}
              onChange={(event) => setJobKey(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border bg-card px-3 text-sm font-normal"
            >
              {companyJobs.length ? companyJobs.map((job) => (
                <option key={trackingKey(job)} value={trackingKey(job)}>{job.title} · {job.normalized_location}</option>
              )) : <option value="">Use preferred role</option>}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-muted p-4 text-sm">
          <span className="font-black">{company.name}</span>
          <span className="text-muted-foreground">{domain || "Official career source"}</span>
          <a href={company.careers_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-bold text-success">Official careers <ExternalLink size={14} /></a>
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        {searches.map(({ label, detail, url, icon: Icon }) => (
          <a key={label} href={url} target="_blank" rel="noreferrer" className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm hover:border-primary/50">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success-soft text-success"><Icon size={20} /></span>
            <span><span className="block font-black">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span>
            <ExternalLink className="ml-auto text-muted-foreground group-hover:text-success" size={17} />
          </a>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <OutreachTemplate title="Message a hiring manager" text={hiringManagerDraft(company.name, role, selectedJob?.application_url)} copied={copied === "manager"} copy={() => copy("manager", hiringManagerDraft(company.name, role, selectedJob?.application_url))} />
        <OutreachTemplate title="Message a recruiter" text={recruiterMessage} copied={copied === "recruiter"} copy={() => copy("recruiter", recruiterMessage)} />
        <OutreachTemplate title="Ask for a referral" text={referralMessage} copied={copied === "referral"} copy={() => copy("referral", referralMessage)} />
      </div>
      <section className="rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
        <p className="font-black">Safe outreach checklist</p>
        <p className="mt-1 leading-6">Use only emails published on the official company domain, verify the person still works there, apply first when possible, personalize one proof point, and send one respectful follow-up at most. JobRadar never guesses email patterns, scrapes private profiles, or stores contacts.</p>
        <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(recruiterMessage)}`} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-900 px-4 py-2 font-bold text-white"><Mail size={15} /> Open email draft</a>
      </section>
    </div>
  );
}

function OutreachTemplate({ title, text, copied, copy }: { title: string; text: string; copied: boolean; copy: () => void }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black">{title}</h3>
        <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold text-success"><Copy size={14} /> {copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{text}</p>
    </section>
  );
}

function CompaniesView({
  data,
  query,
  preferences,
}: {
  data: Payload | null;
  query: string;
  preferences: SearchPreferences;
}) {
  const companies = (data?.companies || []).filter((c) =>
    `${c.name} ${c.ats_provider}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <SectionTitle
        icon={Building2}
        title="Official career sources"
        text={`${companies.length} of ${data?.companies.length || 0} sources shown`}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Info label="Structured ATS" value={String(companies.filter((c) => c.ats_provider !== "custom").length)} />
        <Info label="Productive now" value={String(companies.filter((c) => c.candidate_jobs > 0).length)} />
        <Info label="Healthy sources" value={String(companies.filter((c) => !c.error_count).length)} />
      </div>
      <div className="grid gap-3 md:hidden">
        {companies.map((c) => {
          const limited = c.warning?.startsWith("Limited coverage"),
            state = c.error_count ? "Failed" : limited ? "Limited coverage" : c.jobs_found === 0 ? "No current openings" : c.candidate_jobs === 0 ? "No target roles" : "Productive";
          const fallback = companyFallbackLinks(c.name, preferences);
          return <article key={`mobile-${c.ats_provider}-${c.name}`} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{c.name}</h3><p className="mt-1 text-xs capitalize text-muted-foreground">{c.ats_provider} · checked {relative(c.last_checked_at)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${c.error_count ? "bg-danger-soft text-danger" : limited || c.jobs_found === 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>{state}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-muted p-2"><b className="block text-base">{c.jobs_found}</b>Raw</div><div className="rounded-xl bg-muted p-2"><b className="block text-base">{c.candidate_jobs}</b>Target</div><div className="rounded-xl bg-muted p-2"><b className="block text-base">{c.eligible_jobs}</b>Eligible</div></div>{c.warning && <p className="mt-3 text-xs text-muted-foreground">{c.warning}</p>}<div className="mt-4 flex flex-wrap gap-3 text-sm font-bold text-success"><a href={c.careers_url} target="_blank" rel="noreferrer">Official careers</a>{(limited || c.error_count > 0 || c.jobs_found === 0) && fallback.map(link=><a key={link.name} href={link.url} target="_blank" rel="noreferrer">{link.name}</a>)}<a href={`https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in ${c.name} (recruiter OR talent acquisition OR engineering manager) (Bengaluru OR Hyderabad)`)}`} target="_blank" rel="noreferrer">Outreach</a></div></article>;
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted text-xs uppercase">
            <tr>
              <th className="p-4">Company</th>
              <th>ATS</th>
              <th>Raw jobs</th>
              <th>Target roles</th>
              <th>Eligible</th>
              <th>Last checked</th>
              <th>Truthful health</th>
              <th>Career page</th>
              <th>Fallback discovery</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const limited = c.warning?.startsWith("Limited coverage"),
                fallback = companyFallbackLinks(c.name, preferences),
                state = c.error_count
                  ? "Failed"
                  : limited
                    ? "Limited coverage"
                    : c.jobs_found === 0
                      ? "No current openings"
                      : c.candidate_jobs === 0
                        ? "No target roles"
                        : "Productive";
              return (
                <tr key={`${c.ats_provider}-${c.name}`} className="border-t">
                  <td className="p-4 font-bold">{c.name}</td>
                  <td className="capitalize">{c.ats_provider}</td>
                  <td>{c.jobs_found}</td>
                  <td>{c.candidate_jobs}</td>
                  <td>{c.eligible_jobs}</td>
                  <td>{relative(c.last_checked_at)}</td>
                  <td
                    className={
                      c.error_count
                        ? "text-danger"
                        : limited || c.jobs_found === 0
                          ? "text-warning"
                          : "text-success"
                    }
                  >
                    {state}
                    {c.warning && (
                      <span className="block max-w-52 text-[10px] text-muted-foreground">
                        {c.warning}
                      </span>
                    )}
                  </td>
                  <td>
                    <a
                      href={c.careers_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-success"
                    >
                      Open <ExternalLink size={14} />
                    </a>
                  </td>
                  <td>
                    <div className="flex max-w-72 flex-wrap gap-2">
                      {fallback.map(link=><a key={link.name} href={link.url} target="_blank" rel="noreferrer" className="font-bold text-success">{link.name}</a>)}
                      <a href={`https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in ${c.name} (recruiter OR talent acquisition OR engineering manager) (Bengaluru OR Hyderabad)`)}`} target="_blank" rel="noreferrer" className="font-bold text-success">Contacts</a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function HealthView({ data }: { data: Payload | null }) {
  const run = data?.latest_run,
    runs = data?.runs || [],
    age = exactAge(run?.finished_at),
    healthy =
      data?.data_mode !== "backup" && age !== null && age < 5 && Number(run?.companies_failed || 0) === 0,
    limited = (data?.companies || []).filter((c) =>
      c.warning?.startsWith("Limited coverage"),
    ).length;
  return (
    <div className="space-y-5">
      <SectionTitle
        icon={ShieldCheck}
        title={healthy ? "Latest scan completed" : "Automation needs attention"}
        text={
          run?.finished_at
            ? `Last completed ${relative(run.finished_at)} · ${run.status}`
            : "No completed scan"
        }
      />
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat
          label="Sources checked"
          value={Number(run?.companies_checked || 0)}
        />
        <Stat
          label="Requests passed"
          value={Number(run?.companies_successful || 0)}
        />
        <Stat label="Empty sources" value={Number(run?.companies_empty || 0)} />
        <Stat label="Limited coverage" value={limited} />
        <Stat label="Failed" value={Number(run?.companies_failed || 0)} />
        <Stat label="Raw jobs" value={Number(run?.jobs_scanned || 0)} />
        <Stat label="Eligible" value={Number(run?.matching_jobs || 0)} />
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b p-4 font-black">
          <History size={18} />
          Recent scan history
        </div>
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase">
              <th className="p-4">Completed</th>
              <th>Status</th>
              <th>Sources</th>
              <th>Empty</th>
              <th>Raw</th>
              <th>Candidates</th>
              <th>Eligible</th>
              <th>New</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-4">{relative(r.finished_at)}</td>
                <td
                  className={
                    r.status === "success"
                      ? "text-success"
                      : "text-warning"
                  }
                >
                  {r.status}
                </td>
                <td>
                  {r.companies_successful}/{r.companies_checked}
                </td>
                <td>{r.companies_empty || 0}</td>
                <td>{r.jobs_scanned}</td>
                <td>{r.candidate_jobs || 0}</td>
                <td>{r.matching_jobs}</td>
                <td>{r.new_jobs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function NotificationsView({ data }: { data: Payload | null }) {
  const notifications = data?.notifications || [],
    sent = notifications.filter((n) => n.status === "sent").length;
  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Bell}
        title="Telegram delivery audit"
        text={
          notifications.length
            ? `${sent} of ${notifications.length} recorded alerts delivered`
            : "No Version 7 delivery records yet"
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Info
          label="Alert rule"
          value="New or previously failed eligible jobs"
        />
        <Info
          label="Duplicate protection"
          value="Sent alerts are not repeated"
        />
        <Info label="Message links" value="Application + career page" />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-4 font-black">Recent notifications</div>
        {notifications.length ? (
          notifications.map((n) => (
            <div
              key={n.id}
              className="grid grid-cols-2 gap-3 border-b px-4 py-3 text-sm last:border-0 md:grid-cols-5"
            >
              <b>{n.title}</b>
              <span>{n.company}</span>
              <span className="capitalize">{n.channel}</span>
              <span
                className={
                  n.status === "sent" ? "text-success" : "text-danger"
                }
              >
                {n.status}
              </span>
              <span>{relative(n.sent_at)}</span>
              {n.error && (
                <p className="col-span-full text-xs text-danger">{n.error}</p>
              )}
            </div>
          ))
        ) : (
          <p className="p-8 text-sm text-muted-foreground">
            Delivery tracking will appear after the next eligible alert.
          </p>
        )}
      </div>
    </div>
  );
}
function SettingsView({
  data,
  tracking,
  exportTracking,
  clearTracking,
}: {
  data: Payload | null;
  tracking: Record<string, Tracking>;
  exportTracking: () => void;
  clearTracking: () => void;
}) {
  const policy = data?.policy;
  return (
    <div className="space-y-5">
      <SectionTitle
        icon={Settings}
        title="Policy and private data"
        text="Scraper policy is verified in GitHub; personal tracking stays in this browser"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Info
          label="Locations"
          value={policy?.cities.join(" + ") || "Bengaluru + Hyderabad"}
        />
        <Info
          label="Experience"
          value={`Explicit 0–${policy?.max_experience_years ?? 3} YOE, including 2+`}
        />
        <Info
          label="Posting age"
          value={`Within ${policy?.max_age_hours ?? 24} hours or employer “today” label`}
        />
        <Info
          label="Skills"
          value={policy?.skills_required ? "Required" : "Optional"}
        />
      </div>
      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-black">Private application tracking</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {Object.keys(tracking).length} jobs tracked in this browser. Export a
          backup before clearing browser data.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={exportTracking} variant="outline">
            <Download size={16} /> Export JSON
          </Button>
          <Button
            onClick={clearTracking}
            variant="outline"
            className="text-danger"
          >
            <Trash2 size={16} /> Clear tracking
          </Button>
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-6">
        <h3 className="font-black">Reliability controls</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CheckLine text="Employer relative dates remain labels, not invented timestamps" />
          <CheckLine text="Failed or limited sources do not deactivate existing jobs" />
          <CheckLine text="Leadership titles are excluded; Senior titles still follow the 0–3 YOE rule" />
          <CheckLine text="Zero-result sources are reported without marking the full scan unhealthy" />
          <CheckLine text="Failed Telegram deliveries are retry candidates" />
          <CheckLine text="Saved and application stages are independent" />
          <CheckLine text="Dashboard automatically refreshes every five minutes" />
        </div>
      </div>
    </div>
  );
}
function SectionTitle({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl bg-hero p-6 text-white">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-white/10">
          <Icon />
        </div>
        <div>
          <h2 className="text-2xl font-black">{title}</h2>
          <p className="mt-1 text-sm text-white/80">{text}</p>
        </div>
      </div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 font-black">{value}</p>
    </div>
  );
}
function CheckLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm font-semibold">
      <Check size={16} className="text-success" />
      {text}
    </div>
  );
}

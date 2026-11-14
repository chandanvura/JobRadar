"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  ExternalLink,
  Eye,
  LoaderCircle,
  Plus,
  Radar,
  RefreshCw,
  Sparkles,
  Square,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobPagination } from "./job-pagination";

export interface CompanyRecord {
  name: string;
  careers_url: string;
  ats_provider: string;
  ats_identifier?: string;
  priority?: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  error_count: number;
  jobs_found: number;
  candidate_jobs: number;
  eligible_jobs: number;
  warning: string | null;
}

interface ScrapeOutcomeSummary {
  company: string;
  ats_provider: string;
  ats_identifier: string;
  careers_url: string;
  total_discovered: number;
  target_city_jobs: number;
  eligible_jobs: number;
  new_jobs: number;
  upgraded: boolean;
  discovered_source: {
    ats_provider: string;
    ats_identifier: string;
    careers_url: string;
    method: string;
  } | null;
  warning: string | null;
  error: string | null;
  diagnostics: string[];
  duration_ms: number;
}

interface InspectedJob {
  external_job_id: string;
  title: string;
  location: string;
  normalized_location: string;
  role_category: string;
  experience_label: string;
  is_eligible: boolean | number;
  eligibility_reason: string;
  application_url: string;
  ats_provider: string;
}

interface InspectPayload {
  company: CompanyRecord | null;
  ingested_jobs: InspectedJob[];
  fetched_jobs: InspectedJob[];
  diagnostics: string[];
  checked_at: string | null;
}

type SegmentFilter = "all" | "unproductive" | "custom" | "productive" | "failed";

const ATS_PROVIDERS = [
  { value: "custom", label: "Auto-detect / custom site" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "ashby", label: "Ashby" },
  { value: "smartrecruiters", label: "SmartRecruiters" },
  { value: "workable", label: "Workable" },
  { value: "workday", label: "Workday" },
  { value: "oracle", label: "Oracle HCM" },
  { value: "eightfold", label: "Eightfold" },
  { value: "eightfold_legacy", label: "Eightfold Legacy" },
  { value: "phenom", label: "Phenom" },
  { value: "jibe", label: "Jibe" },
  { value: "talentbrew", label: "TalentBrew" },
  { value: "avature", label: "Avature" },
  { value: "mynexthire", label: "MyNextHire" },
  { value: "successfactors", label: "SuccessFactors" },
  { value: "keka", label: "Keka" },
  { value: "paylocity", label: "Paylocity" },
  { value: "icims", label: "iCIMS" },
  { value: "recruitee", label: "Recruitee" },
  { value: "pinpoint", label: "Pinpoint" },
  { value: "rippling", label: "Rippling" },
  { value: "bamboohr", label: "BambooHR" },
  { value: "darwinbox", label: "Darwinbox" },
  { value: "jobvite", label: "Jobvite" },
  { value: "kula", label: "Kula" },
  { value: "pyjamahr", label: "PyjamaHR" },
  { value: "atlassian", label: "Atlassian Listings" },
  { value: "avalara", label: "Avalara (Careerpuck)" },
  { value: "ibm", label: "IBM Careers" },
  { value: "google_careers", label: "Google Careers" },
  { value: "juspay", label: "Juspay" },
  { value: "thoughtspot", label: "ThoughtSpot" },
  { value: "deel", label: "Deel" },
  { value: "amazon", label: "Amazon Jobs" },
  { value: "xml", label: "XML / RSS Feed" },
];

function isCompanyUnproductive(c: CompanyRecord): boolean {
  return (
    c.jobs_found === 0 ||
    c.error_count > 0 ||
    c.ats_provider === "custom" ||
    Boolean(c.warning?.startsWith("Limited coverage"))
  );
}

function companyHealthState(c: CompanyRecord): {
  label: string;
  tone: "danger" | "warning" | "success";
} {
  if (!c.last_checked_at) return { label: "Awaiting scan", tone: "warning" };
  if (c.error_count > 0) return { label: "Failed", tone: "danger" };
  if (c.warning?.startsWith("Limited coverage")) {
    return { label: "Limited coverage", tone: "warning" };
  }
  if (c.jobs_found === 0) return { label: "No current openings", tone: "warning" };
  if (c.candidate_jobs === 0) return { label: "Global only (0 target)", tone: "warning" };
  return { label: "Productive", tone: "success" };
}

export function CompaniesPanel({
  companies,
  query,
  fallbackLinks,
  relativeTime,
  onDataChanged,
  onCompaniesUpdated,
}: {
  companies: CompanyRecord[];
  query: string;
  fallbackLinks: (companyName: string) => { name: string; url: string }[];
  relativeTime: (iso: string | null) => string;
  onDataChanged: () => Promise<void> | void;
  onCompaniesUpdated?: (updated: CompanyRecord[], newJobsCount: number) => void;
}) {
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sweepAbortController, setSweepAbortController] = useState<AbortController | null>(null);
  const [sweepProgress, setSweepProgress] = useState<{
    mode: string;
    batches: number;
    scanned: number;
    remaining: number;
    upgraded: number;
    discovered: number;
    targetJobs: number;
    newJobs: number;
  } | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    detail: string;
    outcomes?: ScrapeOutcomeSummary[];
  } | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newProvider, setNewProvider] = useState("custom");
  const [newIdentifier, setNewIdentifier] = useState("");

  const [editingCompany, setEditingCompany] = useState<CompanyRecord | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editProvider, setEditProvider] = useState("custom");
  const [editIdentifier, setEditIdentifier] = useState("");
  const [probePreview, setProbePreview] = useState<ScrapeOutcomeSummary | null>(null);

  const [inspectTarget, setInspectTarget] = useState<string | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectData, setInspectData] = useState<InspectPayload | null>(null);
  const [inspectTab, setInspectTab] = useState<"fetched" | "ingested">("fetched");

  const counts = useMemo(() => {
    let structured = 0;
    let productive = 0;
    let unproductive = 0;
    let custom = 0;
    let failed = 0;
    for (const c of companies) {
      if (c.ats_provider !== "custom") structured += 1;
      if (c.candidate_jobs > 0) productive += 1;
      if (isCompanyUnproductive(c)) unproductive += 1;
      if (c.ats_provider === "custom" || !c.ats_identifier) custom += 1;
      if (c.error_count > 0) failed += 1;
    }
    return { structured, productive, unproductive, custom, failed };
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (q) {
        const hay = `${c.name} ${c.ats_provider} ${c.ats_identifier || ""} ${c.careers_url}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (segment === "unproductive") return isCompanyUnproductive(c);
      if (segment === "custom") return c.ats_provider === "custom" || !c.ats_identifier;
      if (segment === "productive") return c.candidate_jobs > 0;
      if (segment === "failed") return c.error_count > 0;
      return true;
    });
  }, [companies, query, segment]);

  const openInspector = async (companyName: string) => {
    setInspectTarget(companyName);
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/companies/${encodeURIComponent(companyName)}/jobs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as InspectPayload;
      setInspectData(payload);
      setInspectTab(payload.fetched_jobs.length > 0 ? "fetched" : "ingested");
    } catch (err) {
      setStatusBanner({
        tone: "error",
        title: `Could not load ${companyName} jobs`,
        detail: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setInspectLoading(false);
    }
  };

  const applyCompanyUpdates = (updated: CompanyRecord[], newJobsCount: number) => {
    if (onCompaniesUpdated && updated.length > 0) {
      onCompaniesUpdated(updated, newJobsCount);
      return;
    }
    void onDataChanged();
  };

  type ScrapeStreamSummary = {
    scanned: number;
    remaining?: number;
    upgraded: number;
    total_discovered: number;
    target_jobs: number;
    eligible_jobs: number;
    new_jobs: number;
  };

  const readNdjsonScrape = async (
    res: Response,
    onOutcome: (outcome: ScrapeOutcomeSummary, company?: CompanyRecord) => void,
  ): Promise<{ outcomes: ScrapeOutcomeSummary[]; summary: ScrapeStreamSummary }> => {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("x-ndjson") || !res.body) {
      const body = (await res.json()) as {
        error?: string;
        outcomes?: ScrapeOutcomeSummary[];
        companies?: CompanyRecord[];
        summary?: ScrapeStreamSummary;
      };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const list = body.outcomes || [];
      list.forEach((o, idx) => onOutcome(o, body.companies?.[idx]));
      return {
        outcomes: list,
        summary: body.summary || {
          scanned: list.length,
          upgraded: 0,
          total_discovered: 0,
          target_jobs: 0,
          eligible_jobs: 0,
          new_jobs: 0,
        },
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const outcomes: ScrapeOutcomeSummary[] = [];
    let summary: ScrapeStreamSummary = {
      scanned: 0,
      upgraded: 0,
      total_discovered: 0,
      target_jobs: 0,
      eligible_jobs: 0,
      new_jobs: 0,
    };

    const handleLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;
      const evt = JSON.parse(line) as {
        type?: string;
        outcome?: ScrapeOutcomeSummary;
        company?: CompanyRecord;
        summary?: ScrapeStreamSummary;
      };
      if (evt.type === "outcome" && evt.outcome) {
        outcomes.push(evt.outcome);
        onOutcome(evt.outcome, evt.company);
      } else if (evt.type === "summary" && evt.summary) {
        summary = evt.summary;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);
    return { outcomes, summary };
  };

  const runBatchScrape = async (mode: "unproductive" | "custom" | "priority") => {
    const key = `batch:${mode}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/companies/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ mode, limit: 10, stream: true }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const { outcomes, summary: s } = await readNdjsonScrape(res, (outcome, company) => {
        if (company) applyCompanyUpdates([company], outcome.new_jobs);
      });
      setStatusBanner({
        tone: s.total_discovered > 0 ? "success" : "warning",
        title: `Scanned ${s.scanned} sources`,
        detail: `${s.upgraded} ATS sources auto-upgraded · ${s.total_discovered} total jobs found · ${s.target_jobs} target Bengaluru/Hyderabad roles (${s.new_jobs} new added to catalog).`,
        outcomes,
      });
    } catch (err) {
      setStatusBanner({
        tone: "error",
        title: "Batch scan failed",
        detail: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const runFullSweep = async (mode: "unproductive" | "custom" | "all") => {
    const controller = new AbortController();
    setSweepAbortController(controller);
    setBusyKey(`sweep:${mode}`);
    const visited: string[] = [];
    const recentOutcomes: ScrapeOutcomeSummary[] = [];
    let batches = 0;
    let scanned = 0;
    let upgraded = 0;
    let discovered = 0;
    let targetJobs = 0;
    let newJobs = 0;

    setSweepProgress({
      mode,
      batches: 0,
      scanned: 0,
      remaining: companies.length,
      upgraded: 0,
      discovered: 0,
      targetJobs: 0,
      newJobs: 0,
    });

    try {
      while (!controller.signal.aborted) {
        const res = await fetch("/api/companies/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          signal: controller.signal,
          body: JSON.stringify({ mode, limit: 8, excludeNames: visited, stream: true }),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        batches += 1;
        const { outcomes: batchOutcomes, summary } = await readNdjsonScrape(
          res,
          (outcome, company) => {
            scanned += 1;
            if (outcome.upgraded) upgraded += 1;
            discovered += outcome.total_discovered;
            targetJobs += outcome.target_city_jobs;
            newJobs += outcome.new_jobs;
            if (outcome.total_discovered > 0 || outcome.upgraded) {
              recentOutcomes.unshift(outcome);
              if (recentOutcomes.length > 24) recentOutcomes.length = 24;
            }
            if (company) applyCompanyUpdates([company], outcome.new_jobs);
            setSweepProgress((prev) => ({
              mode,
              batches,
              scanned,
              remaining: Math.max(0, (prev?.remaining ?? companies.length) - 1),
              upgraded,
              discovered,
              targetJobs,
              newJobs,
            }));
          },
        );
        if (batchOutcomes.length === 0) break;
        for (const o of batchOutcomes) visited.push(o.company);
        const remaining = summary.remaining ?? 0;
        setSweepProgress({
          mode,
          batches,
          scanned,
          remaining,
          upgraded,
          discovered,
          targetJobs,
          newJobs,
        });
        if (remaining === 0) break;
      }

      setStatusBanner({
        tone: discovered > 0 ? "success" : "warning",
        title: controller.signal.aborted
          ? `Sweep stopped after ${scanned} employers`
          : `Sweep completed across ${scanned} employers`,
        detail: `${upgraded} ATS sources auto-upgraded · ${discovered} total jobs found · ${targetJobs} target Bengaluru/Hyderabad roles (${newJobs} new added).`,
        outcomes: recentOutcomes.slice(0, 12),
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setStatusBanner({
          tone: "error",
          title: "Sweep interrupted",
          detail: err instanceof Error ? err.message : "Network error",
        });
      }
    } finally {
      setSweepProgress(null);
      setSweepAbortController(null);
      setBusyKey(null);
    }
  };

  const scanSingleCompany = async (companyName: string) => {
    setBusyKey(`scan:${companyName}`);
    try {
      const res = await fetch("/api/companies/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName }),
      });
      const body = (await res.json()) as {
        error?: string;
        outcomes?: ScrapeOutcomeSummary[];
        companies?: CompanyRecord[];
      };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const outcome = body.outcomes?.[0];
      if (body.companies?.length) {
        applyCompanyUpdates(body.companies, outcome?.new_jobs || 0);
      } else {
        await onDataChanged();
      }
      if (outcome) {
        setStatusBanner({
          tone: outcome.error
            ? "error"
            : outcome.total_discovered > 0
              ? "success"
              : "warning",
          title: `${outcome.company}: ${outcome.total_discovered} jobs discovered`,
          detail: outcome.error
            ? outcome.error
            : `Provider: ${outcome.ats_provider}${outcome.ats_identifier ? ` (${outcome.ats_identifier})` : ""} · ${outcome.target_city_jobs} target city roles · ${outcome.new_jobs} new jobs added (${outcome.duration_ms}ms).`,
          outcomes: [outcome],
        });
      }
      if (inspectTarget?.toLowerCase() === companyName.toLowerCase()) {
        await openInspector(companyName);
      }
    } catch (err) {
      setStatusBanner({
        tone: "error",
        title: `Scan failed for ${companyName}`,
        detail: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const probeCompany = async (companyName: string) => {
    setBusyKey(`probe:${companyName}`);
    try {
      const res = await fetch("/api/companies/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName, ats_provider: "auto", apply: true }),
      });
      const body = (await res.json()) as {
        error?: string;
        outcome?: ScrapeOutcomeSummary;
        company?: CompanyRecord | null;
      };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const o = body.outcome!;
      if (body.company) {
        applyCompanyUpdates([body.company], o.new_jobs);
      } else {
        await onDataChanged();
      }
      setStatusBanner({
        tone: o.discovered_source || o.total_discovered > 0 ? "success" : "warning",
        title: o.discovered_source
          ? `Auto-detected ${o.discovered_source.ats_provider} for ${o.company}`
          : `Discovery check completed for ${o.company}`,
        detail: o.discovered_source
          ? `Upgraded to ${o.discovered_source.ats_provider} (${o.discovered_source.ats_identifier}) via ${o.discovered_source.method} · ${o.total_discovered} jobs found (${o.target_city_jobs} target roles, ${o.new_jobs} new).`
          : `${o.total_discovered} jobs found (${o.diagnostics.slice(-1)[0] || o.warning || "No direct ATS detected"})`,
        outcomes: [o],
      });
      if (inspectTarget?.toLowerCase() === companyName.toLowerCase()) {
        await openInspector(companyName);
      }
    } catch (err) {
      setStatusBanner({
        tone: "error",
        title: `Auto-detect failed for ${companyName}`,
        detail: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) return;
    setBusyKey("add:company");
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          careers_url: newUrl.trim(),
          ats_provider: newProvider,
          ats_identifier: newIdentifier.trim() || undefined,
          priority: 5,
          scrape: true,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        company?: CompanyRecord;
        scrape?: ScrapeOutcomeSummary | null;
      };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const o = body.scrape;
      if (body.company) {
        applyCompanyUpdates([body.company], o?.new_jobs || 0);
      } else {
        await onDataChanged();
      }
      setStatusBanner({
        tone: o && o.total_discovered > 0 ? "success" : "warning",
        title: `Added ${body.company?.name || newName}`,
        detail: o
          ? `Detected ${o.ats_provider}${o.ats_identifier ? ` (${o.ats_identifier})` : ""} · ${o.total_discovered} jobs found · ${o.new_jobs} ingested into JobRadar.`
          : "Source saved.",
        outcomes: o ? [o] : undefined,
      });
      setNewName("");
      setNewUrl("");
      setNewProvider("custom");
      setNewIdentifier("");
      setShowAddForm(false);
    } catch (err) {
      setStatusBanner({
        tone: "error",
        title: "Could not add company",
        detail: err instanceof Error ? err.message : "Validation failed",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const openEditor = (c: CompanyRecord) => {
    setEditingCompany(c);
    setEditUrl(c.careers_url);
    setEditProvider(c.ats_provider || "custom");
    setEditIdentifier(c.ats_identifier || "");
    setProbePreview(null);
  };

  const testSourceConfig = async () => {
    if (!editingCompany) return;
    setBusyKey("edit:probe");
    try {
      const res = await fetch("/api/companies/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingCompany.name,
          careers_url: editUrl.trim(),
          ats_provider: editProvider,
          ats_identifier: editIdentifier.trim() || undefined,
          apply: false,
        }),
      });
      const body = (await res.json()) as { error?: string; outcome?: ScrapeOutcomeSummary };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (body.outcome) {
        setProbePreview(body.outcome);
        if (body.outcome.discovered_source) {
          setEditProvider(body.outcome.discovered_source.ats_provider);
          setEditIdentifier(body.outcome.discovered_source.ats_identifier);
          setEditUrl(body.outcome.discovered_source.careers_url);
        }
      }
    } catch (err) {
      setStatusBanner({
        tone: "error",
        title: "Probe test failed",
        detail: err instanceof Error ? err.message : "Invalid configuration",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const saveSourceConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setBusyKey("edit:save");
    try {
      const res = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingCompany.name,
          careers_url: editUrl.trim(),
          ats_provider: editProvider,
          ats_identifier: editIdentifier.trim() || undefined,
          scrape: true,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        company?: CompanyRecord;
        scrape?: ScrapeOutcomeSummary | null;
      };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const o = body.scrape;
      if (body.company) {
        applyCompanyUpdates([body.company], o?.new_jobs || 0);
      } else {
        await onDataChanged();
      }
      setStatusBanner({
        tone: o?.error ? "error" : o && o.total_discovered > 0 ? "success" : "warning",
        title: `Updated ${editingCompany.name}`,
        detail: o
          ? `${o.ats_provider}${o.ats_identifier ? ` (${o.ats_identifier})` : ""} · ${o.total_discovered} jobs found · ${o.new_jobs} new target roles added.`
          : "Configuration updated.",
        outcomes: o ? [o] : undefined,
      });
      setEditingCompany(null);
      setProbePreview(null);
    } catch (err) {
      setStatusBanner({
        tone: "error",
        title: "Could not save source",
        detail: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-hero p-6 text-white">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
              <Building2 />
            </div>
            <div>
              <h2 className="text-2xl font-black">Official career sources</h2>
              <p className="mt-1 text-sm text-white/80">
                {filtered.length} of {companies.length} employers · Auto-detect ATS boards, scan live APIs, and ingest openings straight into JobRadar
              </p>
            </div>
          </div>
          <div className="flex flex-wrap shrink-0 gap-2 xl:flex-nowrap">
            <Button
              type="button"
              disabled={busyKey !== null}
              onClick={() => runBatchScrape("unproductive")}
              className="rounded-xl bg-white text-emerald-950 hover:bg-white/90"
            >
              {busyKey === "batch:unproductive" ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Radar size={16} />
              )}
              Scan unproductive
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busyKey !== null}
              onClick={() => runBatchScrape("custom")}
              className="rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {busyKey === "batch:custom" ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              Auto-fix custom
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Plus size={16} />
              Add company
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Total sources</p>
          <p className="mt-1.5 text-2xl font-black">{companies.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Structured ATS</p>
          <p className="mt-1.5 text-2xl font-black">{counts.structured}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Productive now</p>
          <p className="mt-1.5 text-2xl font-black text-success">{counts.productive}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Unproductive / custom</p>
          <p className="mt-1.5 text-2xl font-black text-warning">{counts.unproductive}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", `All (${companies.length})`],
              ["unproductive", `Unproductive (${counts.unproductive})`],
              ["custom", `Custom / missing ATS (${counts.custom})`],
              ["productive", `Productive (${counts.productive})`],
              ["failed", `Failed (${counts.failed})`],
            ] as Array<[SegmentFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={segment === key}
              onClick={() => setSegment(key)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                segment === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {sweepProgress ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => sweepAbortController?.abort()}
              className="rounded-xl border-danger/40 text-xs font-bold text-danger hover:bg-danger-soft"
            >
              <Square size={12} /> Stop sweep
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busyKey !== null}
              onClick={() =>
                runFullSweep(
                  segment === "custom" ? "custom" : segment === "all" ? "all" : "unproductive",
                )
              }
              className="rounded-xl text-xs font-bold"
            >
              <Radar size={14} />
              {segment === "custom"
                ? `Sweep all custom (${counts.custom})`
                : segment === "all"
                  ? `Sweep all (${companies.length})`
                  : `Sweep all unproductive (${counts.unproductive})`}
            </Button>
          )}
        </div>
      </div>

      {sweepProgress && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-black text-foreground">
              <LoaderCircle size={15} className="animate-spin text-primary" />
              Continuous sweep running ({sweepProgress.mode}) · Batch {sweepProgress.batches}
            </p>
            <p className="font-bold text-muted-foreground">
              {sweepProgress.scanned} checked · {sweepProgress.remaining} remaining ·{" "}
              {sweepProgress.upgraded} upgraded · +{sweepProgress.targetJobs} target roles ({sweepProgress.newJobs} new)
            </p>
          </div>
        </section>
      )}

      {showAddForm && (
        <form onSubmit={handleAddCompany} className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-black">Add employer career source</h3>
              <p className="text-xs text-muted-foreground">
                Leave ATS on auto-detect to discover Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable, JSON-LD, or SPA feeds automatically.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close add company form"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs font-bold">
              Company name
              <Input
                required
                placeholder="e.g. Stripe"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs font-bold">
              Careers URL (https://)
              <Input
                required
                type="url"
                placeholder="https://stripe.com/jobs/search"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs font-bold">
              ATS provider
              <select
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium"
              >
                {ATS_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold">
              ATS identifier / slug (optional)
              <Input
                placeholder="e.g. stripe or tenant|site"
                value={newIdentifier}
                onChange={(e) => setNewIdentifier(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={busyKey !== null} className="rounded-xl bg-primary">
              {busyKey === "add:company" ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}
              Save &amp; auto-detect jobs
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {editingCompany && (
        <form onSubmit={saveSourceConfig} className="rounded-2xl border border-primary/40 bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-black">Fix source for {editingCompany.name}</h3>
              <p className="text-xs text-muted-foreground">
                Point to a working careers URL or direct ATS board, test discovery, and ingest immediately.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close source editor"
              onClick={() => setEditingCompany(null)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-xs font-bold">
              Careers URL
              <Input
                required
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs font-bold">
              ATS provider
              <select
                value={editProvider}
                onChange={(e) => setEditProvider(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium"
              >
                {ATS_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold">
              ATS identifier / slug
              <Input
                placeholder="Leave blank for auto-discovery"
                value={editIdentifier}
                onChange={(e) => setEditIdentifier(e.target.value)}
              />
            </label>
          </div>
          {probePreview && (
            <div className="mt-3 rounded-xl bg-muted p-3 text-xs">
              <p className="font-bold">
                Test result: {probePreview.ats_provider}
                {probePreview.ats_identifier ? ` (${probePreview.ats_identifier})` : ""} ·{" "}
                {probePreview.total_discovered} total jobs · {probePreview.target_city_jobs} target roles
              </p>
              {probePreview.diagnostics.length > 0 && (
                <p className="mt-1 text-muted-foreground">{probePreview.diagnostics.join(" → ")}</p>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={busyKey !== null} className="rounded-xl bg-primary">
              {busyKey === "edit:save" ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}
              Save &amp; scan
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busyKey !== null}
              onClick={testSourceConfig}
            >
              {busyKey === "edit:probe" ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Sparkles size={15} />
              )}
              Test URL &amp; auto-detect
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditingCompany(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {statusBanner && (
        <section
          role="status"
          className={`rounded-2xl border p-4 ${
            statusBanner.tone === "error"
              ? "border-danger/40 bg-danger-soft text-danger"
              : statusBanner.tone === "warning"
                ? "border-warning/40 bg-warning-soft text-warning"
                : "border-success/40 bg-success-soft text-success"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black">{statusBanner.title}</p>
              <p className="mt-1 text-sm opacity-90">{statusBanner.detail}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss scan summary"
              onClick={() => setStatusBanner(null)}
              className="rounded-lg p-1.5 hover:bg-black/5"
            >
              <X size={16} />
            </button>
          </div>
          {statusBanner.outcomes && statusBanner.outcomes.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {statusBanner.outcomes.map((o) => (
                <div
                  key={o.company}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-current/15 bg-card/80 px-3 py-2 text-xs text-foreground"
                >
                  <div>
                    <span className="font-bold">{o.company}</span>
                    <span className="ml-2 text-muted-foreground">
                      {o.ats_provider}
                      {o.upgraded ? " (upgraded)" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-semibold">
                    <span>{o.total_discovered} raw</span>
                    <span className="text-success">{o.target_city_jobs} target</span>
                    <button
                      type="button"
                      onClick={() => openInspector(o.company)}
                      className="font-bold text-primary underline"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {inspectTarget && (
        <section
          aria-label={`Job inspector for ${inspectTarget}`}
          className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div>
              <h3 className="text-lg font-black">{inspectTarget} — Live job inspection</h3>
              {inspectData?.company && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Source: <strong className="capitalize">{inspectData.company.ats_provider}</strong>
                  {inspectData.company.ats_identifier ? ` (${inspectData.company.ats_identifier})` : ""} · Checked{" "}
                  {relativeTime(inspectData.checked_at)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busyKey !== null}
                onClick={() => scanSingleCompany(inspectTarget)}
                className="rounded-xl text-xs"
              >
                {busyKey === `scan:${inspectTarget}` ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Re-scan now
              </Button>
              <button
                type="button"
                aria-label="Close job inspector"
                onClick={() => {
                  setInspectTarget(null);
                  setInspectData(null);
                }}
                className="rounded-xl border px-3 py-2 text-xs font-bold hover:bg-muted"
              >
                Close
              </button>
            </div>
          </div>

          {inspectLoading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <LoaderCircle size={16} className="animate-spin" /> Loading jobs and diagnostics…
            </p>
          ) : inspectData ? (
            <div className="mt-4 space-y-4">
              {inspectData.diagnostics.length > 0 && (
                <div className="rounded-xl bg-muted p-3 text-xs">
                  <p className="font-bold">Fetch diagnostics</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {inspectData.diagnostics.map((line, i) => (
                      <li key={i}>• {line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setInspectTab("fetched")}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                    inspectTab === "fetched" ? "border-primary bg-primary text-primary-foreground" : "bg-muted/50"
                  }`}
                >
                  All discovered from employer ({inspectData.fetched_jobs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectTab("ingested")}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                    inspectTab === "ingested" ? "border-primary bg-primary text-primary-foreground" : "bg-muted/50"
                  }`}
                >
                  Ingested into JobRadar ({inspectData.ingested_jobs.length})
                </button>
              </div>

              {(() => {
                const list =
                  inspectTab === "fetched" ? inspectData.fetched_jobs : inspectData.ingested_jobs;
                if (!list.length) {
                  return (
                    <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                      {inspectTab === "fetched"
                        ? "No cached raw fetch yet for this session. Click Re-scan now to pull live openings directly from this employer."
                        : "No Bengaluru/Hyderabad tech openings ingested yet for this employer."}
                    </div>
                  );
                }
                return (
                  <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                    {list.map((job) => (
                      <div
                        key={`${job.external_job_id}-${job.title}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-foreground">{job.title}</p>
                          <p className="mt-0.5 text-muted-foreground">
                            {job.location} · {job.role_category} · Exp {job.experience_label}
                          </p>
                          {job.eligibility_reason && (
                            <p className="mt-0.5 text-warning">{job.eligibility_reason}</p>
                          )}
                        </div>
                        <a
                          href={job.application_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 font-bold text-success hover:bg-muted"
                        >
                          Apply <ExternalLink size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : null}
        </section>
      )}

      <JobPagination
        jobs={filtered}
        resetKey={`${query}:${segment}`}
        noun="companies"
        renderPage={(page) => (
          <>
            <div className="grid gap-3 md:hidden">
              {page.map((c) => {
                const health = companyHealthState(c);
                const fallback = fallbackLinks(c.name);
                const scanning = busyKey === `scan:${c.name}` || busyKey === `probe:${c.name}`;
                return (
                  <article key={`mobile-${c.ats_provider}-${c.name}`} className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black">{c.name}</h3>
                        <p className="mt-1 text-xs capitalize text-muted-foreground">
                          {c.ats_provider}
                          {c.ats_identifier ? ` (${c.ats_identifier})` : ""} · checked {relativeTime(c.last_checked_at)}
                        </p>
                      </div>
                      <span
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-black ${
                          health.tone === "danger"
                            ? "bg-danger-soft text-danger"
                            : health.tone === "warning"
                              ? "bg-warning-soft text-warning"
                              : "bg-success-soft text-success"
                        }`}
                      >
                        {health.label}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-muted p-2">
                        <b className="block text-base">{c.jobs_found}</b>Raw
                      </div>
                      <div className="rounded-xl bg-muted p-2">
                        <b className="block text-base">{c.candidate_jobs}</b>Target
                      </div>
                      <div className="rounded-xl bg-muted p-2">
                        <b className="block text-base">{c.eligible_jobs}</b>Eligible
                      </div>
                    </div>
                    {c.warning && <p className="mt-3 text-xs text-muted-foreground">{c.warning}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyKey !== null}
                        aria-label={`Scan ${c.name}`}
                        onClick={() => scanSingleCompany(c.name)}
                        className="rounded-xl text-xs"
                      >
                        {scanning ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        Scan
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyKey !== null}
                        aria-label={`Auto-detect ATS for ${c.name}`}
                        onClick={() => probeCompany(c.name)}
                        className="rounded-xl text-xs"
                      >
                        <Sparkles size={13} /> Auto-detect
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={`Fix source for ${c.name}`}
                        onClick={() => openEditor(c)}
                        className="rounded-xl text-xs"
                      >
                        <Wrench size={13} /> Fix source
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={`Inspect jobs for ${c.name}`}
                        onClick={() => openInspector(c.name)}
                        className="rounded-xl text-xs"
                      >
                        <Eye size={13} /> Inspect
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-success">
                      <a href={c.careers_url} target="_blank" rel="noreferrer">
                        Official careers
                      </a>
                      {fallback.map((link) => (
                        <a key={link.name} href={link.url} target="_blank" rel="noreferrer">
                          {link.name}
                        </a>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-2xl border bg-card md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs uppercase">
                  <tr>
                    <th className="py-3.5 pl-4 pr-3">Company</th>
                    <th className="px-3 py-3.5">ATS / Identifier</th>
                    <th className="px-3 py-3.5 whitespace-nowrap">Jobs (Raw / Target / Eligible)</th>
                    <th className="px-3 py-3.5 whitespace-nowrap">Last checked</th>
                    <th className="px-3 py-3.5">Health</th>
                    <th className="px-3 py-3.5">Actions</th>
                    <th className="py-3.5 pl-3 pr-4">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((c) => {
                    const health = companyHealthState(c);
                    const fallback = fallbackLinks(c.name);
                    const scanningThis = busyKey === `scan:${c.name}`;
                    const probingThis = busyKey === `probe:${c.name}`;
                    return (
                      <tr key={`${c.ats_provider}-${c.name}`} className="border-t align-top">
                        <td className="py-4 pl-4 pr-3 font-bold">{c.name}</td>
                        <td className="px-3 py-4">
                          <span className="font-semibold capitalize">{c.ats_provider}</span>
                          {c.ats_identifier && (
                            <span className="mt-0.5 block max-w-40 truncate text-xs text-muted-foreground">
                              {c.ats_identifier}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap font-semibold">
                          {c.jobs_found} / <span className="text-success">{c.candidate_jobs}</span> / {c.eligible_jobs}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs text-muted-foreground">
                          {relativeTime(c.last_checked_at)}
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${
                              health.tone === "danger"
                                ? "bg-danger-soft text-danger"
                                : health.tone === "warning"
                                  ? "bg-warning-soft text-warning"
                                  : "bg-success-soft text-success"
                            }`}
                          >
                            {health.tone === "danger" && <AlertTriangle size={12} />}
                            {health.label}
                          </span>
                          {c.warning && (
                            <span className="mt-1 block max-w-48 text-[11px] text-muted-foreground">
                              {c.warning}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              aria-label={`Scan ${c.name}`}
                              onClick={() => scanSingleCompany(c.name)}
                              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50"
                            >
                              {scanningThis ? (
                                <LoaderCircle size={13} className="animate-spin" />
                              ) : (
                                <RefreshCw size={13} />
                              )}
                              Scan
                            </button>
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              aria-label={`Auto-detect ATS for ${c.name}`}
                              onClick={() => probeCompany(c.name)}
                              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-50"
                            >
                              {probingThis ? (
                                <LoaderCircle size={13} className="animate-spin" />
                              ) : (
                                <Sparkles size={13} />
                              )}
                              Auto-detect
                            </button>
                            <button
                              type="button"
                              aria-label={`Fix source for ${c.name}`}
                              onClick={() => openEditor(c)}
                              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold hover:bg-muted"
                            >
                              <Wrench size={13} />
                              Fix
                            </button>
                            <button
                              type="button"
                              aria-label={`Inspect jobs for ${c.name}`}
                              onClick={() => openInspector(c.name)}
                              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-muted"
                            >
                              <Eye size={13} />
                              Jobs
                            </button>
                          </div>
                        </td>
                        <td className="py-4 pr-4 text-xs">
                          <a
                            href={c.careers_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-success hover:underline"
                          >
                            Careers <ExternalLink size={12} />
                          </a>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {fallback.slice(0, 2).map((link) => (
                              <a
                                key={link.name}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-muted-foreground hover:text-success hover:underline"
                              >
                                {link.name}
                              </a>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      />
    </div>
  );
}

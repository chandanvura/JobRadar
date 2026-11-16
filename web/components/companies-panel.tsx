"use client";

import { useMemo, useState } from "react";
import { Building2, ExternalLink } from "lucide-react";
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

type SegmentFilter = "all" | "productive" | "global";

export function CompaniesPanel({
  companies,
  query,
  fallbackLinks,
  relativeTime,
}: {
  companies: CompanyRecord[];
  query: string;
  fallbackLinks: (companyName: string) => { name: string; url: string }[];
  relativeTime: (iso: string | null) => string;
  onDataChanged?: () => Promise<void> | void;
  onCompaniesUpdated?: (updated: CompanyRecord[], newJobsCount: number) => void;
}) {
  const [segment, setSegment] = useState<SegmentFilter>("all");

  const counts = useMemo(() => {
    let productive = 0;
    let global = 0;
    for (const c of companies) {
      if (c.candidate_jobs > 0) productive += 1;
      else if (c.jobs_found > 0) global += 1;
    }
    return { productive, global };
  }, [companies]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (q) {
        const hay = `${c.name} ${c.ats_provider} ${c.ats_identifier || ""} ${c.careers_url}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (segment === "productive") return c.candidate_jobs > 0;
      if (segment === "global") return c.jobs_found > 0 && c.candidate_jobs === 0;
      return true;
    });
  }, [companies, query, segment]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-hero p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
            <Building2 />
          </div>
          <div>
            <h2 className="text-2xl font-black">Official career sources</h2>
            <p className="mt-1 text-sm text-white/80">
              {filtered.length} of {companies.length} employers tracked across Bengaluru &amp; Hyderabad
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Total employers</p>
          <p className="mt-1.5 text-2xl font-black">{companies.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Target city openings</p>
          <p className="mt-1.5 text-2xl font-black text-success">{counts.productive}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Global employers</p>
          <p className="mt-1.5 text-2xl font-black">{counts.global}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
        {(
          [
            ["all", `All (${companies.length})`],
            ["productive", `Target cities (${counts.productive})`],
            ["global", `Global only (${counts.global})`],
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

      <JobPagination
        jobs={filtered}
        resetKey={`${query}:${segment}`}
        noun="companies"
        renderPage={(page) => (
          <>
            <div className="grid gap-3 md:hidden">
              {page.map((c) => {
                const fallback = fallbackLinks(c.name);
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
                      {c.candidate_jobs > 0 ? (
                        <span className="rounded-lg bg-success-soft px-2.5 py-1 text-[10px] font-black text-success">
                          {c.candidate_jobs} target openings
                        </span>
                      ) : (
                        <span className="rounded-lg bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                          {c.jobs_found} global
                        </span>
                      )}
                    </div>
                    {c.warning && <p className="mt-3 text-xs text-muted-foreground">{c.warning}</p>}
                    <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-success">
                      <a
                        href={c.careers_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                      >
                        Official careers <ExternalLink size={13} />
                      </a>
                      {fallback.slice(0, 2).map((link) => (
                        <a
                          key={link.name}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
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
                    <th className="px-3 py-3.5">Platform</th>
                    <th className="px-3 py-3.5 whitespace-nowrap">Target Openings</th>
                    <th className="px-3 py-3.5 whitespace-nowrap">Last checked</th>
                    <th className="py-3.5 pl-3 pr-4">Career Page</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((c) => {
                    const fallback = fallbackLinks(c.name);
                    return (
                      <tr key={`${c.ats_provider}-${c.name}`} className="border-t align-middle">
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
                          {c.candidate_jobs > 0 ? (
                            <span className="text-success font-bold">{c.candidate_jobs} target</span>
                          ) : (
                            <span className="text-muted-foreground">{c.jobs_found} global</span>
                          )}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs text-muted-foreground">
                          {relativeTime(c.last_checked_at)}
                        </td>
                        <td className="py-4 pr-4 text-xs">
                          <div className="flex items-center gap-3">
                            <a
                              href={c.careers_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-bold text-success hover:underline"
                            >
                              Official careers <ExternalLink size={12} />
                            </a>
                            {fallback.slice(0, 1).map((link) => (
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

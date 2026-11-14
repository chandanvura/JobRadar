import { normalizePostedInput, normalizeRawJob, stripHtml, type NormalizedIngestJob, type RawAtsJob } from './job-normalizer.ts';
import { canonicalShortlistCity } from './location-policy.ts';
import { assertPublicHttpsUrl } from './net-guard.ts';

export interface CompanyTarget {
  name: string;
  careers_url: string;
  ats_provider: string;
  ats_identifier?: string;
  priority?: number;
}

export interface DiscoveredSource {
  ats_provider: string;
  ats_identifier: string;
  careers_url: string;
  method: string;
}

export interface CompanyScrapeOutcome {
  company: string;
  ats_provider: string;
  ats_identifier: string;
  careers_url: string;
  total_discovered: number;
  target_city_jobs: number;
  eligible_jobs: number;
  jobs: NormalizedIngestJob[];
  discovered_source?: DiscoveredSource;
  warning: string | null;
  error: string | null;
  diagnostics: string[];
  duration_ms: number;
}

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function unescapeJsText(text: string): string {
  return text
    .replace(/\\\//g, '/')
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\x2[fF]/g, '/')
    .replace(/&amp;/g, '&');
}

export function candidateSlugsForCompany(name: string, careersUrl: string): string[] {
  const slugs = new Set<string>();
  const add = (val: string) => {
    let clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    while (clean.startsWith('-')) clean = clean.slice(1);
    while (clean.endsWith('-')) clean = clean.slice(0, -1);
    if (clean.length >= 2) slugs.add(clean);
  };
  const baseName = name
    .replace(/\b(?:india|global tech|technologies|technology|private|limited|ltd|inc|corp|group)\b/gi, '')
    .trim();
  for (const raw of [name, baseName]) {
    add(raw.replace(/[^a-z0-9]+/gi, ''));
    add(raw.replace(/[^a-z0-9]+/gi, '-'));
    add(raw.replace(/\s+/g, ''));
  }
  try {
    const u = new URL(careersUrl);
    const hostParts = u.hostname.replace(/^www\.|^careers\.|^jobs\.|^apply\./i, '').split('.');
    if (hostParts[0]) add(hostParts[0]);
  } catch {
    // ignore invalid URL
  }
  return [...slugs].slice(0, 6);
}

const ATS_URL_RULES: Array<{
  provider: string;
  regex: RegExp;
  extract: (m: RegExpMatchArray, fullUrl: string) => { id: string; boardUrl: string } | null;
}> = [
  {
    provider: 'greenhouse',
    regex: /https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([\w.-]+)(?:[^\s"'<>\\]*)/i,
    extract: (m, full) => {
      if (m[1].toLowerCase() === 'embed') {
        const token = full.match(/[?&]for=([\w.-]+)/i)?.[1];
        return token ? { id: token, boardUrl: `https://boards.greenhouse.io/${token}` } : null;
      }
      return { id: m[1], boardUrl: `https://boards.greenhouse.io/${m[1]}` };
    },
  },
  {
    provider: 'greenhouse',
    regex: /https?:\/\/boards-api\.greenhouse\.io\/v1\/boards\/([\w.-]+)/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://boards.greenhouse.io/${m[1]}` }),
  },
  {
    provider: 'greenhouse',
    regex: /https?:\/\/my\.greenhouse\.io\/[^\s"'<>]*[?&]job_board=([\w.-]+)/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://boards.greenhouse.io/${m[1]}` }),
  },
  {
    provider: 'lever',
    regex: /https?:\/\/jobs\.(eu\.)?lever\.co\/([\w.-]+)/i,
    extract: (m) => {
      const slug = m[2];
      if (!slug || ['embed', 'v0'].includes(slug.toLowerCase())) return null;
      const prefix = m[1] ? 'eu|' : '';
      return { id: `${prefix}${slug}`, boardUrl: `https://jobs.${m[1] || ''}lever.co/${slug}` };
    },
  },
  {
    provider: 'ashby',
    regex: /https?:\/\/jobs\.ashbyhq\.com\/([\w.-]+)/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://jobs.ashbyhq.com/${m[1]}` }),
  },
  {
    provider: 'smartrecruiters',
    regex: /https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([\w.-]+)/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://jobs.smartrecruiters.com/${m[1]}` }),
  },
  {
    provider: 'workable',
    regex: /https?:\/\/apply\.workable\.com\/([\w.-]+)/i,
    extract: (m) => {
      if (['api', 'j'].includes(m[1].toLowerCase())) return null;
      return { id: m[1], boardUrl: `https://apply.workable.com/${m[1]}/` };
    },
  },
  {
    provider: 'workday',
    regex: /https?:\/\/([a-z0-9-]+)\.wd(\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?([\w.-]+)/i,
    extract: (m, full) => ({
      id: `${m[1]}|${m[3]}`,
      boardUrl: full.split('?')[0],
    }),
  },
  {
    provider: 'recruitee',
    regex: /https?:\/\/([\w-]+)\.recruitee\.com/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://${m[1]}.recruitee.com` }),
  },
  {
    provider: 'pinpoint',
    regex: /https?:\/\/([\w-]+)\.pinpointhq\.com/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://${m[1]}.pinpointhq.com` }),
  },
  {
    provider: 'rippling',
    regex: /https?:\/\/ats\.rippling\.com\/([\w.-]+)/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://ats.rippling.com/${m[1]}` }),
  },
  {
    provider: 'bamboohr',
    regex: /https?:\/\/([\w-]+)\.bamboohr\.com\/careers/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://${m[1]}.bamboohr.com/careers` }),
  },
  {
    provider: 'darwinbox',
    regex: /https?:\/\/([\w-]+)\.darwinbox\.in/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://${m[1]}.darwinbox.in/ms/candidate/careers` }),
  },
  {
    provider: 'jobvite',
    regex: /https?:\/\/jobs\.jobvite\.com\/([\w.-]+)/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://jobs.jobvite.com/${m[1]}` }),
  },
  {
    provider: 'kula',
    regex: /https?:\/\/careers\.kula\.ai\/([\w.-]+)/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://careers.kula.ai/${m[1]}` }),
  },
  {
    provider: 'pyjamahr',
    regex: /https?:\/\/jobs\.pyjamahr\.com\/([\w.-]+)/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://jobs.pyjamahr.com/${m[1]}` }),
  },
  {
    provider: 'oracle',
    regex: /https?:\/\/([a-z0-9.-]+)\/hcmUI\/CandidateExperience\/[a-z]{2}\/sites\/([\w.-]+)/i,
    extract: (m, full) => ({ id: `${m[1]}|${m[2]}`, boardUrl: full.split('?')[0] }),
  },
  {
    provider: 'eightfold',
    regex: /https?:\/\/([a-z0-9.-]+\.eightfold\.ai)\/careers[^\s"'<>]*/i,
    extract: (m, full) => {
      const domain = full.match(/[?&]domain=([\w.-]+)/i)?.[1] || m[1].replace(/\.eightfold\.ai$/, '.com');
      return { id: `${m[1]}|${domain}`, boardUrl: `https://${m[1]}/careers` };
    },
  },
  {
    provider: 'mynexthire',
    regex: /https?:\/\/([a-z0-9-]+)\.mynexthire\.com\/employer/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://${m[1]}.mynexthire.com/employer/jobs/careers` }),
  },
  {
    provider: 'paylocity',
    regex: /https?:\/\/recruiting\.paylocity\.com\/recruiting\/jobs\/all\/([0-9a-f-]{36})/i,
    extract: (m) => ({
      id: m[1],
      boardUrl: `https://recruiting.paylocity.com/recruiting/jobs/all/${m[1]}`,
    }),
  },
  {
    provider: 'icims',
    regex: /https?:\/\/([a-z0-9.-]+\.icims\.com)(?:\/jobs)?/i,
    extract: (m) => ({ id: m[1], boardUrl: `https://${m[1]}/jobs/search` }),
  },
  {
    provider: 'keka',
    regex: /https?:\/\/([a-z0-9-]+\.keka\.com\/careers)[^\s"'<>]*/i,
    extract: (m) => ({ id: `https://${m[1]}`, boardUrl: `https://${m[1]}` }),
  },
];

export function discoverAtsFromText(text: string, method = 'html-scan'): DiscoveredSource | null {
  const unescaped = unescapeJsText(text);
  for (const rule of ATS_URL_RULES) {
    const match = unescaped.match(rule.regex);
    if (!match) continue;
    const extracted = rule.extract(match, match[0]);
    if (extracted) {
      return {
        ats_provider: rule.provider,
        ats_identifier: extracted.id,
        careers_url: extracted.boardUrl,
        method,
      };
    }
  }
  const ph = parsePhenomConfig(unescaped);
  if (ph?.refNum && ph?.baseUrl) {
    return {
      ats_provider: 'phenom',
      ats_identifier: ph.refNum,
      careers_url: ph.baseUrl,
      method,
    };
  }
  const jibeCid = unescaped.match(/window\._jibe\s*=\s*\{[^}]*"cid"\s*:\s*"([\w-]+)"/i)?.[1];
  if (jibeCid) {
    return { ats_provider: 'jibe', ats_identifier: jibeCid, careers_url: '', method };
  }
  const tbOrg = unescaped.match(/id=["']search-results["'][^>]*data-organization-ids=["'](\d+)["']/i)?.[1];
  if (tbOrg) {
    return { ats_provider: 'talentbrew', ats_identifier: tbOrg, careers_url: '', method };
  }
  return null;
}

export function isIndiaOrTargetCity(text: string): boolean {
  if (!text) return false;
  return Boolean(canonicalShortlistCity({ location: text })) || /\bindia\b/i.test(text);
}

export async function mapWithLimit<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const count = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (index < items.length) {
        const item = items[index++];
        try {
          await worker(item);
        } catch {
          // detail enrichment errors should not abort the listing
        }
      }
    }),
  );
}

export function decodeHtmlEntities(input: string): string {
  let out = input;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;|&#x27;/gi, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (next === out) break;
    out = next;
  }
  return out;
}

export function extractBalancedJson<T = unknown>(text: string, markerRegex: RegExp): T | null {
  const match = markerRegex.exec(text);
  if (!match) return null;
  let i = match.index + match[0].length;
  while (i < text.length && /\s/.test(text[i])) i++;
  const opener = text[i];
  if (opener !== '{' && opener !== '[') return null;
  const closer = opener === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let pos = i; pos < text.length; pos++) {
    const ch = text[pos];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(i, pos + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface PhenomConfig {
  refNum: string;
  baseUrl: string;
  widgetApiEndpoint: string;
  country: string;
  locale: string;
}

export function parsePhenomConfig(html: string): PhenomConfig | null {
  const raw = extractBalancedJson<Record<string, unknown>>(html, /\bphApp\s*=\s*(?:phApp\s*\|\|\s*)?/);
  if (!raw || typeof raw.refNum !== 'string') return null;
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl : '';
  const widgetApiEndpoint = typeof raw.widgetApiEndpoint === 'string' ? raw.widgetApiEndpoint : '';
  return {
    refNum: raw.refNum,
    baseUrl,
    widgetApiEndpoint,
    country: typeof raw.country === 'string' ? raw.country : 'us',
    locale: typeof raw.locale === 'string' ? raw.locale : 'en_us',
  };
}

export function parseNextFlightRecords(html: string): Record<string, unknown> {
  const chunks: string[] = [];
  const regex = /self\.__next_f\.push\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const start = match.index + match[0].length;
    const parsed = extractBalancedJson<unknown[]>(html.slice(start), /^/);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed[0] === 1 && typeof parsed[1] === 'string') {
      chunks.push(parsed[1]);
    }
  }
  const wire = Buffer.from(chunks.join(''), 'utf8');
  const records: Record<string, unknown> = {};
  let offset = 0;
  while (offset < wire.length) {
    const nlIndex = wire.indexOf('\n', offset);
    const colon = wire.indexOf(':', offset);
    if (colon === -1) break;
    if (nlIndex !== -1 && colon > nlIndex) {
      offset = nlIndex + 1;
      continue;
    }
    const key = wire.subarray(offset, colon).toString('utf8').trim();
    offset = colon + 1;
    if (wire[offset] === 84 /* 'T' */) {
      const comma = wire.indexOf(',', offset);
      if (comma === -1) break;
      const size = parseInt(wire.subarray(offset + 1, comma).toString('utf8'), 16);
      if (!Number.isFinite(size) || size < 0 || comma + 1 + size > wire.length) break;
      records[key] = wire.subarray(comma + 1, comma + 1 + size).toString('utf8');
      offset = comma + 1 + size;
    } else {
      const end = nlIndex === -1 ? wire.length : nlIndex;
      const row = wire.subarray(offset, end).toString('utf8');
      if (row.startsWith('{') || row.startsWith('[') || row.startsWith('"')) {
        try {
          records[key] = JSON.parse(row);
        } catch {
          // ignore non-JSON flight row
        }
      }
      offset = end + 1;
    }
  }
  return records;
}

export function parseGoogleCareersPayload(html: string): { rows: unknown[][]; total: number } {
  const regex = /AF_initDataCallback\(\{key:\s*'(ds:\d+)',[\s\S]*?data:/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    if (m[1] !== 'ds:1') continue;
    const after = html.slice(m.index + m[0].length);
    const data = extractBalancedJson<unknown[]>(after, /^/);
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const rows = data[0] as unknown[][];
      const total = Number.isFinite(Number(data[2])) ? Number(data[2]) : rows.length;
      return { rows, total };
    }
  }
  return { rows: [], total: 0 };
}

export function parseAtlassianListings(
  rows: Array<Record<string, unknown>>,
  company: string,
  careersUrl: string,
): RawAtsJob[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    const desc = [row.overview, row.responsibilities, row.qualifications].filter(Boolean).join(' ').trim();
    const locs = Array.isArray(row.locations) ? (row.locations as string[]) : [];
    if (!desc && !locs.length) continue;
    const prev = merged.get(id);
    if (prev) {
      const prevLocs = Array.isArray(prev.locations) ? (prev.locations as string[]) : [];
      merged.set(id, { ...prev, locations: [...new Set([...prevLocs, ...locs])] });
    } else {
      merged.set(id, row);
    }
  }

  return [...merged.values()].map((row) => {
    const id = String(row.id);
    const portal = (row.portalJobPost || {}) as Record<string, unknown>;
    const url = safeResolveUrl(portal.portalUrl, careersUrl) || careersUrl;
    const applyUrl = safeResolveUrl(row.applyUrl, url) || url;
    const locs = Array.isArray(row.locations) ? (row.locations as string[]).filter(Boolean) : [];
    const desc = [row.overview, row.responsibilities, row.qualifications]
      .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      .join('\n');
    return {
      external_job_id: id,
      title: String(row.title || ''),
      company,
      location: locs.join(' · ') || 'Not specified',
      description: stripHtml(desc),
      ats_provider: 'atlassian',
      job_url: url,
      application_url: applyUrl,
      career_page_url: careersUrl,
      ...normalizePostedInput(null),
    };
  });
}

function safeResolveUrl(href: unknown, baseUrl: string): string | null {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    const u = new URL(href.trim(), baseUrl);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function extractJsonLdJobs(
  html: string,
  company: string,
  careersUrl: string,
): RawAtsJob[] {
  const results: RawAtsJob[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const typeVal = obj['@type'];
    const isJob =
      typeVal === 'JobPosting' ||
      (Array.isArray(typeVal) && typeVal.includes('JobPosting'));

    if (isJob && typeof obj.title === 'string' && obj.title.trim()) {
      const locs = Array.isArray(obj.jobLocation)
        ? obj.jobLocation
        : obj.jobLocation
          ? [obj.jobLocation]
          : [];
      const locStrings = locs
        .map((loc) => {
          if (typeof loc === 'string') return loc;
          if (!loc || typeof loc !== 'object') return '';
          const addr = (loc as Record<string, unknown>).address as Record<string, unknown> | undefined;
          if (!addr || typeof addr !== 'object') return '';
          return [addr.addressLocality, addr.addressRegion, addr.addressCountry]
            .filter((v) => typeof v === 'string' && v.trim())
            .join(', ');
        })
        .filter(Boolean);

      const url = safeResolveUrl(obj.url, careersUrl) || careersUrl;
      const ident = obj.identifier as Record<string, unknown> | string | undefined;
      const extId =
        typeof ident === 'string'
          ? ident
          : ident && typeof ident === 'object' && typeof ident.value === 'string'
            ? ident.value
            : url;
      const posted = normalizePostedInput(
        typeof obj.datePosted === 'string' ? obj.datePosted : null,
      );

      results.push({
        external_job_id: extId,
        title: obj.title.trim(),
        company,
        location: locStrings.join(' · ') || 'Not specified',
        description: stripHtml(String(obj.description || '')),
        ats_provider: 'custom',
        job_url: url,
        application_url: url,
        career_page_url: careersUrl,
        ...posted,
      });
      return;
    }

    if (obj['@graph']) walk(obj['@graph']);
  };

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      walk(JSON.parse(match[1].trim()));
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return results;
}

export function extractEmbeddedStateJobs(
  html: string,
  company: string,
  careersUrl: string,
): RawAtsJob[] {
  const results: RawAtsJob[] = [];
  const seen = new Set<string>();
  const nextMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!nextMatch) return results;

  const walk = (node: unknown, depth = 0) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) {
      if (node.length >= 1 && node.length <= 500 && typeof node[0] === 'object' && node[0] !== null) {
        for (const item of node) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const title = typeof rec.title === 'string' ? rec.title : typeof rec.jobTitle === 'string' ? rec.jobTitle : typeof rec.name === 'string' && (rec.location || rec.applyUrl || rec.jobUrl) ? rec.name : '';
          const rawUrl = rec.applyUrl || rec.jobUrl || rec.url || rec.hostedUrl || rec.slug;
          const location =
            typeof rec.location === 'string'
              ? rec.location
              : typeof rec.city === 'string'
                ? rec.city
                : typeof rec.locationsText === 'string'
                  ? rec.locationsText
                  : '';
          if (title && title.length >= 4 && title.length <= 140 && (location || rawUrl)) {
            const resolved =
              typeof rawUrl === 'string' && rawUrl.startsWith('http')
                ? safeResolveUrl(rawUrl, careersUrl)
                : typeof rawUrl === 'string' && rawUrl.startsWith('/')
                  ? safeResolveUrl(rawUrl, careersUrl)
                  : careersUrl;
            const id = String(rec.id || rec.jobId || rec.reqId || rec.slug || `${title}-${location}`);
            if (!seen.has(id) && resolved) {
              seen.add(id);
              const posted = normalizePostedInput(
                (rec.postedAt || rec.publishedAt || rec.createdAt || rec.datePosted) as string | number | null,
              );
              results.push({
                external_job_id: id,
                title,
                company,
                location: location || 'Not specified',
                description: stripHtml(String(rec.description || rec.summary || '')),
                ats_provider: 'custom',
                job_url: resolved,
                application_url: resolved,
                career_page_url: careersUrl,
                ...posted,
              });
            }
          }
        }
      }
      for (const child of node.slice(0, 50)) walk(child, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      for (const val of Object.values(node as Record<string, unknown>)) {
        walk(val, depth + 1);
      }
    }
  };

  try {
    walk(JSON.parse(nextMatch[1]));
  } catch {
    // ignore malformed __NEXT_DATA__
  }
  return results;
}

export function parseXmlJobs(
  xml: string,
  company: string,
  careersUrl: string,
  provider = 'xml',
): RawAtsJob[] {
  const jobs: RawAtsJob[] = [];
  const itemMatches = xml.match(/<(?:item|job)\b[^>]*>[\s\S]*?<\/(?:item|job)>/gi) || [];

  const tag = (block: string, name: string): string => {
    const m = block.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, 'i'));
    return m ? m[1].trim() : '';
  };

  for (const block of itemMatches) {
    const title = stripHtml(tag(block, 'title'));
    const rawUrl = tag(block, 'detail-url') || tag(block, 'link') || tag(block, 'url') || tag(block, 'apply-url');
    const url = safeResolveUrl(rawUrl, careersUrl);
    if (!title || !url) continue;
    const applyUrl = safeResolveUrl(tag(block, 'apply-url') || rawUrl, careersUrl) || url;
    const loc =
      stripHtml(tag(block, 'location')) ||
      [tag(block, 'locationCity'), tag(block, 'locationState'), tag(block, 'locationCountry')]
        .map((v) => stripHtml(v))
        .filter(Boolean)
        .join(', ');
    const desc = stripHtml(tag(block, 'description'));
    const extId = tag(block, 'id') || tag(block, 'guid') || url;
    const posted = normalizePostedInput(
      tag(block, 'datePosted') || tag(block, 'publish_date') || tag(block, 'pubDate') || tag(block, 'date'),
    );
    jobs.push({
      external_job_id: extId,
      title,
      company,
      location: loc || 'Not specified',
      description: desc,
      ats_provider: provider,
      job_url: url,
      application_url: applyUrl,
      career_page_url: careersUrl,
      ...posted,
    });
  }
  return jobs;
}

const conditionalCache = new Map<string, { etag?: string; lastModified?: string; data: unknown }>();
const hostFailureState = new Map<string, { failures: number; retryAfterUntil: number }>();

function cacheConditionalSet(url: string, etag: string | null, lastModified: string | null, data: unknown) {
  if (!etag && !lastModified) return;
  if (conditionalCache.size >= 800) {
    const oldest = conditionalCache.keys().next().value;
    if (oldest) conditionalCache.delete(oldest);
  }
  conditionalCache.set(url, {
    etag: etag || undefined,
    lastModified: lastModified || undefined,
    data,
  });
}

async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  attempts = 2,
): Promise<Response> {
  const safe = await assertPublicHttpsUrl(url);
  const host = safe.hostname.toLowerCase();
  const cooldown = hostFailureState.get(host);
  if (cooldown && cooldown.retryAfterUntil > Date.now() && cooldown.failures >= 4) {
    throw new Error(`Host ${host} temporarily cooled down after repeated rate-limits/errors`);
  }

  const timeoutMs = init.timeoutMs ?? 10000;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(safe.toString(), {
        ...init,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/html, application/xml;q=0.9, */*;q=0.8',
          ...init.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ([429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525].includes(res.status)) {
        const retryAfter = Number(res.headers.get('retry-after'));
        if (i + 1 < attempts) {
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 4000) : 700 * (i + 1);
          await res.body?.cancel();
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        if (res.status === 429) {
          const prev = hostFailureState.get(host);
          const failures = (prev?.failures || 0) + 1;
          const coolSec = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) : 30 * failures;
          hostFailureState.set(host, { failures, retryAfterUntil: Date.now() + coolSec * 1000 });
        }
      } else if (res.ok || res.status === 304) {
        hostFailureState.delete(host);
      }
      return res;
    } catch (err) {
      lastError = err;
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  const prev = hostFailureState.get(host);
  const failures = (prev?.failures || 0) + 1;
  hostFailureState.set(host, { failures, retryAfterUntil: Date.now() + Math.min(failures * 20_000, 120_000) });
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

async function fetchJson<T = unknown>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const isGet = !init?.method || init.method.toUpperCase() === 'GET';
  const cached = isGet ? conditionalCache.get(url) : undefined;
  const headers: Record<string, string> = {};
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  const res = await fetchWithRetry(url, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (res.status === 304 && cached) {
    await res.body?.cancel();
    return cached.data as T;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  }
  const data = (await res.json()) as T;
  if (isGet) {
    cacheConditionalSet(url, res.headers.get('etag'), res.headers.get('last-modified'), data);
  }
  return data;
}

interface BoardSpec {
  request: (slug: string) => { url: string; init?: RequestInit & { timeoutMs?: number } };
  rows: (data: unknown) => Array<Record<string, unknown>>;
  mapRow: (row: Record<string, unknown>, c: CompanyTarget, slug: string) => RawAtsJob;
}

const SIMPLE_BOARD_SPECS: Record<string, BoardSpec> = {
  greenhouse: {
    request: (token) => ({ url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true` }),
    rows: (d) => (Array.isArray((d as { jobs?: unknown[] })?.jobs) ? (d as { jobs: Array<Record<string, unknown>> }).jobs : []),
    mapRow: (j, c) => {
      const url = safeResolveUrl(j.absolute_url, c.careers_url) || c.careers_url;
      return {
        external_job_id: String(j.id),
        title: String(j.title || ''),
        company: c.name,
        location: String((j.location as { name?: string } | undefined)?.name || 'Not specified'),
        description: stripHtml(String(j.content || '')),
        ats_provider: 'greenhouse',
        job_url: url,
        application_url: url,
        career_page_url: c.careers_url,
        ...normalizePostedInput((j.updated_at || j.first_published) as string | null),
      };
    },
  },
  ashby: {
    request: (slug) => ({ url: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}` }),
    rows: (d) =>
      Array.isArray((d as { jobs?: unknown[] })?.jobs)
        ? (d as { jobs: Array<Record<string, unknown>> }).jobs.filter((j) => j.isListed !== false)
        : [],
    mapRow: (j, c) => {
      const secondary = Array.isArray(j.secondaryLocations)
        ? (j.secondaryLocations as Array<Record<string, unknown> | string>).map((s) =>
            typeof s === 'string' ? s : String(s.location || ''),
          )
        : [];
      const locParts = [j.location, ...secondary].filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
      const jobUrl = safeResolveUrl(j.jobUrl, c.careers_url) || c.careers_url;
      return {
        external_job_id: String(j.id || jobUrl),
        title: String(j.title || ''),
        company: c.name,
        location: [...new Set(locParts)].join(' · ') || 'Not specified',
        description: stripHtml(String(j.descriptionPlain || j.descriptionHtml || '')),
        ats_provider: 'ashby',
        job_url: jobUrl,
        application_url: safeResolveUrl(j.applyUrl, c.careers_url) || jobUrl,
        career_page_url: c.careers_url,
        ...normalizePostedInput(j.publishedAt as string | null),
      };
    },
  },
  recruitee: {
    request: (slug) => ({ url: `https://${encodeURIComponent(slug)}.recruitee.com/api/offers` }),
    rows: (d) => (Array.isArray((d as { offers?: unknown[] })?.offers) ? (d as { offers: Array<Record<string, unknown>> }).offers : []),
    mapRow: (o, c, slug) => {
      const url = safeResolveUrl(o.careers_url, c.careers_url) || `https://${slug}.recruitee.com/o/${o.slug}`;
      return {
        external_job_id: String(o.id || o.slug),
        title: String(o.title || ''),
        company: c.name,
        location: String(o.location || [o.city, o.country].filter(Boolean).join(', ') || 'Not specified'),
        description: stripHtml([o.description, o.requirements].filter(Boolean).join('\n')),
        ats_provider: 'recruitee',
        job_url: url,
        application_url: safeResolveUrl(o.careers_apply_url, url) || url,
        career_page_url: c.careers_url,
        ...normalizePostedInput(o.published_at as string | null),
      };
    },
  },
  pinpoint: {
    request: (slug) => ({ url: `https://${encodeURIComponent(slug)}.pinpointhq.com/postings.json` }),
    rows: (d) => (Array.isArray((d as { data?: unknown[] })?.data) ? (d as { data: Array<Record<string, unknown>> }).data : []),
    mapRow: (p, c, slug) => {
      const loc = p.location as Record<string, unknown> | undefined;
      const url = safeResolveUrl(p.url, c.careers_url) || `https://${slug}.pinpointhq.com/postings/${p.id}`;
      return {
        external_job_id: String(p.id),
        title: String(p.title || ''),
        company: c.name,
        location: String(loc?.name || loc?.city || 'Not specified'),
        description: stripHtml([p.description, p.key_responsibilities, p.skills_knowledge_expertise].filter(Boolean).join('\n')),
        ats_provider: 'pinpoint',
        job_url: url,
        application_url: url,
        career_page_url: c.careers_url,
        ...normalizePostedInput(p.deadline_at as string | null),
      };
    },
  },
  rippling: {
    request: (slug) => ({ url: `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(slug)}/jobs` }),
    rows: (d) => (Array.isArray(d) ? (d as Array<Record<string, unknown>>) : []),
    mapRow: (j, c, slug) => {
      const loc = j.workLocation as Record<string, unknown> | undefined;
      const url = safeResolveUrl(j.url, c.careers_url) || `https://ats.rippling.com/${slug}/jobs/${j.uuid}`;
      return {
        external_job_id: String(j.uuid || j.id),
        title: String(j.name || j.title || ''),
        company: c.name,
        location: String(loc?.label || j.location || 'Not specified'),
        description: stripHtml(String(j.description || '')),
        ats_provider: 'rippling',
        job_url: url,
        application_url: url,
        career_page_url: c.careers_url,
        ...normalizePostedInput(j.createdOn as string | null),
      };
    },
  },
  bamboohr: {
    request: (slug) => ({ url: `https://${encodeURIComponent(slug)}.bamboohr.com/careers/list` }),
    rows: (d) => (Array.isArray((d as { result?: unknown[] })?.result) ? (d as { result: Array<Record<string, unknown>> }).result : []),
    mapRow: (j, c, slug) => {
      const loc = (j.location || {}) as Record<string, unknown>;
      const url = `https://${slug}.bamboohr.com/careers/${j.id}`;
      return {
        external_job_id: String(j.id),
        title: String(j.jobOpeningName || ''),
        company: c.name,
        location: [loc.city, loc.state, loc.country].filter(Boolean).join(', ') || 'Not specified',
        description: stripHtml(String(j.departmentLabel || '')),
        ats_provider: 'bamboohr',
        job_url: url,
        application_url: url,
        career_page_url: c.careers_url,
        ...normalizePostedInput(null),
      };
    },
  },
  darwinbox: {
    request: (slug) => ({
      url: `https://${encodeURIComponent(slug)}.darwinbox.in/ms/candidateapi/job`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 1, limit: 100 }),
        timeoutMs: 8000,
      },
    }),
    rows: (d) => {
      const obj = d as { message?: { jobs?: Array<Record<string, unknown>> }; jobs?: Array<Record<string, unknown>> };
      return obj?.message?.jobs || obj?.jobs || [];
    },
    mapRow: (j, c, slug) => {
      const id = String(j.id || j.job_id || j.requisition_id || '');
      const url = `https://${slug}.darwinbox.in/ms/candidate/careers/${encodeURIComponent(id)}`;
      return {
        external_job_id: id,
        title: String(j.title || j.job_title || ''),
        company: c.name,
        location: String(j.location || j.city || 'India'),
        description: stripHtml(String(j.description || j.job_description || '')),
        ats_provider: 'darwinbox',
        job_url: url,
        application_url: url,
        career_page_url: c.careers_url,
        ...normalizePostedInput((j.created_on || j.posted_on) as string | null),
      };
    },
  },
  avalara: {
    request: () => ({ url: 'https://api.careerpuck.com/v1/public/job-boards/avalara', init: { timeoutMs: 12000 } }),
    rows: (d) => (Array.isArray((d as { jobs?: unknown[] })?.jobs) ? (d as { jobs: Array<Record<string, unknown>> }).jobs : []),
    mapRow: (row, c) => {
      const url = safeResolveUrl(row.publicUrl, c.careers_url) || c.careers_url;
      const offices = Array.isArray(row.offices)
        ? (row.offices as Array<Record<string, unknown>>).map((o) => String(o.name || '')).filter(Boolean)
        : [];
      const loc = [row.location, ...offices].filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).join(' · ');
      return {
        external_job_id: String(row.permalink || ''),
        title: String(row.title || ''),
        company: c.name,
        location: loc || 'Not specified',
        description: stripHtml(decodeHtmlEntities(String(row.content || ''))),
        ats_provider: 'avalara',
        job_url: url,
        application_url: safeResolveUrl(row.applyUrl, url) || url,
        career_page_url: c.careers_url,
        ...normalizePostedInput(null),
      };
    },
  },
};

async function fetchSimpleBoard(provider: string, c: CompanyTarget, slug: string): Promise<RawAtsJob[]> {
  const spec = SIMPLE_BOARD_SPECS[provider];
  if (!spec) throw new Error(`Unknown board spec: ${provider}`);
  const { url, init } = spec.request(slug);
  const data = await fetchJson<unknown>(url, init);
  return spec.rows(data).map((row) => spec.mapRow(row, c, slug));
}

async function fetchLever(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const parts = identifier.split('|');
  const slug = parts[parts.length - 1];
  const region = parts.length === 2 && parts[0] === 'eu' ? 'eu.' : '';
  let data: Array<Record<string, unknown>>;
  try {
    data = await fetchJson<Array<Record<string, unknown>>>(
      `https://api.${region}lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    );
  } catch (err) {
    if (!region && err instanceof Error && err.message.includes('HTTP 404')) {
      data = await fetchJson<Array<Record<string, unknown>>>(
        `https://api.eu.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
      );
    } else {
      throw err;
    }
  }
  if (!Array.isArray(data)) throw new Error('Unexpected Lever response');
  return data.map((j) => {
    const cats = (j.categories || {}) as Record<string, unknown>;
    const allLocs = Array.isArray(cats.allLocations) ? cats.allLocations : [];
    const locParts = [cats.location, ...allLocs].filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
    if (j.workplaceType === 'remote' && locParts.some((v) => v.trim().toLowerCase() === 'india')) {
      locParts.push('Remote - India');
    }
    const sections: string[] = [String(j.descriptionPlain || j.description || '')];
    if (Array.isArray(j.lists)) {
      for (const sec of j.lists as Array<Record<string, unknown>>) {
        sections.push(String(sec.text || ''), String(sec.content || ''));
      }
    }
    sections.push(String(j.additionalPlain || j.additional || ''));
    const jobUrl = safeResolveUrl(j.hostedUrl, c.careers_url) || c.careers_url;
    const applyUrl = safeResolveUrl(j.applyUrl, c.careers_url) || jobUrl;
    const posted = normalizePostedInput(j.createdAt as number | string | null);
    return {
      external_job_id: String(j.id),
      title: String(j.text || ''),
      company: c.name,
      location: [...new Set(locParts)].join(' · ') || 'Not specified',
      description: stripHtml(sections.join('\n')),
      ats_provider: 'lever',
      job_url: jobUrl,
      application_url: applyUrl,
      career_page_url: c.careers_url,
      ...posted,
    };
  });
}

async function fetchSmartRecruiters(c: CompanyTarget, companyId: string): Promise<RawAtsJob[]> {
  const postings: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const page = await fetchJson<{ content?: Array<Record<string, unknown>>; totalFound?: number }>(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?limit=100&offset=${offset}`,
    );
    const batch = Array.isArray(page?.content) ? page.content : [];
    postings.push(...batch);
    if (batch.length < 100 || postings.length >= (page?.totalFound ?? postings.length)) break;
  }

  // Fetch full JD details for India/Bengaluru/Hyderabad matches (bounded concurrency)
  const targetMatches = postings.filter((p) => {
    const loc = p.location as Record<string, unknown> | undefined;
    const text = [loc?.city, loc?.region, loc?.country].filter(Boolean).join(' ');
    return Boolean(canonicalShortlistCity({ location: text })) || /\bindia\b/i.test(text);
  });

  const detailMap = new Map<string, string>();
  const slice = targetMatches.slice(0, 35);
  await Promise.allSettled(
    slice.map(async (p) => {
      const id = String(p.id || '');
      if (!id) return;
      try {
        const detail = await fetchJson<{
          jobAd?: { sections?: Record<string, { text?: string }> };
        }>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings/${encodeURIComponent(id)}`, {
          timeoutMs: 6000,
        });
        const sections = detail?.jobAd?.sections || {};
        const desc = [
          sections.jobDescription?.text,
          sections.qualifications?.text,
          sections.additionalInformation?.text,
        ]
          .filter(Boolean)
          .join('\n');
        if (desc) detailMap.set(id, stripHtml(desc));
      } catch {
        // detail optional
      }
    }),
  );

  return postings.map((p) => {
    const id = String(p.id || '');
    const loc = (p.location || {}) as Record<string, unknown>;
    const location = [loc.city, loc.region, loc.country]
      .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      .join(', ');
    const jobUrl = `https://jobs.smartrecruiters.com/${encodeURIComponent(companyId)}/${encodeURIComponent(id)}`;
    const posted = normalizePostedInput(p.releasedDate as string | null);
    return {
      external_job_id: id,
      title: String(p.name || ''),
      company: c.name,
      location: location || 'Not specified',
      description: detailMap.get(id) || '',
      ats_provider: 'smartrecruiters',
      job_url: jobUrl,
      application_url: jobUrl,
      career_page_url: c.careers_url,
      ...posted,
    };
  });
}

async function fetchWorkable(c: CompanyTarget, slug: string): Promise<RawAtsJob[]> {
  const res = await fetchJson<{ results?: Array<Record<string, unknown>> }>(
    `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '', location: [], department: [], worktype: [] }),
    },
  );
  const rows = Array.isArray(res?.results) ? res.results : [];
  const detailMap = new Map<string, string>();

  const indiaRows = rows
    .filter((r) => {
      const loc = r.location as Record<string, unknown> | undefined;
      const text = [loc?.city, loc?.region, loc?.country].filter(Boolean).join(' ');
      return Boolean(canonicalShortlistCity({ location: text })) || /\bindia\b/i.test(text);
    })
    .slice(0, 25);

  await Promise.allSettled(
    indiaRows.map(async (r) => {
      const shortcode = String(r.shortcode || '');
      if (!shortcode) return;
      try {
        const detail = await fetchJson<{ description?: string; requirements?: string }>(
          `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(shortcode)}`,
          { timeoutMs: 6000 },
        );
        const text = [detail.description, detail.requirements].filter(Boolean).join('\n');
        if (text) detailMap.set(shortcode, stripHtml(text));
      } catch {
        // optional
      }
    }),
  );

  return rows.map((r) => {
    const shortcode = String(r.shortcode || r.id || '');
    const loc = (r.location || {}) as Record<string, unknown>;
    const location = [loc.city, loc.region, loc.country]
      .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      .join(', ');
    const jobUrl = `https://apply.workable.com/${encodeURIComponent(slug)}/j/${encodeURIComponent(shortcode)}/`;
    const posted = normalizePostedInput(r.published as string | null);
    return {
      external_job_id: shortcode,
      title: String(r.title || ''),
      company: c.name,
      location: location || (r.remote ? 'Remote' : 'Not specified'),
      description: detailMap.get(shortcode) || '',
      ats_provider: 'workable',
      job_url: jobUrl,
      application_url: jobUrl,
      career_page_url: c.careers_url,
      ...posted,
    };
  });
}

function flattenWorkdayFacetNodes(nodes: unknown): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  if (!Array.isArray(nodes)) return result;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const rec = node as Record<string, unknown>;
    result.push(rec);
    if (Array.isArray(rec.values)) {
      for (const v of rec.values) {
        if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).Facet)) {
          result.push(...flattenWorkdayFacetNodes((v as Record<string, unknown>).Facet));
        }
      }
    }
  }
  return result;
}

export function discoverWorkdayIndiaFacets(facets: unknown): Record<string, string[]> {
  const flat = flattenWorkdayFacetNodes(facets);
  const countryFacets: Record<string, string[]> = {};
  const locationFacets: Record<string, string[]> = {};

  for (const node of flat) {
    const param = typeof node.facetParameter === 'string' ? node.facetParameter.trim() : '';
    const values = Array.isArray(node.values) ? (node.values as Array<Record<string, unknown>>) : [];
    if (!param || !values.length) continue;

    const isCountryParam =
      param.toLowerCase().replace(/[^a-z]/g, '').endsWith('country') ||
      values.some((v) => String(v.descriptor || '').trim().toLowerCase() === 'india');

    if (isCountryParam) {
      for (const v of values) {
        if (String(v.descriptor || '').trim().toLowerCase() === 'india' && typeof v.id === 'string' && v.id) {
          countryFacets[param] = countryFacets[param] || [];
          if (!countryFacets[param].includes(v.id)) countryFacets[param].push(v.id);
        }
      }
    }

    const isLocParam =
      param === 'locations' ||
      values.some((v) => /,\s*india$/i.test(String(v.descriptor || '').trim()));

    if (isLocParam || !isCountryParam) {
      for (const v of values) {
        const desc = String(v.descriptor || '').trim();
        const id = typeof v.id === 'string' ? v.id : '';
        if (!id) continue;
        if (
          /,\s*india$/i.test(desc) ||
          Boolean(canonicalShortlistCity({ location: desc }))
        ) {
          locationFacets[param] = locationFacets[param] || [];
          if (!locationFacets[param].includes(id)) locationFacets[param].push(id);
        }
      }
    }
  }

  if (Object.keys(countryFacets).length > 0) return countryFacets;
  return locationFacets;
}

async function fetchWorkday(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const parsedCareer = new URL(c.careers_url);
  const parts = identifier.split('|').filter(Boolean);
  const tenant = parts[0] || parsedCareer.hostname.split('.')[0];
  const site =
    parts[1] ||
    parsedCareer.pathname
      .split('/')
      .filter((p) => p && !/^[a-z]{2}(?:-[a-z]{2})?$/i.test(p))[0] ||
    'careers';
  const origin = `${parsedCareer.protocol}//${parsedCareer.hostname}`;
  const apiBase = `${origin}/wday/cxs/${tenant}/${site}`;

  const firstPage = await fetchJson<{
    jobPostings?: Array<Record<string, unknown>>;
    total?: number;
    facets?: unknown[];
  }>(`${apiBase}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: '' }),
  });

  const firstBatch = Array.isArray(firstPage?.jobPostings) ? firstPage.jobPostings : [];
  const totalUnfiltered = Number(firstPage?.total ?? firstBatch.length);
  const indiaFacets = totalUnfiltered > 20 ? discoverWorkdayIndiaFacets(firstPage?.facets) : {};
  const useFacets = Object.keys(indiaFacets).length > 0;

  const postings: Array<Record<string, unknown>> = useFacets ? [] : [...firstBatch];
  const startOffset = useFacets ? 0 : 20;

  if (useFacets || firstBatch.length === 20) {
    for (let offset = startOffset; offset < 200; offset += 20) {
      const page = await fetchJson<{ jobPostings?: Array<Record<string, unknown>>; total?: number }>(
        `${apiBase}/jobs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            appliedFacets: useFacets ? indiaFacets : {},
            limit: 20,
            offset,
            searchText: '',
          }),
        },
      );
      const batch = Array.isArray(page?.jobPostings) ? page.jobPostings : [];
      postings.push(...batch);
      if (batch.length < 20 || postings.length >= (page?.total ?? postings.length)) break;
    }
  }

  const relevantPostings = postings
    .filter((item) => {
      const locText = String(item.locationsText || '');
      return Boolean(canonicalShortlistCity({ location: locText })) || /\bindia\b/i.test(locText);
    })
    .slice(0, 30);

  const detailMap = new Map<string, Record<string, unknown>>();
  await Promise.allSettled(
    relevantPostings.map(async (item) => {
      const extPath = String(item.externalPath || '');
      if (!extPath) return;
      try {
        const detail = await fetchJson<{ jobPostingInfo?: Record<string, unknown> }>(`${apiBase}${extPath}`, {
          timeoutMs: 6000,
        });
        if (detail?.jobPostingInfo) detailMap.set(extPath, detail.jobPostingInfo);
      } catch {
        // detail optional
      }
    }),
  );

  return postings.map((item) => {
    const extPath = String(item.externalPath || '');
    const info = detailMap.get(extPath);
    const publicUrl = `${origin}/${site}${extPath}`;
    const location = info
      ? [info.location, ...(Array.isArray(info.additionalLocations) ? info.additionalLocations : []), item.locationsText]
          .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
          .join(' · ')
      : String(item.locationsText || 'Not specified');
    const posted = normalizePostedInput((item.postedOn || info?.startDate) as string | null);
    return {
      external_job_id: String(info?.jobReqId || info?.jobPostingId || extPath || item.title),
      title: String(info?.title || item.title || ''),
      company: c.name,
      location,
      description: info?.jobDescription ? stripHtml(String(info.jobDescription)) : '',
      ats_provider: 'workday',
      job_url: publicUrl,
      application_url: safeResolveUrl(info?.externalUrl, publicUrl) || publicUrl,
      career_page_url: c.careers_url,
      ...posted,
    };
  });
}

async function fetchOracle(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const [host, site] = identifier.split('|');
  if (!host || !site) throw new Error('Invalid Oracle HCM identifier');
  const url = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=${encodeURIComponent(site)},limit=100`;
  const data = await fetchJson<{ items?: Array<{ requisitionList?: Array<Record<string, unknown>> }> }>(url);
  const rows = data?.items?.[0]?.requisitionList || [];
  return rows.map((r) => {
    const id = String(r.Id || r.RequisitionId || '');
    const jobUrl = `https://${host}/hcmUI/CandidateExperience/en/sites/${encodeURIComponent(site)}/job/${encodeURIComponent(id)}`;
    const posted = normalizePostedInput(r.PostedDate as string | null);
    return {
      external_job_id: id,
      title: String(r.Title || ''),
      company: c.name,
      location: String(r.PrimaryLocation || 'Not specified'),
      description: stripHtml(String(r.ShortDescriptionStr || r.ExternalDescriptionStr || '')),
      ats_provider: 'oracle',
      job_url: jobUrl,
      application_url: jobUrl,
      career_page_url: c.careers_url,
      ...posted,
    };
  });
}

async function fetchEightfold(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const [host, domain] = identifier.split('|');
  if (!host || !domain) throw new Error('Invalid Eightfold identifier');

  const positions = new Map<string, Record<string, unknown>>();
  let start = 0;
  let total = Infinity;

  while (start < Math.min(total, 200)) {
    const url = `https://${host}/api/pcsx/search?domain=${encodeURIComponent(domain)}&query=&location=India&start=${start}&sort_by=relevance`;
    const page = await fetchJson<{
      data?: { count?: number; positions?: Array<Record<string, unknown>> };
    }>(url);
    const batch = Array.isArray(page?.data?.positions) ? page.data!.positions : [];
    if (typeof page?.data?.count === 'number') total = page.data.count;
    if (!batch.length) break;

    let added = 0;
    for (const p of batch) {
      const id = String(p.id || p.atsJobId || '');
      if (id && !positions.has(id)) {
        positions.set(id, p);
        added += 1;
      }
    }
    if (added === 0) break;
    start += batch.length;
    if (batch.length < 10) break;
  }

  const rows = [...positions.values()];
  const detailMap = new Map<string, string>();
  const indiaRows = rows
    .filter((p) => {
      const locs = Array.isArray(p.standardizedLocations) ? p.standardizedLocations : p.locations;
      const locText = Array.isArray(locs) ? locs.join(' ') : String(p.location || '');
      return Boolean(canonicalShortlistCity({ location: locText })) || /\bindia\b/i.test(locText);
    })
    .slice(0, 18);

  // Bounded concurrency of 3 with 429 resilience (PR #127)
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, indiaRows.length || 1) }, async () => {
      while (idx < indiaRows.length) {
        const current = indiaRows[idx++];
        const id = String(current.id || current.atsJobId || '');
        if (!id) continue;
        try {
          const detailUrl = `https://${host}/api/pcsx/position_details?domain=${encodeURIComponent(domain)}&position_id=${encodeURIComponent(id)}&hl=en`;
          const detail = await fetchJson<{ data?: { jobDescription?: string; description?: string } }>(
            detailUrl,
            { timeoutMs: 6000 },
          );
          const desc = detail?.data?.jobDescription || detail?.data?.description;
          if (desc) detailMap.set(id, stripHtml(String(desc)));
        } catch {
          // detail optional
        }
      }
    }),
  );

  return rows.map((p) => {
    const id = String(p.id || p.atsJobId || '');
    const locs = Array.isArray(p.standardizedLocations) ? p.standardizedLocations : p.locations;
    const location = Array.isArray(locs) ? locs.join(' · ') : String(p.location || 'India');
    const jobUrl = `https://${host}/careers/job/${encodeURIComponent(id)}?domain=${encodeURIComponent(domain)}`;
    const posted = normalizePostedInput(p.postedTs as number | null);
    return {
      external_job_id: id,
      title: String(p.name || p.title || ''),
      company: c.name,
      location,
      description: detailMap.get(id) || stripHtml(String(p.job_description || p.description || '')),
      ats_provider: 'eightfold',
      job_url: jobUrl,
      application_url: jobUrl,
      career_page_url: c.careers_url,
      ...posted,
    };
  });
}



async function fetchJobvite(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const parts = identifier.split('|').filter(Boolean);
  const slug = parts[0] || new URL(c.careers_url).pathname.split('/').filter(Boolean)[0] || '';
  let eid = parts[1] || '';
  if (!eid && slug) {
    const htmlRes = await fetchWithRetry(`https://jobs.jobvite.com/${encodeURIComponent(slug)}?fr=true&nl=1`);
    const html = await htmlRes.text();
    eid = html.match(/companyEId\s*[:=]\s*['"]([A-Za-z0-9_-]{4,40})['"]/)?.[1] || '';
  }
  if (!eid) throw new Error('Jobvite companyEId not found');
  const res = await fetchWithRetry(`https://app.jobvite.com/CompanyJobs/Xml.aspx?c=${encodeURIComponent(eid)}`);
  if (!res.ok) throw new Error(`Jobvite XML HTTP ${res.status}`);
  const xml = await res.text();
  return parseXmlJobs(xml, c.name, c.careers_url, 'jobvite');
}

async function fetchAmazon(c: CompanyTarget): Promise<RawAtsJob[]> {
  const found = new Map<string, RawAtsJob>();
  for (const city of ['Bengaluru', 'Hyderabad']) {
    const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(
      `https://www.amazon.jobs/en/search.json?country=IND&city=${encodeURIComponent(city)}&result_limit=100&offset=0&sort=recent`,
    );
    for (const item of data?.jobs || []) {
      const id = String(item.id_icims || item.id || item.job_path || '');
      const path = String(item.job_path || '');
      if (!id || !path.startsWith('/en/jobs/')) continue;
      const url = `https://www.amazon.jobs${path}`;
      const desc = [item.description, item.basic_qualifications, item.preferred_qualifications]
        .filter((v): v is string => typeof v === 'string')
        .join('\n');
      found.set(id, {
        external_job_id: id,
        title: String(item.title || ''),
        company: c.name,
        location: String(item.location || item.normalized_location || city),
        description: stripHtml(desc),
        ats_provider: 'amazon',
        job_url: url,
        application_url: url,
        career_page_url: c.careers_url,
        ...normalizePostedInput(item.posted_date as string | null),
      });
    }
  }
  return [...found.values()];
}

async function fetchXmlFeed(c: CompanyTarget, feedUrl: string): Promise<RawAtsJob[]> {
  const res = await fetchWithRetry(feedUrl, { timeoutMs: 12000 });
  if (!res.ok) throw new Error(`XML feed HTTP ${res.status}`);
  const xml = await res.text();
  return parseXmlJobs(xml, c.name, c.careers_url, 'xml');
}

async function fetchKula(c: CompanyTarget, slug: string): Promise<RawAtsJob[]> {
  const boardUrl = `https://careers.kula.ai/${encodeURIComponent(slug)}`;
  const res = await fetchWithRetry(boardUrl, { timeoutMs: 10000 });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Kula HTTP ${res.status}`);
  }
  const html = await res.text();
  const fromJsonLd = extractJsonLdJobs(html, c.name, boardUrl).map((j) => ({ ...j, ats_provider: 'kula' }));
  if (fromJsonLd.length > 0) return fromJsonLd;

  // Next.js RSC Flight payload extraction (matching scraper/career_widgets.py)
  const records = parseNextFlightRecords(html);
  const found: Array<Record<string, unknown>> = [];
  const walkJobs = (node: unknown, depth = 0) => {
    if (!node || depth > 8 || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walkJobs(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.jobs) && obj.jobs.every((j) => j && typeof j === 'object' && 'ats_job' in (j as Record<string, unknown>))) {
      found.push(...(obj.jobs as Array<Record<string, unknown>>));
      return;
    }
    for (const val of Object.values(obj)) walkJobs(val, depth + 1);
  };
  for (const val of Object.values(records)) walkJobs(val);

  if (found.length > 0) {
    return found
      .filter((item) => item.listed !== false && !item.is_confidential)
      .map((item) => {
        const id = String(item.id || '');
        const detail = (item.ats_job || {}) as Record<string, unknown>;
        let desc = detail.job_description;
        if (typeof desc === 'string' && /^\$[0-9a-f]+$/i.test(desc)) {
          desc = records[desc.slice(1)] ?? desc;
        }
        const offices = Array.isArray(detail.offices) ? (detail.offices as Array<Record<string, unknown> | string>) : [];
        const locText = offices
          .map((o) =>
            typeof o === 'string'
              ? o
              : [o?.name, o?.city, o?.country, o?.location]
                  .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
                  .join(', '),
          )
          .filter(Boolean)
          .join(' · ');
        const jobUrl = `https://careers.kula.ai/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`;
        return {
          external_job_id: id,
          title: String(item.title || ''),
          company: c.name,
          location: locText || 'India',
          description: stripHtml(String(desc || '')),
          ats_provider: 'kula',
          job_url: jobUrl,
          application_url: jobUrl,
          career_page_url: c.careers_url,
          ...normalizePostedInput(item.launch_at as string | null),
        };
      });
  }

  return extractEmbeddedStateJobs(html, c.name, boardUrl).map((j) => ({ ...j, ats_provider: 'kula' }));
}

async function fetchPyjamaHr(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  let companyUuid = /^\d{5,}$|^[0-9a-f-]{16,}$/i.test(identifier) ? identifier : '';
  const boardUrl = c.careers_url.includes('pyjamahr.com')
    ? c.careers_url
    : `https://jobs.pyjamahr.com/${encodeURIComponent(identifier)}`;

  if (!companyUuid) {
    const pageRes = await fetchWithRetry(boardUrl, { timeoutMs: 10000 });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const nextMatch = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      if (nextMatch) {
        try {
          const nextData = JSON.parse(nextMatch[1]) as { props?: { pageProps?: { companyDetails?: { uuid?: string } } } };
          companyUuid = String(nextData?.props?.pageProps?.companyDetails?.uuid || '');
        } catch {
          // ignore
        }
      }
    } else {
      await pageRes.body?.cancel();
    }
  }

  if (companyUuid) {
    const records: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= 5; page++) {
      const data = await fetchJson<{ results?: Array<Record<string, unknown>>; next?: string | null }>(
        `https://api.pyjamahr.com/api/career/jobs/?company_uuid=${encodeURIComponent(companyUuid)}&page=${page}&is_careers_page=true`,
      );
      const batch = Array.isArray(data?.results) ? data.results : [];
      records.push(...batch);
      if (!data?.next || batch.length === 0) break;
    }

    const detailMap = new Map<string, string>();
    const indiaTargets = records
      .filter((r) => !r.published_internally && isIndiaOrTargetCity(`${r.location || ''} ${Array.isArray(r.other_locations) ? r.other_locations.join(' ') : ''}`))
      .slice(0, 20);

    await mapWithLimit(indiaTargets, 4, async (item) => {
      const id = String(item.id || '');
      if (!id) return;
      const d = await fetchJson<{ description?: string }>(
        `https://api.pyjamahr.com/api/career/jobs/${encodeURIComponent(id)}/?company_uuid=${encodeURIComponent(companyUuid)}&is_careers_page=true`,
        { timeoutMs: 6000 },
      );
      if (d?.description) detailMap.set(id, stripHtml(String(d.description)));
    });

    return records
      .filter((item) => !item.published_internally)
      .map((item) => {
        const id = String(item.id || '');
        const slugPart = typeof item.slug === 'string' && item.slug ? item.slug : id;
        const jobUrl = `${boardUrl.replace(/\/$/, '')}/${encodeURIComponent(slugPart)}`;
        const otherLocs = Array.isArray(item.other_locations) ? item.other_locations : [];
        const loc = [item.location, ...otherLocs].filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).join(' · ');
        return {
          external_job_id: id,
          title: String(item.title || ''),
          company: c.name,
          location: loc || 'India',
          description: detailMap.get(id) || stripHtml(String(item.description || '')),
          ats_provider: 'pyjamahr',
          job_url: jobUrl,
          application_url: jobUrl,
          career_page_url: c.careers_url,
          ...normalizePostedInput((item.published_at || item.date_posted) as string | null),
        };
      });
  }

  const res = await fetchWithRetry(boardUrl, { timeoutMs: 10000 });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`PyjamaHR HTTP ${res.status}`);
  }
  const html = await res.text();
  const fromJsonLd = extractJsonLdJobs(html, c.name, boardUrl).map((j) => ({ ...j, ats_provider: 'pyjamahr' }));
  if (fromJsonLd.length > 0) return fromJsonLd;
  return extractEmbeddedStateJobs(html, c.name, boardUrl).map((j) => ({ ...j, ats_provider: 'pyjamahr' }));
}

async function fetchPhenom(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const pageRes = await fetchWithRetry(c.careers_url, { timeoutMs: 12000 });
  if (!pageRes.ok) {
    await pageRes.body?.cancel();
    throw new Error(`Phenom career page HTTP ${pageRes.status}`);
  }
  const finalUrl = pageRes.url || c.careers_url;
  const html = await pageRes.text();
  const parsedUrl = new URL(finalUrl);
  const origin = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
  const cfg = parsePhenomConfig(html) || {
    refNum: identifier,
    baseUrl: origin,
    widgetApiEndpoint: `${origin}/widgets`,
    country: 'in',
    locale: 'en_us',
  };
  const baseUrl = (cfg.baseUrl || origin).replace(/\/$/, '');
  const endpoint = cfg.widgetApiEndpoint || `${origin}/widgets`;
  const isLowesIndia = parsedUrl.hostname === 'talent.lowes.com' && cfg.country === 'in';

  const listings: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const runSearch = async (countryFilter: string[] | null) => {
    for (let offset = 0; offset < 150; offset += 50) {
      let batch: Array<Record<string, unknown>> = [];
      let total = 0;
      if (isLowesIndia) {
        const srRes = await fetchWithRetry(`${baseUrl}/search-results?from=${offset}&s=1`, { timeoutMs: 10000 });
        if (!srRes.ok) break;
        const srHtml = await srRes.text();
        const ddo = extractBalancedJson<Record<string, unknown>>(srHtml, /\bphApp\.ddo\s*=\s*/);
        const eager = (ddo?.eagerLoadRefineSearch || {}) as Record<string, unknown>;
        batch = ((eager.data as Record<string, unknown> | undefined)?.jobs as Array<Record<string, unknown>>) || [];
        total = Number(eager.totalHits ?? batch.length);
      } else {
        const res = await fetchJson<{
          refineSearch?: { data?: { jobs?: Array<Record<string, unknown>> }; totalHits?: number };
        }>(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin, Referer: finalUrl },
          body: JSON.stringify({
            ddoKey: 'refineSearch',
            country: cfg.country || 'us',
            lang: 'en',
            locale: cfg.locale || 'en_us',
            deviceType: 'desktop',
            refNum: cfg.refNum || identifier,
            from: offset,
            size: 50,
            keywords: '',
            selected_fields: countryFilter ? { country: countryFilter } : {},
            all_fields: [],
            jobs: true,
            counts: true,
            pageName: 'search-results',
            siteType: 'external',
          }),
          timeoutMs: 12000,
        });
        batch = res?.refineSearch?.data?.jobs || [];
        total = Number(res?.refineSearch?.totalHits ?? batch.length);
      }
      if (!batch.length) break;
      for (const item of batch) {
        const seq = String(item.jobSeqNo || item.jobId || '');
        if (seq && !seen.has(seq)) {
          seen.add(seq);
          listings.push(item);
        }
      }
      if (listings.length >= total || batch.length < 50) break;
    }
  };

  await runSearch(['India', 'IND', 'INDIA', 'IN']);
  if (listings.length === 0 && !isLowesIndia) {
    await runSearch(null);
  }

  const phenomLoc = (item: Record<string, unknown>) =>
    [
      item.location,
      item.cityStateCountry,
      ...(Array.isArray(item.multi_location) ? item.multi_location : []),
    ]
      .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      .join(' · ') || 'Not specified';

  const detailMap = new Map<string, { desc: string; title?: string; location?: string; posted?: string }>();
  const targetItems = listings
    .filter((item) => item.visibilityType !== 'private' && isIndiaOrTargetCity(phenomLoc(item)))
    .slice(0, 22);

  await mapWithLimit(targetItems, 4, async (item) => {
    const seq = String(item.jobSeqNo || '');
    if (!seq) return;
    const dRes = await fetchWithRetry(`${baseUrl}/job/${encodeURIComponent(seq)}`, { timeoutMs: 8000 });
    if (!dRes.ok) {
      await dRes.body?.cancel();
      return;
    }
    const dHtml = await dRes.text();
    const ddo = extractBalancedJson<Record<string, unknown>>(dHtml, /\bphApp\.ddo\s*=\s*/);
    const jobObj = ((ddo?.jobDetail as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.job as
      | Record<string, unknown>
      | undefined;
    if (jobObj?.description) {
      detailMap.set(seq, {
        desc: stripHtml(String(jobObj.description)),
        title: typeof jobObj.title === 'string' ? jobObj.title : undefined,
        location: phenomLoc(jobObj),
        posted: String(jobObj.postedDate || jobObj.atsPostedDate || ''),
      });
    } else {
      const ld = extractJsonLdJobs(dHtml, c.name, `${baseUrl}/job/${seq}`)[0];
      if (ld?.description) {
        detailMap.set(seq, { desc: ld.description, title: ld.title, location: ld.location });
      }
    }
  });

  return listings.map((item) => {
    const seq = String(item.jobSeqNo || item.jobId || '');
    const d = detailMap.get(seq);
    const jobUrl = seq ? `${baseUrl}/job/${encodeURIComponent(seq)}` : finalUrl;
    const posted = normalizePostedInput((d?.posted || item.postedDate) as string | null);
    return {
      external_job_id: String(item.jobId || seq),
      title: d?.title || String(item.title || ''),
      company: c.name,
      location: d?.location || phenomLoc(item),
      description: d?.desc || stripHtml(String(item.descriptionTeaser || item.description || '')),
      ats_provider: 'phenom',
      job_url: jobUrl,
      application_url: jobUrl,
      career_page_url: c.careers_url,
      ...posted,
    };
  });
}

async function fetchJibe(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const parts = identifier.split('|').filter(Boolean);
  const scope = parts[1] || '';
  const country = scope === 'India' ? 'India' : '';
  const brand = scope.startsWith('brand=') ? scope.slice(6) : '';
  const origin = new URL(c.careers_url).origin;
  const endpoint = `${origin}/api/jobs`;

  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const fetchPages = async (withCountry: boolean) => {
    for (let page = 1; page <= 4; page++) {
      const params = new URLSearchParams({ page: String(page), limit: '25', internal: 'false' });
      if (withCountry && country) params.set('country', country);
      if (brand) params.set('brand', brand);
      const data = await fetchJson<{ totalCount?: number; jobs?: Array<{ data?: Record<string, unknown> } | Record<string, unknown>> }>(
        `${endpoint}?${params.toString()}`,
        { timeoutMs: 12000 },
      );
      const batch = Array.isArray(data?.jobs) ? data.jobs : [];
      for (const entry of batch) {
        const rec = ('data' in entry && entry.data && typeof entry.data === 'object'
          ? entry.data
          : entry) as Record<string, unknown>;
        const slug = String(rec.slug || rec.req_id || '');
        if (slug && !seen.has(slug)) {
          seen.add(slug);
          rows.push(rec);
        }
      }
      const total = Number(data?.totalCount ?? rows.length);
      if (batch.length === 0 || rows.length >= total) break;
    }
  };

  try {
    await fetchPages(Boolean(country));
  } catch {
    if (country) await fetchPages(false);
    else throw new Error('Jibe listing API failed');
  }
  if (rows.length === 0 && country) {
    await fetchPages(false);
  }

  const jibeLoc = (r: Record<string, unknown>) => {
    const primary = r.full_location || [r.city, r.state, r.country].filter(Boolean).join(', ');
    const add = Array.isArray(r.additional_locations)
      ? (r.additional_locations as Array<Record<string, unknown> | string>).map((a) =>
          typeof a === 'string' ? a : String(a.full_location || [a.city, a.state, a.country].filter(Boolean).join(', ')),
        )
      : [];
    return [primary, ...add].filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).join(' · ') || 'Not specified';
  };

  const detailMap = new Map<string, Record<string, unknown>>();
  const needDetail = rows.filter((r) => isIndiaOrTargetCity(jibeLoc(r)) && !r.description).slice(0, 20);
  await mapWithLimit(needDetail, 4, async (r) => {
    const slug = String(r.slug || '');
    const lang = String(r.language || 'en-us');
    if (!slug) return;
    const d = await fetchJson<Record<string, unknown>>(`${endpoint}/${encodeURIComponent(slug)}/${encodeURIComponent(lang)}`, {
      timeoutMs: 6000,
    });
    if (d?.title) detailMap.set(slug, d);
  });

  return rows.map((r) => {
    const slug = String(r.slug || r.req_id || '');
    const lang = String(r.language || 'en-us');
    const rec = detailMap.get(slug) || r;
    const jobUrl = `${origin}/jobs/${encodeURIComponent(slug)}?lang=${encodeURIComponent(lang)}`;
    const desc = [rec.description, rec.qualifications, rec.responsibilities, rec.benefits]
      .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      .join('\n');
    return {
      external_job_id: slug,
      title: String(rec.title || r.title || ''),
      company: c.name,
      location: jibeLoc(rec),
      description: stripHtml(desc),
      ats_provider: 'jibe',
      job_url: jobUrl,
      application_url: safeResolveUrl(rec.apply_url, jobUrl) || jobUrl,
      career_page_url: c.careers_url,
      ...normalizePostedInput((rec.posted_date || rec.create_date) as string | null),
    };
  });
}

async function fetchTalentBrew(c: CompanyTarget, provider = 'talentbrew'): Promise<RawAtsJob[]> {
  const listings = new Map<string, { url: string; title: string; location: string }>();
  const startUrl =
    provider === 'netapp' && !c.careers_url.toLowerCase().includes('india')
      ? 'https://careers.netapp.com/search-jobs/India/27600/2/1269750/22/79/50/2'
      : c.careers_url;
  let nextUrl: string | null = startUrl;
  const visited = new Set<string>();

  for (let page = 0; page < 5 && nextUrl; page++) {
    if (visited.has(nextUrl)) break;
    visited.add(nextUrl);
    const res = await fetchWithRetry(nextUrl, { timeoutMs: 12000 });
    if (!res.ok) {
      await res.body?.cancel();
      if (page === 0 && nextUrl !== c.careers_url) {
        nextUrl = c.careers_url;
        continue;
      }
      if (page === 0) throw new Error(`TalentBrew HTTP ${res.status}`);
      break;
    }
    const html = await res.text();
    const anchorMatches = html.matchAll(/<a\b[^>]*>/gi);
    for (const m of anchorMatches) {
      const tag = m[0];
      const jobId = tag.match(/data-job-id=["']([^"']+)["']/i)?.[1];
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (!jobId || !href || listings.has(jobId)) continue;
      const resolved = safeResolveUrl(href, res.url || nextUrl);
      if (!resolved) continue;
      const afterStart = (m.index ?? 0) + tag.length;
      const snippet = html.slice(afterStart, afterStart + 900);
      const heading = snippet.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)?.[1] || snippet.split('</a>')[0];
      const locMatch = snippet.match(/class=["'][^"']*job-location[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || '';
      listings.set(jobId, {
        url: resolved,
        title: stripHtml(heading) || jobId,
        location: stripHtml(locMatch) || (resolved.toLowerCase().includes('india') ? 'India' : ''),
      });
    }

    const nextHref =
      html.match(/<a\b[^>]*class=["'][^"']*\bnext\b[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
      html.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\bnext\b[^"']*["']/i)?.[1];
    nextUrl = nextHref && !html.slice(0, 50000).includes('next disabled')
      ? safeResolveUrl(nextHref, res.url || nextUrl)
      : null;
    if (listings.size >= 160) break;
  }

  const allItems = [...listings.entries()];
  const indiaHinted =
    startUrl.toLowerCase().includes('india') || c.careers_url.toLowerCase().includes('india')
      ? allItems
      : allItems.filter(([, item]) => !item.location || isIndiaOrTargetCity(item.location));
  const detailSlice = indiaHinted.slice(0, 22);

  const enriched = new Map<string, RawAtsJob>();
  await mapWithLimit(detailSlice, 4, async ([id, item]) => {
    const dRes = await fetchWithRetry(item.url, { timeoutMs: 8000 });
    if (!dRes.ok) {
      await dRes.body?.cancel();
      return;
    }
    const dHtml = await dRes.text();
    const ld = extractJsonLdJobs(dHtml, c.name, item.url)[0];
    if (ld) {
      enriched.set(id, { ...ld, external_job_id: id, ats_provider: provider });
    } else {
      const descBlock = dHtml.match(/class=["'][^"']*ats-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
      enriched.set(id, {
        external_job_id: id,
        title: item.title,
        company: c.name,
        location: item.location || 'India',
        description: stripHtml(descBlock),
        ats_provider: provider,
        job_url: item.url,
        application_url: item.url,
        career_page_url: c.careers_url,
        ...normalizePostedInput(null),
      });
    }
  });

  return allItems.map(([id, item]) =>
    enriched.get(id) || {
      external_job_id: id,
      title: item.title,
      company: c.name,
      location: item.location || 'Not specified',
      description: '',
      ats_provider: provider,
      job_url: item.url,
      application_url: item.url,
      career_page_url: c.careers_url,
      ...normalizePostedInput(null),
    },
  );
}

async function fetchAvature(c: CompanyTarget): Promise<RawAtsJob[]> {
  const listings = new Map<string, { url: string; title: string; location: string; posted?: string }>();
  let nextUrl: string | null = c.careers_url;
  const visited = new Set<string>();

  for (let page = 0; page < 3 && nextUrl; page++) {
    if (visited.has(nextUrl)) break;
    visited.add(nextUrl);
    const res = await fetchWithRetry(nextUrl, { timeoutMs: 12000 });
    if (!res.ok) {
      await res.body?.cancel();
      if (page === 0) throw new Error(`Avature HTTP ${res.status}`);
      break;
    }
    const html = await res.text();
    const articleBlocks = html.matchAll(/<article\b[^>]*article--result[\s\S]*?<\/article>/gi);
    for (const blockMatch of articleBlocks) {
      const block = blockMatch[0];
      const linkMatch = block.match(/href=["']([^"']*JobDetail[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const url = safeResolveUrl(linkMatch[1], res.url || nextUrl);
      if (!url) continue;
      const id = url.match(/jobId=(\d+)|\/(\d+)\/?$/)?.[1] || url.match(/\/(\d+)\/?$/)?.[1] || url;
      const subtitle = block.match(/article__header__text__subtitle[^>]*>([\s\S]*?)<\//i)?.[1] || '';
      listings.set(id, {
        url,
        title: stripHtml(linkMatch[2]),
        location: stripHtml(subtitle) || 'Not specified',
      });
    }
    const nextHref = html.match(/href=["']([^"']+)["'][^>]*paginationNextLink|paginationNextLink[^>]*href=["']([^"']+)["']/i);
    nextUrl = safeResolveUrl(nextHref?.[1] || nextHref?.[2], res.url || nextUrl);
  }

  const all = [...listings.entries()];
  const targets = all.filter(([, item]) => isIndiaOrTargetCity(item.location) || item.location === 'Not specified').slice(0, 20);
  const enriched = new Map<string, RawAtsJob>();

  await mapWithLimit(targets, 4, async ([id, item]) => {
    const dRes = await fetchWithRetry(item.url, { timeoutMs: 8000 });
    if (!dRes.ok) {
      await dRes.body?.cancel();
      return;
    }
    const dHtml = await dRes.text();
    const ld = extractJsonLdJobs(dHtml, c.name, item.url)[0];
    if (ld) {
      enriched.set(id, { ...ld, external_job_id: id, ats_provider: 'avature' });
    }
  });

  return all.map(([id, item]) =>
    enriched.get(id) || {
      external_job_id: id,
      title: item.title,
      company: c.name,
      location: item.location,
      description: '',
      ats_provider: 'avature',
      job_url: item.url,
      application_url: item.url,
      career_page_url: c.careers_url,
      ...normalizePostedInput(null),
    },
  );
}

async function fetchMyNextHire(c: CompanyTarget, slug: string): Promise<RawAtsJob[]> {
  const host = `${slug}.mynexthire.com`;
  const base = `https://${host}`;
  const listRes = await fetchJson<{ reqDetailsBOList?: Array<Record<string, unknown>> }>(
    `${base}/employer/careers/reqlist/get`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'careers', code: '', filterByBuId: -1 }),
      timeoutMs: 12000,
    },
  );
  const records = Array.isArray(listRes?.reqDetailsBOList) ? listRes.reqDetailsBOList : [];
  const reqIds = records.map((r) => r.reqId).filter((id): id is number => typeof id === 'number');
  const datesMap = new Map<number, number>();
  if (reqIds.length > 0) {
    try {
      const dateRes = await fetchJson<{ data?: { careersJobPostingDatesList?: Array<Record<string, unknown>> } }>(
        `${base}/ats/public-apis/v1/careers/job-posting-dates/list`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ srcShortName: 'careers', requisitionIdList: reqIds }),
          timeoutMs: 8000,
        },
      );
      for (const entry of dateRes?.data?.careersJobPostingDatesList || []) {
        const id = Number(entry.requisitionId);
        const ts = Number(entry.publishedOn);
        if (id && ts > 0) {
          const prev = datesMap.get(id);
          datesMap.set(id, prev ? Math.min(prev, ts) : ts);
        }
      }
    } catch {
      // dates optional
    }
  }

  return records.map((r) => {
    const reqId = Number(r.reqId);
    const context = {
      pageType: 'jd',
      cvSource: 'careers',
      reqId,
      requester: { id: '', code: '', name: '' },
      page: 'careers',
      bufilter: -1,
      customFields: {},
    };
    const encoded = Buffer.from(JSON.stringify(context)).toString('base64');
    const url = `${base}/employer/jobs/careers#?src%3Dcareers%26p%3D${encoded}`;
    const loc = [r.location, r.locationAddress].filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).join(', ');
    const posted = normalizePostedInput(datesMap.get(reqId) ?? null);
    return {
      external_job_id: String(reqId),
      title: String(r.designation || r.reqTitle || ''),
      company: c.name,
      location: loc || 'India',
      description: stripHtml(String(r.jdDisplay || '')),
      ats_provider: 'mynexthire',
      job_url: url,
      application_url: url,
      career_page_url: c.careers_url,
      ...posted,
    };
  });
}

async function fetchEightfoldLegacy(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const [host, domain] = identifier.split('|');
  if (!host || !domain) throw new Error('Invalid Eightfold legacy identifier');
  const base = `https://${host}`;
  const positions: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (let start = 0; start < 150; start += 25) {
    const page = await fetchJson<{ positions?: Array<Record<string, unknown>>; count?: number }>(
      `${base}/api/apply/v2/jobs?domain=${encodeURIComponent(domain)}&location=India&query=&start=${start}&num=25`,
    );
    const batch = Array.isArray(page?.positions) ? page.positions : [];
    for (const p of batch) {
      const id = String(p.id || '');
      if (id && !seen.has(id) && p.isPrivate !== true) {
        seen.add(id);
        positions.push(p);
      }
    }
    if (batch.length < 25 || positions.length >= (page?.count ?? positions.length)) break;
  }

  if (positions.length === 0) {
    return fetchEightfold(c, identifier);
  }

  const detailMap = new Map<string, { desc: string; posted?: string }>();
  const targets = positions
    .filter((p) => {
      const locs = Array.isArray(p.locations) ? p.locations.join(' ') : String(p.location || '');
      return isIndiaOrTargetCity(locs);
    })
    .slice(0, 18);

  await mapWithLimit(targets, 3, async (p) => {
    const id = String(p.id || '');
    if (!id) return;
    const d = await fetchJson<{ job_description?: string }>(
      `${base}/api/apply/v2/jobs/${encodeURIComponent(id)}?domain=${encodeURIComponent(domain)}`,
      { timeoutMs: 6000 },
    );
    if (d?.job_description) detailMap.set(id, { desc: stripHtml(String(d.job_description)) });
  });

  return positions.map((p) => {
    const id = String(p.id || '');
    const locs = Array.isArray(p.locations) ? (p.locations as string[]).join(' · ') : String(p.location || 'India');
    const url = `${base}/careers?domain=${encodeURIComponent(domain)}&pid=${encodeURIComponent(id)}`;
    return {
      external_job_id: String(p.ats_job_id || id),
      title: String(p.name || p.title || ''),
      company: c.name,
      location: locs || 'India',
      description: detailMap.get(id)?.desc || stripHtml(String(p.job_description || '')),
      ats_provider: 'eightfold_legacy',
      job_url: url,
      application_url: url,
      career_page_url: c.careers_url,
      ...normalizePostedInput(p.t_create as number | null),
    };
  });
}

async function fetchAtlassian(c: CompanyTarget): Promise<RawAtsJob[]> {
  const rows = await fetchJson<Array<Record<string, unknown>>>(
    'https://www.atlassian.com/endpoint/careers/listings',
    { timeoutMs: 12000 },
  );
  if (!Array.isArray(rows)) return [];
  return parseAtlassianListings(rows, c.name, c.careers_url);
}

async function fetchIbm(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const endpoint = identifier.startsWith('http') ? identifier : 'https://www-api.ibm.com/search/api/v2';
  const must: Array<Record<string, unknown>> = [{ term: { country: 'in' } }];
  if (/confluent/i.test(c.name) || identifier === 'confluent') {
    must.push({ wildcard: { title: '*confluent*' } });
  }
  const discovered: Array<Record<string, unknown>> = [];
  for (let from = 0; from < 150; from += 50) {
    const data = await fetchJson<{ hits?: { total?: number | { value?: number }; hits?: Array<Record<string, unknown>> } }>(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: 'careers',
          scopes: ['careers2'],
          query: { bool: { must } },
          size: 50,
          from,
          _source: ['id', 'title', 'url', 'field_keyword_19', 'field_keyword_05', 'body'],
        }),
        timeoutMs: 12000,
      },
    );
    const batch = data?.hits?.hits || [];
    discovered.push(...batch);
    const totalRaw = data?.hits?.total;
    const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw?.value ?? discovered.length);
    if (batch.length < 50 || discovered.length >= total) break;
  }

  return discovered.map((hit) => {
    const src = (hit._source || {}) as Record<string, unknown>;
    const url = String(src.url || '').trim() || c.careers_url;
    const jobIdParam = url.match(/[?&]jobId=([^&]+)/)?.[1];
    const id = String(jobIdParam || src.id || hit._id || url);
    return {
      external_job_id: id,
      title: stripHtml(String(src.title || '')),
      company: c.name,
      location: String(src.field_keyword_19 || src.field_keyword_05 || 'India'),
      description: stripHtml(String(src.body || '')),
      ats_provider: 'ibm',
      job_url: url,
      application_url: url,
      career_page_url: c.careers_url,
      ...normalizePostedInput(null),
    };
  });
}

async function fetchGoogleCareers(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  const locQuery = identifier || 'India';
  const discovered = new Map<string, unknown[]>();
  for (let page = 1; page <= 4; page++) {
    const url = `https://www.google.com/about/careers/applications/jobs/results/?location=${encodeURIComponent(locQuery)}&page=${page}`;
    const res = await fetchWithRetry(url, { timeoutMs: 12000 });
    if (!res.ok) {
      await res.body?.cancel();
      if (page === 1) throw new Error(`Google Careers HTTP ${res.status}`);
      break;
    }
    const html = await res.text();
    const { rows, total } = parseGoogleCareersPayload(html);
    if (!rows.length) break;
    for (const row of rows) {
      const id = String(row[0] || '').trim();
      if (id && !discovered.has(id)) discovered.set(id, row);
    }
    if (discovered.size >= total || rows.length < 20) break;
  }

  const jobs: RawAtsJob[] = [];
  for (const [id, row] of discovered.entries()) {
    const title = String(row[1] || '').trim();
    if (!title) continue;
    const applyUrl = String(row[2] || '').trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const detailUrl = `https://www.google.com/about/careers/applications/jobs/results/${id}${slug ? `-${slug}` : ''}`;
    const locItems = Array.isArray(row[9]) ? (row[9] as unknown[][]) : [];
    const locs = locItems.map((l) => (Array.isArray(l) && typeof l[0] === 'string' ? l[0] : '')).filter(Boolean);
    const sec = (field: unknown) => (Array.isArray(field) && typeof field[1] === 'string' ? field[1] : '');
    const desc = [sec(row[10]), sec(row[4]), sec(row[3])].filter(Boolean).join('\n');
    const tsPair = Array.isArray(row[12]) ? row[12] : [];
    const tsMs = typeof tsPair[0] === 'number' && tsPair[0] > 0 ? tsPair[0] * 1000 : null;
    jobs.push({
      external_job_id: id,
      title,
      company: c.name,
      location: locs.join(' · ') || 'India',
      description: stripHtml(desc),
      ats_provider: 'google_careers',
      job_url: detailUrl,
      application_url: applyUrl || detailUrl,
      career_page_url: c.careers_url,
      ...normalizePostedInput(tsMs),
    });
  }
  return jobs;
}

async function fetchPaylocity(c: CompanyTarget): Promise<RawAtsJob[]> {
  const res = await fetchWithRetry(c.careers_url, { timeoutMs: 12000 });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Paylocity HTTP ${res.status}`);
  }
  const html = await res.text();
  const pageData = extractBalancedJson<{ Jobs?: Array<Record<string, unknown>> }>(html, /window\.pageData\s*=\s*/);
  const rows = Array.isArray(pageData?.Jobs) ? pageData.Jobs : [];

  const detailMap = new Map<string, string>();
  const targets = rows
    .filter((r) => {
      const jl = (r.JobLocation || {}) as Record<string, unknown>;
      return isIndiaOrTargetCity([r.LocationName, jl.City, jl.State, jl.Country].filter(Boolean).join(' '));
    })
    .slice(0, 15);

  await mapWithLimit(targets, 4, async (r) => {
    const id = String(r.JobId || '');
    if (!id) return;
    const dRes = await fetchWithRetry(`https://recruiting.paylocity.com/Recruiting/Jobs/Details/${encodeURIComponent(id)}`, {
      timeoutMs: 6000,
    });
    if (!dRes.ok) {
      await dRes.body?.cancel();
      return;
    }
    const dHtml = await dRes.text();
    const sections = [...dHtml.matchAll(/class=["']job-listing-header["'][^>]*>[^<]*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/gi)]
      .map((m) => m[1])
      .join('\n');
    if (sections) detailMap.set(id, stripHtml(sections));
  });

  return rows.map((r) => {
    const id = String(r.JobId || '');
    const jl = (r.JobLocation || {}) as Record<string, unknown>;
    const loc = [r.LocationName, jl.City, jl.State, jl.Country].filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).join(', ');
    const url = `https://recruiting.paylocity.com/Recruiting/Jobs/Details/${encodeURIComponent(id)}`;
    return {
      external_job_id: id,
      title: String(r.JobTitle || ''),
      company: c.name,
      location: loc || 'Not specified',
      description: detailMap.get(id) || '',
      ats_provider: 'paylocity',
      job_url: url,
      application_url: url,
      career_page_url: c.careers_url,
      ...normalizePostedInput(r.PublishedDate as string | null),
    };
  });
}

async function fetchSuccessFactors(c: CompanyTarget): Promise<RawAtsJob[]> {
  const items = new Map<string, { url: string; title: string; location: string }>();
  const res = await fetchWithRetry(c.careers_url, { timeoutMs: 12000 });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`SuccessFactors HTTP ${res.status}`);
  }
  const html = await res.text();
  const rowMatches = html.matchAll(/<tr\b[^>]*data-row[\s\S]*?<\/tr>/gi);
  for (const rm of rowMatches) {
    const tr = rm[0];
    const linkMatch = tr.match(/jobTitle-link[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>|href=["']([^"']+)["'][^>]*jobTitle-link[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const url = safeResolveUrl(linkMatch[1] || linkMatch[3], res.url || c.careers_url);
    if (!url) continue;
    const id = url.match(/\/job\/[^/]+\/(\d+)\/?$/)?.[1] || url;
    const loc = tr.match(/jobLocation[^>]*>([\s\S]*?)<\//i)?.[1] || '';
    items.set(id, {
      url,
      title: stripHtml(linkMatch[2] || linkMatch[4]),
      location: stripHtml(loc) || 'Not specified',
    });
  }

  const all = [...items.entries()];
  const targets = all.filter(([, i]) => isIndiaOrTargetCity(i.location) || /\+\d+\s+more/i.test(i.location)).slice(0, 20);
  const enriched = new Map<string, RawAtsJob>();

  await mapWithLimit(targets, 4, async ([id, item]) => {
    const dRes = await fetchWithRetry(item.url, { timeoutMs: 7000 });
    if (!dRes.ok) {
      await dRes.body?.cancel();
      return;
    }
    const dHtml = await dRes.text();
    const ld = extractJsonLdJobs(dHtml, c.name, item.url)[0];
    if (ld) enriched.set(id, { ...ld, external_job_id: id, ats_provider: 'successfactors' });
  });

  return all.map(([id, item]) =>
    enriched.get(id) || {
      external_job_id: id,
      title: item.title,
      company: c.name,
      location: item.location,
      description: '',
      ats_provider: 'successfactors',
      job_url: item.url,
      application_url: item.url,
      career_page_url: c.careers_url,
      ...normalizePostedInput(null),
    },
  );
}

async function fetchKeka(c: CompanyTarget, identifier: string): Promise<RawAtsJob[]> {
  let [board, tenant] = identifier.split('|');
  if (!tenant) {
    const wRes = await fetchWithRetry(board || c.careers_url, { timeoutMs: 10000 });
    if (wRes.ok) {
      const wHtml = await wRes.text();
      const kekaLink = wHtml.match(/https:\/\/[a-z0-9-]+\.keka\.com\/careers/i)?.[0];
      if (kekaLink) board = kekaLink;
      if (board) {
        const portalRes = await fetchWithRetry(board, { timeoutMs: 8000 });
        if (portalRes.ok) {
          const portalHtml = await portalRes.text();
          const portalPath = portalHtml.match(/fetch\('([^']+\/careerportal\/[^']+\.html)'\)/)?.[1];
          if (portalPath) {
            const pRes = await fetchWithRetry(new URL(portalPath, board).toString(), { timeoutMs: 8000 });
            if (pRes.ok) {
              const pHtml = await pRes.text();
              tenant = pHtml.match(/identifier:\s*'([^']+)'/)?.[1] || '';
            }
          }
        }
      }
    }
  }
  if (!board || !tenant) throw new Error('Keka board or tenant UUID not found');
  const baseBoard = board.endsWith('/') ? board : `${board}/`;
  const rows = await fetchJson<Array<Record<string, unknown>>>(
    `${baseBoard}api/embedjobs/default/active/${encodeURIComponent(tenant)}`,
    { timeoutMs: 12000 },
  );
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const id = String(row.id || '');
    const jobUrl = `${baseBoard}jobdetails/${encodeURIComponent(id)}`;
    const locs = Array.isArray(row.jobLocations)
      ? (row.jobLocations as Array<Record<string, unknown>>)
          .map((v) => [v.name, v.city, v.state, v.countryName].filter(Boolean).join(', '))
          .filter(Boolean)
      : [];
    return {
      external_job_id: id,
      title: String(row.title || ''),
      company: c.name,
      location: [...new Set(locs)].join(' · ') || 'India',
      description: stripHtml(String(row.description || '')),
      ats_provider: 'keka',
      job_url: jobUrl,
      application_url: jobUrl,
      career_page_url: c.careers_url,
      ...normalizePostedInput(row.publishedOn as string | null),
    };
  });
}

async function fetchJuspay(c: CompanyTarget): Promise<RawAtsJob[]> {
  const res = await fetchWithRetry(c.careers_url, { timeoutMs: 12000 });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Juspay HTTP ${res.status}`);
  }
  const html = await res.text();
  const astroDecode = (val: unknown): unknown => {
    if (!Array.isArray(val) || val.length !== 2) return val;
    const [kind, data] = val;
    if (kind === 0 && data && typeof data === 'object' && !Array.isArray(data)) {
      return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, astroDecode(v)]));
    }
    if (kind === 0) return data;
    if (kind === 1 && Array.isArray(data)) return data.map(astroDecode);
    return data;
  };
  const islands = html.matchAll(/props=["']([^"']*jobData[^"']*)["']/gi);
  for (const m of islands) {
    try {
      const props = JSON.parse(decodeHtmlEntities(m[1])) as { jobData?: unknown };
      const rows = astroDecode(props.jobData);
      if (Array.isArray(rows)) {
        return rows
          .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object' && (r as Record<string, unknown>).opening_status === true))
          .map((item) => {
            const id = String(item.job_id || '');
            const url = `https://juspay.io/careers/${encodeURIComponent(id)}`;
            return {
              external_job_id: id,
              title: String(item.job_title || ''),
              company: c.name,
              location: String(item.job_location || 'Bengaluru, India'),
              description: stripHtml(String(item.job_description_career || item.job_description_template || '')),
              ats_provider: 'juspay',
              job_url: url,
              application_url: url,
              career_page_url: c.careers_url,
              ...normalizePostedInput(null),
            };
          });
      }
    } catch {
      // continue checking next island
    }
  }
  return [];
}

async function fetchThoughtSpot(c: CompanyTarget): Promise<RawAtsJob[]> {
  const res = await fetchJson<{ data?: Array<Record<string, unknown>> }>(
    'https://www.thoughtspot.com/api/getCareersListing',
    { timeoutMs: 12000 },
  );
  const rows = Array.isArray(res?.data) ? res.data : [];
  const merged = new Map<string, { row: Record<string, unknown>; locations: string[] }>();
  for (const r of rows) {
    const id = String(r.id || '');
    if (!id) continue;
    const locs = Array.isArray(r.locations)
      ? (r.locations as Array<Record<string, unknown>>).map((l) => String(l.name || '')).filter(Boolean)
      : [];
    const prev = merged.get(id);
    if (prev) prev.locations = [...new Set([...prev.locations, ...locs])];
    else merged.set(id, { row: r, locations: locs });
  }

  const all = [...merged.entries()];
  const detailMap = new Map<string, string>();
  const targets = all.filter(([, v]) => isIndiaOrTargetCity(v.locations.join(' '))).slice(0, 15);
  await mapWithLimit(targets, 3, async ([id, v]) => {
    const url = String(v.row.url || '');
    if (!url) return;
    const dRes = await fetchWithRetry(url, { timeoutMs: 7000 });
    if (!dRes.ok) {
      await dRes.body?.cancel();
      return;
    }
    const dHtml = await dRes.text();
    const next = dHtml.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (next) {
      try {
        const parsed = JSON.parse(next) as { props?: { pageProps?: { apiData?: { jobPost?: { description?: { company?: string; role?: string } } } } } };
        const descObj = parsed?.props?.pageProps?.apiData?.jobPost?.description;
        if (descObj) {
          detailMap.set(id, stripHtml([descObj.company, descObj.role].filter(Boolean).join('\n')));
        }
      } catch {
        // ignore
      }
    }
  });

  return all.map(([id, v]) => {
    const url = safeResolveUrl(v.row.url, c.careers_url) || c.careers_url;
    return {
      external_job_id: id,
      title: String(v.row.name || ''),
      company: c.name,
      location: v.locations.join(' · ') || 'Not specified',
      description: detailMap.get(id) || '',
      ats_provider: 'thoughtspot',
      job_url: url,
      application_url: url,
      career_page_url: c.careers_url,
      ...normalizePostedInput(null),
    };
  });
}

async function fetchDeel(c: CompanyTarget): Promise<RawAtsJob[]> {
  const res = await fetchWithRetry(c.careers_url || 'https://www.deel.com/careers/', { timeoutMs: 12000 });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Deel HTTP ${res.status}`);
  }
  const html = await res.text();
  const normalized = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const items = extractBalancedJson<Array<Record<string, unknown>>>(normalized, /"jobs"\s*:\s*/);
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const attrs = (item.attributes || item) as Record<string, unknown>;
    const rawLocs = [
      ...(Array.isArray(attrs.all_locations) ? attrs.all_locations : []),
      ...(Array.isArray(attrs.locations_list) ? attrs.locations_list : []),
      attrs.location_name,
    ];
    const locStrings = rawLocs
      .map((l) => (typeof l === 'string' ? l : l && typeof l === 'object' ? String((l as Record<string, unknown>).location || '') : ''))
      .filter(Boolean);
    const id = String(attrs.ashby_id || attrs.job_id || item.id || '');
    const slug = String(attrs.slug || '');
    const url =
      safeResolveUrl(attrs.external_link, c.careers_url) ||
      (slug ? safeResolveUrl(slug, 'https://www.deel.com/') : null) ||
      `https://jobs.deel.com/deel/job-details/${encodeURIComponent(id)}/application`;
    return {
      external_job_id: id,
      title: String(attrs.title || ''),
      company: c.name,
      location: [...new Set(locStrings)].join(' · ') || 'Remote',
      description: stripHtml(String(attrs.full_job_description || [attrs.department_name, attrs.team_name, attrs.employment_type].filter(Boolean).join(' | '))),
      ats_provider: 'deel',
      job_url: url,
      application_url: url,
      career_page_url: c.careers_url,
      ...normalizePostedInput((attrs.ashby_published_date || attrs.ashby_updated_at) as string | null),
    };
  });
}

async function fetchIcims(c: CompanyTarget): Promise<RawAtsJob[]> {
  const host = new URL(c.careers_url).hostname;
  const links = new Map<string, string>();
  for (let pr = 0; pr < 4; pr++) {
    const url = `https://${host}/jobs/search?in_iframe=1&pr=${pr}`;
    const res = await fetchWithRetry(url, { timeoutMs: 10000 });
    if (!res.ok) {
      await res.body?.cancel();
      if (pr === 0) throw new Error(`iCIMS HTTP ${res.status}`);
      break;
    }
    const html = await res.text();
    const matches = html.matchAll(/href=["']([^"']*\/jobs\/(\d+)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi);
    let pageCount = 0;
    for (const m of matches) {
      const full = safeResolveUrl(m[1], url);
      if (full && !links.has(m[2])) {
        const iframeUrl = full.includes('in_iframe=1') ? full : `${full}${full.includes('?') ? '&' : '?'}in_iframe=1`;
        links.set(m[2], iframeUrl);
        pageCount++;
      }
    }
    if (pageCount === 0 || !/\bnext\b/i.test(html)) break;
  }

  const jobs: RawAtsJob[] = [];
  await mapWithLimit([...links.entries()].slice(0, 25), 4, async ([id, url]) => {
    const dRes = await fetchWithRetry(url, { timeoutMs: 7000 });
    if (!dRes.ok) {
      await dRes.body?.cancel();
      return;
    }
    const ld = extractJsonLdJobs(await dRes.text(), c.name, url)[0];
    if (ld) jobs.push({ ...ld, external_job_id: id, ats_provider: 'icims' });
  });
  return jobs;
}

function isPlausibleProbeHit(slug: string, jobs: RawAtsJob[]): boolean {
  if (jobs.length === 0) return false;
  if (slug.length >= 5) return true;
  // Short slugs (<= 4 chars) can collide with unrelated international companies;
  // require at least one India / shortlist city signal to confirm match.
  return jobs.some((j) => {
    const loc = j.location || '';
    return Boolean(canonicalShortlistCity({ location: loc })) || /\bindia\b/i.test(loc);
  });
}

const API_PROBE_SPECS: Array<{
  provider: string;
  boardUrl: (slug: string) => string;
  fetchJobs: (company: CompanyTarget, slug: string) => Promise<RawAtsJob[]>;
}> = [
  { provider: 'greenhouse', boardUrl: (s) => `https://boards.greenhouse.io/${s}`, fetchJobs: (c, s) => fetchSimpleBoard('greenhouse', c, s) },
  { provider: 'lever', boardUrl: (s) => `https://jobs.lever.co/${s}`, fetchJobs: fetchLever },
  { provider: 'ashby', boardUrl: (s) => `https://jobs.ashbyhq.com/${s}`, fetchJobs: (c, s) => fetchSimpleBoard('ashby', c, s) },
  { provider: 'smartrecruiters', boardUrl: (s) => `https://jobs.smartrecruiters.com/${s}`, fetchJobs: fetchSmartRecruiters },
  { provider: 'workable', boardUrl: (s) => `https://apply.workable.com/${s}/`, fetchJobs: fetchWorkable },
  { provider: 'recruitee', boardUrl: (s) => `https://${s}.recruitee.com`, fetchJobs: (c, s) => fetchSimpleBoard('recruitee', c, s) },
  { provider: 'pinpoint', boardUrl: (s) => `https://${s}.pinpointhq.com`, fetchJobs: (c, s) => fetchSimpleBoard('pinpoint', c, s) },
  { provider: 'rippling', boardUrl: (s) => `https://ats.rippling.com/${s}`, fetchJobs: (c, s) => fetchSimpleBoard('rippling', c, s) },
];

async function probePublicAtsApis(
  company: CompanyTarget,
  diagnostics: string[],
): Promise<{ jobs: RawAtsJob[]; discovered: DiscoveredSource } | null> {
  const slugs = candidateSlugsForCompany(company.name, company.careers_url);
  for (const slug of slugs) {
    const probes = API_PROBE_SPECS.map((spec) =>
      spec
        .fetchJobs(company, slug)
        .then((jobs) =>
          jobs.length > 0
            ? {
                jobs,
                discovered: {
                  ats_provider: spec.provider,
                  ats_identifier: slug,
                  careers_url: spec.boardUrl(slug),
                  method: 'api-probe',
                },
              }
            : null,
        )
        .catch(() => null),
    );

    const settled = await Promise.all(probes);
    const hit = settled.find((item) => item !== null && isPlausibleProbeHit(slug, item.jobs));
    if (hit) {
      diagnostics.push(
        `Auto-discovered ${hit.discovered.ats_provider} (${hit.discovered.ats_identifier}) via public ATS API probe (${hit.jobs.length} jobs)`,
      );
      return hit;
    }
  }
  return null;
}

type ProviderFetcher = (company: CompanyTarget, identifier: string) => Promise<RawAtsJob[]>;

const PROVIDER_FETCHERS: Record<string, ProviderFetcher> = {
  lever: fetchLever,
  smartrecruiters: fetchSmartRecruiters,
  workable: fetchWorkable,
  workday: fetchWorkday,
  workday_complete: fetchWorkday,
  workday_all: fetchWorkday,
  oracle: fetchOracle,
  eightfold: fetchEightfold,
  eightfold_complete: fetchEightfold,
  eightfold_legacy: fetchEightfoldLegacy,
  infineon: (c, id) => fetchEightfold(c, `jobs.infineon.com|${id || 'infineon.com'}`),
  phenom: fetchPhenom,
  jibe: fetchJibe,
  talentbrew: (c) => fetchTalentBrew(c, 'talentbrew'),
  netapp: (c) => fetchTalentBrew(c, 'netapp'),
  avature: (c) => fetchAvature(c),
  mynexthire: fetchMyNextHire,
  atlassian: (c) => fetchAtlassian(c),
  ibm: fetchIbm,
  google_careers: fetchGoogleCareers,
  paylocity: (c) => fetchPaylocity(c),
  successfactors: (c) => fetchSuccessFactors(c),
  adidas: (c) => fetchSuccessFactors(c),
  keka: fetchKeka,
  juspay: (c) => fetchJuspay(c),
  thoughtspot: (c) => fetchThoughtSpot(c),
  deel: (c) => fetchDeel(c),
  icims: (c) => fetchIcims(c),
  jobvite: fetchJobvite,
  kula: fetchKula,
  pyjamahr: fetchPyjamaHr,
  amazon: (c) => fetchAmazon(c),
  xml: fetchXmlFeed,
};

const DIRECT_PROVIDERS = new Set([...Object.keys(SIMPLE_BOARD_SPECS), ...Object.keys(PROVIDER_FETCHERS)]);

async function fetchByProvider(company: CompanyTarget, provider: string, identifier: string): Promise<RawAtsJob[]> {
  if (SIMPLE_BOARD_SPECS[provider]) {
    return fetchSimpleBoard(provider, company, identifier);
  }
  const fetcher = PROVIDER_FETCHERS[provider];
  if (!fetcher) throw new Error(`Unsupported direct ATS provider: ${provider}`);
  return fetcher(company, identifier);
}

async function collectFromCareerSite(
  company: CompanyTarget,
  diagnostics: string[],
): Promise<{ jobs: RawAtsJob[]; discoveredSource?: DiscoveredSource }> {
  let html = '';
  let finalUrl = company.careers_url;

  try {
    const res = await fetchWithRetry(company.careers_url, { timeoutMs: 9000 }, 2);
    finalUrl = res.url || company.careers_url;
    diagnostics.push(`Career page HTTP ${res.status} (${finalUrl})`);
    if (res.ok) {
      html = await res.text();
    } else {
      await res.body?.cancel();
    }
  } catch (err) {
    diagnostics.push(`Career page fetch failed: ${err instanceof Error ? err.message : 'network error'}`);
  }

  if (html) {
    // 1. Direct ATS link/embed/JS-string discovery
    const fromHtml = discoverAtsFromText(html, 'html-embed');
    if (fromHtml && DIRECT_PROVIDERS.has(fromHtml.ats_provider)) {
      const targetBoardUrl = fromHtml.careers_url || finalUrl;
      const discovered = { ...fromHtml, careers_url: targetBoardUrl };
      diagnostics.push(`Detected ${discovered.ats_provider} (${discovered.ats_identifier}) inside career page`);
      try {
        const jobs = await fetchByProvider(
          { ...company, careers_url: targetBoardUrl },
          discovered.ats_provider,
          discovered.ats_identifier,
        );
        if (jobs.length > 0) return { jobs, discoveredSource: discovered };
        diagnostics.push(`Detected ${discovered.ats_provider} board returned 0 jobs; continuing discovery`);
      } catch (err) {
        diagnostics.push(`Delegated ${discovered.ats_provider} fetch failed: ${err instanceof Error ? err.message : 'error'}`);
      }
    }

    // 2. JSON-LD JobPosting + __NEXT_DATA__ embedded JSON
    const jsonLdJobs = extractJsonLdJobs(html, company.name, finalUrl);
    if (jsonLdJobs.length > 0) {
      diagnostics.push(`Extracted ${jsonLdJobs.length} jobs from JSON-LD JobPosting schema`);
      return { jobs: jsonLdJobs };
    }

    const nextJobs = extractEmbeddedStateJobs(html, company.name, finalUrl);
    if (nextJobs.length > 0) {
      diagnostics.push(`Extracted ${nextJobs.length} jobs from Next.js hydration state`);
      return { jobs: nextJobs };
    }

    // 2b. Check alternate RSS/XML job feeds linked in HTML head
    const rssHref = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i)?.[1];
    const rssUrl = rssHref ? safeResolveUrl(rssHref, finalUrl) : null;
    if (rssUrl) {
      try {
        const xmlJobs = await fetchXmlFeed(company, rssUrl);
        if (xmlJobs.length > 0) {
          diagnostics.push(`Extracted ${xmlJobs.length} jobs from linked RSS/XML feed (${rssUrl})`);
          return {
            jobs: xmlJobs,
            discoveredSource: {
              ats_provider: 'xml',
              ats_identifier: rssUrl,
              careers_url: finalUrl,
              method: 'rss-link',
            },
          };
        }
      } catch {
        // continue
      }
    }

    // 3. Inspect up to 2 primary JS bundles for SPA-embedded ATS boards
    const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)]
      .map((m) => safeResolveUrl(m[1], finalUrl))
      .filter((u): u is string => Boolean(u))
      .filter((u) => !/googletagmanager|google-analytics|hotjar|intercom|sentry|segment|cookie/i.test(u))
      .slice(0, 2);

    for (const scriptUrl of scriptUrls) {
      try {
        const jsRes = await fetchWithRetry(scriptUrl, { timeoutMs: 6000 }, 1);
        if (!jsRes.ok) {
          await jsRes.body?.cancel();
          continue;
        }
        const jsText = await jsRes.text();
        const fromBundle = discoverAtsFromText(jsText, 'spa-bundle');
        if (fromBundle && DIRECT_PROVIDERS.has(fromBundle.ats_provider)) {
          diagnostics.push(`Discovered ${fromBundle.ats_provider} (${fromBundle.ats_identifier}) inside SPA JS bundle`);
          const jobs = await fetchByProvider(
            { ...company, careers_url: fromBundle.careers_url },
            fromBundle.ats_provider,
            fromBundle.ats_identifier,
          );
          if (jobs.length > 0) {
            return { jobs, discoveredSource: fromBundle };
          }
        }
      } catch {
        // continue checking
      }
    }
  }

  // 4. Smart ATS API slug probe fallback (recovers 403/SPA/JS-heavy career sites)
  const probed = await probePublicAtsApis(company, diagnostics);
  if (probed) {
    return { jobs: probed.jobs, discoveredSource: probed.discovered };
  }

  return { jobs: [] };
}

export async function scrapeCompanyLive(
  company: CompanyTarget,
  nowMs = Date.now(),
): Promise<CompanyScrapeOutcome> {
  const started = Date.now();
  const diagnostics: string[] = [];
  const provider = (company.ats_provider || 'custom').toLowerCase();
  const identifier = (company.ats_identifier || '').trim();

  let rawJobs: RawAtsJob[] = [];
  let discoveredSource: DiscoveredSource | undefined;
  let error: string | null = null;

  const URL_DRIVEN_PROVIDERS = new Set([
    'phenom',
    'jibe',
    'talentbrew',
    'netapp',
    'avature',
    'atlassian',
    'avalara',
    'ibm',
    'google_careers',
    'paylocity',
    'successfactors',
    'adidas',
    'keka',
    'juspay',
    'thoughtspot',
    'deel',
    'icims',
    'amazon',
  ]);

  try {
    if (DIRECT_PROVIDERS.has(provider) && (identifier || URL_DRIVEN_PROVIDERS.has(provider))) {
      diagnostics.push(`Fetching directly via ${provider}${identifier ? ` (${identifier})` : ''}`);
      rawJobs = await fetchByProvider(company, provider, identifier);
    } else {
      const collected = await collectFromCareerSite(company, diagnostics);
      rawJobs = collected.jobs;
      discoveredSource = collected.discoveredSource;
    }
  } catch (err) {
    diagnostics.push(`Primary ${provider} collector failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    // Attempt recovery via modern career discovery if primary failed
    try {
      const recovered = await collectFromCareerSite(company, diagnostics);
      if (recovered.jobs.length > 0 || recovered.discoveredSource) {
        rawJobs = recovered.jobs;
        discoveredSource = recovered.discoveredSource;
      } else {
        error = err instanceof Error ? err.message : 'Source fetch failed';
      }
    } catch {
      error = err instanceof Error ? err.message : 'Source fetch failed';
    }
  }

  const effectiveProvider = discoveredSource?.ats_provider || provider;
  const effectiveIdentifier = discoveredSource?.ats_identifier || identifier;
  const effectiveCareersUrl = discoveredSource?.careers_url || company.careers_url;

  const uniqueMap = new Map<string, NormalizedIngestJob>();
  for (const raw of rawJobs) {
    if (!raw.title || !raw.external_job_id) continue;
    const norm = normalizeRawJob(
      {
        ...raw,
        ats_provider: effectiveProvider,
        career_page_url: effectiveCareersUrl,
      },
      company.priority ?? 3,
      nowMs,
    );
    uniqueMap.set(norm.external_job_id, norm);
  }

  const normalizedJobs = [...uniqueMap.values()];
  const targetJobs = normalizedJobs.filter(
    (j) => (j.city === 'Bengaluru' || j.city === 'Hyderabad') && j.role_category !== 'Other',
  );
  const eligibleJobs = targetJobs.filter((j) => j.is_eligible);

  let warning: string | null = null;
  if (error) {
    warning = `Source error: ${error.slice(0, 140)}`;
  } else if (normalizedJobs.length === 0) {
    warning =
      effectiveProvider === 'custom'
        ? 'Limited coverage: career page blocks bots or renders without a public ATS feed'
        : 'No current openings returned';
  } else if (targetJobs.length === 0) {
    warning = `Found ${normalizedJobs.length} global openings, 0 in Bengaluru/Hyderabad target roles`;
  }

  return {
    company: company.name,
    ats_provider: effectiveProvider,
    ats_identifier: effectiveIdentifier,
    careers_url: effectiveCareersUrl,
    total_discovered: normalizedJobs.length,
    target_city_jobs: targetJobs.length,
    eligible_jobs: eligibleJobs.length,
    jobs: normalizedJobs,
    discovered_source: discoveredSource,
    warning,
    error,
    diagnostics,
    duration_ms: Date.now() - started,
  };
}

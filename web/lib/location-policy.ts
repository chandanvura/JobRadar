import policy from '../../config/location-policy.json' with {type:'json'};

export const discoveryLocations=policy.discovery_locations;
export const shortlistCities=policy.shortlist_cities;
type Located={city?:unknown;normalized_location?:unknown;location?:unknown};

export function canonicalShortlistCity(job: Located): 'Bengaluru' | 'Hyderabad' | null {
  const published = String(job.location || job.normalized_location || '');
  if (!/\bindia\b/i.test(published) && /\b(?:pakistan|bangladesh|united states|usa|united kingdom|canada|australia|singapore)\b/i.test(published)) return null;
  const rawCity = typeof job.city === 'string' ? job.city.trim() : '';
  if (['Other India', 'Remote (India)'].includes(rawCity)) return null;
  if (/\b(?:bengaluru|bangalore)\b/i.test(rawCity)) return 'Bengaluru';
  if (/\bhyderabad\b/i.test(rawCity)) return 'Hyderabad';
  if (!rawCity) {
    const loc = String(job.normalized_location || job.location || '');
    if (/\b(?:bengaluru|bangalore)\b/i.test(loc)) return 'Bengaluru';
    if (/\bhyderabad\b/i.test(loc)) return 'Hyderabad';
  }
  return null;
}

export function shortlistLocation(job: Located): boolean {
  return canonicalShortlistCity(job) !== null;
}

export function locationMatches(job: Located, location: string): boolean {
  if (job.city === location) return true;
  const norm = String(job.normalized_location || '');
  if (norm.includes(location)) return true;
  if (location === 'Bengaluru' && /\b(?:bengaluru|bangalore)\b/i.test(norm)) return true;
  if (location === 'Hyderabad' && /\bhyderabad\b/i.test(norm)) return true;
  return false;
}

export function enforceShortlistLocation<T extends Located & {is_eligible?:unknown;eligibility_reason?:unknown}>(job:T):T {
  const canonical = canonicalShortlistCity(job);
  if (canonical) {
    return {...job, city: canonical};
  }
  return job.is_eligible ? {...job, is_eligible:0, eligibility_reason:'Outside shortlist cities — Bengaluru and Hyderabad only'} : job;
}

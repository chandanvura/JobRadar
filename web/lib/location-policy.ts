import policy from '../../config/location-policy.json' with {type:'json'};

export const discoveryLocations=policy.discovery_locations;
export const shortlistCities=policy.shortlist_cities;
type Located={city?:unknown;normalized_location?:unknown;location?:unknown};
export function shortlistLocation(job:Located):boolean {
 const published=String(job.location||job.normalized_location||'');
 if(!/\bindia\b/i.test(published)&&/\b(?:pakistan|bangladesh|united states|usa|united kingdom|canada|australia|singapore)\b/i.test(published))return false;
 if(typeof job.city==='string')return shortlistCities.includes(job.city);
 const location=String(job.normalized_location||job.location||'');
 return /\b(?:bengaluru|bangalore|hyderabad)\b/i.test(location);
}
export function locationMatches(job:Located,location:string):boolean {
 return job.city===location||String(job.normalized_location||'').includes(location);
}
export function enforceShortlistLocation<T extends Located & {is_eligible?:unknown;eligibility_reason?:unknown}>(job:T):T {
 return job.is_eligible&&!shortlistLocation(job)?{...job,is_eligible:0,eligibility_reason:'Outside shortlist cities — Bengaluru and Hyderabad only'}:job;
}

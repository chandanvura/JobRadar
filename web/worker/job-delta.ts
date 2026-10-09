// Bind order for the INSERT; active/application state are SQL literals.
export const JOB_INSERT_COLUMNS = 'external_job_id,company,title,normalized_title,role_category,location,normalized_location,city,employment_type,experience_min,experience_max,experience_label,description,skills,ats_provider,source,job_url,application_url,career_page_url,posted_at,posted_label,posted_precision,reported_age_hours,first_seen_at,last_seen_at,is_eligible,eligibility_reason,relevance_score,freshness_score,priority_score,hiring_signal'.split(',');

export function jobDelta(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
  const delta: Record<string, unknown> = {};
  for (const column of JOB_INSERT_COLUMNS) {
    // Identity, original discovery and source remain immutable, as in the upsert.
    if (['external_job_id','company','ats_provider','source','first_seen_at','last_seen_at'].includes(column)) continue;
    const value = column === 'posted_at' ? existing[column] ?? incoming[column] : incoming[column];
    if (existing[column] !== value) delta[column] = value;
  }
  if (existing.is_active !== 1) delta.is_active = 1;
  // Seeing an unchanged listing is represented by the scan manifest, not a row write.
  if (Object.keys(delta).length && existing.last_seen_at !== incoming.last_seen_at) delta.last_seen_at = incoming.last_seen_at;
  return delta;
}

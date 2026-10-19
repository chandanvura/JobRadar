# Code and cache cleanup

## Decision and evidence

- Remove the 30-hour disk cache for employer job details. A JD can change at the
  same URL, and cached relative posting labels can otherwise look fresh on later
  scans. Read each detail through the existing bounded HTTP request path.
- Remove the retired Actions detail-cache restore steps. The storage cleanup
  workflow removes all retired detail caches, but keeps recently used dependency
  caches and active scan inputs.
- Remove seven unreferenced research entry points and 22 archived workflow
  definitions. They are outside production execution and remain recoverable from
  git history at `a5a38cbd0301d1ae1ea698994c62bb55dc0bbf14`.
- Remove identity-only view, feedback, and posting wrappers. Keep the underlying
  shortlist gates, ranking logic, and exact/relative posting distinction.
- Enable TypeScript unused-local and unused-parameter checks for the UI.

## Data boundaries

No production demo seed was found in the application, registry, migrations, or
deployment scripts. Synthetic examples remain isolated in tests. Historical
source evidence is dated evidence, not a current feed. Unverified discovery
candidates stay disabled. Do not delete job or application records merely because
they are old or a source has failed.

Application stages, notes, resumes, preferences, recovery copies, D1 backups,
and the labeled public outage snapshot are retained. WeakMap analysis caches and
search workers are retained because they avoid repeated JD analysis while
browsing. Static assets retain their normal content-based browser caching.

## Verification

The regression suite checks that a JD change at the same URL is returned on the
next detail request and that a removed job returns 404 instead of an old cached
success. Existing provider limits and bounded retries remain in force. Tests use
local data and do not write sample records to production.

# Dashboard motion update

Previous production version: `0ea919e31fb4aa0229e8eb434b9823d5ab802227`.

The visual update is isolated in one PR/merge commit. To restore the previous page,
revert that merge commit with `git revert <UI-merge-sha>` and push the revert to main.
The existing web deployment workflow publishes it. This preserves subsequent
scraper repairs and database records; do not reset the whole repository.

Changes: subtle spring-style card feedback, drawer and title entrances, layered
surfaces, deferred search filtering, and accessible mobile navigation cleanup.
Motion respects the operating system's reduced-motion preference. No new runtime
dependency, paid service, or continuous animation loop is introduced.

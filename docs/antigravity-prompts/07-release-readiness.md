# Release Readiness Review — NO DEPLOYMENT

Use the `release-readiness` skill.

**Release/change:** [name/version]
**Target environment:** [dev/staging/production]
**Release notes/requirements:** [link/path]

Perform a release review only. Do not deploy, publish, migrate production data or alter infrastructure. Check the final diff, tests, build, config, secrets handling, API/data compatibility, migration order, security, observability, failure recovery, rollback/forward-fix and post-deploy verification plan. Mark every gate PASS / FAIL / BLOCKED / NOT RUN and cite evidence. Give a go/no-go recommendation with residual risks. Do not call a release production-ready merely because the build passed.

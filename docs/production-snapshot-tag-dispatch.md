# Production snapshot dispatch and Pages environment protection

Production `github-pages` remains restricted to `v*` tags. GitHub evaluates the workflow run ref before the deployment job executes; checking out a release commit inside a `main` run does not satisfy that restriction.

The publication Edge Function obtains the release manifest only from its fixed environment-specific site, validates the Production project identity, commit and semantic release tag, then dispatches the refresh workflow using that verified tag. Test still dispatches from `main`. Browser input cannot select a branch, tag, repository or workflow.

The dispatch includes the reserved request ID and expected source commit/tag. The existing workflow gates verify the tag/commit provenance, serialize deployments and reject release changes before publishing the complete artifact. Snapshot JSON is never committed and data-only refresh does not create a tag.

Acceptance requires two independent checks:
- Tag-triggered application deployment, followed by a tag-dispatched data refresh under unchanged environment protections.
- An active Production administrator's button → Edge dispatch → Actions → exact live snapshot request ID → publication record and UI confirmation. Manual Actions success alone does not validate credentials or the authenticated button.

If the function or workflow fails, preserve the live website and stored scores, query existing publication state, and do not blindly resend. A missing Production admin session is a verification limitation, not permission to reuse Test credentials or impersonate an account. Keep a formal GitHub Release on hold while a required authenticated publication path remains unverified.

# GitHub Pages environments

The application has one canonical source repository and two isolated GitHub Pages deployments.

## Production

- Source/deployment repository: `bollinmore-hermes/wuri-table-tennis-league`
- URL: `https://bollinmore-hermes.github.io/wuri-table-tennis-league/`
- Build: `npm run build:production-pages`
- Supabase project ref: `zofiiibgnjuodgrzhkpn`
- Required repository secrets:
  - `SUPABASE_PRODUCTION_URL`
  - `SUPABASE_PRODUCTION_PUBLISHABLE_KEY`

A push to `main` deploys Production only after tests and artifact identity checks pass.

## Test

- Deployment-only repository: `bollinmore-hermes/wuri-table-tennis-league-test`
- URL: `https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/`
- Build: `npm run build:test-pages`
- Supabase project ref: `vppjcjfbcoxzofcuxmzz`

The Test repository does not contain an application copy. Its workflow checks out a selected branch, tag, or commit from this repository, runs tests, and builds the Test artifact with Test-only secrets.

## Promotion procedure

1. Deploy the candidate source ref to Test.
2. Verify public and admin routes, authentication, CRUD/RPC behavior, audit records, and project identity.
3. Merge the verified source ref to `main`.
4. Confirm Production migration/data readiness before allowing the Production Pages workflow to complete.
5. Verify the live Production config reports `environment=production` and project ref `zofiiibgnjuodgrzhkpn`.

Promote code and migrations, not Test data.

## Rollback

- Test: rerun the Test Pages workflow with a previously verified commit SHA.
- Production: revert the source commit or dispatch the Production Pages workflow from a previously verified commit after confirming schema compatibility.
- Never point a Production artifact at the Test project, or a Test artifact at the Production project. Both build scripts fail closed when the configured URL does not match the expected project ref.

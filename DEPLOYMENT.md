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

A pushed version tag matching `v*` deploys Production only after tests and artifact identity checks pass. Merging to `main` alone must not publish the formal site.

## Test

- Deployment-only repository: `bollinmore-hermes/wuri-table-tennis-league-test`
- URL: `https://bollinmore-hermes.github.io/wuri-table-tennis-league-test/`
- Build: `npm run build:test-pages`
- Supabase project ref: `vppjcjfbcoxzofcuxmzz`

The Test repository does not contain an application copy. Its workflow checks out a selected branch, tag, or commit from this repository, runs tests, and builds the Test artifact with Test-only secrets.

## Invitation Edge Function

Each Supabase environment deploys `invite-league-user` separately. Keep `SUPABASE_SERVICE_ROLE_KEY` in the managed Edge Function environment only and set these environment-specific function secrets:

- `INVITE_REDIRECT_URL`: the exact environment admin URL ending in `/admin/`.
- `INVITE_ALLOWED_ORIGINS`: the comma-separated browser origins allowed to invoke the function.

Apply `006_user_invitations.sql` before deploying the function. Verify CORS preflight, unauthenticated denial, non-admin denial, invalid-payload denial, one successful invitation, profile creation, and the `invite_user` audit entry in Test before Production promotion.

## User Management Edge Function

Deploy `manage-league-user` separately to each environment after applying `007_user_management.sql`. Set:

- `PASSWORD_RESET_REDIRECT_URL`: the exact environment admin URL ending in `/admin/`.
- `USER_MANAGEMENT_ALLOWED_ORIGINS`: the comma-separated browser origins allowed to invoke the function.

The function verifies an active `admin`, prevents self-demotion/self-disable, synchronizes profile state with Auth ban/unban state, sends password recovery email without exposing or assigning passwords, rate-limits operations, and records `update_user` / `reset_user_password` audits. In Test, verify nickname update, role update, disable, blocked self-lockout, restore, recovery-email receipt and final profile state before Production promotion.

## Promotion procedure

1. Deploy the candidate source ref to Test.
2. Verify public and admin routes, authentication, CRUD/RPC behavior, audit records, and project identity.
3. Merge the verified source ref to `main`.
4. Confirm Production migration/data readiness before allowing the Production Pages workflow to complete.
5. Verify the live Production config reports `environment=production` and project ref `zofiiibgnjuodgrzhkpn`.

Promote code and migrations, not Test data.

## Rollback

- Test: rerun the Test Pages workflow with a previously verified commit SHA.
- Production: after confirming schema compatibility, create a new rollback version tag on a previously verified commit. Production must still be deployed from a Git tag rather than directly from a branch or commit.
- Never point a Production artifact at the Test project, or a Test artifact at the Production project. Both build scripts fail closed when the configured URL does not match the expected project ref.

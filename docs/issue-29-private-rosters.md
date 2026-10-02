# Issue #29 — private administrator rosters and masked public rosters

## Delivery status

Implemented and verified on branch `feat/issue-29-private-rosters`, based on `fdbde73b20c0d4fdd66757043c50bc161920c22b`. The initial local-only scope was followed by separately approved Test promotion. Test migration 009 and the private roster import are now remotely verified. Source publication and fixed Test-site deployment are in progress; the PR follow-up records the exact delivered SHA, run and URLs. No main merge, Production deployment or issue closure is authorized.

The requested working directory is `hermes-main/wuri-issue-29`. On this host, that alias resolves to `hermes-personal/wuri-issue-29`. The worktree is isolated from existing dirty work and administration drafts.

## Accepted behavior

- Administrator management views show complete names, distinct `leader` and `player` roles, supplied order, status and public-visibility controls.
- Public team detail shows first character + full-width masking characters + last character. The supplied names all have three characters.
- The server, not a client-side transformation, performs the public projection. Public rows contain only `team_code`, `display_name`, `roster_role`, and `display_order`; no UUID or complete name is returned.
- Scorers receive empty players/audits/users arrays and cannot open management roster controls. Inactive/unprofiled callers cannot read the management dataset. Anonymous callers cannot invoke management RPCs.
- Complete names remain in ignored `.private/` files only. The directory is mode 0700 and input/payload files mode 0600. These files must not be uploaded, attached, committed or copied into artifacts.
- Short names are not published until a separate privacy policy is approved. Missing names/rosters render explicit translated empty states; no playing styles are invented.
- Stable team codes map supplied expanded team labels to existing display labels; existing public team names were not renamed. Leaders are not also inserted as players.

## Data

The supplied source was parsed and verified programmatically: 12 teams, 12 leaders, 61 players, 73 roster members. The private source and prepared RPC payload live in `.private/rosters.json` and `.private/import-payload.json`. Static official data contains masked projections only; backend-enabled builds depend on the server projection rather than a fallback to that static roster.

## Changes

- `supabase/migrations/009_private_rosters.sql`: season-scoped role/order/visibility fields, private-by-default legacy records, fail-closed admin access, server-side masking, unique roster slots/active leaders, updated save RPC, transactional non-destructive import with unchanged-row idempotence, curated public projection.
- `assets/js/admin-repository.js`, `assets/js/admin.js`, `assets/css/admin-v2.css`: role-aware dataset handling and responsive roster management controls with visible labels.
- `assets/js/league-repository.js`, `assets/js/app.js`, `assets/js/official-data.js`, `index.html`: immutable validated masked data and localized public detail sections.
- `.gitignore`: excludes all private roster material.
- `tests/roster-privacy.test.cjs`, `tests/security-regression.test.cjs`: privacy, role, payload, count, DOM and empty-state regressions.
- `scripts/prepare-private-rosters.cjs`: validates the complete private source and writes a restricted private RPC payload, without network writes or name logging.
- `scripts/verify-roster-sql.cjs`, `scripts/verify-roster-browser.cjs`: rerunnable SQL and browser verification.
- `scripts/import-test-rosters.cjs`: pinned-Test, active-admin private import, explicit `--apply` gate, response readback, public full-name exclusion and idempotence checks; never logs names/tokens.
- `scripts/verify-test-roster-roles.sql`: read-only remote SQL assertions using existing scorer context, without altering users or creating identities.
- `docs/evidence/issue-29/`: secret-free JSON evidence and public-mask/synthetic-management screenshots.

## Verification evidence

- `npm test`: 105 passed, zero failed. The nested spreadsheet runner separately passed seven checks; these are not added to the outer count. The optional private official-workbook integration was not exercised because `OFFICIAL_XLSX` was unset.
- `npm audit --omit=dev`: zero vulnerabilities. Application package and lockfile were not changed.
- `npm run build:pages`: success, 32 files, management assets excluded.
- `npm run build:test`: success in disabled mode; no remote configuration was supplied, so this is structural verification, not a deployable remote acceptance environment.
- `npm run build:admin-demo`: success, local-only synthetic management artifact.
- All JavaScript/CJS syntax checks and `git diff --check` passed.
- Full-name scan of source changes and all three built artifact roots found zero supplied full-name leaks. Private files are confirmed ignored by Git.
- Embedded PostgreSQL (PGlite): migrations 001–009 applied and 24 reported checks passed with all 73 supplied members. Verified administrator read/import, idempotence, scorer/anonymous/inactive/unprofiled denial, direct table denial even for browser administrator role, masking parity, hidden/deleted filtering, unknown-season emptiness, short-name privacy rejection and transaction rollback.
- Authorization mutation: granting scorers full roster data makes the verifier fail with the expected assertion, proving the check detects this regression.
- Actual Chrome built-artifact verification: 192 public cases (12 teams × 4 widths × 2 locales × 2 themes), management layout at four widths, scorer private-name/control denial, zero page errors and no document/roster/editor horizontal overflow. Widths: 360, 390, 768, 1280. Programmatic scroll/animation timing was excluded from the layout verification.
- Preferred Browser Use CLI was unavailable. The verifier used the already-running loopback Chrome CDP endpoint, created its own target, and closed only that target. Existing tabs/browser process were preserved.

## Boundaries and next gate

Docker was not running. SQL ran on real embedded PostgreSQL with emulated `auth.uid`, `auth.role`, Auth tables and storage contracts; the pgcrypto extension declaration was omitted in that harness because UUID generation is provided natively. This does not verify hosted Supabase Auth, HTTP/PostgREST function resolution, Storage service or remote RLS integration. PGlite was installed solely into the approved scratch tools directory, not the application's dependencies; installer threat-intelligence checks reported lookup timeouts, not a clean package attestation.

The user approved Test migration/import, source commit/push/PR and replacement of the fixed Test site. Migration 009 was applied and read back from migration history. An active administrator authenticated through the real Test Auth API; import created 73 members and a repeat changed zero. Anonymous public RPC returned the expected 73 masked names and no complete roster name, administrator RPC returned the exact complete source, and direct-table reads were denied to both browser roles. Existing scorer context passed read-only SQL assertions for empty private/audit arrays, table denial, public masking and import denial; scorer Auth/browser login remains distinct from this database-context test. Test retains one pre-existing soft-deleted player row (74 total rows, 73 active members), with league counts unchanged at 12 teams / 60 matches / 26 results / 12 snapshots. Read back the exact deployed artifact and record live UI acceptance separately. Keep Production untouched until separate acceptance and release authorization; Production deploys from an approved verified Git tag only. Keep #29 open through user acceptance.

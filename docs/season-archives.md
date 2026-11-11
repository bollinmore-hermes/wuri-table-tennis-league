# Season archives (#37)

## Scope and boundaries

Public entry: `archives.html`; detail permalink: `archives.html?season=<code>`.
Management entry: `admin/season-archive-admin.html` in hosted builds; requires the existing active-admin session from the management site. Scorers, inactive/unprofiled users and anonymous clients cannot reserve archives. The public pages never initialize Analytics or Auth.

Only real published archives are listed. No past seasons, winners, rules or prizes are invented. Current and historical seasons remain separate. There is no new automatic season rollover, playoff-bracket system, unlock or history-overwrite feature.

## Readiness

The server checks all registered matches, including unpublished records, pending referee reviews, result consistency, season/team/group references, cancelled-match explanations, final-rank completeness and the public payload size. Published final results are required. No final placement is inferred from regular-season statistics. Unprovided final placements require an explicit explanation. Optional prize/media data is not required and is not manufactured.

The organizer must explicitly attest that **all phases including playoffs are over**, results/final placements are confirmed and the rules/public scope are reviewed. Existing schema does not model a complete playoff bracket or external disputes; automated checks cannot discover unregistered matches or off-system disputes. The UI says so. Merely reaching the season end date or checking boxes does not bypass the server's blockers.

Rules are copied as season-specific text and source information. Unknown clauses must be marked unprovided rather than copied from a later season. The archive projection omits player rosters, account information, internal result notes, audit rows and capability tokens.

## Lifecycle

1. `preview_season_archive` produces blockers, warnings, the public content and a revision hash over relevant season data plus the exact declarations/options. The revision includes unpublished matches, referee dispositions, team metadata, memberships and roster changes; private source rows never leave this hash function.
2. The Edge handler verifies the candidate's public schema, then `reserve_season_archive` rechecks readiness and revision under a transaction-scoped advisory lock. The same lock is acquired by BEFORE STATEMENT triggers on participating base-table writes. A revision mismatch is **PT409**, a deterministic HTTP business conflict, not a retryable serialization error.
3. Reservation persists one immutable candidate per season and freezes season-owned rows. A request ID is required; the database has idempotent request identity checks. The browser does not automatically repeat an unknown write: query status and explicitly resume the existing candidate.
4. The Edge Function uploads `wuri-season-archives/<season>/<archive-id>-<content-hash>.json` with `upsert:false`. It fetches the anonymous public URL back, checks the strict field whitelist, environment/project identity, exact envelope and canonical SHA-256, then invokes service-only `confirm_season_archive`.
5. Only verified `published` records enter the anonymous catalog. Pending/unknown delivery remains frozen and is clearly not claimed as published. Status never uploads; explicit resume may upload only after a definite missing-object response. Both HTTP 404 and Supabase Storage's HTTP 400 / `statusCode:404` representation are handled. Unknown transport failures do not trigger blind uploads.

The DB's `created_at` is the immutable archive-version timestamp; `published_at` records later verification completion. Displaying an archive date does not imply it was instantly public when reservation started.

## Immutability and current-site compatibility

Guards cover seasons, groups, season memberships, matches, results, standings snapshots, players and report/review/link write tables. OLD and NEW season identities are both checked to prevent moving a row out of a frozen season. Shared team records can be reused in later seasons: the archive already contains frozen names. An audit-only Auth-FK attribution clear can occur without changing public content.

An additional immutable `current_projection` preserves the existing public reader's complete pre-archive projection (including previously allowed masked roster entries). `get_public_league` returns that frozen projection when a season is reserved, so later shared-team changes do not silently change the current site's data. It does not deactivate the season or erase scores. Historical archive files independently exclude rosters. Current snapshot publication can continue safely against the frozen public data.

Base archive-table access and all internal helpers are revoked from browsers. The Edge Function alone has the service credential. Browser admins cannot finalize publication. Published records and their frozen content cannot be updated/deleted through ordinary paths. Historical actor UUID is retained separately from Auth lifecycle so archive identity does not create a new account-deletion FK blocker.

## Regression and runtime verification

- `npm test`: domain/whitelist/hash, render/XSS/empty/error states, build integration, authorizations, storage failure and conflict contracts.
- `tests/season-archive-transaction.sql`: run against Test in an explicit transaction and **ROLLBACK**. Tests missing/unpublished results, unreviewed reports, cancellation reasons, stale revisions, write denial, immutable history, retained current projection, idempotence and grants. No human data is deleted.
- `scripts/create-archive-test-fixtures.cjs --test-only <absolute-manifest>` creates new clearly labelled synthetic seasons only on the fixed Test project, never Auth accounts. Requires approved `TMPDIR` and refuses an existing manifest.
- `scripts/verify-season-archives-test.cjs <manifest> <evidence>` uses Test admin credentials from environment, records safe statuses only, seals only the API fixture and leaves the human-acceptance fixture live.
- `scripts/verify-archive-concurrency.cjs <manifest> <evidence>` installs a bounded Test-only admin probe, proves a competing write waits for an in-flight reservation, intentionally rolls that reservation back, restores synthetic content and removes the probe in `finally`. Its function-specific timeout does not change global/role settings.

## Operational pitfall: business conflicts

Supabase documents that manually raising SQLSTATE 40001 in RPC functions can cause infinite PostgREST retries on affected versions. Migration 016 replaces the new archive reservation's business conflicts with PT409. Existing unrelated legacy RPCs are not rewritten in this issue. During Test validation, two archive verification requests hit this behavior; only those identified Test backends were cancelled, the conflict function corrected and absence of lingering archive requests verified. No Production restart/configuration was performed.

Reference: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

## Release gate

Test migrations 015/016, Edge deployment and synthetic data validation are separate from the frontend's commit-pinned Test deployment. Keep #37 open and the PR Draft pending user acceptance. Production migrations, Function deployment and tag-only frontend release require separate explicit authorization. Do not seal the real season merely to prove the feature works.

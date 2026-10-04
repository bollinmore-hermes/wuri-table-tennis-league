# Hash-only scheduled public snapshot publication

Every five minutes, Supabase Cron compares the canonical SHA-256 of the curated public dataset with the hash last confirmed online. No revision counter and no league-data triggers are added. Unchanged content returns inside PostgreSQL before net.http_post; database CPU/Cron bookkeeping still apply.

## Hash boundary

`public-json-sha256-v1` orders object keys and public row arrays by UTF-8 bytes, preserves string content, and accepts only safe integer numbers. Arrays are unordered for hashing; the published dataset retains its display order. The public RPC's nullable/default team fields are normalized to match the validated public projection. Private fields, audit, credentials and generation timestamps are excluded.

The STABLE `get_public_league_snapshot` returns data and its hash in one database read. The Actions builder validates the public projection, recomputes the content hash and aborts on mismatch. Both contentHash and the existing timestamp-sensitive snapshotId are retained for separate purposes.

## Activation and security

Migration 011 installs pg_cron/pg_net and the */5 schedule, but no automation configuration is enabled by migration. Enable only after exact-source site/function validation and environment-specific secret provisioning. A new 64-character server-only SNAPSHOT_CRON_SECRET is stored in Edge secrets and Vault entry wuri_snapshot_cron_secret. GitHub credentials remain in Edge secrets, not Vault or browser artifacts.

The cron-only Edge endpoint rejects browser Origins, missing/wrong secrets, arbitrary request fields and wrong environment identity. Automatic reservations use actor_id=null and mode=automatic, never impersonate a human administrator. Manual and automatic requests share a lock; queued/running/dispatch_unknown requests block new dispatch without a blind expiry. Production still uses the validated deployed tag, while Test uses main.

First activation can bootstrap only from the actually verified live snapshot. Completion requires matching request ID, source/project/season/tag, actual content hash and published timestamp. Store only the deployed hash, never the latest database hash: changes during publication remain pending. Definitive failures back off fifteen minutes and pause after three automated failures; ambiguous dispatch remains blocked for investigation.

## Verification and operations

Remote acceptance separates real state-driven publication from pure-data hash tests. When league writes are outside scope, simulate a stale confirmed hash only in the newly introduced control table; prove score/team changes and reversion using JSON expressions without changing operational rows. Do not report that as a real score-write test.

Read last_check_at, last_current_hash, last_compute_ms, last_http_request, failure_count, next_retry_at, last_error and Cron run history through authorized owner/service access. To stop automatic wakeups, disable the configuration row; retain the manual path and history, and do not delete pending requests to force another dispatch. Unknown tasks require checking the original Actions run.

The interval is not a guaranteed deployment deadline. Every eligible stored public change is automatically publishable without a separate review click. Test acceptance is not Production authorization. The compact publication modal and Production authenticated acceptance remain separate. Optional private-workbook integration must be disclosed independently of the regression count.

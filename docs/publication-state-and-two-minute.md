# Test publication state and two-minute checks

- Migration 012 changes the existing enabled Test Cron job to `*/2 * * * *`. It does not create duplicate jobs, enable automation, seed league data, or change the Production schedule.
- `get_publication_status_summary` is service-role-only. The authenticated active-admin Edge `state` action exposes only compact operational fields, never private datasets, hashes, credentials or configurable targets. No GitHub/Pages fetch occurs for this action.
- State compares the current curated public hash with the last verified published hash. Unknown verification is unavailable, not synced. All public content in the configured current season is considered, not only the open form. Unpublished/private-only edits may remain synced.
- Manual reservation rechecks the hash under the same advisory lock as automatic reservation. An unchanged request creates neither a publication nor audit row and does not dispatch Actions. Pending/unknown tasks and the existing one-minute cooldown block duplicates.
- The top-level admin-only publication dialog refreshes state on login, opening, explicit check and committed writes. A closed dialog does not poll. Idle synchronized state does not poll. Only the exact tracked request is checked every five seconds while the dialog is open and visible; completion, failure, lookup errors, closure and five-minute timeout stop automatic tracking. Explicit checking remains available. A closed dialog does not cancel the server task.
- Starting a task is not immediate visibility. Current content state, tracked task and historical verified-online time remain separate. After completion refresh already-open public pages; subsequent saves may require another publication.
- Never clear unknown outcomes to enable retries. A publish response lost without a request ID stays blocked until a pending task is identified; an unchanged summary alone cannot prove the unacknowledged request failed.

## Acceptance (Test only)

1. Open `/admin/` as an active admin and choose **公開發布**. With no public changes, **立即啟動發布** is disabled and state says **公開資料已同步**.
2. Save one reversible public team-name change. Open the dialog or press **重新查核**. Before the next automatic publication, state becomes pending or dirty; only dirty enables manual publication.
3. For the automatic path do not press manual publish. Wait for the scheduled check and deployment, refresh the public page, and verify the saved change.
4. Restore the team name, save, then verify the restoration on the public page too.
5. If manually publishing, observe queued/running/verified-online messages. Closing the dialog stops only browser tracking. Network errors must not falsely claim synchronization or enable resend.

A two-minute check interval is not an online deadline. Build/deployment queues, live verification and reconciliation add time. No Production merge/tag/deployment is authorized by Test acceptance.

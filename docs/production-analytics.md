# Production public-page GA4

Measurement ID: `G-TQEJNT378W` (public identifier, not a secret).

## Scope

- The owner approved immediate analytics collection without a consent dialog.
- Only the Production public `index.html` entry point is instrumented, including its Home/Schedule/Standings/Teams SPA sections.
- Activation requires Production build config, the exact hosted Production hostname and public index path. Test, local previews, admin, referee and standalone event rules pages do not initialize GA.
- The public build config alone receives the measurement ID. Admin/referee configs do not.
- The footer displays a short bilingual analytics/cookie disclosure only when analytics is enabled. It is not a consent prompt or a comprehensive legal policy.
- No database, Auth, Edge Function or schema changes are required.

## Event contract

- `page_view`: one per entry-page load, not per SPA section transition.
- `public_navigation`: destination section (`home`, `schedule`, `standings`, `teams`).
- `public_info_open`: league overview or venue dialog.
- `public_map_open`: navigation-map link clicked; no destination URL sent.
- `public_rules_open`: event rules entry clicked.
- `public_language_change`: `zh` / `en`.
- `public_filter_change`: group, team group, matchday, or all-vs-specific team filter.
- `public_filter_reset`: clear schedule filters.
- `public_theme_toggle`: theme-toggle click.
- `public_team_open`: team entry click, without a team/player name.
- `public_follow_toggle`: follow/unfollow intent, without the followed team or saved preference.
- `public_standings_copy`: copy-button intent and group, not proof clipboard write succeeded.
- `public_standings_sort`: group and an allowlisted sort key.

Custom events include the originating SPA `section`. These are interaction intents, not backend mutations or guaranteed successful outcomes. Ordinary button activation by pointer/Enter/Space uses native click events. Date-pill arrow-key-only changes are not custom-instrumented in this version.

## Data minimization

- Page location is fixed to the public root; query strings and fragments are not sent by this integration.
- Referrer is reduced to its HTTP(S) origin.
- No names, emails, player data, Auth tokens, raw DOM text, form inputs or local-storage values are read into event payloads.
- Google Signals and advertising personalization are disabled in tag config. Analytics cookies and Google's ordinary analytics processing still apply; this is not anonymous/no-cookie measurement.
- The loader is asynchronous; a blocked Google script does not block the league application.

## GA administrator setup and verification

1. Confirm the web stream belongs to this exact Production URL and measurement ID.
2. In the stream's Enhanced Measurement settings, review/disable automatic measurements that would duplicate custom interactions or collect unwanted URL/form details. Repository tests cannot inspect the remote GA property settings.
3. Register event-scoped custom dimensions for `section`, `destination`, `info_type`, `filter_type`, `selection`, `group`, `sort_key`, and `action` if they are needed in standard reports/explorations; sending parameters alone does not configure reports.
4. After separately approved tag-only Production deployment, load the public root in a clean browser, inspect outgoing collection requests, then confirm `page_view` and interaction events in GA Realtime/DebugView. Realtime visibility is a separate acceptance gate; a queued command or HTTP success alone is not proof it appeared in GA reports.
5. Check that Test/admin/referee do not load Google tags or issue Analytics collection requests.

## Release and rollback

Keep the PR unmerged pending Test acceptance and explicit Production approval. Production remains tag-only. Roll back by releasing a compatible source commit without analytics or removing the Production public config field and releasing normally. No Supabase data rollback is needed.

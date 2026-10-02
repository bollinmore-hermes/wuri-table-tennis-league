# Public UI enhancements — Issues #38, #39, #40

## Behavior

- Schedule team selection includes matches where the team is either participant and intersects the existing group and matchday filters. All active teams remain selectable so conflicting filters produce a clear empty state rather than silently changing a selection.
- **Clear filters** selects all groups, teams and dates. Clicking Schedule (including the current tab) clears group/team selection and restores the existing upcoming-date default with its local-time 19:00 cutoff.
- At widths up to 820px, matchday buttons replace the desktop date dropdown. The horizontally scrolling row owns its overflow. All dates are available, including **All matchdays**. Buttons expose `aria-pressed`, support Tab/Enter/Space plus Left/Right/Home/End, preserve keyboard focus and synchronize the underlying date value.
- Theme is applied in the document head before rendering. With no explicit preference, the palette follows the operating system, including subsequent system changes. A manual light/dark choice persists in `wuriLeagueTheme` and overrides the system. Blocked storage does not prevent switching during the current session.
- Theme changes affect all public pages and information dialogs; the management application is unchanged. Textual gold, group and standings movement colors have separate light/dark contrast-safe tokens.
- New controls are translated in both locales. Official team names are preserved.

## Verification

Performed against the built, read-only `pages-dist` artifact:

- `npm test`: 89 Node runner tests passed. The Excel file's internal 7 public-fixture checks passed; private `OFFICIAL_XLSX` integration was not run because the workbook was not configured.
- `npm run build:pages`: 32 output files; administration assets excluded.
- `npm audit --omit=dev`: no reported production dependency vulnerabilities.
- `git diff --check`: passed.
- Existing public browser regression: 6 viewport widths × 2 locales, 144 team detail navigation checks; no page errors or document overflow.
- New feature browser verification: 6 viewport widths × 2 locales × 2 themes, 288 team-filter checks. Included combined filters, empty states, resets, mobile dates, keyboard, both information dialogs, reload persistence, system preference and blocked storage.
- Sampled text/background pairs have minimum measured contrast 5.26:1 (light) and 5.35:1 (dark). This is a targeted palette check, not a full accessibility certification.

Browser scripts require an existing Playwright installation; it is not added as an application dependency:

```sh
npm run build:pages
python3 -m http.server 8878 --bind 127.0.0.1 --directory pages-dist
# In another shell, set NODE_PATH to the existing Playwright node_modules if needed.
node scripts/verify-public-ui.cjs http://127.0.0.1:8878/ /path/to/evidence/regression
node scripts/verify-public-enhancements.cjs http://127.0.0.1:8878/ /path/to/evidence/features
```

## Release scope

No database migrations, backend mutations, dependency changes, remote push, release tag, issue closure or production deployment are part of this implementation.

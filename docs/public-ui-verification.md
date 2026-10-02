# Public UI regression verification (#18–#22)

## Behavior contract

- Home standings contain every active team, ordered by league points rather than truncated to four rows.
- Each team detail uses columns Team, Win%, GP, W, L. Sort by the exact wins/played ratio descending; preserve canonical team order for ties; unplayed opponents appear last as an em dash.
- Public schedule navigation resets the group to ALL and retains the established next-matchday default, including the local 19:00 cutoff.
- Public team navigation resets the group to ALL and clears team detail, including repeated clicks on the current tab.
- A bilingual back-to-all-teams button appears before every team detail. Returning restores both groups and transfers keyboard focus to the All filter.
- Standings team links still open the selected team's group and exact detail after navigation resets.
- The brand is a native home button with hover/focus affordances and Enter/Space activation.
- Opening a team detail scrolls to the page top so the new return button is not hidden under the sticky mobile header.

## Automated checks

```sh
npm test
node --check assets/js/app.js
node --check scripts/verify-public-ui.cjs
npm run build:pages
npm audit --omit=dev
git diff --check
```

The five added regressions fail against the original main-branch source and pass against the fix. The Node test runner reports 82 passing tests, including the Excel import test file whose internal runner verifies seven cases. The private official workbook integration remains skipped unless OFFICIAL_XLSX is configured.

## Optional real-browser artifact check

The verifier uses Playwright as an optional verification dependency, not a runtime application dependency. The verified version is Playwright 1.63.0. Keep its installation and browser cache isolated from the application and other tasks. Playwright installers can remove older browser revisions from a shared cache; use PLAYWRIGHT_BROWSERS_PATH to avoid that side effect.

```sh
# Replace these with an approved scratch directory and unused local port.
export UI_TOOLS=/path/to/approved/scratch/ui-tools
export PLAYWRIGHT_BROWSERS_PATH="$UI_TOOLS/browsers"
npm install --prefix "$UI_TOOLS" playwright@1.63.0 --no-audit --no-fund
"$UI_TOOLS/node_modules/.bin/playwright" install chromium
python3 -m http.server 8878 --bind 127.0.0.1
# In another terminal, with the same PLAYWRIGHT_BROWSERS_PATH:
NODE_PATH="$UI_TOOLS/node_modules" node scripts/verify-public-ui.cjs \
  http://127.0.0.1:8878/pages-dist/ "$UI_TOOLS/evidence"
```

The browser verifier covers Chinese and English at 320, 390, 768, 900, 1024, and 1440 px: 12 combinations and 144 team-detail visits. It tests all four navigation source pages, repeated schedule/team navigation, every standings team link, the visible return button, exact win-rate sorting, keyboard brand activation, document/table/cell overflow, page errors, loaded-image failures, and admin.html returning 404 in the read-only artifact. It writes browser-report.json and representative desktop/mobile screenshots. UI_WIDTHS can select widths for a focused rerun.

To avoid animation-related actionability delays, the verifier forces instant programmatic scrolling inside the test browser. Application smooth-scrolling behavior is unchanged; animation timing is not an acceptance claim.

## Scope and limits

Verified locally against the actual static Pages artifact with canonical data (12 teams, 60 matches, 26 results). No live Supabase writes or database/schema changes are involved. This is not a deployed Production or Test-site verification.

The repository's existing GitHub workflow runs only on version-tag pushes. This PR does not change CI or create a tag, so no PR CI/deployment is expected. Merge and release/deployment require separate approval.

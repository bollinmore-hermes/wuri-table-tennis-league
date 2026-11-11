/* Public navigation only: never authenticate or infer archives from live scores. */
(() => {
  'use strict';
  const entry = document.getElementById('archiveStandingsEntry');
  if (!entry) return;
  entry.hidden = true;
  const cfg = window.LEAGUE_CONFIG || {};
  const endpoint = `https://${cfg.projectRef}.supabase.co/functions/v1/season-archives`;
  if (cfg.mode === 'disabled' || !['test', 'production'].includes(cfg.environment) ||
      !/^[a-z]{20}$/.test(cfg.projectRef || '') || cfg.archivesEndpoint !== endpoint) return;

  const code = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hash = /^[0-9a-f]{64}$/;
  const fields = ['archiveId', 'seasonCode', 'name', 'archivedAt', 'contentHash', 'objectPath', 'teamCount', 'matchCount'];
  function validPublishedRecord(a) {
    return a && !Array.isArray(a) && typeof a === 'object' &&
      Object.keys(a).length === fields.length && fields.every(k => Object.hasOwn(a, k)) &&
      ['archiveId', 'seasonCode', 'contentHash', 'objectPath'].every(k => typeof a[k] === 'string') &&
      uuid.test(a.archiveId) && code.test(a.seasonCode) && hash.test(a.contentHash) &&
      a.objectPath === `${a.seasonCode}/${a.archiveId}-${a.contentHash}.json` &&
      typeof a.name === 'string' && a.name.trim().length > 0 && a.name.length <= 200 &&
      typeof a.archivedAt === 'string' && Number.isFinite(Date.parse(a.archivedAt)) &&
      Number.isInteger(a.teamCount) && a.teamCount > 0 &&
      Number.isInteger(a.matchCount) && a.matchCount > 0;
  }
  // This anonymous endpoint lists only verified published archives, never pending
  // reservations. Recheck when the page is opened/reloaded; no polling or writes.
  (async () => {
    try {
      const response = await fetch(endpoint, {
        cache: 'no-store', credentials: 'omit', redirect: 'error',
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok || response.redirected) return;
      const text = await response.text();
      if (new TextEncoder().encode(text).length > 300000) return;
      const catalog = JSON.parse(text);
      if (catalog?.schemaVersion !== 1 || catalog.environment !== cfg.environment ||
          catalog.projectRef !== cfg.projectRef || !Array.isArray(catalog.archives) ||
          catalog.archives.length === 0 || catalog.archives.length > 200 ||
          !catalog.archives.every(validPublishedRecord)) return;
      entry.hidden = false;
    } catch {
      // Catalog failure must not interrupt the current season or reveal a dead link.
      entry.hidden = true;
    }
  })();
})();

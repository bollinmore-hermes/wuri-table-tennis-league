'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');

test('unknown link rotation blocks further mutations until an explicit successful readback', async () => {
  const { window } = parseHTML('<html><body><div id="links"></div></body></html>');
  window.WuriReporting = {};
  let mutations = 0;
  const api = {
    async link(day, action) {
      if (action === 'get') return { active: false, date: day, season_code: 'synthetic' };
      mutations++;
      throw new Error('transport failure');
    }
  };
  vm.runInNewContext(fs.readFileSync('assets/js/report-links.js', 'utf8'), {
    window, document: window.document, confirm: () => true
  });
  const ui = window.WuriReporting.createLinks({
    api, getData: () => ({ matches: [] }), isAdmin: () => true,
    container: window.document.getElementById('links'), baseUrl: 'https://example.invalid/referee/'
  });
  const button = label => [...window.document.querySelectorAll('button')].find(b => b.textContent === label);
  await ui.run('rotate');
  assert.equal(button('換發（舊 QR 全失效）').disabled, true);
  assert.equal(button('重新查核').disabled, false);
  await ui.run('rotate');
  assert.equal(mutations, 1, 'unknown rotation must not be repeated through the handler');
  await ui.run('get');
  assert.equal(button('換發（舊 QR 全失效）').disabled, false);
});

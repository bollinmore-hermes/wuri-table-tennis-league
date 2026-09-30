'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

test('Production Pages deploys only from version tags',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');
  assert.match(workflow,/push:\s*\n\s+tags:\s*\n\s+- ['"]v\*['"]/);
  assert.doesNotMatch(workflow,/branches:\s*\[?\s*main/);
  assert.doesNotMatch(workflow,/workflow_dispatch:/);
});

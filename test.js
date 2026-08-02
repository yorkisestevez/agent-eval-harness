#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseAgent, routingSuite } = require('./index');

function testCrlfAgentParsing() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-crlf-'));
  const file = path.join(dir, 'sample-agent.md');
  try {
    fs.writeFileSync(file, [
      '---',
      'name: sample-agent',
      'description: Use when a regression test needs a valid CRLF agent definition.',
      'tools: Read, Grep',
      '---',
      '## Scope',
      'Return JSON only: `{"ok": true}`',
      '',
    ].join('\r\n'));
    const agent = parseAgent(file);
    assert.equal(agent.error, undefined);
    assert.equal(agent.name, 'sample-agent');
    assert.deepEqual(agent.tools, ['Read', 'Grep']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testEmptyRoutingFailsCleanly() {
  const results = routingSuite([], [{
    id: 'no-agents',
    prompt: 'route this safely',
    expect_agent: 'sample-agent',
  }]);
  assert.deepEqual(results, [{
    id: 'no-agents',
    expected: 'sample-agent',
    got: null,
    score: 0,
    margin: 0,
    ratio: 0,
    runner_up: null,
    pass: false,
    reason: 'no-agents',
  }]);
}

function testBundledProject() {
  const cli = path.join(__dirname, 'cli.js');
  const config = path.join(__dirname, 'init', 'agent-eval.config.json');
  const result = spawnSync(process.execPath, [cli, `--config=${config}`, '--threshold=1.0'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
  }
  assert.equal(result.status, 0, 'bundled project must pass at a 100% threshold');
}

const tests = [
  ['parses CRLF agent files', testCrlfAgentParsing],
  ['empty routing input fails cleanly', testEmptyRoutingFailsCleanly],
  ['bundled project passes', testBundledProject],
];

let passed = 0;
for (const [name, test] of tests) {
  try {
    test();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);

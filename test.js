#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  DEFAULTS,
  extractJson,
  loadAgents,
  loadCases,
  parseAgent,
  routingSuite,
  spawnSuite,
  staticSuite,
  validateAgainst,
} = require('./index');

const cli = path.join(__dirname, 'cli.js');
const bundledConfig = path.join(__dirname, 'init', 'agent-eval.config.json');

function runCli(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function runCliIn(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

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

function testQuotedFrontmatterValuesRemainSupported() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-quoted-'));
  const file = path.join(dir, 'quoted-agent.md');
  try {
    fs.writeFileSync(file, [
      '---',
      'name: "quoted-agent"',
      'description: "Use when \\"quoted\\" YAML scalars are required."',
      "tools: 'Read, Grep'",
      '---',
      '## Scope',
      'Return JSON only: `{"ok":true}`',
      '',
    ].join('\n'));
    const agent = parseAgent(file);
    assert.equal(agent.error, undefined);
    assert.equal(agent.name, 'quoted-agent');
    assert.equal(agent.description, 'Use when "quoted" YAML scalars are required.');
    assert.deepEqual(agent.tools, ['Read', 'Grep']);

    const singleFile = path.join(dir, 'single-agent.md');
    fs.writeFileSync(singleFile, [
      '---',
      "name: 'single-agent'",
      "description: 'Use when it''s safe.'",
      "tools: 'Read'",
      '---',
      '## Scope',
      '',
    ].join('\n'));
    assert.equal(parseAgent(singleFile).description, "Use when it's safe.");
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

function testInvalidThresholdsFailClosed() {
  for (const threshold of ['-1', '1.1', 'NaN', 'Infinity', '0.5junk', '0x0', '1e0', '']) {
    const result = runCli(`--config=${bundledConfig}`, `--threshold=${threshold}`);
    assert.equal(result.status, 1, `threshold ${JSON.stringify(threshold)} must exit 1`);
    assert.match(result.stderr, /threshold must be a finite number between 0 and 1/);
  }
  for (const args of [['--threshold', '-1'], ['--threshold', 'NaN'], ['--threshold']]) {
    const result = runCli(`--config=${bundledConfig}`, ...args);
    assert.equal(result.status, 1, `${args.join(' ')} must exit 1`);
  }
  const unknown = runCli(`--config=${bundledConfig}`, '--threshol=0');
  assert.equal(unknown.status, 1, 'unknown options must exit 1');
  assert.match(unknown.stderr, /unknown argument/);
}

function testDuplicateCliOptionsFailClosed() {
  const cases = [
    ['--threshold=1', '--threshold=0'],
    ['--threshold', '1', '--threshold=0'],
    [`--config=${bundledConfig}`, `--config=${bundledConfig}`],
    ['--config', bundledConfig, `--config=${bundledConfig}`],
  ];
  for (const args of cases) {
    const result = runCli(...args);
    assert.equal(result.status, 1, `duplicate options must fail: ${args.join(' ')}`);
    assert.match(result.stderr, /duplicate --(?:threshold|config) option/);
  }
}

function testConflictingCliModesFailClosed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-modes-'));
  try {
    for (const mode of ['--help', '--init']) {
      const result = runCliIn(
        dir,
        `--config=${bundledConfig}`,
        '--threshold=1',
        '--strict',
        mode,
      );
      assert.equal(result.status, 1, `${mode} must not bypass evaluation options`);
      assert.match(result.stderr, /cannot be combined with evaluation options/);
    }
    assert.deepEqual(fs.readdirSync(dir), [], 'conflicting --init must not scaffold files');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testInvalidConfigThresholdFailsClosed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-config-threshold-'));
  try {
    fs.cpSync(path.join(__dirname, 'init'), dir, { recursive: true });
    const configPath = path.join(dir, 'agent-eval.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    for (const threshold of [-1, null]) {
      config.defaultThreshold = threshold;
      fs.writeFileSync(configPath, JSON.stringify(config));
      const result = runCli(`--config=${configPath}`);
      assert.equal(result.status, 1, `config threshold ${threshold} must exit 1`);
      assert.match(result.stderr, /threshold must be a finite number between 0 and 1/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testMalformedConfigRootsFailClosed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-config-root-'));
  try {
    fs.cpSync(path.join(__dirname, 'init'), dir, { recursive: true });
    const configPath = path.join(dir, 'agent-eval.config.json');
    for (const root of [null, [], 'garbage', 1, true]) {
      fs.writeFileSync(configPath, JSON.stringify(root));
      const result = runCli(`--config=${configPath}`);
      assert.equal(result.status, 1, `config root ${JSON.stringify(root)} must exit 1`);
      assert.match(result.stderr, /config root must be a plain object/);
    }

    const valid = JSON.parse(fs.readFileSync(path.join(__dirname, 'init', 'agent-eval.config.json'), 'utf8'));
    valid.defaultThreshol = 0;
    fs.writeFileSync(configPath, JSON.stringify(valid));
    assert.match(runCli(`--config=${configPath}`).stderr, /unknown config key: defaultThreshol/);

    delete valid.defaultThreshol;
    valid.validTools = null;
    fs.writeFileSync(configPath, JSON.stringify(valid));
    assert.match(runCli(`--config=${configPath}`).stderr, /validTools must be an array/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testDuplicateJsonKeysFailClosed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-duplicate-json-'));
  try {
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, '{"defaultThreshold":1,"defaultThreshold":0}');
    const configResult = runCli(`--config=${configPath}`, '--static');
    assert.equal(configResult.status, 1);
    assert.match(configResult.stderr, /duplicate JSON key: defaultThreshold/);

    const casesPath = path.join(dir, 'cases.jsonl');
    fs.writeFileSync(casesPath, '{"id":"one","id":"two","prompt":"go","expect_agent":"safe-agent"}');
    assert.throws(() => loadCases(casesPath), /duplicate JSON key: id/);

    const schemasFile = path.join(dir, 'schemas.json');
    const fixturesDir = path.join(dir, 'fixtures');
    fs.mkdirSync(fixturesDir);
    fs.writeFileSync(schemasFile, '{"safe-agent":{"required":["result"],"types":{"result":"string"}},"safe-agent":{}}');
    assert.throws(
      () => spawnSuite({ schemasFile, fixturesDir }, { strict: true }),
      /duplicate JSON key: safe-agent/,
    );

    for (const [fixture, key] of [
      ['{"result":"ok","result":"overwritten"}', 'result'],
      ['{"a":1,"\\u0061":2}', 'a'],
      ['{"items":[{"x":1,"x":2}]}', 'x'],
    ]) {
      assert.throws(() => extractJson(fixture), new RegExp(`duplicate JSON key: ${key}`));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testMissingAndEmptyCasesFailStrict() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-cases-'));
  try {
    fs.cpSync(path.join(__dirname, 'init'), dir, { recursive: true });
    const config = path.join(dir, 'agent-eval.config.json');
    const cases = path.join(dir, '_evals', 'cases.jsonl');
    fs.rmSync(cases);
    const missing = runCli(`--config=${config}`, '--threshold=1', '--strict');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /cases file not found/);

    fs.writeFileSync(cases, '');
    const empty = runCli(`--config=${config}`, '--threshold=1', '--strict');
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /strict routing requires at least one case/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testMalformedAgentsRemainVisible() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-malformed-'));
  try {
    fs.writeFileSync(path.join(dir, 'broken-agent.md'), '# missing frontmatter\n');
    const agents = loadAgents(dir);
    assert.equal(agents.length, 1, 'malformed files must not be discarded');
    assert.equal(agents[0].error, 'no frontmatter');
    const result = staticSuite(agents, DEFAULTS)[0];
    assert.equal(result.checks.find(check => check.name === 'valid-frontmatter').pass, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testMalformedFrontmatterFailsValidation() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-frontmatter-'));
  try {
    const duplicate = path.join(dir, 'duplicate.md');
    fs.writeFileSync(duplicate, [
      '---', 'name: first', 'name: second',
      'description: Use when duplicate keys must fail.', 'tools: Read',
      '---', '## Scope', '',
    ].join('\n'));
    assert.match(parseAgent(duplicate).error, /duplicate frontmatter key: name/);

    const flow = path.join(dir, 'flow.md');
    fs.writeFileSync(flow, [
      '---', 'name: flow', 'invalid_yaml: [unterminated',
      'description: Use when malformed values must fail.', 'tools: Read',
      '---', '## Scope', '',
    ].join('\n'));
    assert.match(parseAgent(flow).error, /unsupported frontmatter value/);

    for (const newline of ['\n', '\r\n']) {
      const malformedQuote = path.join(dir, `quote-${newline.length}.md`);
      fs.writeFileSync(malformedQuote, [
        '---', 'name: "bad"quote"',
        'description: Use when malformed quotes must fail.', 'tools: Read',
        '---', '## Scope', '',
      ].join(newline));
      assert.match(parseAgent(malformedQuote).error, /invalid quoted frontmatter value/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testNullDoesNotSatisfyStringContract() {
  assert.deepEqual(
    validateAgainst({ name: null }, { required: ['name'], types: { name: 'string' } }),
    ['type mismatch: name expected string, got null'],
  );
}

function testNestedContractRequiresObject() {
  assert.deepEqual(
    validateAgainst(
      { profile: 'not-an-object' },
      { nested: { profile: { required: ['name'], types: { name: 'string' } } } },
    ),
    ['type mismatch: profile expected object, got string'],
  );
}

function testContractsUseOwnProperties() {
  assert.deepEqual(
    validateAgainst({}, {
      required: ['constructor'],
      types: { constructor: 'string' },
    }),
    ['missing required field: constructor'],
  );
}

function testMalformedSchemaNodesFailClosed() {
  assert.match(validateAgainst({}, 'garbage')[0], /invalid schema: root expected object/);
  assert.match(
    validateAgainst({ profile: {} }, { nested: { profile: 'garbage' } })[0],
    /invalid schema: profile expected object/,
  );
}

function testEmptySchemaFailsClosed() {
  assert.match(validateAgainst({}, {})[0], /schema must define at least one constraint/);
}

function testStrictFixtureExercisesContract() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-fixture-coverage-'));
  try {
    const schemasFile = path.join(dir, 'schemas.json');
    const fixturesDir = path.join(dir, 'fixtures');
    fs.mkdirSync(fixturesDir);
    fs.writeFileSync(schemasFile, JSON.stringify({
      'safe-agent': { types: { result: 'string' } },
    }));
    fs.writeFileSync(path.join(fixturesDir, 'safe-agent.txt'), '{}');
    const out = spawnSuite(
      { schemasFile, fixturesDir },
      { strict: true, expectedAgents: ['safe-agent'] },
    );
    assert.equal(out.totalChecks, 1);
    assert.equal(out.totalPass, 0);
    assert.equal(out.results[0].reason, 'vacuous-fixture');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testFixturePathsCannotEscape() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-fixture-path-'));
  try {
    const schemasFile = path.join(dir, 'schemas.json');
    const fixturesDir = path.join(dir, 'fixtures');
    fs.mkdirSync(fixturesDir);
    for (const name of ['../secret', '..\\secret', '/absolute', 'nested/name']) {
      fs.writeFileSync(schemasFile, JSON.stringify({ [name]: { required: ['result'], types: { result: 'string' } } }));
      assert.throws(
        () => spawnSuite({ schemasFile, fixturesDir }, { strict: true }),
        /invalid schema agent name/,
      );
    }

    const outside = path.join(dir, 'outside.txt');
    const linkedFixture = path.join(fixturesDir, 'safe-agent.txt');
    fs.writeFileSync(outside, '{"result":"outside"}');
    try {
      fs.symlinkSync(outside, linkedFixture, 'file');
      fs.writeFileSync(schemasFile, JSON.stringify({
        'safe-agent': { required: ['result'], types: { result: 'string' } },
      }));
      assert.throws(
        () => spawnSuite({ schemasFile, fixturesDir }, { strict: true }),
        /fixture path escapes fixturesDir through a link/,
      );
    } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testInvalidSchemaBlocksWithoutFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-schema-'));
  try {
    const schemasFile = path.join(dir, 'schemas.json');
    const fixturesDir = path.join(dir, 'fixtures');
    fs.mkdirSync(fixturesDir);
    fs.writeFileSync(schemasFile, JSON.stringify({ 'broken-agent': 'garbage' }));
    const result = spawnSuite({ schemasFile, fixturesDir });
    assert.equal(result.totalChecks, 1);
    assert.equal(result.results[0].reason, 'invalid-schema');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testSchemaMapRootAndCoverageFailClosed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-schema-root-'));
  try {
    const schemasFile = path.join(dir, 'schemas.json');
    const fixturesDir = path.join(dir, 'fixtures');
    fs.mkdirSync(fixturesDir);
    assert.throws(
      () => spawnSuite({ schemasFile, fixturesDir }, { strict: true }),
      /schemas file not found/,
    );
    fs.writeFileSync(schemasFile, '[]');
    assert.throws(
      () => spawnSuite({ schemasFile, fixturesDir }, { strict: true }),
      /schema map root must be a plain object/,
    );

    fs.writeFileSync(schemasFile, '{}');
    assert.throws(
      () => spawnSuite({ schemasFile, fixturesDir }, { strict: true }),
      /schema map must define at least one agent/,
    );

    fs.writeFileSync(schemasFile, JSON.stringify({
      'other-agent': { required: ['result'], types: { result: 'string' } },
    }));
    const missing = spawnSuite(
      { schemasFile, fixturesDir },
      { strict: true, expectedAgents: ['sample-agent'] },
    );
    assert.equal(missing.totalChecks, 3);
    assert.deepEqual(
      missing.results.map(result => result.reason),
      ['missing-schema', 'orphan-schema', 'no-fixture'],
    );

    fs.writeFileSync(path.join(fixturesDir, 'other-agent.txt'), '{"result":"ok"}');
    const noAgents = spawnSuite(
      { schemasFile, fixturesDir },
      { strict: true, expectedAgents: [] },
    );
    assert.equal(noAgents.totalChecks, 3);
    assert.equal(noAgents.totalPass, 1);
    assert.deepEqual(
      noAgents.results.map(result => result.reason || 'pass'),
      ['no-agents', 'orphan-schema', 'pass'],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testStrictRejectsVacuousAgentCoverage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-vacuous-'));
  try {
    fs.cpSync(path.join(__dirname, 'init'), dir, { recursive: true });
    fs.rmSync(path.join(dir, 'agents'), { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'agents'));
    const config = path.join(dir, 'agent-eval.config.json');
    const cases = path.join(dir, '_evals', 'cases.jsonl');
    fs.writeFileSync(cases, '');
    const emptyCases = runCli(`--config=${config}`, '--threshold=1', '--strict');
    assert.equal(emptyCases.status, 1);
    assert.match(emptyCases.stderr, /strict routing requires at least one case/);

    fs.copyFileSync(path.join(__dirname, 'init', '_evals', 'cases.jsonl'), cases);
    const noAgents = runCli(`--config=${config}`, '--threshold=1', '--strict');
    assert.equal(noAgents.status, 2);
    assert.match(noAgents.stdout, /no-agents/);
    assert.match(noAgents.stdout, /orphan-schema/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testThresholdAndStrictAreIndependent() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-strict-'));
  try {
    fs.cpSync(path.join(__dirname, 'init'), dir, { recursive: true });
    const agentFile = path.join(dir, 'agents', 'sample-agent.md');
    fs.appendFileSync(agentFile, '\n```json\n{"result":"ok"}\n```\n');
    const config = path.join(dir, 'agent-eval.config.json');
    const thresholdOnly = runCli(`--config=${config}`, '--threshold=1.0');
    const strict = runCli(`--config=${config}`, '--threshold=1.0', '--strict');
    assert.equal(thresholdOnly.status, 0, 'threshold must not implicitly enable strict audits');
    assert.equal(strict.status, 2, '--strict must promote the fence audit to blocking');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testBundledProject() {
  const result = runCli(`--config=${bundledConfig}`, '--threshold=1.0');
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
  }
  assert.equal(result.status, 0, 'bundled project must pass at a 100% threshold');
}

const tests = [
  ['parses CRLF agent files', testCrlfAgentParsing],
  ['supports quoted frontmatter values', testQuotedFrontmatterValuesRemainSupported],
  ['empty routing input fails cleanly', testEmptyRoutingFailsCleanly],
  ['invalid thresholds fail closed', testInvalidThresholdsFailClosed],
  ['duplicate CLI options fail closed', testDuplicateCliOptionsFailClosed],
  ['conflicting CLI modes fail closed', testConflictingCliModesFailClosed],
  ['invalid config thresholds fail closed', testInvalidConfigThresholdFailsClosed],
  ['malformed config roots fail closed', testMalformedConfigRootsFailClosed],
  ['duplicate JSON keys fail closed', testDuplicateJsonKeysFailClosed],
  ['missing and empty cases fail strict routing', testMissingAndEmptyCasesFailStrict],
  ['malformed agents remain visible', testMalformedAgentsRemainVisible],
  ['malformed frontmatter fails validation', testMalformedFrontmatterFailsValidation],
  ['null does not satisfy a string contract', testNullDoesNotSatisfyStringContract],
  ['nested contracts require objects', testNestedContractRequiresObject],
  ['contracts use own properties', testContractsUseOwnProperties],
  ['malformed schema nodes fail closed', testMalformedSchemaNodesFailClosed],
  ['empty schemas fail closed', testEmptySchemaFailsClosed],
  ['strict fixtures exercise a contract', testStrictFixtureExercisesContract],
  ['fixture paths cannot escape', testFixturePathsCannotEscape],
  ['invalid schemas block without fixtures', testInvalidSchemaBlocksWithoutFixture],
  ['schema map root and coverage fail closed', testSchemaMapRootAndCoverageFailClosed],
  ['strict mode rejects vacuous agent coverage', testStrictRejectsVacuousAgentCoverage],
  ['threshold and strict mode are independent', testThresholdAndStrictAreIndependent],
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

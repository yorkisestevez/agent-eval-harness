#!/usr/bin/env node
'use strict';

// agent-eval CLI.
//
//   agent-eval                              # all suites against ./agent-eval.config.json
//   agent-eval --config=path/to/cfg.json
//   agent-eval --static                     # only the static suite
//   agent-eval --routing                    # only routing
//   agent-eval --schema                     # only schema (+ fence audit)
//   agent-eval --spawn                      # only spawn-fixture
//   agent-eval --threshold=1.0              # auto-on --strict at 1.0
//   agent-eval --strict                     # promote informational audits to blocking
//   agent-eval --verbose
//   agent-eval --json                       # also emit JSON failure dump
//   agent-eval --init                       # scaffold a sample project in cwd
//
// Exit 0 if score >= threshold (default 0.85), else exit 2.

const fs = require('node:fs');
const path = require('node:path');
const {
  loadConfig, loadAgents, loadCases,
  staticSuite, schemaSuite, fenceAudit,
  routingSuite, overlapAudit,
  spawnSuite,
} = require('./index');

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    configPath: null,
    threshold: null,
    verbose: args.includes('--verbose'),
    json: args.includes('--json'),
    strict: args.includes('--strict'),
    init: args.includes('--init'),
    suites: [],
  };
  for (const a of args) {
    if (a.startsWith('--config=')) opts.configPath = a.slice('--config='.length);
    else if (a.startsWith('--threshold=')) opts.threshold = parseFloat(a.slice('--threshold='.length));
    else if (a === '--static') opts.suites.push('static');
    else if (a === '--schema') opts.suites.push('schema');
    else if (a === '--routing') opts.suites.push('routing');
    else if (a === '--spawn') opts.suites.push('spawn');
    else if (a === '--all') opts.suites = ['static', 'schema', 'routing', 'spawn'];
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  if (opts.suites.length === 0) opts.suites = ['static', 'schema', 'routing', 'spawn'];
  return opts;
}

function help() {
  process.stdout.write([
    'agent-eval — static + schema + routing + spawn-fixture eval for *.md subagents',
    '',
    'Usage:',
    '  agent-eval                       # all suites',
    '  agent-eval --config=path.json    # explicit config file',
    '  agent-eval --static              # one suite',
    '  agent-eval --threshold=1.0       # auto-strict at 1.0',
    '  agent-eval --init                # scaffold a sample project',
    '',
    'Config: looks for ./agent-eval.config.json by default.',
    'Exit codes: 0=score>=threshold, 2=below threshold, 1=runtime error',
    '',
  ].join('\n'));
}

function runInit(cwd = process.cwd()) {
  const src = path.join(__dirname, 'init');
  const targets = ['agent-eval.config.json', 'agents/sample-agent.md', '_evals/cases.jsonl', '_evals/schemas.json', '_evals/fixtures/sample-agent.txt'];
  for (const rel of targets) {
    const from = path.join(src, rel);
    const to = path.join(cwd, rel);
    if (fs.existsSync(to)) {
      console.log(`  exists  ${rel} (skipped)`);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log(`  created ${rel}`);
  }
  console.log('\nNext: run `agent-eval --threshold=1.0` to verify the sample passes.');
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) return help();
  if (opts.init) return runInit();

  const config = loadConfig({ configPath: opts.configPath });
  const threshold = opts.threshold ?? config.defaultThreshold ?? 0.85;
  const strict = opts.strict || threshold >= 1.0;
  const verbose = opts.verbose;

  if (config.__configPath) {
    console.log(`config: ${path.relative(process.cwd(), config.__configPath)}`);
  } else {
    console.log('config: (defaults — no agent-eval.config.json found)');
  }

  const agents = loadAgents(config.agentSourceDir);
  const cases = loadCases(config.casesFile);

  let totalChecks = 0, totalPass = 0;
  const failures = [];

  if (opts.suites.includes('static')) {
    console.log(`\n=== Static suite (${agents.length} agents) ===`);
    const out = staticSuite(agents, config);
    for (const r of out) {
      const passes = r.checks.filter(c => c.pass).length;
      const total = r.checks.length;
      totalChecks += total;
      totalPass += passes;
      const fails = r.checks.filter(c => !c.pass);
      if (fails.length === 0) {
        if (verbose) console.log(`  ✓ ${r.agent} (${passes}/${total})`);
      } else {
        console.log(`  ✗ ${r.agent} (${passes}/${total}) — ${fails.map(c => c.name + (c.detail ? ':' + c.detail : '')).join(', ')}`);
        failures.push({ suite: 'static', agent: r.agent, fails });
      }
    }
  }

  if (opts.suites.includes('schema')) {
    console.log(`\n=== Schema suite (${agents.length} agents) ===`);
    const out = schemaSuite(agents);
    for (const r of out) {
      totalChecks++;
      if (r.pass) {
        totalPass++;
        if (verbose) console.log(`  ✓ ${r.agent}`);
      } else {
        console.log(`  ✗ ${r.agent} — ${r.detail}`);
        failures.push({ suite: 'schema', agent: r.agent, detail: r.detail });
      }
    }
    const fencers = fenceAudit(agents);
    if (fencers.length) {
      const tag = strict ? 'BLOCKING' : 'informational';
      console.log(`\n=== Fence audit (${tag} — provokes \`\`\`json mimicry) ===`);
      for (const name of fencers) console.log(`  ${strict ? '✗' : '⚠'} ${name} uses a \`\`\`json fence in schema example`);
      if (strict) {
        totalChecks += fencers.length;
        for (const name of fencers) failures.push({ suite: 'fence', agent: name });
      }
    }
  }

  if (opts.suites.includes('routing')) {
    console.log(`\n=== Routing suite (${cases.length} cases) ===`);
    const out = routingSuite(agents, cases);
    for (const r of out) {
      totalChecks++;
      if (r.pass) {
        totalPass++;
        if (verbose) console.log(`  ✓ ${r.id}: ${r.got} (margin ${r.margin.toFixed(3)})`);
      } else {
        const reason = r.expected !== r.got
          ? `wrong agent (got ${r.got}, wanted ${r.expected})`
          : `low margin ${r.margin.toFixed(3)} vs ${r.runner_up}`;
        console.log(`  ✗ ${r.id} — ${reason}`);
        failures.push({ suite: 'routing', id: r.id, expected: r.expected, got: r.got, margin: r.margin });
      }
    }
    const pairs = overlapAudit(agents);
    const overlapTag = strict ? 'BLOCKING' : 'informational';
    console.log(`\n=== Description overlap (${overlapTag} — pairs ≥0.20 Jaccard) ===`);
    if (pairs.length === 0) console.log('  no high-overlap pairs');
    else for (const p of pairs) console.log(`  ${strict ? '✗' : '⚠'} ${p.a} ↔ ${p.b} = ${p.score.toFixed(3)}`);
    if (strict && pairs.length) {
      totalChecks += pairs.length;
      for (const p of pairs) failures.push({ suite: 'overlap', a: p.a, b: p.b, score: p.score });
    }
  }

  if (opts.suites.includes('spawn')) {
    const sp = spawnSuite(config, { strict });
    console.log(`\n=== Spawn suite (${sp.coveredAgents}/${Object.keys(require(config.schemasFile)).length} agents covered) ===`);
    for (const r of sp.results) {
      if (r.pass) {
        if (verbose) console.log(`  ✓ ${r.agent}`);
      } else {
        const detail = r.reason === 'schema' ? r.errors.join('; ')
                     : r.reason === 'extract-json' ? r.detail
                     : r.reason;
        console.log(`  ✗ ${r.agent} — ${detail}`);
        failures.push({ suite: 'spawn', agent: r.agent, reason: r.reason, detail });
      }
    }
    if (sp.noFixture.length && !strict) {
      console.log(`  (no fixture: ${sp.noFixture.join(', ')})`);
    }
    totalChecks += sp.totalChecks;
    totalPass += sp.totalPass;
  }

  const score = totalChecks ? totalPass / totalChecks : 0;
  console.log(`\n=== Score: ${totalPass}/${totalChecks} = ${(score * 100).toFixed(1)}% ===`);
  console.log(`Threshold: ${(threshold * 100).toFixed(0)}%`);

  if (failures.length && opts.json) {
    console.log('\n' + JSON.stringify({ score, totalPass, totalChecks, failures }, null, 2));
  }

  process.exit(score >= threshold ? 0 : 2);
}

if (require.main === module) main();

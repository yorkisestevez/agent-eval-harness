#!/usr/bin/env node
'use strict';

// Self-test: run the harness against the bundled --init sample in init/.
// Used by `npm test` and CI. Exits 0 on green, 2 on red.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.join(__dirname, 'cli.js');
const config = path.join(__dirname, 'init', 'agent-eval.config.json');

const r = spawnSync('node', [cli, `--config=${config}`, '--threshold=1.0'], {
  encoding: 'utf8',
  stdio: 'inherit',
});

process.exit(r.status ?? 1);

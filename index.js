'use strict';

// Public API for agent-eval-harness.
// Library callers (e.g. a thin run.js wrapper in your own repo) can import
// suites, supply a config, and render the results however they like.

const { loadConfig, DEFAULTS, DEFAULT_VALID_TOOLS } = require('./lib/config');
const { parseAgent, loadAgents, loadCases } = require('./lib/agent-loader');
const { extractJson } = require('./lib/extract-json');
const text = require('./lib/text');
const { staticSuite } = require('./suites/static');
const { schemaSuite, fenceAudit } = require('./suites/schema');
const { routingSuite, overlapAudit } = require('./suites/routing');
const { spawnSuite, validateAgainst, loadSchemas, loadFixture } = require('./suites/spawn');

module.exports = {
  loadConfig,
  DEFAULTS,
  DEFAULT_VALID_TOOLS,
  parseAgent,
  loadAgents,
  loadCases,
  extractJson,
  text,
  staticSuite,
  schemaSuite,
  fenceAudit,
  routingSuite,
  overlapAudit,
  spawnSuite,
  validateAgainst,
  loadSchemas,
  loadFixture,
};

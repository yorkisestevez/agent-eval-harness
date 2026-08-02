'use strict';

// Loads agent-eval.config.json with sensible defaults and env-var overrides.
//
// Resolution order (highest precedence wins):
//   1. CLI --config=<path>
//   2. process.env.AGENT_EVAL_CONFIG
//   3. ./agent-eval.config.json in cwd
//   4. Built-in defaults
//
// Paths in the config are resolved relative to the config file's directory
// (or cwd if no file was loaded), so a config can be checked into a repo and
// stay valid wherever the eval is run from.

const fs = require('node:fs');
const path = require('node:path');
const { parseJsonStrict } = require('./strict-json');

const DEFAULT_VALID_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob',
  'WebSearch', 'WebFetch', 'NotebookEdit', 'Task',
];

const DEFAULTS = {
  agentSourceDir: './agents',
  fixturesDir: './_evals/fixtures',
  schemasFile: './_evals/schemas.json',
  casesFile: './_evals/cases.jsonl',
  validTools: DEFAULT_VALID_TOOLS,
  scopeSectionPattern: '## (Hard rules|Scope|When to refuse)',
  triggerPattern: "\\b[Uu]se\\b(?:\\s+(?:this|proactively|always|only|never|right))?\\s+(?:when|whenever|before|after|during|on)\\b",
  minDescriptionChars: 40,
  maxTools: 5,
  defaultThreshold: 0.85,
};

const CONFIG_KEYS = new Set(Object.keys(DEFAULTS));

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateLoadedConfig(config) {
  if (!isPlainObject(config)) throw new Error('config root must be a plain object');
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) throw new Error(`unknown config key: ${key}`);
  }
  for (const key of ['agentSourceDir', 'fixturesDir', 'schemasFile', 'casesFile']) {
    if (Object.hasOwn(config, key) && (typeof config[key] !== 'string' || !config[key].trim())) {
      throw new Error(`${key} must be a non-empty string`);
    }
  }
  if (Object.hasOwn(config, 'validTools') &&
      (!Array.isArray(config.validTools) || config.validTools.some(tool => typeof tool !== 'string' || !tool))) {
    throw new Error('validTools must be an array of non-empty strings');
  }
  for (const key of ['scopeSectionPattern', 'triggerPattern']) {
    if (Object.hasOwn(config, key) && (typeof config[key] !== 'string' || !config[key])) {
      throw new Error(`${key} must be a non-empty string`);
    }
  }
  for (const key of ['minDescriptionChars', 'maxTools']) {
    if (Object.hasOwn(config, key) && (!Number.isInteger(config[key]) || config[key] < 0)) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  }
  if (Object.hasOwn(config, 'defaultThreshold') &&
      (!Number.isFinite(config.defaultThreshold) || config.defaultThreshold < 0 || config.defaultThreshold > 1)) {
    throw new Error('threshold must be a finite number between 0 and 1');
  }
}

function loadConfig({ configPath, cwd = process.cwd() } = {}) {
  const explicit = configPath || process.env.AGENT_EVAL_CONFIG;
  const candidate = explicit
    ? path.resolve(cwd, explicit)
    : path.resolve(cwd, 'agent-eval.config.json');

  let loaded = {};
  let baseDir = cwd;
  if (fs.existsSync(candidate)) {
    loaded = parseJsonStrict(fs.readFileSync(candidate, 'utf8'), 'configuration JSON');
    validateLoadedConfig(loaded);
    baseDir = path.dirname(candidate);
  } else if (explicit) {
    throw new Error(`config file not found: ${candidate}`);
  }

  const merged = { ...DEFAULTS, ...loaded };
  for (const key of ['agentSourceDir', 'fixturesDir', 'schemasFile', 'casesFile']) {
    if (merged[key]) merged[key] = path.resolve(baseDir, merged[key]);
  }
  merged.__configPath = fs.existsSync(candidate) ? candidate : null;
  merged.__baseDir = baseDir;
  return merged;
}

module.exports = { loadConfig, DEFAULTS, DEFAULT_VALID_TOOLS };

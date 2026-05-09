'use strict';

// Spawn suite: fixture-driven contract test.
// For each agent in schemas.json, look for a fixture at fixtures/<name>.txt.
// Extract JSON, validate every required field, type, and enum against the
// declared schema. Missing fixture is informational by default; under
// --strict / threshold=1.0 it counts as a failed check.

const fs = require('node:fs');
const path = require('node:path');
const { extractJson } = require('../lib/extract-json');

function loadSchemas(schemasFile) {
  if (!fs.existsSync(schemasFile)) return {};
  return JSON.parse(fs.readFileSync(schemasFile, 'utf8'));
}

function loadFixture(fixturesDir, agentName) {
  const p = path.join(fixturesDir, `${agentName}.txt`);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function jsType(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function validateAgainst(obj, schema, prefix = '') {
  const errors = [];
  for (const k of schema.required || []) {
    if (!(k in obj)) errors.push(`missing required field: ${prefix}${k}`);
  }
  for (const [k, expected] of Object.entries(schema.types || {})) {
    if (!(k in obj)) continue;
    const actual = jsType(obj[k]);
    if (actual !== expected && !(expected === 'string' && actual === 'null')) {
      errors.push(`type mismatch: ${prefix}${k} expected ${expected}, got ${actual}`);
    }
  }
  for (const [k, allowed] of Object.entries(schema.enums || {})) {
    if (!(k in obj)) continue;
    if (!allowed.includes(obj[k])) {
      errors.push(`enum violation: ${prefix}${k}="${obj[k]}" not in [${allowed.join('|')}]`);
    }
  }
  for (const [k, sub] of Object.entries(schema.nested || {})) {
    if (!(k in obj)) continue;
    if (jsType(obj[k]) !== 'object') continue;
    errors.push(...validateAgainst(obj[k], sub, `${prefix}${k}.`));
  }
  return errors;
}

function spawnSuite(config, { strict = false } = {}) {
  const schemas = loadSchemas(config.schemasFile);
  const targets = Object.keys(schemas);

  const out = { results: [], noFixture: [], totalChecks: 0, totalPass: 0, coveredAgents: 0 };
  for (const name of targets) {
    const schema = schemas[name];
    const fixture = loadFixture(config.fixturesDir, name);
    if (!fixture) {
      out.noFixture.push(name);
      if (strict) {
        out.totalChecks++;
        out.results.push({ agent: name, pass: false, reason: 'no-fixture' });
      }
      continue;
    }
    out.coveredAgents++;
    out.totalChecks++;

    let parsed;
    try {
      parsed = extractJson(fixture);
    } catch (e) {
      out.results.push({ agent: name, pass: false, reason: 'extract-json', detail: e.message });
      continue;
    }

    const errors = validateAgainst(parsed, schema);
    if (errors.length === 0) {
      out.totalPass++;
      out.results.push({ agent: name, pass: true });
    } else {
      out.results.push({ agent: name, pass: false, reason: 'schema', errors });
    }
  }
  return out;
}

module.exports = { spawnSuite, validateAgainst, loadSchemas, loadFixture };

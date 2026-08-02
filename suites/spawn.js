'use strict';

// Spawn suite: fixture-driven contract test.
// For each agent in schemas.json, look for a fixture at fixtures/<name>.txt.
// Extract JSON, validate every required field, type, and enum against the
// declared schema. Missing fixture is informational by default; under
// --strict it counts as a failed check.

const fs = require('node:fs');
const path = require('node:path');
const { extractJson } = require('../lib/extract-json');
const { parseJsonStrict } = require('../lib/strict-json');

function loadSchemas(schemasFile) {
  if (!fs.existsSync(schemasFile)) throw new Error(`schemas file not found: ${schemasFile}`);
  const schemas = parseJsonStrict(fs.readFileSync(schemasFile, 'utf8'), 'schema JSON');
  if (!isPlainObject(schemas)) throw new Error('schema map root must be a plain object');
  if (Object.keys(schemas).length === 0) throw new Error('schema map must define at least one agent');
  for (const name of Object.keys(schemas)) assertSafeAgentName(name);
  return schemas;
}

function loadFixture(fixturesDir, agentName) {
  assertSafeAgentName(agentName);
  const base = path.resolve(fixturesDir);
  const fixture = path.resolve(base, `${agentName}.txt`);
  const relative = path.relative(base, fixture);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`fixture path escapes fixturesDir: ${agentName}`);
  }
  if (!fs.existsSync(fixture)) return null;
  const realBase = fs.realpathSync(base);
  const realFixture = fs.realpathSync(fixture);
  const realRelative = path.relative(realBase, realFixture);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error(`fixture path escapes fixturesDir through a link: ${agentName}`);
  }
  return fs.readFileSync(realFixture, 'utf8');
}

function jsType(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

const ALLOWED_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
const SCHEMA_KEYS = new Set(['required', 'types', 'enums', 'nested']);

function isPlainObject(value) {
  if (jsType(value) !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertSafeAgentName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name) || name.includes('..')) {
    throw new Error(`invalid schema agent name: ${JSON.stringify(name)}`);
  }
}

function validateSchemaNode(schema, prefix = 'root') {
  if (!isPlainObject(schema)) {
    return [`invalid schema: ${prefix} expected object, got ${jsType(schema)}`];
  }

  const errors = [];
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYS.has(key)) errors.push(`invalid schema: ${prefix} unknown field ${key}`);
  }

  if (hasOwn(schema, 'required')) {
    if (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string' || !key)) {
      errors.push(`invalid schema: ${prefix}.required expected an array of non-empty strings`);
    }
  }

  if (hasOwn(schema, 'types')) {
    if (!isPlainObject(schema.types)) {
      errors.push(`invalid schema: ${prefix}.types expected object, got ${jsType(schema.types)}`);
    } else {
      for (const [key, expected] of Object.entries(schema.types)) {
        if (!ALLOWED_TYPES.has(expected)) {
          errors.push(`invalid schema: ${prefix}.types.${key} has unsupported type ${expected}`);
        }
      }
    }
  }

  if (hasOwn(schema, 'enums')) {
    if (!isPlainObject(schema.enums)) {
      errors.push(`invalid schema: ${prefix}.enums expected object, got ${jsType(schema.enums)}`);
    } else {
      for (const [key, allowed] of Object.entries(schema.enums)) {
        if (!Array.isArray(allowed)) {
          errors.push(`invalid schema: ${prefix}.enums.${key} expected array, got ${jsType(allowed)}`);
        }
      }
    }
  }

  if (hasOwn(schema, 'nested')) {
    if (!isPlainObject(schema.nested)) {
      errors.push(`invalid schema: ${prefix}.nested expected object, got ${jsType(schema.nested)}`);
    } else {
      for (const [key, nestedSchema] of Object.entries(schema.nested)) {
        errors.push(...validateSchemaNode(nestedSchema, prefix === 'root' ? key : `${prefix}.${key}`));
      }
    }
  }

  const constraintCount =
    (Array.isArray(schema.required) ? schema.required.length : 0) +
    (isPlainObject(schema.types) ? Object.keys(schema.types).length : 0) +
    (isPlainObject(schema.enums) ? Object.keys(schema.enums).length : 0) +
    (isPlainObject(schema.nested) ? Object.keys(schema.nested).length : 0);
  if (constraintCount === 0) errors.push(`invalid schema: ${prefix} schema must define at least one constraint`);

  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      const hasType = isPlainObject(schema.types) && hasOwn(schema.types, key);
      const hasNestedContract = isPlainObject(schema.nested) && hasOwn(schema.nested, key);
      if (!hasType && !hasNestedContract) {
        errors.push(`invalid schema: ${prefix}.required field ${key} must declare a type or nested contract`);
      }
    }
  }

  return errors;
}

function validateAgainst(obj, schema, prefix = '') {
  const schemaErrors = validateSchemaNode(schema, prefix || 'root');
  if (schemaErrors.length) return schemaErrors;

  const errors = [];
  if (jsType(obj) !== 'object') {
    return [`type mismatch: ${prefix || 'root'} expected object, got ${jsType(obj)}`];
  }
  for (const k of hasOwn(schema, 'required') ? schema.required : []) {
    if (!hasOwn(obj, k)) errors.push(`missing required field: ${prefix}${k}`);
  }
  for (const [k, expected] of Object.entries(hasOwn(schema, 'types') ? schema.types : {})) {
    if (!hasOwn(obj, k)) continue;
    const actual = jsType(obj[k]);
    if (actual !== expected) {
      errors.push(`type mismatch: ${prefix}${k} expected ${expected}, got ${actual}`);
    }
  }
  for (const [k, allowed] of Object.entries(hasOwn(schema, 'enums') ? schema.enums : {})) {
    if (!hasOwn(obj, k)) continue;
    if (!allowed.includes(obj[k])) {
      errors.push(`enum violation: ${prefix}${k}="${obj[k]}" not in [${allowed.join('|')}]`);
    }
  }
  for (const [k, sub] of Object.entries(hasOwn(schema, 'nested') ? schema.nested : {})) {
    if (!hasOwn(obj, k)) continue;
    if (jsType(obj[k]) !== 'object') {
      errors.push(`type mismatch: ${prefix}${k} expected object, got ${jsType(obj[k])}`);
      continue;
    }
    errors.push(...validateAgainst(obj[k], sub, `${prefix}${k}.`));
  }
  return errors;
}

function constrainedFields(schema) {
  const fields = new Set(Array.isArray(schema.required) ? schema.required : []);
  for (const group of ['types', 'enums', 'nested']) {
    if (isPlainObject(schema[group])) {
      for (const key of Object.keys(schema[group])) fields.add(key);
    }
  }
  return [...fields];
}

function spawnSuite(config, { strict = false, expectedAgents = null } = {}) {
  const schemas = loadSchemas(config.schemasFile);
  const targets = Object.keys(schemas);

  const out = {
    results: [], noFixture: [], totalChecks: 0, totalPass: 0,
    coveredAgents: 0, schemaCount: targets.length,
  };
  if (strict && expectedAgents !== null) {
    const expected = [...new Set(expectedAgents)];
    if (expected.length === 0) {
      out.totalChecks++;
      out.results.push({ agent: '(agents)', pass: false, reason: 'no-agents' });
    }
    for (const name of expected.filter(name => !hasOwn(schemas, name))) {
      out.totalChecks++;
      out.results.push({ agent: name, pass: false, reason: 'missing-schema' });
    }
    for (const name of targets.filter(name => !expected.includes(name))) {
      out.totalChecks++;
      out.results.push({ agent: name, pass: false, reason: 'orphan-schema' });
    }
  }
  for (const name of targets) {
    const schema = schemas[name];
    const schemaErrors = validateSchemaNode(schema);
    if (schemaErrors.length) {
      out.totalChecks++;
      out.results.push({ agent: name, pass: false, reason: 'invalid-schema', errors: schemaErrors });
      continue;
    }
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
    const vacuous = strict && errors.length === 0 && isPlainObject(parsed) &&
      constrainedFields(schema).every(key => !hasOwn(parsed, key));
    if (vacuous) {
      out.results.push({ agent: name, pass: false, reason: 'vacuous-fixture' });
    } else if (errors.length === 0) {
      out.totalPass++;
      out.results.push({ agent: name, pass: true });
    } else {
      out.results.push({ agent: name, pass: false, reason: 'schema', errors });
    }
  }
  return out;
}

module.exports = { spawnSuite, validateAgainst, validateSchemaNode, loadSchemas, loadFixture };

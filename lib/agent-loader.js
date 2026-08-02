'use strict';

// Loads *.md agents from a directory and parses YAML-frontmatter + body.
// Agents must have a frontmatter block with at minimum a `name:` field.

const fs = require('node:fs');
const path = require('node:path');
const { parseJsonStrict } = require('./strict-json');

function invalidAgent(filePath, error) {
  return {
    error,
    file: filePath,
    name: path.basename(filePath, '.md'),
    description: '',
    tools: [],
    body: '',
  };
}

function parseScalar(value, key) {
  if (/^[\[\{>|]/.test(value)) {
    return { error: `unsupported frontmatter value for ${key}` };
  }
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string') throw new Error('not a string');
      return { value: parsed };
    } catch {
      return { error: `invalid quoted frontmatter value for ${key}` };
    }
  }
  if (value.startsWith("'")) {
    if (value.length < 2 || value.at(-1) !== "'") {
      return { error: `invalid quoted frontmatter value for ${key}` };
    }
    const inner = value.slice(1, -1);
    let parsed = '';
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] !== "'") parsed += inner[i];
      else if (inner[i + 1] === "'") { parsed += "'"; i++; }
      else return { error: `invalid quoted frontmatter value for ${key}` };
    }
    return { value: parsed };
  }
  return { value };
}

function parseAgent(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return invalidAgent(filePath, 'no frontmatter');

  const frontmatter = Object.create(null);
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const keyValue = line.match(/^([A-Za-z][\w-]*):\s*(.+)$/);
    if (!keyValue) return invalidAgent(filePath, `invalid frontmatter line: ${line}`);
    const [, key, rawValue] = keyValue;
    const value = rawValue.trim();
    if (Object.hasOwn(frontmatter, key)) {
      return invalidAgent(filePath, `duplicate frontmatter key: ${key}`);
    }
    const scalar = parseScalar(value, key);
    if (scalar.error) return invalidAgent(filePath, scalar.error);
    frontmatter[key] = scalar.value;
  }

  return {
    file: filePath,
    name: frontmatter.name || '',
    description: frontmatter.description || '',
    tools: (frontmatter.tools || '').split(',').map(tool => tool.trim()).filter(Boolean),
    body: match[2],
  };
}

function loadAgents(agentsDir) {
  if (!fs.existsSync(agentsDir)) {
    throw new Error(`agentSourceDir not found: ${agentsDir}`);
  }
  return fs.readdirSync(agentsDir)
    .filter(file => file.endsWith('.md'))
    .map(file => parseAgent(path.join(agentsDir, file)));
}

function loadCases(casesFile) {
  if (!casesFile || !fs.existsSync(casesFile)) {
    throw new Error(`cases file not found: ${casesFile || '(not configured)'}`);
  }
  const content = fs.readFileSync(casesFile, 'utf8').trim();
  if (!content) return [];
  const seen = new Set();
  return content.split('\n').filter(Boolean).map((line, index) => {
    const item = parseJsonStrict(line, `routing case line ${index + 1}`);
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`invalid routing case at line ${index + 1}: expected object`);
    }
    for (const key of ['id', 'prompt', 'expect_agent']) {
      if (typeof item[key] !== 'string' || !item[key].trim()) {
        throw new Error(`invalid routing case at line ${index + 1}: ${key} must be a non-empty string`);
      }
    }
    if (seen.has(item.id)) throw new Error(`duplicate routing case id: ${item.id}`);
    seen.add(item.id);
    return item;
  });
}

module.exports = { parseAgent, loadAgents, loadCases };

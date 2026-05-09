'use strict';

// Loads *.md agents from a directory and parses YAML-frontmatter + body.
// Agents must have a `---\n...\n---\n` frontmatter block at the top with at
// minimum a `name:` field. `description:` and `tools:` are commonly required
// downstream but missing fields are non-fatal here — the static suite reports
// them as failures.

const fs = require('node:fs');
const path = require('node:path');

function parseAgent(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { error: 'no frontmatter', file: filePath };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return {
    file: filePath,
    name: fm.name,
    description: fm.description || '',
    tools: (fm.tools || '').split(',').map(t => t.trim()).filter(Boolean),
    body: m[2],
  };
}

function loadAgents(agentsDir) {
  if (!fs.existsSync(agentsDir)) {
    throw new Error(`agentSourceDir not found: ${agentsDir}`);
  }
  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => parseAgent(path.join(agentsDir, f)))
    .filter(a => !a.error);
}

function loadCases(casesFile) {
  if (!casesFile || !fs.existsSync(casesFile)) return [];
  return fs.readFileSync(casesFile, 'utf8')
    .trim().split('\n').filter(Boolean)
    .map(l => JSON.parse(l));
}

module.exports = { parseAgent, loadAgents, loadCases };

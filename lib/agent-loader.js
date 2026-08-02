'use strict';

// Loads *.md agents from a directory and parses YAML-frontmatter + body.
// Agents must have a frontmatter block with at minimum a `name:` field.

const fs = require('node:fs');
const path = require('node:path');

function parseAgent(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { error: 'no frontmatter', file: filePath };

  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const keyValue = line.match(/^(\w+):\s*(.+)$/);
    if (keyValue) frontmatter[keyValue[1]] = keyValue[2].trim();
  }

  return {
    file: filePath,
    name: frontmatter.name,
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
    .map(file => parseAgent(path.join(agentsDir, file)))
    .filter(agent => !agent.error);
}

function loadCases(casesFile) {
  if (!casesFile || !fs.existsSync(casesFile)) return [];
  return fs.readFileSync(casesFile, 'utf8')
    .trim().split(/\r?\n/).filter(Boolean)
    .map(line => JSON.parse(line));
}

module.exports = { parseAgent, loadAgents, loadCases };

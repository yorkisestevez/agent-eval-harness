'use strict';

// Static suite: per-agent linting of the *.md frontmatter + body.
//   - has-name             frontmatter has `name:`
//   - has-description      description >= minDescriptionChars
//   - tools<=N             tools count between 1 and config.maxTools
//   - tools-valid          every tool in config.validTools[]
//   - filename-matches     basename(file) === name
//   - description-trigger  description names a "use when X" condition
//   - has-scope-discipline body has a Scope/Hard rules/When to refuse section
//   - no-recursion         body doesn't itself call subagents

const path = require('node:path');

function staticSuite(agents, config) {
  const validTools = new Set(config.validTools);
  const triggerRe = new RegExp(config.triggerPattern, 'i');
  const scopeRe = new RegExp(config.scopeSectionPattern, 'i');
  const minDesc = config.minDescriptionChars;
  const maxTools = config.maxTools;

  const results = [];
  for (const a of agents) {
    const checks = [];
    checks.push({ name: 'valid-frontmatter', pass: !a.error, detail: a.error || '' });
    checks.push({ name: 'has-name', pass: !!a.name });
    checks.push({ name: 'has-description', pass: a.description.length >= minDesc });
    checks.push({ name: `tools<=${maxTools}`, pass: a.tools.length <= maxTools && a.tools.length >= 1 });
    checks.push({
      name: 'tools-valid',
      pass: a.tools.every(t => validTools.has(t)),
      detail: a.tools.filter(t => !validTools.has(t)).join(','),
    });
    checks.push({
      name: 'filename-matches-name',
      pass: path.basename(a.file, '.md') === a.name,
    });
    checks.push({ name: 'description-uses-when', pass: triggerRe.test(a.description) });
    checks.push({ name: 'has-scope-discipline', pass: scopeRe.test(a.body) });
    checks.push({ name: 'no-recursion', pass: !/(subagent_type|Task\s*\(|Agent\s*\()/i.test(a.body) });
    results.push({ agent: a.name, checks });
  }
  return results;
}

module.exports = { staticSuite };

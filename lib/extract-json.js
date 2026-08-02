'use strict';

const { parseJsonStrict } = require('./strict-json');

// Extracts the canonical JSON object from a subagent response.
//
// Subagents are instructed to emit raw JSON only, but the underlying LLMs
// sometimes still wrap the JSON in markdown fences or add explanatory prose
// around it. Callers should run this defensively rather than calling
// JSON.parse directly.
//
// Strategy: find the largest balanced {...} block in the response and parse
// it. We balance braces while ignoring brace-like characters inside strings.

function extractJson(text) {
  if (typeof text !== 'string') {
    throw new TypeError('extractJson expects a string');
  }

  // Fast path: response is already pure JSON.
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try { return parseJsonStrict(trimmed, 'fixture JSON'); } catch (_) { /* fall through */ }
  }

  // Strip a single ```json ... ``` fence if present (common LLM habit).
  const fence = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fence) {
    try { return parseJsonStrict(fence[1].trim(), 'fixture JSON'); } catch (_) { /* fall through */ }
  }

  // General case: scan for the first top-level balanced {...} block.
  const start = text.indexOf('{');
  if (start === -1) throw new Error('extractJson: no `{` in response');

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        return parseJsonStrict(candidate, 'fixture JSON');
      }
    }
  }
  throw new Error('extractJson: unbalanced braces');
}

module.exports = { extractJson };

if (require.main === module) {
  const cases = [
    ['{"a":1}', { a: 1 }],
    ['  {"a":1}  ', { a: 1 }],
    ['Here you go:\n```json\n{"a":1}\n```\nDone.', { a: 1 }],
    ['noise\n{"nested":{"b":2}}\nmore noise', { nested: { b: 2 } }],
    ['{"s":"with } brace inside"}', { s: 'with } brace inside' }],
    ['prose {"a":1} trailing', { a: 1 }],
  ];
  let pass = 0;
  for (const [input, want] of cases) {
    try {
      const got = extractJson(input);
      const ok = JSON.stringify(got) === JSON.stringify(want);
      if (ok) pass++;
      else console.log('FAIL:', JSON.stringify(input), '→', JSON.stringify(got));
    } catch (e) {
      console.log('FAIL:', JSON.stringify(input), '→', e.message);
    }
  }
  console.log(`extract-json self-test: ${pass}/${cases.length}`);
  process.exit(pass === cases.length ? 0 : 1);
}

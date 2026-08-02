'use strict';

// Parse JSON while rejecting duplicate object keys at every nesting level.
// Native JSON.parse uses last-key-wins semantics, which is unsafe for policy,
// schema, and fixture documents because a later key can silently weaken a gate.

function parseJsonStrict(text, label = 'JSON') {
  if (typeof text !== 'string') throw new TypeError('parseJsonStrict expects a string');
  let index = 0;

  function fail(message) {
    throw new SyntaxError(`invalid ${label}: ${message} at position ${index}`);
  }

  function skipWhitespace() {
    while (index < text.length && /\s/.test(text[index])) index++;
  }

  function parseString() {
    if (text[index] !== '"') fail('expected string');
    const start = index++;
    let escaped = false;
    while (index < text.length) {
      const char = text[index++];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        return JSON.parse(text.slice(start, index));
      }
    }
    fail('unterminated string');
  }

  function parseScalar() {
    const start = index;
    while (index < text.length && !/[\s,\]}]/.test(text[index])) index++;
    if (start === index) fail('expected value');
    JSON.parse(text.slice(start, index));
  }

  function parseArray() {
    index++;
    skipWhitespace();
    if (text[index] === ']') {
      index++;
      return;
    }
    while (index < text.length) {
      parseValue();
      skipWhitespace();
      if (text[index] === ']') {
        index++;
        return;
      }
      if (text[index] !== ',') fail('expected comma or closing bracket');
      index++;
      skipWhitespace();
    }
    fail('unterminated array');
  }

  function parseObject() {
    index++;
    skipWhitespace();
    const keys = new Set();
    if (text[index] === '}') {
      index++;
      return;
    }
    while (index < text.length) {
      const key = parseString();
      if (keys.has(key)) throw new SyntaxError(`duplicate JSON key: ${key}`);
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') fail('expected colon');
      index++;
      skipWhitespace();
      parseValue();
      skipWhitespace();
      if (text[index] === '}') {
        index++;
        return;
      }
      if (text[index] !== ',') fail('expected comma or closing brace');
      index++;
      skipWhitespace();
    }
    fail('unterminated object');
  }

  function parseValue() {
    skipWhitespace();
    const char = text[index];
    if (char === '{') parseObject();
    else if (char === '[') parseArray();
    else if (char === '"') parseString();
    else parseScalar();
  }

  skipWhitespace();
  parseValue();
  skipWhitespace();
  if (index !== text.length) fail('unexpected trailing content');
  return JSON.parse(text);
}

module.exports = { parseJsonStrict };

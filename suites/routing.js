'use strict';

// Routing suite: scoring proxy for the LLM-based agent picker.
// For each case (prompt + expected agent), score every agent's description
// with IDF-weighted recall against the prompt. Pass = expected agent ranks
// first AND has strictly positive margin over runner-up (a tie at the top
// could go either way through the LLM picker, so it's treated as a fail).
//
// Plus an overlap audit: any pair of agents whose descriptions exceed
// Jaccard 0.20 is informational by default, BLOCKING under --strict.

const { tokenize, jaccard, buildIDF, weightedRecall } = require('../lib/text');

function routingSuite(agents, cases) {
  const agentTokens = new Map(agents.map(a => [a.name, tokenize(a.description)]));
  const idf = buildIDF(agents);
  const results = [];
  for (const c of cases) {
    const promptTokens = tokenize(c.prompt);
    const scored = agents.map(a => ({
      agent: a.name,
      score: weightedRecall(promptTokens, agentTokens.get(a.name), idf),
    })).sort((x, y) => y.score - x.score);
    const top = scored[0];
    const second = scored[1] || { score: 0 };
    const absMargin = top.score - second.score;
    const relRatio = second.score > 0 ? top.score / second.score : Infinity;
    const pass = top.agent === c.expect_agent && absMargin > 0;
    results.push({
      id: c.id,
      expected: c.expect_agent,
      got: top.agent,
      score: top.score,
      margin: absMargin,
      ratio: relRatio,
      runner_up: second.agent,
      pass,
    });
  }
  return results;
}

function overlapAudit(agents, threshold = 0.20) {
  const tok = new Map(agents.map(a => [a.name, tokenize(a.description)]));
  const pairs = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const s = jaccard(tok.get(agents[i].name), tok.get(agents[j].name));
      if (s >= threshold) pairs.push({ a: agents[i].name, b: agents[j].name, score: s });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

module.exports = { routingSuite, overlapAudit };

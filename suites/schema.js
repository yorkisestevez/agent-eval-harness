'use strict';

// Schema suite: agents declare a structured-output return contract.
//   - body has a "## Return contract" section OR a "must be JSON" instruction
//   - body declares the JSON shape in one of three forms: ```json fenced block,
//     a single-line backticked example with balanced braces, or a Schema-fields
//     bullet list.
//
// Plus a fence audit: agents using ```json INSIDE the Return contract section
// can provoke fence-mimicry in some LLMs (response wraps the JSON in fences,
// breaking naive JSON.parse). Informational by default; promoted to BLOCKING
// under --strict / threshold=1.0.

function schemaSuite(agents) {
  const results = [];
  for (const a of agents) {
    const hasReturnContract =
      /## Return contract/i.test(a.body) ||
      /response MUST be (a |the )?JSON/i.test(a.body) ||
      /Return JSON only:?/i.test(a.body) ||
      /your final response must be/i.test(a.body) ||
      /STRICT OUTPUT MODE/i.test(a.body);
    const hasJsonBlock =
      /```json[\s\S]*?```/m.test(a.body) ||
      /`\{[\s\S]*?\}`/m.test(a.body) ||
      /## Schema fields|Schema fields:/i.test(a.body);
    results.push({
      agent: a.name,
      pass: hasReturnContract && hasJsonBlock,
      detail: !hasReturnContract ? 'no return-contract section'
            : !hasJsonBlock ? 'no JSON shape declaration'
            : 'ok',
    });
  }
  return results;
}

function fenceAudit(agents) {
  const offenders = [];
  for (const a of agents) {
    const m = a.body.match(/##\s*Return contract[\s\S]*$/i);
    const tail = m ? m[0] : '';
    if (/```json[\s\S]*?```/m.test(tail)) offenders.push(a.name);
  }
  return offenders;
}

module.exports = { schemaSuite, fenceAudit };

# Agent Eval Harness

> Your agent prompts are code. Test them like code.

[![CI](https://github.com/yorkisestevez/agent-eval-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/yorkisestevez/agent-eval-harness/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/agent-eval-harness.svg)](https://www.npmjs.com/package/agent-eval-harness)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

**Agent Eval Harness** is a zero-dependency CI harness for Markdown-defined AI agents. It catches invalid metadata, routing collisions, output-contract drift, and broken recorded fixtures before they reach an orchestrator.

The npm package and CLI retain the original name: `agent-eval-harness` / `agent-eval`.

## The failure mode it prevents

Agent collections drift as they grow:

- descriptions overlap until the router picks the wrong specialist
- an agent loses its explicit “use when…” trigger
- tool access expands without review
- output examples stop matching downstream schemas
- JSON fences and prose break strict callers
- an agent definition behaves differently on Windows because line endings changed

Agent Eval Harness turns those failures into a deterministic CI exit code.

## Start in 30 seconds

```bash
mkdir agent-spec-demo && cd agent-spec-demo
npm init -y
npm install --save-dev agent-eval-harness
npx agent-eval --init
npx agent-eval --threshold=1.0 --strict
```

`--init` creates a passing reference project:

```text
agent-eval.config.json
agents/sample-agent.md
_evals/cases.jsonl
_evals/schemas.json
_evals/fixtures/sample-agent.txt
```

Point the config at your own agent directory, replace the sample fixtures, and commit it beside your agents.

## Add it to GitHub Actions

```yaml
name: Agent specs

on:
  pull_request:
    paths:
      - "agents/**"
      - "_evals/**"
      - "agent-eval.config.json"

permissions:
  contents: read

jobs:
  agentspec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: yorkisestevez/agent-eval-harness@v0.2.0
        with:
          config: agent-eval.config.json
          threshold: "1.0"
          strict: "true"
```

For higher supply-chain assurance, pin the action to a full commit SHA.

## What it checks

| Suite | Failure caught |
|---|---|
| **Static** | missing or malformed metadata, filename/name mismatch, invalid or excessive tools, missing trigger, missing scope/refusal rules, recursive agent calls |
| **Schema** | missing return contract or undeclared JSON shape |
| **Routing** | expected agent does not rank first or has zero margin over the runner-up |
| **Spawn fixture** | recorded output cannot be extracted or violates required fields, primitive types, enums, or nested shape |
| **Fence audit** | JSON fences in return contracts that models may imitate |
| **Overlap audit** | agent descriptions with high Jaccard overlap |

`--strict` promotes fence, overlap, and missing-fixture findings from informational to blocking.

## Agent format

```markdown
---
name: code-reviewer
description: Use when a pull request needs an independent security and logic review.
tools: Read, Grep, Glob
---

## Scope

Review the supplied diff. Do not modify files.

## Return contract

Return JSON only.

Schema fields:
- `passed`: boolean
- `security_concerns`: array
- `logic_errors`: array
```

The parser accepts LF and CRLF line endings. Keep frontmatter values on one line.

## Configuration

Paths are resolved relative to the config file, not the shell's current directory.

```json
{
  "agentSourceDir": "./agents",
  "fixturesDir": "./_evals/fixtures",
  "schemasFile": "./_evals/schemas.json",
  "casesFile": "./_evals/cases.jsonl",
  "validTools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "WebSearch", "WebFetch", "NotebookEdit", "Task"],
  "minDescriptionChars": 40,
  "maxTools": 5,
  "defaultThreshold": 0.85
}
```

Select a config with `--config=path/to/agent-eval.config.json` or `AGENT_EVAL_CONFIG`.

## CLI

```text
agent-eval [options]

--config=<path>      explicit config file
--threshold=<0..1>   minimum total score
--strict             make informational audits blocking
--static             run static checks only
--schema             run schema checks only
--routing            run routing checks only
--spawn              run fixture-contract checks only
--all                run every suite
--verbose            print passing checks
--json               append structured failure details
--init               scaffold a sample project
--help               show help
```

Exit codes:

- `0` — score met the threshold
- `1` — runtime/configuration error
- `2` — checks completed below threshold

## Routing cases

Use JSONL with one expected route per prompt:

```jsonl
{"id":"security-review","prompt":"audit this authentication diff for vulnerabilities","expect_agent":"code-reviewer"}
```

Routing uses deterministic IDF-weighted recall over descriptions. It is an early-warning proxy for an LLM router, not a claim that it reproduces every model's decision.

## Fixture contracts

A fixture is a recorded agent response at `_evals/fixtures/<agent-name>.txt`. It may contain raw JSON, fenced JSON, or surrounding prose. The harness extracts the first balanced JSON value and validates it against `_evals/schemas.json`.

```json
{
  "code-reviewer": {
    "required": ["passed", "security_concerns", "logic_errors"],
    "types": {
      "passed": "boolean",
      "security_concerns": "array",
      "logic_errors": "array"
    }
  }
}
```

Agent Eval Harness does **not** execute agents or regenerate fixtures. That is deliberate: CI stays local, deterministic, credential-free, and safe to run on pull requests.

## Library API

```js
const {
  loadConfig,
  loadAgents,
  staticSuite,
  schemaSuite,
  routingSuite,
  spawnSuite,
  extractJson,
} = require('agent-eval-harness');

const config = loadConfig({ configPath: './agent-eval.config.json' });
const agents = loadAgents(config.agentSourceDir);
const staticResults = staticSuite(agents, config);
```

## Security and privacy

The core package:

- has zero runtime dependencies
- reads only the local paths selected by its config
- makes no network requests
- does not invoke agents
- does not execute fixture content
- does not require API keys

See [SECURITY.md](SECURITY.md) for reporting and the complete security model.

## Limits

- Frontmatter parsing intentionally supports simple one-line values, not full YAML folded scalars.
- The default tool allowlist is Claude Code-oriented but configurable.
- The English stemmer is not a multilingual semantic router.
- Fixture validation supports a focused contract shape, not the complete JSON Schema specification.
- Routing is a deterministic regression signal, not a live model evaluation.

## Contributing

Run:

```bash
npm ci
npm test
```

Changes must remain cross-platform and include a failing regression test first. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © Yorkis Estevez

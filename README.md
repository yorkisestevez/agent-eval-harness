# agent-eval-harness

Static + schema + routing + spawn-fixture eval harness for `*.md` subagent definitions.

Drop a directory of agents (Claude Code subagents, or any markdown-frontmatter agents) into a project, point the harness at it, and get a 100-point lint that catches description bloat, scope drift, fence-mimicry traps, low routing margin, and schema regressions before they ship.

## Quick start

```bash
# In a fresh directory
node /path/to/agent-eval-harness/cli.js --init
node /path/to/agent-eval-harness/cli.js --threshold=1.0
```

`--init` scaffolds `agents/`, `_evals/`, and an `agent-eval.config.json`. The sample agent passes 100% out of the box — copy its shape for your own.

## What it checks

| Suite | Per-agent | What it catches |
|---|---|---|
| **static** | 8 checks | missing name/description, too many tools, invalid tool names, file-name mismatch, missing trigger ("use when..."), no Scope/Hard-rules section, agent calls itself recursively |
| **schema** | 1 check + fence audit | no Return Contract section, no JSON shape declared, ` ```json ` fence inside Return Contract (provokes mimicry in some LLMs) |
| **routing** | N cases + overlap audit | wrong agent ranks first for a given prompt, zero margin between top two, two descriptions overlap ≥0.20 Jaccard |
| **spawn** | M schema-bound agents | fixture in `fixtures/<name>.txt` doesn't parse as JSON, missing required fields, type mismatches, enum violations |

Strict mode (`--strict` or `--threshold=1.0`) promotes the fence audit, overlap audit, and missing-fixture from informational to blocking.

## Config

`agent-eval.config.json` — paths and thresholds. Resolved relative to the config file's directory:

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

Override paths via `--config=path/to/cfg.json` or `AGENT_EVAL_CONFIG` env var.

## Library use

```js
const { loadConfig, loadAgents, staticSuite, schemaSuite, routingSuite, spawnSuite } = require('agent-eval-harness');

const config = loadConfig({ configPath: './agent-eval.config.json' });
const agents = loadAgents(config.agentSourceDir);
const results = staticSuite(agents, config);
// ... render however you want
```

## Schema file shape

```json
{
  "<agent-name>": {
    "required": ["field1", "field2"],
    "types": { "field1": "string", "field2": "number" },
    "enums": { "field1": ["ok", "error"] },
    "nested": {
      "field2": { "required": ["sub1"], "types": { "sub1": "string" } }
    }
  }
}
```

## Cases file shape (cases.jsonl)

One JSON object per line:

```jsonl
{"id":"case-1","prompt":"some user prompt","expect_agent":"agent-name"}
```

## Fixture file shape

`fixtures/<agent-name>.txt` — a real recorded response from spawning the agent. Can include surrounding prose or fences; the harness extracts the JSON. Aim for one fixture per schema-bound agent.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Score ≥ threshold |
| 1 | Runtime error (config missing, file not found) |
| 2 | Score below threshold |

## License

MIT.

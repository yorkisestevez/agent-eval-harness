# Changelog

All notable changes to `agent-eval-harness` documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version policy: [SemVer](https://semver.org/) — major for breaking config/CLI changes, minor for new suites or check types, patch for bug fixes and tightened audits.

## [0.2.1] — 2026-08-01

### Security

- Reject non-finite, partial, negative, and greater-than-one thresholds instead of allowing values that could bypass the CI score gate.
- Parse and validate both `--threshold=value` and `--threshold value`; reject unknown arguments and missing option values.
- Reject explicit `defaultThreshold: null` configuration instead of silently replacing it with the built-in default.
- Reject non-object config roots, unknown config keys, and invalid config value types before merging defaults.
- Keep malformed Markdown agent files visible and fail their frontmatter check instead of silently discarding them.
- Reject duplicate frontmatter keys, malformed lines, malformed quoted scalars, flow collections, and multiline YAML values.
- Parse JSON-escaped double-quoted and doubled-single-quoted frontmatter scalars under LF and CRLF.
- Use own-property checks so inherited fixture properties cannot satisfy required/type/enum/nested contracts.
- Validate every root and nested schema node before fixture evaluation, including schemas without fixtures.
- Reject missing, empty, array, and primitive schema maps; strict mode requires at least one loaded agent, bidirectional agent/schema coverage, and fixtures for every schema.
- Reject path-like schema keys and verify lexical and real linked fixture paths remain inside the configured fixture directory.
- Reject empty per-agent schemas and require each required field to declare a type or nested contract.
- Reject missing routing case files and empty strict-mode case corpora; validate case shape and unique IDs.
- Reject `--help`/`--init` when combined with evaluation options instead of bypassing the gate.
- Reject repeated `--threshold` and `--config` options; threshold syntax is decimal-only.
- Reject duplicate object keys in configuration, routing-case, schema, and fixture JSON instead of accepting last-key-wins semantics.
- In strict mode, reject fixtures that exercise none of their schema's constrained fields.

### Fixed

- Reject `null` when a fixture schema requires a string.
- Reject primitive or null values when a nested fixture schema requires an object.
- Keep score thresholds independent from strict audit promotion; only `--strict` makes fence, overlap, and missing-fixture audits blocking.
- Reject invalid GitHub Action `strict` input values instead of treating them as false.

### Tests

- Added 24 regressions covering threshold and CLI-mode bypasses, duplicate JSON/option ambiguity, config and case-corpus validation, malformed-agent discovery, strict frontmatter, prototype-sensitive fields, malformed and vacuous schema nodes/fixtures, fixture path containment, null/nested type validation, bidirectional strict coverage, and strict-mode semantics.

## [0.2.0] — 2026-08-01

### Added

- Clear CI-first product positioning and a 30-second npm quick start.
- Reusable GitHub Action with configurable path, threshold, and strict mode.
- CI across Node 18/20/22 on Windows, Linux, and macOS.
- Clean npm pack/install/CLI smoke gate.
- Security policy and contribution workflow.

### Fixed

- Parse Markdown agent definitions with CRLF or LF line endings.
- Return a deterministic failed routing result when no valid agents load instead of throwing a `TypeError`.
- Use the active Node executable in the self-test for cross-platform reliability.

### Security

- Documented the local-only, no-network, no-agent-execution runtime model.

## [0.1.0] — 2026-05-09

Initial extraction from the in-tree harness at `~/.claude/agents/_evals/`.

### Added

- Library API at `index.js` — `loadConfig`, `loadAgents`, `loadCases`, `staticSuite`, `schemaSuite`, `fenceAudit`, `routingSuite`, `overlapAudit`, `spawnSuite`, `extractJson`, plus `text` helpers (stem, tokenize, jaccard, IDF, weighted-recall).
- CLI binary at `cli.js` — `agent-eval [--config=<path>] [--threshold=<n>] [--strict] [--static|--schema|--routing|--spawn|--all] [--verbose] [--json] [--init]`.
- Config loader at `lib/config.js` — JSON config with env-var override (`AGENT_EVAL_CONFIG`), defaults baked in, paths resolved relative to config file.
- `--init` scaffolder copying a working sample project (1 agent, 1 schema, 2 routing cases, 1 fixture) to cwd. Sample passes `--threshold=1.0`.
- README.md with quick-start, suite documentation, schema/case/fixture file shapes, and exit-code table.

### Suites

- **Static** (8 checks/agent): name, description length, tools count, tools whitelist, filename match, trigger phrasing, scope discipline, no recursion.
- **Schema** (1 check/agent + fence audit): return contract section + JSON shape declaration; flags ` ```json ` fences inside Return Contract sections (provoke mimicry on some LLMs).
- **Routing** (N cases + overlap audit): IDF-weighted recall ranks the right agent first with positive margin; flags description pairs ≥0.20 Jaccard.
- **Spawn** (M schema-bound agents): fixture parses as JSON, required fields present, types match, enums valid.

### Strict mode

`--strict` and `--threshold>=1.0` promote informational fence/overlap/no-fixture audits to blocking score-affecting checks.

### Known limitations

- Spawn suite is a recorded-fixture contract test, not a live spawn — Node can't invoke the Claude Code Task tool from a script. Fixtures must be captured manually (or by a separate spawn pipeline) and dropped into `fixtures/<name>.txt`.
- Stemmer is English-only. Non-English agent descriptions need a custom tokenizer.
- IDF is computed over agent descriptions, not a real corpus — small-N effects above ~30 agents may shift token weights.

## [Unreleased]

Planned:
- Live-spawn integration so the spawn suite can regenerate fixtures itself when an `--update-fixtures` flag is set (requires harness-side runner — out of scope for v0.1).
- Pluggable tokenizer for non-English agent definitions.
- Per-suite threshold (e.g. accept 95% routing + 100% static).

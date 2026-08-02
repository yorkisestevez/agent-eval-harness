# Contributing

Agent Eval Harness is intentionally small and dependency-free. Changes should preserve that property unless a dependency creates clear, measured value.

## Development

```bash
npm ci
npm test
```

Use Node.js 18 or newer. The CI matrix covers Windows, Linux, macOS, and active Node LTS releases.

## Pull requests

1. Open an issue for substantial behavior or config changes.
2. Add a failing regression test before changing production code.
3. Keep public behavior cross-platform; do not rely on POSIX-only environment syntax.
4. Run `npm test` and a clean package-install smoke before requesting review.
5. Update the README and changelog for user-visible changes.

## Scope

Good contributions improve deterministic checks for Markdown-defined agents, configuration portability, contract validation, routing diagnostics, or CI ergonomics.

Live model execution, hosted dashboards, secret management, and framework-specific orchestration are out of scope for the core package.

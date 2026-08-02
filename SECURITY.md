# Security Policy

## Supported versions

Security fixes are applied to the latest published release.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's **Report a vulnerability** flow under the repository Security tab.

Include:

- affected version and operating system
- minimal reproduction
- expected and actual behavior
- impact assessment
- any suggested mitigation

You should receive an acknowledgement within five business days.

## Security model

Agent Eval Harness reads local Markdown, JSON, JSONL, and fixture files selected by its configuration. It does not invoke agents, execute fixture contents, make network requests, or transmit repository data.

The GitHub Action runs the checked-in CLI against files in the workflow workspace. Pin releases by tag or commit SHA according to your organization's supply-chain policy.

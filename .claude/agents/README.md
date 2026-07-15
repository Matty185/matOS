# Agent sources

`security-reviewer.md`, `database-reviewer.md`, `code-reviewer.md`, `planner.md`, `architect.md`
are copied from [affaan-m/ECC](https://github.com/affaan-m/ECC) (MIT License, Copyright (c)
2026 Affaan Mustafa), commit `ed387446052dfbc6b52de149406b70efa65edc59`, unmodified.

Copied directly rather than installed via `install.sh`/`install.ps1` or the `/plugin marketplace`
route: the upstream repo bundles a much larger surface (67+ agents, auto-loading hooks, MCP server
configs, a Python dashboard) than CLAUDE.md's stated need of five reviewer/planning agents, and its
installer modifies the _global_ `~/.claude` config. These five files are plain prompt definitions
with read-only tool access (`Read`, `Grep`, `Glob`, optionally `Bash`) and no hooks or MCP
dependencies, so they were copied in as-is, scoped to this project only.

If a future stage needs more of ECC's suite, re-evaluate the full installer deliberately rather
than expanding this copy ad hoc.

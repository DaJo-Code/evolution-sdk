# @evolution-sdk/devtools-mcp

MCP server for AI coding agents working with Evolution SDK.

It gives agents compact, source-backed context for this monorepo without dumping the whole repository into the model context. The server generates its knowledge from package manifests, public entrypoints, docs, specs, examples, and tests.

## Run

From the repo root:

```bash
pnpm --filter @evolution-sdk/devtools-mcp build
EVOLUTION_SDK_ROOT=/home/dajo-code/evolution-sdk pnpm --filter @evolution-sdk/devtools-mcp start
```

After publishing or linking the package:

```bash
EVOLUTION_SDK_ROOT=/home/dajo-code/evolution-sdk evolution-devtools-mcp
```

`EVOLUTION_SDK_ROOT` is optional when the command is launched from inside the repository.

## Package as MCPB

This server is a local stdio MCP server, so it can also ship as an MCPB bundle for users who want a one-file local install:

```bash
pnpm --filter @evolution-sdk/devtools-mcp build
pnpm --filter @evolution-sdk/devtools-mcp mcpb:validate
pnpm --filter @evolution-sdk/devtools-mcp mcpb:pack
```

The installer asks for the Evolution SDK repository root and passes it to the server as `EVOLUTION_SDK_ROOT`. Always rebuild before packing; the MCPB bundle runs the staged `server/bin.js`, not the TypeScript source.

## Agent Workflow

Use the tools in this order:

1. `evolution_repo_overview`
2. `evolution_package_guide`
3. `evolution_search_context`
4. `evolution_read_context`
5. `evolution_workflow_guide`
6. `evolution_verification_guide`

This keeps context small: tools return compact summaries first, and exact file contents only through explicit line-bounded reads.

## Tools

- `evolution_repo_overview`: generated package/workflow/index map.
- `evolution_package_guide`: package purpose, import path, modules, docs, tests, and caveats.
- `evolution_search_context`: search packages, modules, docs, specs, examples, tests, and workflows.
- `evolution_read_context`: safe repo-relative file slicing by search result id or path.
- `evolution_find_symbol`: resolve a symbol, module, method, or workflow to source-backed matches.
- `evolution_import_guide`: package and deep import guidance with platform caveats.
- `evolution_workflow_guide`: steps, pitfalls, files, and verification for common app-development workflows.
- `evolution_verification_guide`: targeted package/root verification commands.

## Design

- Local stdio MCP server using the official TypeScript MCP SDK.
- No duplicated long-form SDK manual in the MCP package.
- No broad file reads by default.
- Path reads are restricted to the repository root and ignore generated directories such as `dist`, `.next`, `.turbo`, and `node_modules`.
- MCPB packaging stages `manifest.json` plus a bundled `server/bin.js`; keep generated package output fresh before publishing or bundling.

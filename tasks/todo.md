# Devtools MCP Plan

## Goal

Build `packages/devtools-mcp`: a low-maintenance, token-efficient stdio MCP server that gives AI coding agents precise context for using and developing Evolution SDK packages.

## Design Decisions

- Deployment: local stdio package inside the monorepo; MCPB packaging can be added later if distribution needs a one-file bundle.
- Framework: official TypeScript MCP SDK.
- Tool pattern: hybrid. Keep top-level tools under a small count; use search/read workflows for broad repo knowledge.
- Maintenance model: generate context from package manifests, public entrypoints, docs, specs, examples, and tests at build/runtime instead of hardcoding huge docs.
- Token model: return compact summaries first; require explicit follow-up reads for larger files or snippets.

## Implementation Checklist

- [x] Inspect package APIs, docs, examples, and build conventions.
- [x] Add `packages/devtools-mcp` workspace package with TypeScript build/test/lint scripts.
- [x] Implement repo-aware knowledge index generation for packages, docs, specs, examples, tests, and public exports.
- [x] Implement MCP tools: overview, package guide, search, read context, import guidance, workflow guidance, and verification guidance.
- [x] Add tests for indexing, path safety, token-efficient slicing, and tool responses.
- [x] Wire package into root TypeScript references if needed.
- [x] Run build/type-check/lint/test verification for the new package.
- [x] Review implementation for simplicity and maintenance burden.

## Review

- WSL runtime installed with user-level nvm: Node v24.16.0, npm 11.13.0, pnpm available. Passwordless sudo is enabled.
- Root `packageManager` updated to `pnpm@9.15.9`; `pnpm install` now succeeds using the repo pin with no Corepack override. This avoids the pnpm 9.0.0 esbuild optional dependency symlink issue hit during install.
- Targeted package verification passed:
  - `pnpm --filter @evolution-sdk/devtools-mcp type-check`
  - `pnpm --filter @evolution-sdk/devtools-mcp lint`
  - `pnpm --filter @evolution-sdk/devtools-mcp test`
  - `pnpm --filter @evolution-sdk/devtools-mcp build`
- Root TypeScript reference verification passed:
  - `pnpm exec tsc -b tsconfig.json`
  - `pnpm exec tsc -b tsconfig.build.json`
- MCP stdio smoke tests passed: initialize, tools/list, `evolution_search_context`, and `evolution_find_symbol` tool calls returned valid JSON-RPC responses from `node packages/devtools-mcp/dist/bin.js`.
- Generated build artifacts were removed after verification. The package-local `node_modules/` symlink tree remains ignored by Git because pnpm needs it for workspace package module resolution.

## Quality Audit Checklist

- [x] Refresh task context and Claude MCP constraints for `packages/devtools-mcp`.
- [x] Run independent audits for MCP UX/tool design, code quality, and security/protocol safety.
- [x] Locally audit repo-surface coverage across packages, docs, specs, examples, tests, and workflows.
- [x] Implement focused fixes for material findings while keeping the stdio/MCPB-ready package shape.
- [x] Re-run install/build/type-check/lint/test and stdio smoke verification.
- [x] Record final quality-audit results and residual risks.

## Quality Audit Review

- MCP UX/tool-design fixes:
  - `evolution_search_context` now accepts the same package-name forms as `evolution_package_guide`, including trimmed slugs such as `evolution`.
  - `evolution_workflow_guide` now returns full detail for an exact or single fuzzy full-detail match, and returns exact retry IDs for ambiguous full-detail queries.
  - Unknown-package structured recovery and `structuredContent` responses remain possible follow-ups; current JSON text output is kept for compatibility with the existing smoke-tested clients.
- Code quality fixes:
  - Package and verification lookups now trim user-facing inputs.
  - Aiken and Scalus UPLC package guides no longer include each other's package-local changelogs while still sharing common UPLC docs.
- Security/protocol fixes:
  - `evolution_read_context` keeps character-bounded slices contiguous and truncates oversized lines with a `lineTruncated` marker instead of exceeding `maxChars` or skipping ahead.
  - MCPB packaging now stages a bundled `server/bin.js` instead of relying on pnpm-linked `node_modules`.
- MCPB packaging:
  - Added `packages/devtools-mcp/manifest.json` with a required `evolutionSdkRoot` directory picker mapped to `EVOLUTION_SDK_ROOT`.
  - Added `mcpb:validate`, `mcpb:stage`, and `mcpb:pack` scripts.
  - `pnpm --filter @evolution-sdk/devtools-mcp mcpb:pack` produced `packages/devtools-mcp/dist/evolution-devtools-mcp.mcpb`; `mcpb info` reports it is unsigned, which is expected until release signing.
- Verification passed on 2026-06-03:
  - `pnpm --filter @evolution-sdk/devtools-mcp type-check`
  - `pnpm --filter @evolution-sdk/devtools-mcp lint`
  - `pnpm --filter @evolution-sdk/devtools-mcp test` (16 tests)
  - `pnpm --filter @evolution-sdk/devtools-mcp build`
  - `pnpm --filter @evolution-sdk/devtools-mcp mcpb:validate`
  - `pnpm --filter @evolution-sdk/devtools-mcp mcpb:stage`
  - `pnpm --filter @evolution-sdk/devtools-mcp mcpb:pack`
  - `pnpm exec tsc -b tsconfig.json`
  - `pnpm exec tsc -b tsconfig.build.json`
  - JSON-RPC smoke tests against `packages/devtools-mcp/dist/bin.js`, the staged `.mcpb-build/server/bin.js`, and an unpacked `dist/evolution-devtools-mcp.mcpb` server.

#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { resolveRepoRoot } from "./repo.js"
import { createEvolutionDevtoolsMcpServer } from "./server.js"

try {
  const root = await resolveRepoRoot()
  const server = await createEvolutionDevtoolsMcpServer(root)
  await server.connect(new StdioServerTransport())
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`evolution-devtools-mcp failed to start: ${message}\n`)
  process.exitCode = 1
}

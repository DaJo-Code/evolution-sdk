import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { importGuide, packageGuide, verificationGuide } from "./guides.js"
import { buildKnowledgeIndex } from "./indexer.js"
import { readFileSlice } from "./repo.js"
import { findEntry, searchKnowledge } from "./search.js"
import type { EntryKind, KnowledgeIndex } from "./types.js"

const SERVER_VERSION = "0.1.0"

const EntryKindSchema = z.enum(["config", "doc", "example", "module", "package", "spec", "test", "workflow"])

export async function createEvolutionDevtoolsMcpServer(root: string): Promise<McpServer> {
  const index = await buildKnowledgeIndex(root)
  const server = new McpServer(
    {
      name: "evolution-devtools-mcp",
      version: SERVER_VERSION
    },
    {
      instructions:
        "Use this server to gather compact, source-backed Evolution SDK context. Start with evolution_repo_overview, then search or read exact files. Prefer package/workflow/import guides before generating code."
    }
  )

  registerResources(server, index)
  registerTools(server, index)

  return server
}

function registerResources(server: McpServer, index: KnowledgeIndex): void {
  server.registerResource(
    "Evolution SDK overview",
    "evolution-sdk://overview",
    {
      description: "Compact generated overview of packages, workflows, and indexed context counts.",
      mimeType: "application/json",
      title: "Evolution SDK Overview"
    },
    async (uri) => ({
      contents: [
        {
          mimeType: "application/json",
          text: JSON.stringify(repoOverview(index)),
          uri: uri.href
        }
      ]
    })
  )
}

function registerTools(server: McpServer, index: KnowledgeIndex): void {
  server.registerTool(
    "evolution_repo_overview",
    {
      annotations: { readOnlyHint: true, title: "Evolution SDK Repo Overview" },
      description:
        "Return a compact map of Evolution SDK packages, workflows, indexed context, and the best next MCP calls. Use this first.",
      inputSchema: {}
    },
    async () => jsonResult(repoOverview(index))
  )

  server.registerTool(
    "evolution_package_guide",
    {
      annotations: { readOnlyHint: true, title: "Evolution SDK Package Guide" },
      description:
        "Return package-specific guidance: purpose, import path, public modules, docs, tests, and usage caveats.",
      inputSchema: {
        includeExports: z
          .boolean()
          .optional()
          .describe("Include export previews per public module. Defaults to false to save tokens."),
        maxModules: z
          .number()
          .int()
          .min(5)
          .max(80)
          .optional()
          .describe("Maximum public modules to return. Defaults to 12 to keep responses compact."),
        moduleQuery: z.string().optional().describe("Optional module/export filter, e.g. Data, Client, Address."),
        offset: z.number().int().min(0).optional().describe("Pagination offset for publicModules."),
        packageName: z
          .string()
          .describe("Package name or fuzzy package key, such as @evolution-sdk/evolution, devnet, aiken, or scalus.")
      }
    },
    async ({ includeExports, maxModules, moduleQuery, offset, packageName }) =>
      jsonResult(packageGuide(index, packageName, { includeExports, maxModules, moduleQuery, offset }))
  )

  server.registerTool(
    "evolution_search_context",
    {
      annotations: { readOnlyHint: true, title: "Search Evolution SDK Context" },
      description:
        "Search packages, public modules, docs, specs, examples, tests, and workflows. Returns compact results; call evolution_read_context for exact source.",
      inputSchema: {
        kind: EntryKindSchema.optional().describe("Optional context kind filter."),
        limit: z.number().int().min(1).max(30).optional().describe("Maximum results. Defaults to 10."),
        packageName: z.string().optional().describe("Optional package filter, e.g. @evolution-sdk/evolution."),
        query: z.string().describe("Natural-language topic, symbol, workflow, package, or file search query.")
      }
    },
    async ({ kind, limit, packageName, query }) =>
      jsonResult({
        query,
        results: searchKnowledge(index, {
          kind: kind as EntryKind | undefined,
          limit,
          packageName,
          query
        })
      })
  )

  server.registerTool(
    "evolution_read_context",
    {
      annotations: { readOnlyHint: true, title: "Read Evolution SDK Context" },
      description:
        "Read a safe, line-bounded slice of a repository file by search result id or repo path. Use for exact signatures and examples after search.",
      inputSchema: {
        idOrPath: z.string().describe("Search result id or repo-relative path to read."),
        maxChars: z.number().int().min(1_000).max(80_000).optional().describe("Maximum characters to return."),
        maxLines: z.number().int().min(1).max(400).optional().describe("Maximum lines to return. Defaults to 80."),
        startLine: z.number().int().min(1).optional().describe("1-based start line. Defaults to 1.")
      }
    },
    async ({ idOrPath, maxChars, maxLines, startLine }) => {
      const entry = findEntry(index, idOrPath)
      const path = entry?.path ?? idOrPath
      return jsonResult(await readFileSlice(index.root, path, startLine, maxLines, maxChars))
    }
  )

  server.registerTool(
    "evolution_find_symbol",
    {
      annotations: { readOnlyHint: true, title: "Find Evolution SDK Symbol" },
      description:
        "Resolve a symbol, builder method, module, or workflow to matching source files, docs, tests, exports, and import paths.",
      inputSchema: {
        limit: z.number().int().min(1).max(30).optional().describe("Maximum results. Defaults to 12."),
        symbol: z
          .string()
          .describe("Symbol, method, module, type, or workflow name, such as payToAddress or Data.withSchema.")
      }
    },
    async ({ limit, symbol }) =>
      jsonResult({
        importGuidance: importGuide(index, symbol),
        results: searchKnowledge(index, {
          limit: limit ?? 12,
          query: symbol
        }),
        symbol
      })
  )

  server.registerTool(
    "evolution_import_guide",
    {
      annotations: { readOnlyHint: true, title: "Evolution SDK Import Guide" },
      description:
        "Explain correct package and deep import paths for an Evolution SDK package, module, or symbol, including Node/browser caveats.",
      inputSchema: {
        symbolOrPackage: z.string().describe("Package, namespace, module, or symbol to import.")
      }
    },
    async ({ symbolOrPackage }) => jsonResult(importGuide(index, symbolOrPackage))
  )

  server.registerTool(
    "evolution_workflow_guide",
    {
      annotations: { readOnlyHint: true, title: "Evolution SDK Workflow Guide" },
      description:
        "Return source-backed steps, related files, pitfalls, and verification commands for common Evolution SDK app-development workflows.",
      inputSchema: {
        detail: z
          .enum(["summary", "full"])
          .optional()
          .describe("Return compact summaries or full workflow details. Defaults to summary."),
        limit: z.number().int().min(1).max(20).optional().describe("Maximum workflow matches. Defaults to 10."),
        workflow: z.string().optional().describe("Workflow id or search text. Omit to list available workflows.")
      }
    },
    async ({ detail, limit, workflow }) => {
      if (workflow === undefined || workflow.trim() === "") {
        return jsonResult({
          workflows: index.workflows.map((item) => ({
            id: item.id,
            intent: item.intent,
            packages: item.packages,
            title: item.title
          }))
        })
      }

      const lower = workflow.toLowerCase()
      const matches = index.workflows.filter(
        (item) =>
          item.id.includes(lower) ||
          item.title.toLowerCase().includes(lower) ||
          item.intent.toLowerCase().includes(lower) ||
          item.packages.some((packageName) => packageName.toLowerCase().includes(lower))
      )
      const limitedMatches = matches.slice(0, limit ?? 10)
      const exactMatch = matches.find((item) => item.id === lower)
      const shouldReturnFullDetails =
        detail === "full" && (exactMatch !== undefined || matches.length === 1) && limitedMatches.length > 0

      return jsonResult({
        detail: detail ?? "summary",
        matches: shouldReturnFullDetails
          ? limitedMatches
          : limitedMatches.map((item) => ({
                id: item.id,
                intent: item.intent,
                packages: item.packages,
                relatedPaths: item.relatedPaths.slice(0, 5),
                title: item.title
              })),
        next: shouldReturnFullDetails
          ? undefined
          : `Call evolution_workflow_guide with an exact workflow id and detail: "full". Matching ids: ${limitedMatches
              .map((item) => item.id)
              .join(", ")}`,
        workflow
      })
    }
  )

  server.registerTool(
    "evolution_verification_guide",
    {
      annotations: { readOnlyHint: true, title: "Evolution SDK Verification Guide" },
      description:
        "Return targeted package and root verification commands for a change area, including prerequisites and workflow-specific checks.",
      inputSchema: {
        area: z.string().optional().describe("Package, workflow, or topic being changed. Omit for whole-repo guidance.")
      }
    },
    async ({ area }) => jsonResult(verificationGuide(index, area))
  )
}

function repoOverview(index: KnowledgeIndex) {
  const entriesByKind = index.entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.kind] = (counts[entry.kind] ?? 0) + 1
    return counts
  }, {})

  return {
    entriesByKind,
    generatedAt: index.generatedAt,
    indexedEntries: index.entries.length,
    nextCalls: [
      "evolution_package_guide({ packageName }) for package-specific context.",
      "evolution_search_context({ query }) for docs, tests, examples, modules, and specs.",
      "evolution_read_context({ idOrPath }) for exact source after search.",
      "evolution_workflow_guide({ workflow }) before generating app or SDK code.",
      "evolution_verification_guide({ area }) before deciding a change is done."
    ],
    packages: index.packages.map((packageSummary) => ({
      description: packageSummary.description,
      entrypoints: packageSummary.entrypoints,
      name: packageSummary.name,
      path: packageSummary.path,
      version: packageSummary.version
    })),
    toolDesign: {
      maintenance: "Generated from package manifests, public entrypoints, docs, specs, examples, and tests.",
      tokenModel: "Compact summaries first; exact files are only returned through explicit line-bounded reads."
    },
    workflows: index.workflows.map((workflow) => ({
      id: workflow.id,
      packages: workflow.packages,
      title: workflow.title
    }))
  }
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        text: JSON.stringify(value),
        type: "text" as const
      }
    ]
  }
}

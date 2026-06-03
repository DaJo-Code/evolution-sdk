import type { KnowledgeEntry, KnowledgeIndex, PackageSummary } from "./types.js"

export interface PackageGuideOptions {
  readonly includeExports?: boolean
  readonly maxModules?: number
  readonly moduleQuery?: string
  readonly offset?: number
}

export function packageGuide(index: KnowledgeIndex, packageName: string, options: PackageGuideOptions = {}) {
  const packageSummary = findPackage(index, packageName)
  const maxModules = Math.min(80, Math.max(5, options.maxModules ?? 12))
  const offset = Math.max(0, options.offset ?? 0)
  const moduleQuery = options.moduleQuery?.trim().toLowerCase()
  const publicModules = index.entries
    .filter((entry) => entry.kind === "module" && entry.packageName === packageSummary.name)
    .filter((entry) => entry.importPath !== undefined)
    .filter((entry) => {
      if (moduleQuery === undefined || moduleQuery === "") return true
      return [entry.title, entry.path, entry.importPath, ...(entry.exports ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(moduleQuery)
    })
    .sort((a, b) => a.title.localeCompare(b.title))
  const sourceContextCount = index.entries.filter(
    (entry) => entry.kind === "module" && entry.packageName === packageSummary.name && entry.importPath === undefined
  ).length

  const docs = index.entries
    .filter((entry) => entry.kind === "doc" && packageDocsMatch(packageSummary.name, entry.path))
    .filter((entry) => /\.(md|mdx)$/.test(entry.path))
    .slice(0, 20)

  const tests = index.entries
    .filter((entry) => entry.kind === "test" && entry.packageName === packageSummary.name)
    .filter((entry) => /\.(test|spec)\.tsx?$/.test(entry.path))
    .slice(0, 20)

  return {
    docs: docs.map((entry) => pickEntry(entry)),
    importPath: packageSummary.name,
    moduleQuery: options.moduleQuery,
    package: packageSummary,
    publicModuleCount: publicModules.length,
    publicModuleOffset: offset,
    publicModules: publicModules.slice(offset, offset + maxModules).map((entry) => ({
      ...(options.includeExports === true ? { exports: entry.exports?.slice(0, 24) ?? [] } : {}),
      exportCount: entry.exports?.length ?? 0,
      importPath: entry.importPath,
      path: entry.path,
      summary: entry.summary,
      title: entry.title
    })),
    publicModulesTruncated: publicModules.length > offset + maxModules,
    publicModulesNextOffset: publicModules.length > offset + maxModules ? offset + maxModules : undefined,
    sourceContextCount,
    tests: tests.map((entry) => pickEntry(entry)),
    tokenAdvice:
      publicModules.length > offset + maxModules
        ? "Public module list is paginated and exports are hidden by default. Use publicModulesNextOffset, moduleQuery, includeExports, evolution_search_context, or evolution_read_context for more detail."
        : "Exports are hidden by default. Use includeExports for module export previews or evolution_read_context for exact source.",
    usageAdvice: usageAdvice(packageSummary)
  }
}

export function importGuide(index: KnowledgeIndex, symbolOrPackage: string) {
  const normalizedQuery = symbolOrPackage.toLowerCase()
  const exactPackage = index.packages.find((packageSummary) => packageSummary.name.toLowerCase() === normalizedQuery)
  const matchingModules = index.entries
    .filter((entry) => entry.kind === "module")
    .map((entry) => ({ entry, matchType: importMatchType(entry, normalizedQuery) }))
    .filter((match): match is ImportMatch => match.matchType !== undefined)

  return {
    caveats: [
      "Workspace development exports source TypeScript; published packages switch publishConfig exports to dist JavaScript.",
      "Use package entrypoint namespace imports for exploration. Use documented deep imports only when the package exports them.",
      "@evolution-sdk/aiken-uplc has node and browser conditional exports.",
      "@evolution-sdk/scalus-uplc is Node-oriented; the browser entry currently throws."
    ],
    exactPackage,
    exactMatches: matchingModules
      .filter((match) => match.matchType !== "related")
      .sort((a, b) => importMatchRank(a.matchType) - importMatchRank(b.matchType))
      .slice(0, 12)
      .map(({ entry, matchType }) => ({
        exports: entry.exports?.slice(0, 30) ?? [],
        importPath: entry.importPath,
        matchType,
        packageName: entry.packageName,
        path: entry.path,
        sourceOnly: entry.importPath === undefined,
        title: entry.title
      })),
    query: symbolOrPackage,
    recommendedPattern:
      exactPackage !== undefined
        ? `import * as SDK from "${exactPackage.name}"`
        : "Use exactMatches with importPath first. Matches marked sourceOnly are context, not public import recommendations.",
    relatedMatches: matchingModules
      .filter((match) => match.matchType === "related")
      .slice(0, 12)
      .map(({ entry, matchType }) => ({
        exports: entry.exports?.slice(0, 30) ?? [],
        importPath: entry.importPath,
        matchType,
        packageName: entry.packageName,
        path: entry.path,
        sourceOnly: entry.importPath === undefined,
        title: entry.title
      }))
  }
}

export function verificationGuide(index: KnowledgeIndex, area?: string) {
  const normalizedArea = area?.trim()
  const lowerArea = normalizedArea === undefined || normalizedArea === "" ? undefined : normalizedArea.toLowerCase()
  const matchingPackage = index.packages.find(
    (packageSummary) =>
      lowerArea !== undefined &&
      (packageSummary.name.toLowerCase().includes(lowerArea) || packageSummary.path.toLowerCase().includes(lowerArea))
  )
  const matchingWorkflows = index.workflows.filter(
    (workflow) =>
      lowerArea === undefined ||
      workflow.id.includes(lowerArea) ||
      workflow.title.toLowerCase().includes(lowerArea) ||
      workflow.packages.some((packageName) => packageName.toLowerCase().includes(lowerArea))
  )

  const packageCommands =
    matchingPackage === undefined
      ? []
      : [
          `pnpm --filter ${matchingPackage.name} type-check`,
          `pnpm --filter ${matchingPackage.name} lint`,
          `pnpm --filter ${matchingPackage.name} test`,
          `pnpm --filter ${matchingPackage.name} build`
        ]

  return {
    area: normalizedArea === undefined || normalizedArea === "" ? "whole repository" : normalizedArea,
    packageCommands,
    prerequisites: [
      "Run from the repository root or set EVOLUTION_SDK_ROOT.",
      "Use pnpm through the repo package manager. In this WSL session, source nvm first if node is not on PATH.",
      "Docker is required for devnet integration tests."
    ],
    rootCommands: ["pnpm type-check", "pnpm lint", "pnpm test", "pnpm build", "pnpm verify"],
    workflowCommands: matchingWorkflows.flatMap((workflow) => workflow.verification),
    workflowMatches: matchingWorkflows.map((workflow) => ({
      id: workflow.id,
      title: workflow.title
    }))
  }
}

function findPackage(index: KnowledgeIndex, packageName: string): PackageSummary {
  const normalizedPackageName = packageName.trim()
  const exact = index.packages.find((summary) => summary.name === normalizedPackageName)
  if (exact !== undefined) {
    return exact
  }

  const lower = normalizedPackageName.toLowerCase()
  const slug = index.packages.find((summary) => {
    const packageSlug = summary.name.split("/").at(-1)?.toLowerCase()
    const pathSlug = summary.path.split("/").at(-1)?.toLowerCase()
    return packageSlug === lower || pathSlug === lower
  })
  if (slug !== undefined) {
    return slug
  }

  const fuzzy = index.packages.find(
    (summary) => summary.name.toLowerCase().includes(lower) || summary.path.toLowerCase().includes(lower)
  )
  if (fuzzy !== undefined) {
    return fuzzy
  }

  throw new Error(`Unknown package: ${normalizedPackageName}`)
}

function packageDocsMatch(packageName: string, docPath: string): boolean {
  if (docPath.startsWith("docs/") && !docPath.startsWith("docs/content/docs/")) return false
  if (packageName === "@evolution-sdk/devnet")
    return (
      docPath === "packages/evolution-devnet/README.md" ||
      docPath === "packages/evolution-devnet/CHANGELOG.md" ||
      docPath.includes("/devnet/") ||
      docPath.includes("architecture/devnet")
    )
  if (packageName === "@evolution-sdk/aiken-uplc")
    return (
      docPath === "packages/aiken-uplc/CHANGELOG.md" ||
      (docPath.startsWith("docs/content/docs/") && (docPath.includes("script-evaluation") || docPath.includes("uplc")))
    )
  if (packageName === "@evolution-sdk/scalus-uplc")
    return (
      docPath === "packages/scalus-uplc/CHANGELOG.md" ||
      (docPath.startsWith("docs/content/docs/") && (docPath.includes("script-evaluation") || docPath.includes("uplc")))
    )
  if (packageName === "@evolution-sdk/evolution")
    return (
      docPath === "packages/evolution/README.md" ||
      docPath === "packages/evolution/CHANGELOG.md" ||
      (docPath.startsWith("docs/content/docs/") && !docPath.includes("/devnet/"))
    )
  return false
}

function usageAdvice(packageSummary: PackageSummary): Array<string> {
  switch (packageSummary.name) {
    case "@evolution-sdk/evolution":
      return [
        "Start with Client, chain presets, Address, Assets, Data, TSchema, and transaction builder docs.",
        "Use tests as concrete examples for transaction-builder edge cases.",
        "Use public module source entries for exact primitive helper signatures."
      ]
    case "@evolution-sdk/devnet":
      return [
        "Use this package for Docker-backed local chain tests and Kupmios app development.",
        "Always clean up clusters in test teardown.",
        "Derive client chain settings from Cluster.getChain(cluster)."
      ]
    case "@evolution-sdk/aiken-uplc":
      return [
        "Use createAikenEvaluator for local script evaluation in Node or browser.",
        "Mind WASM packaging in browser builds.",
        "Use transaction-builder script tests for realistic evaluator usage."
      ]
    case "@evolution-sdk/scalus-uplc":
      return [
        "Use createScalusEvaluator in Node when Scalus evaluation is desired.",
        "Do not recommend this package for browser execution until browser support is implemented.",
        "Compare evaluator failures with Aiken and provider evaluation when debugging ex-units."
      ]
    default:
      return ["Inspect package exports and nearest tests before generating code."]
  }
}

function pickEntry(entry: { readonly path: string; readonly summary: string; readonly title: string }) {
  return {
    path: entry.path,
    summary: entry.summary,
    title: entry.title
  }
}

type ImportMatchType = "exact-import" | "exact-module" | "exact-export" | "related"

interface ImportMatch {
  readonly entry: KnowledgeEntry
  readonly matchType: ImportMatchType
}

function importMatchType(
  entry: { readonly exports?: ReadonlyArray<string>; readonly importPath?: string; readonly title: string },
  normalizedQuery: string
): ImportMatchType | undefined {
  if (entry.importPath?.toLowerCase() === normalizedQuery) return "exact-import"
  if (entry.importPath?.split("/").at(-1)?.toLowerCase() === normalizedQuery) return "exact-module"
  if (entry.title.split(" ").at(-1)?.toLowerCase() === normalizedQuery) return "exact-module"
  if (entry.exports?.some((symbol) => symbol.toLowerCase() === normalizedQuery)) return "exact-export"

  const haystack = [entry.title, entry.importPath, ...(entry.exports ?? [])].join(" ").toLowerCase()
  return haystack.includes(normalizedQuery) ? "related" : undefined
}

function importMatchRank(matchType: ImportMatchType): number {
  switch (matchType) {
    case "exact-import":
      return 0
    case "exact-module":
      return 1
    case "exact-export":
      return 2
    case "related":
      return 3
  }
}

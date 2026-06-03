import { lstat } from "node:fs/promises"
import path from "node:path"

import { listRepoFiles, pathExists, readJsonFile, readTextFile, toRepoPath } from "./repo.js"
import type { KnowledgeEntry, KnowledgeIndex, PackageSummary } from "./types.js"
import { WORKFLOWS } from "./workflows.js"

interface PackageJson {
  readonly name: string
  readonly version?: string
  readonly description?: string
  readonly keywords?: ReadonlyArray<string>
  readonly exports?: unknown
}

const INDEXED_DIRS = ["packages", "docs", "examples", "apps", ".github", ".specs"]

const ROOT_CONTEXT_FILES = [
  ".env.test.local.example",
  ".prettierrc.json",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "flake.lock",
  "flake.nix",
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "eslint.config.mjs",
  "vitest.config.ts"
]

const IGNORED_FILE_PATTERNS: ReadonlyArray<RegExp> = [
  /^docs\/content\/docs\/modules\//,
  /^packages\/[^/]+\/docs\/modules\//
]

const PACKAGE_PURPOSES: Record<string, string> = {
  "@evolution-sdk/aiken-uplc":
    "Aiken WASM-backed local UPLC evaluator for offline script evaluation in Node and browser builds.",
  "@evolution-sdk/devnet":
    "Docker-backed local Cardano devnet for deterministic application and transaction-builder tests.",
  "@evolution-sdk/evolution":
    "Core TypeScript Cardano SDK: typed primitives, CBOR, Plutus data, client/provider/wallet layer, and transaction builders.",
  "@evolution-sdk/scalus-uplc": "Scalus-backed local UPLC evaluator adapter for Node-based script evaluation."
}

export async function buildKnowledgeIndex(root: string): Promise<KnowledgeIndex> {
  const packages = await readPackageSummaries(root)
  const entries: Array<KnowledgeEntry> = []

  for (const packageSummary of packages) {
    entries.push(packageEntry(packageSummary))
    entries.push(...(await moduleEntries(root, packageSummary)))
  }

  entries.push(...(await fileEntries(root, packages)))
  entries.push(...workflowEntries())

  return {
    entries: dedupeEntries(entries).sort((a, b) => a.id.localeCompare(b.id)),
    generatedAt: new Date().toISOString(),
    packages,
    root,
    workflows: WORKFLOWS
  }
}

async function readPackageSummaries(root: string): Promise<Array<PackageSummary>> {
  const packageRoot = path.join(root, "packages")
  const packageDirs = await listDirectoryNames(packageRoot)
  const summaries: Array<PackageSummary> = []

  for (const packageDir of packageDirs) {
    const packageJsonPath = path.join(packageRoot, packageDir, "package.json")
    if (!(await pathExists(packageJsonPath))) {
      continue
    }

    const packageJson = await readJsonFile<PackageJson>(packageJsonPath)
    const packagePath = toRepoPath(root, path.dirname(packageJsonPath))
    const entrypoints = await packageEntrypoints(root, packagePath, packageJson)
    const exports = flattenPackageExports(packageJson.exports)

    summaries.push({
      description: packageJson.description ?? PACKAGE_PURPOSES[packageJson.name] ?? "",
      entrypoints,
      exports,
      keywords: packageJson.keywords ?? [],
      name: packageJson.name,
      path: packagePath,
      version: packageJson.version ?? "0.0.0"
    })
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name))
}

async function listDirectoryNames(directory: string): Promise<Array<string>> {
  if (!(await pathExists(directory))) {
    return []
  }

  const entries = await import("node:fs/promises").then(({ readdir }) => readdir(directory, { withFileTypes: true }))
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function packageEntrypoints(root: string, packagePath: string, packageJson: PackageJson): Promise<Array<string>> {
  const candidates = [
    `${packagePath}/src/index.ts`,
    `${packagePath}/src/index.node.ts`,
    `${packagePath}/src/index.browser.ts`
  ]

  const entrypoints = []
  for (const candidate of candidates) {
    if (await pathExists(path.join(root, candidate))) {
      entrypoints.push(candidate)
    }
  }

  if (entrypoints.length === 0 && typeof packageJson.exports === "object" && packageJson.exports !== null) {
    entrypoints.push(`${packagePath}/package.json`)
  }

  return entrypoints
}

function flattenPackageExports(exportsField: unknown): Array<string> {
  if (exportsField === undefined) {
    return []
  }

  if (typeof exportsField === "string") {
    return [exportsField]
  }

  if (typeof exportsField !== "object" || exportsField === null) {
    return []
  }

  return Object.keys(exportsField).sort()
}

function packageEntry(packageSummary: PackageSummary): KnowledgeEntry {
  return {
    exports: packageSummary.exports,
    id: `package:${packageSummary.name}`,
    importPath: packageSummary.name,
    kind: "package",
    keywords: [
      ...packageSummary.keywords,
      packageSummary.name,
      ...packageSummary.entrypoints,
      ...(PACKAGE_PURPOSES[packageSummary.name]?.split(/\W+/) ?? [])
    ],
    packageName: packageSummary.name,
    path: packageSummary.path,
    summary: PACKAGE_PURPOSES[packageSummary.name] ?? packageSummary.description,
    title: packageSummary.name
  }
}

async function moduleEntries(root: string, packageSummary: PackageSummary): Promise<Array<KnowledgeEntry>> {
  const entries: Array<KnowledgeEntry> = []

  for (const entrypoint of packageSummary.entrypoints) {
    const source = await readTextFile(root, entrypoint)
    const barrelExports = extractBarrelExports(source)
    for (const exported of barrelExports) {
      const modulePath = resolveExportedModulePath(entrypoint, exported.source)
      const moduleSource = (await pathExists(path.join(root, modulePath))) ? await readTextFile(root, modulePath) : ""
      const symbols = extractExportedSymbols(moduleSource)
      const importPath = importPathFor(packageSummary.name, exported.name, exported.source)
      entries.push({
        exports: symbols.slice(0, 80),
        id: `module:${packageSummary.name}:${exported.name}`,
        importPath,
        kind: "module",
        keywords: [
          packageSummary.name,
          exported.name,
          importPath,
          ...symbols.slice(0, 40),
          ...modulePath.split(/[/.]/)
        ],
        packageName: packageSummary.name,
        path: modulePath,
        summary: summarizeModule(exported.name, packageSummary.name, modulePath, symbols),
        title: `${packageSummary.name} ${exported.name}`
      })
    }

    const directSymbols = extractExportedSymbols(source)
    if (directSymbols.length > 0) {
      entries.push({
        exports: directSymbols,
        id: `module:${packageSummary.name}:entrypoint`,
        importPath: packageSummary.name,
        kind: "module",
        keywords: [packageSummary.name, ...directSymbols, ...entrypoint.split(/[/.]/)],
        packageName: packageSummary.name,
        path: entrypoint,
        summary: `Entrypoint exports for ${packageSummary.name}: ${directSymbols.slice(0, 12).join(", ")}.`,
        title: `${packageSummary.name} entrypoint`
      })
    }
  }

  return entries
}

interface BarrelExport {
  readonly name: string
  readonly source: string
}

function extractBarrelExports(source: string): Array<BarrelExport> {
  const exports: Array<BarrelExport> = []
  const regex = /^\s*export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+"([^"]+)"/gm
  let match = regex.exec(source)

  while (match !== null) {
    const [, name, exportSource] = match
    if (name !== undefined && exportSource !== undefined) {
      exports.push({ name, source: exportSource })
    }
    match = regex.exec(source)
  }

  return exports
}

function resolveExportedModulePath(entrypoint: string, exportSource: string): string {
  const directory = path.posix.dirname(entrypoint)
  const withoutJs = exportSource.endsWith(".js") ? exportSource.slice(0, -3) : exportSource
  return path.posix.normalize(path.posix.join(directory, `${withoutJs}.ts`))
}

function importPathFor(packageName: string, exportName: string, exportSource: string): string {
  if (packageName === "@evolution-sdk/evolution") {
    if (exportSource === "./blueprint/index.js") return `${packageName}/blueprint`
    if (exportSource === "./cose/index.js") return `${packageName}/cose`
    if (exportSource === "./plutus/index.js") return `${packageName}/plutus`
    return `${packageName}/${exportName}`
  }

  if (exportSource.startsWith("./") && exportSource.endsWith(".js")) {
    return `${packageName}/${exportSource.slice(2, -3)}`
  }

  return packageName
}

function extractExportedSymbols(source: string): Array<string> {
  const symbols = new Set<string>()
  const declarationRegex =
    /^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:const|class|interface|type|function|enum)\s+([A-Za-z_$][\w$]*)/gm
  const namedRegex = /^\s*export\s+\{([^}]+)\}/gm
  const namespaceRegex = /^\s*export\s+\*\s+as\s+([A-Za-z_$][\w$]*)/gm

  for (const regex of [declarationRegex, namespaceRegex]) {
    let match = regex.exec(source)
    while (match !== null) {
      if (match[1] !== undefined) {
        symbols.add(match[1])
      }
      match = regex.exec(source)
    }
  }

  let namedMatch = namedRegex.exec(source)
  while (namedMatch !== null) {
    const names = namedMatch[1]
      ?.split(",")
      .map((part) => part.trim().split(/\s+as\s+/)[1] ?? part.trim().split(/\s+as\s+/)[0])
      .filter((part): part is string => part !== undefined && part !== "")
    for (const name of names ?? []) {
      symbols.add(name)
    }
    namedMatch = namedRegex.exec(source)
  }

  return Array.from(symbols).sort()
}

function summarizeModule(
  moduleName: string,
  packageName: string,
  modulePath: string,
  symbols: ReadonlyArray<string>
): string {
  const symbolSummary = symbols.length > 0 ? ` Key exports: ${symbols.slice(0, 14).join(", ")}.` : ""
  return `${moduleName} module in ${packageName}. Source: ${modulePath}.${symbolSummary}`
}

async function fileEntries(root: string, packages: ReadonlyArray<PackageSummary>): Promise<Array<KnowledgeEntry>> {
  const files = new Set<string>(ROOT_CONTEXT_FILES)
  const packagePaths = new Map(packages.map((packageSummary) => [packageSummary.path, packageSummary.name]))
  for (const file of await listRepoFiles(root, INDEXED_DIRS)) {
    files.add(file)
  }

  const entries: Array<KnowledgeEntry> = []
  for (const file of files) {
    if (shouldIgnoreFile(file)) {
      continue
    }
    if (!(await pathExists(path.join(root, file)))) {
      continue
    }
    try {
      const entry = await fileEntry(root, file, packagePaths)
      if (entry !== undefined) {
        entries.push(entry)
      }
    } catch (error) {
      entries.push(diagnosticEntry(file, error))
    }
  }

  return entries
}

function shouldIgnoreFile(file: string): boolean {
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(file))
}

async function fileEntry(
  root: string,
  file: string,
  packagePaths: ReadonlyMap<string, string>
): Promise<KnowledgeEntry | undefined> {
  const absolutePath = path.join(root, file)
  const fileStat = await lstat(absolutePath)
  if (fileStat.isDirectory() || fileStat.isSymbolicLink()) {
    return undefined
  }

  const text = await readTextFile(root, file, 120_000)
  const kind = classifyFile(file)
  const packageName = packageNameFromPath(file, packagePaths)
  const title = titleFromText(file, text)
  const exportedSymbols = file.endsWith(".ts") || file.endsWith(".tsx") ? extractExportedSymbols(text) : []
  const description = summarizeFile(text, kind, exportedSymbols)

  return {
    exports: exportedSymbols.length > 0 ? exportedSymbols : undefined,
    id: `${kind}:${file}`,
    kind,
    keywords: keywordsForFile(file, text, exportedSymbols),
    lineCount: text.split(/\r?\n/).length,
    packageName,
    path: file,
    summary: description,
    title
  }
}

function classifyFile(file: string): KnowledgeEntry["kind"] {
  if (file.startsWith("docs/")) return "doc"
  if (file.startsWith("examples/")) return "example"
  if (file.startsWith(".specs/")) return "spec"
  if (file.startsWith("packages/") && (file.endsWith("/README.md") || file.endsWith("/CHANGELOG.md"))) return "doc"
  if (file.includes("/test/") || file.endsWith(".test.ts") || file.endsWith(".spec.ts")) return "test"
  if (file.startsWith("packages/")) return "module"
  return "config"
}

function packageNameFromPath(file: string, packagePaths: ReadonlyMap<string, string>): string | undefined {
  for (const [packagePath, packageName] of packagePaths.entries()) {
    if (file === packagePath || file.startsWith(`${packagePath}/`)) {
      return packageName
    }
  }
  return undefined
}

function diagnosticEntry(file: string, error: unknown): KnowledgeEntry {
  const message = error instanceof Error ? error.message : String(error)
  return {
    id: `config:index-diagnostic:${file}`,
    kind: "config",
    keywords: ["index", "diagnostic", file, message],
    path: file,
    summary: `Skipped during indexing: ${message}`,
    title: `Index diagnostic: ${file}`
  }
}

function titleFromText(file: string, text: string): string {
  const frontmatterTitle = /^---[\s\S]*?\ntitle:\s*(.+)\n[\s\S]*?---/.exec(text)?.[1]
  if (frontmatterTitle !== undefined) {
    return cleanFrontmatterValue(frontmatterTitle)
  }

  const heading = /^#\s+(.+)$/m.exec(text)?.[1]
  if (heading !== undefined) {
    return heading.trim()
  }

  return (
    file
      .split("/")
      .at(-1)
      ?.replace(/\.(mdx?|tsx?|json|ya?ml|mjs|nix)$/, "")
      .replace(/[-_]/g, " ") ?? file
  )
}

function descriptionFromText(text: string): string {
  const frontmatterDescription = /^---[\s\S]*?\ndescription:\s*(.+)\n[\s\S]*?---/.exec(text)?.[1]
  if (frontmatterDescription !== undefined) {
    return cleanFrontmatterValue(frontmatterDescription)
  }

  const firstParagraph = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== "" &&
        !line.startsWith("#") &&
        !line.startsWith("---") &&
        !line.startsWith("```") &&
        !line.startsWith("/**") &&
        !line.startsWith("*") &&
        !line.startsWith("import ") &&
        !line.startsWith("export ")
    )[0]

  if (firstParagraph !== undefined) {
    return firstParagraph.slice(0, 320)
  }

  return "Repository context file."
}

function summarizeFile(text: string, kind: KnowledgeEntry["kind"], exportedSymbols: ReadonlyArray<string>): string {
  if (kind === "test") {
    const testDescription = firstDescribeName(text)
    if (testDescription !== undefined) {
      return `Test suite: ${testDescription}.`
    }
  }

  const description = descriptionFromText(text)
  if ((kind === "module" || kind === "doc" || kind === "example") && exportedSymbols.length > 0) {
    if (isLowSignalSourceSummary(description)) {
      return `Source exports: ${exportedSymbols.slice(0, 18).join(", ")}.`
    }
  }
  return description
}

function firstDescribeName(text: string): string | undefined {
  return /describe\(\s*["'`]([^"'`]+)["'`]/.exec(text)?.[1]
}

function cleanFrontmatterValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "")
}

function isLowSignalSourceSummary(summary: string): boolean {
  return (
    summary === "Repository context file." ||
    summary === "{" ||
    summary === "[" ||
    summary === '"use client"' ||
    summary.startsWith("//") ||
    summary.startsWith("Effect.") ||
    summary.startsWith("const ") ||
    summary.startsWith("let ") ||
    summary.startsWith("readonly ") ||
    summary.startsWith("return ") ||
    summary.includes("function*")
  )
}

function keywordsForFile(file: string, text: string, exportedSymbols: ReadonlyArray<string>): Array<string> {
  const headings = Array.from(text.matchAll(/^#{1,3}\s+(.+)$/gm))
    .map((match) => match[1])
    .filter((heading): heading is string => heading !== undefined)
    .slice(0, 20)
  const pathParts = file.split(/[/.]/).filter(Boolean)
  return Array.from(new Set([...pathParts, ...headings, ...exportedSymbols, ...extractIdentifierKeywords(text)])).slice(
    0,
    180
  )
}

function extractIdentifierKeywords(text: string): Array<string> {
  const ignored = new Set([
    "const",
    "declare",
    "export",
    "false",
    "from",
    "function",
    "import",
    "interface",
    "return",
    "string",
    "true",
    "type",
    "undefined"
  ])
  const identifiers = new Set<string>()
  const regex = /\b[A-Za-z_$][\w$]{2,}\b/g
  let match = regex.exec(text)

  while (match !== null && identifiers.size < 180) {
    const identifier = match[0]
    if (!ignored.has(identifier)) {
      identifiers.add(identifier)
    }
    match = regex.exec(text)
  }

  return Array.from(identifiers)
}

function workflowEntries(): Array<KnowledgeEntry> {
  return WORKFLOWS.map((workflow) => ({
    id: `workflow:${workflow.id}`,
    kind: "workflow",
    keywords: [
      workflow.id,
      workflow.title,
      workflow.intent,
      ...workflow.packages,
      ...workflow.relatedPaths,
      ...workflow.steps,
      ...workflow.commonPitfalls
    ],
    path: workflow.relatedPaths[0] ?? ".",
    summary: workflow.intent,
    title: workflow.title
  }))
}

function dedupeEntries(entries: ReadonlyArray<KnowledgeEntry>): Array<KnowledgeEntry> {
  return Array.from(new Map(entries.map((entry) => [entry.id, entry])).values())
}

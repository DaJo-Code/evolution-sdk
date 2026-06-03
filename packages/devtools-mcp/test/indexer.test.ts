import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { importGuide, packageGuide, verificationGuide } from "../src/guides.js"
import { buildKnowledgeIndex } from "../src/indexer.js"
import { readFileSlice, resolveSafePath } from "../src/repo.js"
import { searchKnowledge } from "../src/search.js"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

describe("devtools MCP knowledge index", () => {
  it("indexes every workspace package and key repository context", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const packageNames = index.packages.map((packageSummary) => packageSummary.name)

    expect(packageNames).toContain("@evolution-sdk/evolution")
    expect(packageNames).toContain("@evolution-sdk/devnet")
    expect(packageNames).toContain("@evolution-sdk/aiken-uplc")
    expect(packageNames).toContain("@evolution-sdk/scalus-uplc")
    expect(packageNames).toContain("@evolution-sdk/devtools-mcp")
    expect(index.entries.some((entry) => entry.path === "docs/content/docs/common-patterns.mdx")).toBe(true)
    expect(index.entries.some((entry) => entry.path === "docs/app/tools/tx-decoder/page.tsx")).toBe(true)
    expect(index.entries.some((entry) => entry.path === ".github/workflows/ci.yml")).toBe(true)
    expect(index.entries.some((entry) => entry.path === ".specs/transaction-building-specification.md")).toBe(true)
    expect(index.entries.some((entry) => entry.path === "examples/with-vite-react/src/App.tsx")).toBe(true)
    expect(index.entries.some((entry) => entry.path === "flake.nix")).toBe(true)
    expect(index.entries.some((entry) => entry.path.includes("/golden/"))).toBe(false)
    expect(index.entries.some((entry) => entry.path.includes("/docs/modules/"))).toBe(false)
  })

  it("resolves package guides from generated package data", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const guide = packageGuide(index, "evolution")

    expect(guide.package.name).toBe("@evolution-sdk/evolution")
    expect(guide.importPath).toBe("@evolution-sdk/evolution")
    expect(guide.publicModules.some((module) => module.title.includes("Address"))).toBe(true)
    expect(guide.publicModuleCount).toBeGreaterThan(guide.publicModules.length)
    expect(guide.publicModules.length).toBeLessThanOrEqual(12)
    expect(guide.publicModules.every((module) => !("exports" in module))).toBe(true)
    expect(guide.docs.every((entry) => /\.(md|mdx)$/.test(entry.path))).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(guide))).toBeLessThan(70_000)
    expect(guide.docs.length).toBeGreaterThan(0)
  })

  it("trims package guide lookup input", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const guide = packageGuide(index, " evolution ")

    expect(guide.package.name).toBe("@evolution-sdk/evolution")
  })

  it("keeps UPLC package-local docs separated while sharing common docs", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const aikenGuide = packageGuide(index, "aiken-uplc")
    const scalusGuide = packageGuide(index, "scalus-uplc")

    expect(aikenGuide.docs.some((entry) => entry.path === "packages/aiken-uplc/CHANGELOG.md")).toBe(true)
    expect(aikenGuide.docs.some((entry) => entry.path === "packages/scalus-uplc/CHANGELOG.md")).toBe(false)
    expect(scalusGuide.docs.some((entry) => entry.path === "packages/scalus-uplc/CHANGELOG.md")).toBe(true)
    expect(scalusGuide.docs.some((entry) => entry.path === "packages/aiken-uplc/CHANGELOG.md")).toBe(false)
  })

  it("searches source-backed symbols and workflows without returning full files", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const results = searchKnowledge(index, { limit: 8, query: "payToAddress transaction payment" })

    expect(results.length).toBeGreaterThan(0)
    expect(
      results.some((result) => result.path.includes("TransactionBuilder") || result.path.includes("common-patterns"))
    ).toBe(true)
    expect(results.some((result) => result.matchType === "exact" || result.matchType === "strong")).toBe(true)
    expect(JSON.stringify(results).length).toBeLessThan(12_000)
  })

  it("normalizes package filters in context search", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const slugResults = searchKnowledge(index, { packageName: "evolution", query: "Address" })
    const fullNameResults = searchKnowledge(index, { packageName: "@evolution-sdk/evolution", query: "Address" })

    expect(slugResults.length).toBeGreaterThan(0)
    expect(slugResults.map((result) => result.id)).toEqual(fullNameResults.map((result) => result.id))
  })

  it("prioritizes exact API symbol matches over broad documentation hits", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const [first] = searchKnowledge(index, { limit: 5, query: "withBlockfrost" })

    expect(first?.path).toContain("Client.ts")
    expect(first?.matchType).toBe("exact")
    expect(first?.matchedFields).toContain("keywords")
  })

  it("keeps package-root exports discoverable when entrypoints also export namespace barrels", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const guide = packageGuide(index, "evolution", { moduleQuery: "ProviderError" })

    expect(guide.publicModules.some((module) => module.importPath === "@evolution-sdk/evolution")).toBe(true)
  })

  it("does not present source-only internal matches as public imports", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const guide = importGuide(index, "parseProviderError")
    const internalMatch = [...guide.exactMatches, ...guide.relatedMatches].find((match) =>
      match.path.includes("providerErrorParser")
    )

    expect(internalMatch).toBeDefined()
    expect(internalMatch?.sourceOnly).toBe(true)
    expect(internalMatch?.importPath).toBeUndefined()
  })

  it("reads bounded file slices and reports truncation", async () => {
    const slice = await readFileSlice(repoRoot, "packages/evolution/src/index.ts", 1, 5)

    expect(slice.path).toBe("packages/evolution/src/index.ts")
    expect(slice.startLine).toBe(1)
    expect(slice.endLine).toBe(5)
    expect(slice.totalLines).toBeGreaterThan(5)
    expect(slice.truncated).toBe(true)
    expect(slice.nextStartLine).toBe(6)
    expect(slice.text.split("\n")).toHaveLength(5)
    expect(slice.text.startsWith("1:")).toBe(true)
  })

  it("slices large files by line without lying about later line ranges", async () => {
    const tempDir = await mkdtemp(path.join(repoRoot, "packages/devtools-mcp/test/tmp-large-"))
    try {
      const largeFile = path.join(tempDir, "large.txt")
      const lines = Array.from({ length: 6_000 }, (_, index) => `line-${index + 1}`)
      await writeFile(largeFile, lines.join("\n"))

      const slice = await readFileSlice(repoRoot, path.relative(repoRoot, largeFile), 5_500, 3)

      expect(slice.startLine).toBe(5_500)
      expect(slice.endLine).toBe(5_502)
      expect(slice.totalLines).toBe(6_000)
      expect(slice.text).toContain("5500: line-5500")
      expect(slice.nextStartLine).toBe(5_503)
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it("keeps character-bounded slices contiguous", async () => {
    const tempDir = await mkdtemp(path.join(repoRoot, "packages/devtools-mcp/test/tmp-char-slice-"))
    try {
      const file = path.join(tempDir, "slice.txt")
      await writeFile(file, ["first", "x".repeat(2_000), "third"].join("\n"))

      const slice = await readFileSlice(repoRoot, path.relative(repoRoot, file), 1, 10, 1_000)

      expect(slice.lines.map((line) => line.number)).toEqual([1, 2])
      expect(slice.lines[1]?.lineTruncated).toBe(true)
      expect(slice.text).toContain("1: first")
      expect(slice.text).toContain("2: ")
      expect(slice.text).toContain("[line truncated]")
      expect(slice.text).not.toContain("third")
      expect(slice.truncated).toBe(true)
      expect(slice.nextStartLine).toBe(3)
      expect(slice.totalLines).toBe(3)
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it("enforces maxChars even when the first requested line is huge", async () => {
    const tempDir = await mkdtemp(path.join(repoRoot, "packages/devtools-mcp/test/tmp-first-line-"))
    try {
      const file = path.join(tempDir, "first-line.txt")
      await writeFile(file, ["x".repeat(2_000), "second"].join("\n"))

      const slice = await readFileSlice(repoRoot, path.relative(repoRoot, file), 1, 10, 1_000)

      expect(slice.lines).toHaveLength(1)
      expect(slice.lines[0]?.lineTruncated).toBe(true)
      expect(slice.text.length).toBeLessThanOrEqual(1_000)
      expect(slice.text).toContain("[line truncated]")
      expect(slice.text).not.toContain("second")
      expect(slice.nextStartLine).toBe(2)
      expect(slice.totalLines).toBe(2)
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  })

  it("rejects symlinks that could escape the repository", async () => {
    const outsideDir = await mkdtemp(path.join(os.tmpdir(), "devtools-mcp-outside-"))
    const insideDir = await mkdtemp(path.join(repoRoot, "packages/devtools-mcp/test/tmp-symlink-"))
    try {
      const outsideFile = path.join(outsideDir, "secret.txt")
      const symlinkPath = path.join(insideDir, "secret.txt")
      await writeFile(outsideFile, "secret")
      await symlink(outsideFile, symlinkPath)

      await expect(readFileSlice(repoRoot, path.relative(repoRoot, symlinkPath), 1, 1)).rejects.toThrow(
        "symbolic link"
      )
    } finally {
      await rm(insideDir, { force: true, recursive: true })
      await rm(outsideDir, { force: true, recursive: true })
    }
  })

  it("rejects path traversal outside the repository", () => {
    expect(() => resolveSafePath(repoRoot, "../package.json")).toThrow("outside the repo root")
  })

  it("returns targeted verification guidance", async () => {
    const index = await buildKnowledgeIndex(repoRoot)
    const guide = verificationGuide(index, " devtools-mcp ")

    expect(guide.packageCommands).toContain("pnpm --filter @evolution-sdk/devtools-mcp type-check")
    expect(guide.rootCommands).toContain("pnpm verify")
  })
})

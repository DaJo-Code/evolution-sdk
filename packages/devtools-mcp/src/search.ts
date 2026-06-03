import type { EntryKind, KnowledgeEntry, KnowledgeIndex, SearchResult } from "./types.js"

export interface SearchOptions {
  readonly query: string
  readonly kind?: EntryKind
  readonly packageName?: string
  readonly limit?: number
}

export function searchKnowledge(index: KnowledgeIndex, options: SearchOptions): Array<SearchResult> {
  const isCamelCase = /[a-z][A-Z]/.test(options.query)
  const packageName = normalizePackageName(index, options.packageName)
  const terms = tokenize(options.query)
  const limit = Math.min(30, Math.max(1, options.limit ?? 10))

  return index.entries
    .filter((entry) => options.kind === undefined || entry.kind === options.kind)
    .filter((entry) => packageName === undefined || entry.packageName === packageName)
    .map((entry) => ({ entry, scored: scoreEntry(entry, terms, isCamelCase) }))
    .filter(({ scored }) => scored.score > 0 || terms.length === 0)
    .sort((a, b) => b.scored.score - a.scored.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(({ entry, scored }) => ({
      exports: entry.exports?.slice(0, 30),
      id: entry.id,
      importPath: entry.importPath,
      kind: entry.kind,
      matchedFields: scored.matchedFields,
      matchType: scored.matchType,
      packageName: entry.packageName,
      path: entry.path,
      score: scored.score,
      summary: entry.summary,
      title: entry.title
    }))
}

export function findEntry(index: KnowledgeIndex, idOrPath: string): KnowledgeEntry | undefined {
  return index.entries.find((entry) => entry.id === idOrPath || entry.path === idOrPath)
}

function normalizePackageName(index: KnowledgeIndex, packageName: string | undefined): string | undefined {
  if (packageName === undefined || packageName.trim() === "") {
    return undefined
  }

  const normalizedPackageName = packageName.trim()
  const lower = normalizedPackageName.toLowerCase()
  return (
    index.packages.find((summary) => summary.name.toLowerCase() === lower)?.name ??
    index.packages.find((summary) => {
      const packageSlug = summary.name.split("/").at(-1)?.toLowerCase()
      const pathSlug = summary.path.split("/").at(-1)?.toLowerCase()
      return packageSlug === lower || pathSlug === lower
    })?.name ??
    index.packages.find((summary) => summary.name.toLowerCase().includes(lower) || summary.path.toLowerCase().includes(lower))
      ?.name ??
    normalizedPackageName
  )
}

function tokenize(query: string): Array<string> {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_@/-]+/)
    .map((term) => term.trim())
    .filter(Boolean)
}

interface ScoredEntry {
  readonly matchedFields: ReadonlyArray<string>
  readonly matchType: "exact" | "strong" | "fuzzy"
  readonly score: number
}

function scoreEntry(entry: KnowledgeEntry, terms: ReadonlyArray<string>, isCamelCase: boolean): ScoredEntry {
  if (terms.length === 0) {
    return { matchedFields: [], matchType: "fuzzy", score: 1 }
  }

  const fields = {
    exports: entry.exports ?? [],
    importPath: entry.importPath === undefined ? [] : [entry.importPath],
    keywords: entry.keywords,
    packageName: entry.packageName === undefined ? [] : [entry.packageName],
    path: [entry.path],
    summary: [entry.summary],
    title: [entry.title]
  }

  let score = 0
  const matchedFields = new Set<string>()
  let exactMatches = 0
  let strongMatches = 0

  for (const term of terms) {
    for (const [fieldName, values] of Object.entries(fields)) {
      const normalizedValues = values.map((value) => value.toLowerCase())
      const exact = normalizedValues.some((value) => exactFieldTokens(value).has(term))
      const contains = normalizedValues.some((value) => value.includes(term))

      if (exact) {
        score += exactScore(fieldName)
        exactMatches++
        matchedFields.add(fieldName)
      } else if (contains) {
        score += fuzzyScore(fieldName)
        if (fieldName === "exports" || fieldName === "importPath" || fieldName === "title") {
          strongMatches++
        }
        matchedFields.add(fieldName)
      }
    }
  }

  if (isCamelCase && (matchedFields.has("exports") || matchedFields.has("importPath") || matchedFields.has("keywords"))) {
    score += 15
  }
  if (exactMatches > 0) {
    score += exactKindBonus(entry.kind)
  }

  return {
    matchedFields: Array.from(matchedFields).sort(),
    matchType: exactMatches > 0 ? "exact" : strongMatches > 0 ? "strong" : "fuzzy",
    score
  }
}

function exactKindBonus(kind: KnowledgeEntry["kind"]): number {
  switch (kind) {
    case "module":
      return 10
    case "test":
      return 8
    case "workflow":
      return 5
    case "example":
      return 4
    case "spec":
      return 3
    default:
      return 0
  }
}

function exactFieldTokens(value: string): Set<string> {
  return new Set(
    value
      .split(/[^a-z0-9_@/-]+/)
      .flatMap((part) => part.split(/[/.@/-]+/))
      .map((part) => part.trim())
      .filter(Boolean)
  )
}

function exactScore(fieldName: string): number {
  switch (fieldName) {
    case "exports":
      return 40
    case "importPath":
      return 34
    case "title":
      return 30
    case "packageName":
      return 24
    case "keywords":
      return 18
    case "path":
      return 12
    default:
      return 8
  }
}

function fuzzyScore(fieldName: string): number {
  switch (fieldName) {
    case "title":
      return 12
    case "packageName":
    case "importPath":
      return 10
    case "exports":
      return 8
    case "keywords":
      return 5
    case "summary":
      return 3
    default:
      return 2
  }
}

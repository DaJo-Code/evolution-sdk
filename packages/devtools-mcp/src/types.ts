export type EntryKind = "config" | "doc" | "example" | "module" | "package" | "spec" | "test" | "workflow"

export interface PackageSummary {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly path: string
  readonly entrypoints: ReadonlyArray<string>
  readonly exports: ReadonlyArray<string>
  readonly keywords: ReadonlyArray<string>
}

export interface KnowledgeEntry {
  readonly id: string
  readonly kind: EntryKind
  readonly title: string
  readonly path: string
  readonly summary: string
  readonly packageName?: string
  readonly importPath?: string
  readonly exports?: ReadonlyArray<string>
  readonly keywords: ReadonlyArray<string>
  readonly lineCount?: number
}

export interface WorkflowGuide {
  readonly id: string
  readonly title: string
  readonly intent: string
  readonly packages: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
  readonly relatedPaths: ReadonlyArray<string>
  readonly commonPitfalls: ReadonlyArray<string>
  readonly verification: ReadonlyArray<string>
}

export interface KnowledgeIndex {
  readonly generatedAt: string
  readonly root: string
  readonly packages: ReadonlyArray<PackageSummary>
  readonly entries: ReadonlyArray<KnowledgeEntry>
  readonly workflows: ReadonlyArray<WorkflowGuide>
}

export interface SearchResult {
  readonly id: string
  readonly score: number
  readonly matchType: "exact" | "strong" | "fuzzy"
  readonly matchedFields: ReadonlyArray<string>
  readonly kind: EntryKind
  readonly title: string
  readonly path: string
  readonly packageName?: string
  readonly importPath?: string
  readonly summary: string
  readonly exports?: ReadonlyArray<string>
}

export interface FileSlice {
  readonly path: string
  readonly startLine: number
  readonly endLine: number
  readonly nextStartLine?: number
  readonly totalLines: number
  readonly truncated: boolean
  readonly lines: ReadonlyArray<{
    readonly lineTruncated?: boolean
    readonly number: number
    readonly text: string
  }>
  readonly text: string
}

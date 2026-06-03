import { constants, createReadStream } from "node:fs"
import { access, lstat, open, readdir, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

import type { FileSlice } from "./types.js"

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".nix",
  ".rs",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
])

const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".direnv",
  ".git",
  ".next",
  ".source",
  ".turbo",
  ".tsbuildinfo",
  "coverage",
  "dist",
  "fixtures",
  "generated",
  "golden",
  "node_modules",
  "temp"
])

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function resolveRepoRoot(start = process.cwd()): Promise<string> {
  const explicitRoot = process.env.EVOLUTION_SDK_ROOT
  if (explicitRoot !== undefined && explicitRoot.trim() !== "") {
    return assertRepoRoot(path.resolve(explicitRoot))
  }

  const fromCwd = await findRepoRoot(start)
  if (fromCwd !== undefined) {
    return fromCwd
  }

  const currentFile = fileURLToPath(import.meta.url)
  const fromPackage = await findRepoRoot(path.dirname(currentFile))
  if (fromPackage !== undefined) {
    return fromPackage
  }

  throw new Error(
    "Could not find the Evolution SDK repo root. Run from the repository root or set EVOLUTION_SDK_ROOT."
  )
}

async function findRepoRoot(start: string): Promise<string | undefined> {
  let current = path.resolve(start)

  while (true) {
    if (await isRepoRoot(current)) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

async function assertRepoRoot(root: string): Promise<string> {
  if (await isRepoRoot(root)) {
    return root
  }
  throw new Error(`${root} is not an Evolution SDK repo root`)
}

async function isRepoRoot(candidate: string): Promise<boolean> {
  if (!(await pathExists(path.join(candidate, "package.json")))) {
    return false
  }
  if (!(await pathExists(path.join(candidate, "packages", "evolution", "package.json")))) {
    return false
  }

  try {
    const packageJson = JSON.parse(await readFile(path.join(candidate, "package.json"), "utf8")) as { name?: string }
    return packageJson.name === "evolution-sdk"
  } catch {
    return false
  }
}

export function toRepoPath(root: string, filePath: string): string {
  const relative = path.relative(root, filePath).split(path.sep).join("/")
  return relative === "" ? "." : relative
}

export function resolveSafePath(root: string, inputPath: string): string {
  const requested = inputPath.trim()
  if (requested === "") {
    throw new Error("path must not be empty")
  }

  const resolved = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(root, requested)
  const relative = path.relative(root, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to read outside the repo root: ${inputPath}`)
  }

  const segments = relative.split(path.sep)
  for (const segment of segments) {
    if (IGNORED_DIRECTORIES.has(segment)) {
      throw new Error(`Refusing to read ignored directory segment: ${segment}`)
    }
  }

  return resolved
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

export async function readTextFile(root: string, inputPath: string, maxBytes = 160_000): Promise<string> {
  const resolved = resolveSafePath(root, inputPath)
  await assertSafeRealPath(root, resolved, inputPath)
  assertTextFile(resolved, inputPath)

  const fileStat = await stat(resolved)
  if (fileStat.size > maxBytes) {
    const file = await open(resolved, "r")
    try {
      const buffer = Buffer.alloc(maxBytes)
      const { bytesRead } = await file.read(buffer, 0, maxBytes, 0)
      return buffer.subarray(0, bytesRead).toString("utf8")
    } finally {
      await file.close()
    }
  }

  return readFile(resolved, "utf8")
}

export async function readFileSlice(
  root: string,
  inputPath: string,
  startLine = 1,
  maxLines = 80,
  maxChars = 24_000
): Promise<FileSlice> {
  const resolved = resolveSafePath(root, inputPath)
  await assertSafeRealPath(root, resolved, inputPath)
  assertTextFile(resolved, inputPath)

  const safeStart = Math.max(1, Math.floor(startLine))
  const safeMax = Math.min(400, Math.max(1, Math.floor(maxLines)))
  const safeMaxChars = Math.min(80_000, Math.max(1_000, Math.floor(maxChars)))
  const numberedLines = []
  let sliceClosed = false
  let usedChars = 0
  let totalLines = 0

  const reader = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(resolved, { encoding: "utf8" })
  })

  try {
    for await (const line of reader) {
      totalLines++
      if (totalLines < safeStart || numberedLines.length >= safeMax || sliceClosed) {
        continue
      }

      const numberedPrefix = `${totalLines}: `
      const remainingChars = safeMaxChars - usedChars - numberedPrefix.length
      if (remainingChars <= 0) {
        sliceClosed = true
        continue
      }

      const lineTruncated = line.length > remainingChars
      const text = lineTruncated ? truncateLine(line, remainingChars) : line
      const numbered = `${numberedPrefix}${text}`

      numberedLines.push({
        lineTruncated: lineTruncated ? true : undefined,
        number: totalLines,
        text
      })
      usedChars += numbered.length + 1
      if (lineTruncated) {
        sliceClosed = true
      }
    }
  } finally {
    reader.close()
  }

  const endLine = numberedLines.at(-1)?.number ?? safeStart - 1
  const truncated = endLine < totalLines

  return {
    endLine,
    lines: numberedLines,
    nextStartLine: truncated ? endLine + 1 : undefined,
    path: toRepoPath(root, resolved),
    startLine: safeStart,
    text: numberedLines.map((line) => `${line.number}: ${line.text}`).join("\n"),
    totalLines,
    truncated
  }
}

function truncateLine(line: string, maxChars: number): string {
  const marker = "... [line truncated]"
  if (maxChars <= marker.length) {
    return marker.slice(0, Math.max(0, maxChars))
  }
  return `${line.slice(0, maxChars - marker.length)}${marker}`
}

export async function listRepoFiles(root: string, requestedDirs: ReadonlyArray<string>): Promise<Array<string>> {
  const files: Array<string> = []

  for (const requestedDir of requestedDirs) {
    const absoluteDir = resolveSafePath(root, requestedDir)
    if (!(await pathExists(absoluteDir))) {
      continue
    }
    await assertSafeRealPath(root, absoluteDir, requestedDir)
    await walk(root, absoluteDir, files)
  }

  return files.sort()
}

async function walk(root: string, current: string, files: Array<string>): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await walk(root, path.join(current, entry.name), files)
      }
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const filePath = path.join(current, entry.name)
    if (TEXT_FILE_EXTENSIONS.has(path.extname(filePath))) {
      files.push(toRepoPath(root, filePath))
    }
  }
}

function assertTextFile(resolvedPath: string, inputPath: string): void {
  const extension = path.extname(resolvedPath)
  if (!TEXT_FILE_EXTENSIONS.has(extension)) {
    throw new Error(`Refusing to read non-text file: ${inputPath}`)
  }
}

async function assertSafeRealPath(root: string, resolvedPath: string, inputPath: string): Promise<void> {
  const [realRoot, fileStat] = await Promise.all([realpath(root), lstat(resolvedPath)])
  if (fileStat.isSymbolicLink()) {
    throw new Error(`Refusing to read symbolic link: ${inputPath}`)
  }

  const realResolved = await realpath(resolvedPath)
  const relative = path.relative(realRoot, realResolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to read symlink target outside the repo root: ${inputPath}`)
  }

  const segments = relative.split(path.sep)
  for (const segment of segments) {
    if (IGNORED_DIRECTORIES.has(segment)) {
      throw new Error(`Refusing to read ignored directory segment: ${segment}`)
    }
  }
}

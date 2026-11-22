import { Option, Schema } from "effect"

// Models often carry tool names over from other harnesses. Aliases only apply when no
// registered tool already has the requested name, so a real tool always wins.
export const toolAliases: ReadonlyMap<string, string> = new Map([
  ["bash", "shell"],
  ["cmd", "shell"],
  ["terminal", "shell"],
  ["execute_command", "shell"],
  ["run_command", "shell"],
  ["run", "shell"],
  ["exec", "shell"],

  ["search", "grep"],
  ["ripgrep", "grep"],
  ["rg", "grep"],
  ["find_text", "grep"],
  ["search_text", "grep"],
  ["code_search", "grep"],
  ["search_code", "grep"],
  ["grep_search", "grep"],

  ["find", "glob"],
  ["file_search", "glob"],
  ["search_files", "glob"],
  ["list_files", "glob"],
  ["ls", "glob"],
  ["dir", "glob"],

  ["read_file", "read"],
  ["cat", "read"],
  ["view", "read"],
  ["open_file", "read"],

  ["write_file", "write"],
  ["create_file", "write"],

  ["edit_file", "edit"],
  ["str_replace", "edit"],
  ["replace", "edit"],
])

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isFilled = (value: unknown): value is string => typeof value === "string" && value.trim() !== ""

const isPresent = (value: unknown): value is string => typeof value === "string"

const isPlaceholder = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized === "" || normalized === "undefined" || normalized === "null"
}

const PATH_KEYS = [
  "path",
  "filePath",
  "file_path",
  "file",
  "filepath",
  "filename",
  "directory",
  "dir",
  "cwd",
  "folder",
  "root",
  "target",
  "uri",
] as const

const PATH_ALTERNATES = [
  "filePath",
  "file_path",
  "file",
  "filepath",
  "filename",
  "target",
  "uri",
] as const

const take = (
  input: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  accept: (value: unknown) => value is string,
) => {
  for (const key of keys) {
    if (!Object.hasOwn(input, key)) continue
    const value = input[key]
    if (!accept(value)) continue
    delete input[key]
    return value
  }
}

const assign = (
  input: Record<string, unknown>,
  target: string,
  keys: ReadonlyArray<string>,
  accept: (value: unknown) => value is string,
) => {
  if (accept(input[target])) return
  const value = take(input, keys, accept)
  if (value !== undefined) input[target] = value
}

const dropEmptyPaths = (input: Record<string, unknown>) => {
  for (const key of PATH_KEYS) {
    if (input[key] === "") delete input[key]
  }
}

const dropPlaceholderPaths = (input: Record<string, unknown>) => {
  for (const key of PATH_KEYS) {
    if (typeof input[key] === "string" && isPlaceholder(input[key])) delete input[key]
  }
}

/**
 * Repairs the input shapes models commonly send for a canonical tool. The tool's own
 * schema still validates the result; this only moves known alternate field names onto
 * the canonical fields and removes unusable empty path fields.
 */
export const normalizeInput = (toolName: string, value: unknown): unknown => {
  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  if (!isRecord(parsed)) return value
  const input = { ...parsed }

  switch (toolName) {
    case "read":
    case "write":
    case "edit": {
      assign(input, "path", PATH_ALTERNATES, isFilled)
      if (toolName === "write") assign(input, "content", ["contents", "text", "data", "body", "value"], isPresent)
      if (toolName === "edit") {
        assign(input, "oldString", ["old", "old_string", "oldText", "search", "find", "from", "original"], isFilled)
        assign(
          input,
          "newString",
          ["new", "new_string", "newText", "replace", "replacement", "to", "updated"],
          isPresent,
        )
      }
      break
    }
    case "grep": {
      assign(
        input,
        "pattern",
        ["query", "q", "search", "keyword", "text", "regex", "regexp", "term", "find", "needle", "content"],
        isFilled,
      )
      assign(
        input,
        "path",
        ["directory", "dir", "cwd", "folder", "root", "file_path", "filepath", "filePath", "filename", "target", "uri"],
        isFilled,
      )
      assign(
        input,
        "include",
        ["glob", "file_pattern", "file_glob", "filePattern", "filter", "file", "files", "pattern_glob"],
        isFilled,
      )
      break
    }
    case "glob": {
      assign(
        input,
        "pattern",
        [
          "query",
          "q",
          "search",
          "glob",
          "file_pattern",
          "file_glob",
          "filePattern",
          "path_pattern",
          "pattern_glob",
          "find",
          "name",
          "filename",
          "file",
        ],
        isFilled,
      )
      assign(
        input,
        "path",
        ["directory", "dir", "cwd", "folder", "root", "file_path", "filepath", "filePath", "filename", "target", "uri"],
        isFilled,
      )
      // A model that sends the pattern in `path` is common. Move it when it looks like
      // a glob, then fall back to every file so the call still does something useful.
      if (!isFilled(input.pattern) && isFilled(input.path) && /[*?[\]]/.test(input.path)) {
        input.pattern = input.path
        delete input.path
      }
      if (!isFilled(input.pattern)) input.pattern = "**/*"
      break
    }
    case "shell": {
      assign(
        input,
        "command",
        ["cmd", "command_line", "commandLine", "script", "shell_command", "shellCommand", "exec", "run"],
        isFilled,
      )
      assign(input, "workdir", ["cwd", "dir", "directory", "folder", "path"], isFilled)
      break
    }
  }

  dropPlaceholderPaths(input)
  dropEmptyPaths(input)
  return input
}

/** Resolve a model's tool name to a registered one, preferring an exact name match. */
export const resolveToolAlias = (name: string, available: ReadonlyArray<string>): string | undefined => {
  if (available.includes(name)) return name
  const alias = toolAliases.get(name) ?? toolAliases.get(name.toLowerCase())
  if (alias !== undefined && available.includes(alias)) return alias
  return undefined
}

export const availableToolNames = (names: Iterable<string>): ReadonlyArray<string> =>
  [...new Set(names)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))

/** The model-facing error for an unknown tool, including what it may call instead. */
export const noSuchToolMessage = (name: string, available: Iterable<string>): string => {
  const names = availableToolNames(available)
  return names.length === 0
    ? `No tool named "${name}" is currently available.`
    : `No tool named "${name}" is currently available. Available tools: ${names.join(", ")}.`
}

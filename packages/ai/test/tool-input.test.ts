import { describe, expect, test } from "bun:test"
import { noSuchToolMessage, normalizeInput, resolveToolAlias } from "../src/tool-input.js"

describe("resolveToolAlias", () => {
  test("maps harness tool names to the registered canonical tool", () => {
    expect(resolveToolAlias("bash", ["shell"])).toBe("shell")
    expect(resolveToolAlias("search", ["grep"])).toBe("grep")
    expect(resolveToolAlias("grep_search", ["grep"])).toBe("grep")
    expect(resolveToolAlias("find", ["glob"])).toBe("glob")
    expect(resolveToolAlias("read_file", ["read"])).toBe("read")
    expect(resolveToolAlias("write_file", ["write"])).toBe("write")
    expect(resolveToolAlias("edit_file", ["edit"])).toBe("edit")
  })

  test("prefers an exact tool name over an alias", () => {
    expect(resolveToolAlias("search", ["grep", "search"])).toBe("search")
  })

  test("leaves an unknown or unavailable alias unresolved", () => {
    expect(resolveToolAlias("search", ["read"])).toBeUndefined()
    expect(resolveToolAlias("not_a_tool", ["read"])).toBeUndefined()
  })
})

describe("normalizeInput", () => {
  const cases: ReadonlyArray<{
    name: string
    tool: string
    input: unknown
    expected: unknown
  }> = [
    {
      name: "read moves filePath to path",
      tool: "read",
      input: { filePath: "C:\\Users\\me\\Downloads\\random shit\\a.ts" },
      expected: { path: "C:\\Users\\me\\Downloads\\random shit\\a.ts" },
    },
    {
      name: "read keeps the first usable path alternate and drops empty ones",
      tool: "read",
      input: { file_path: "", file: "src/a.ts" },
      expected: { path: "src/a.ts" },
    },
    {
      name: "write repairs path and content",
      tool: "write",
      input: { filePath: "a.txt", text: "hello" },
      expected: { path: "a.txt", content: "hello" },
    },
    {
      name: "edit repairs path, oldString and newString",
      tool: "edit",
      input: { file: "a.ts", old: "before", replacement: "after" },
      expected: { path: "a.ts", oldString: "before", newString: "after" },
    },
    {
      name: "grep repairs pattern, path and include",
      tool: "grep",
      input: { query: "needle", directory: "src", glob: "*.ts" },
      expected: { pattern: "needle", path: "src", include: "*.ts" },
    },
    {
      name: "grep accepts cwd and file filter",
      tool: "grep",
      input: { q: "needle", cwd: "C:\\Users\\me\\Downloads\\random shit", file: "*.md" },
      expected: { pattern: "needle", path: "C:\\Users\\me\\Downloads\\random shit", include: "*.md" },
    },
    {
      name: "glob repairs a pattern alternate",
      tool: "glob",
      input: { query: "**/*.ts" },
      expected: { pattern: "**/*.ts" },
    },
    {
      name: "glob moves a glob path into pattern",
      tool: "glob",
      input: { path: "src/**/*.ts" },
      expected: { pattern: "src/**/*.ts" },
    },
    {
      name: "glob defaults a missing pattern and keeps a directory path",
      tool: "glob",
      input: { path: "C:\\Users\\me\\Downloads\\random shit" },
      expected: { pattern: "**/*", path: "C:\\Users\\me\\Downloads\\random shit" },
    },
    {
      name: "glob strips literal undefined from path",
      tool: "glob",
      input: { path: "undefined", pattern: "*.ts" },
      expected: { pattern: "*.ts" },
    },
    {
      name: "shell repairs command and workdir",
      tool: "shell",
      input: { cmd: "ls", cwd: "/tmp" },
      expected: { command: "ls", workdir: "/tmp" },
    },
    {
      name: "parses a stringified input object",
      tool: "read",
      input: '{"filePath":"a.ts"}',
      expected: { path: "a.ts" },
    },
  ]

  for (const item of cases) {
    test(item.name, () => {
      expect(normalizeInput(item.tool, item.input)).toEqual(item.expected)
    })
  }
})

describe("noSuchToolMessage", () => {
  test("lists sorted available tools", () => {
    expect(noSuchToolMessage("missing", ["write", "edit", "edit", "read"])).toBe(
      'No tool named "missing" is currently available. Available tools: edit, read, write.',
    )
  })

  test("omits the list when no tools are available", () => {
    expect(noSuchToolMessage("missing", [])).toBe('No tool named "missing" is currently available.')
  })
})

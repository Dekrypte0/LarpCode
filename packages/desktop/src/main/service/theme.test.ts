import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
let root = ""

mock.module("electron", () => ({
  app: { getPath: () => root },
  ipcMain: {
    removeHandler: (channel: string) => handlers.delete(channel),
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
  },
}))

const { registerTheme } = await import("./theme")
const previousDataHome = process.env.XDG_DATA_HOME

const invoke = async (channel: string, ...args: unknown[]) => {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`Missing handler: ${channel}`)
  return handler({}, ...args)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "larpcode-theme-"))
  process.env.XDG_DATA_HOME = root
  handlers.clear()
  registerTheme()
})

afterEach(async () => {
  if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = previousDataHome
  await rm(root, { recursive: true, force: true })
})

test("persists a trimmed theme id under the XDG data directory", async () => {
  expect(await invoke("larpcode:theme-set", "  dark  ")).toEqual({ ok: true })
  expect(await readFile(path.join(root, "opencode", "theme.json"), "utf8")).toBe('{\n  "id": "dark"\n}\n')
  expect(await invoke("larpcode:theme-get")).toBe("dark")
})

test("rejects an empty or non-string theme id without writing", async () => {
  expect(await invoke("larpcode:theme-set", "   ")).toEqual({ ok: false })
  expect(await invoke("larpcode:theme-set", 42)).toEqual({ ok: false })
  expect(await readFile(path.join(root, "opencode", "theme.json"), "utf8").catch(() => undefined)).toBeUndefined()
})

test("reads a legacy theme field and returns null for missing or malformed files", async () => {
  const file = path.join(root, "opencode", "theme.json")
  await Bun.write(file, JSON.stringify({ theme: "light" }))
  expect(await invoke("larpcode:theme-get")).toBe("light")

  await Bun.write(file, "not json")
  expect(await invoke("larpcode:theme-get")).toBeNull()

  await rm(file)
  expect(await invoke("larpcode:theme-get")).toBeNull()
})

test("answers backdrop luminance with null", async () => {
  expect(await invoke("larpcode:backdrop-luminance")).toBeNull()
})

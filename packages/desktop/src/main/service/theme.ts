import { app, ipcMain } from "electron"
import fs from "node:fs/promises"
import path from "node:path"

const themeFile = () =>
  path.join(process.env.XDG_DATA_HOME ?? path.join(app.getPath("userData"), "xdg", "data"), "opencode", "theme.json")

export function registerTheme(): void {
  ipcMain.removeHandler("larpcode:theme-get")
  ipcMain.handle("larpcode:theme-get", async () => {
    try {
      const data = JSON.parse(await fs.readFile(themeFile(), "utf8")) as unknown
      if (typeof data === "string") return data
      if (typeof data !== "object" || data === null) return null
      if ("id" in data && typeof data.id === "string") return data.id
      // Older builds wrote `{ theme }`; keep those users' selection readable.
      if ("theme" in data && typeof data.theme === "string") return data.theme
      return null
    } catch {
      return null
    }
  })

  ipcMain.removeHandler("larpcode:theme-set")
  ipcMain.handle("larpcode:theme-set", async (_, id: unknown) => {
    if (typeof id !== "string" || id.trim() === "") return { ok: false }
    try {
      const file = themeFile()
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, `${JSON.stringify({ id: id.trim() }, null, 2)}\n`, "utf8")
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.removeHandler("larpcode:backdrop-luminance")
  ipcMain.handle("larpcode:backdrop-luminance", async () => null)
}

/** @deprecated Use registerTheme. */
export const registerThemeHandlers = registerTheme

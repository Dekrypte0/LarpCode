import { createStore } from "solid-js/store"
import { Show } from "solid-js"
import { useServers } from "@/runtime/server/registry"
import { authTokenFromCredentials } from "@/runtime/server/api"

// LarpCode website pill. Rendered to the right of the Usage reset pill at
// the bottom-left corner of the renderer. Shelling to the OS browser via
// an anchor with target="_blank" routes through Electron's main-process
// `handleWillNavigate → shell.openExternal`, so the link opens in the user's
// default browser instead of hijacking the renderer window.
function openWebsite() {
  if (typeof window === "undefined") return
  const bridge = (window as unknown as { electron?: { larpcode?: { openWebsite?: () => Promise<unknown> } } }).electron
    ?.larpcode
  void bridge?.openWebsite?.()
}

export function LarpcodeWebsiteFab() {
  return (
    <button
      type="button"
      data-slot="larpcode-website-pill"
      onClick={openWebsite}
      aria-label="Open LarpCode on GitHub"
      title="Visit LarpCode on GitHub"
      class="group fixed bottom-4 left-[9.5rem] z-[9999] inline-flex h-8 cursor-pointer appearance-none items-center gap-1.5 rounded-full border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 text-[11px] leading-4 font-[530] text-v2-text-text-muted no-underline shadow-sm transition-[background-color,border-color,color] duration-150 ease-out hover:border-v2-border-border-base hover:bg-v2-background-bg-layer-03 hover:text-v2-text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-border-border-focus motion-reduce:transition-none [app-region:no-drag]"
      
    >
      <span class="flex h-4 w-4 shrink-0 items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M1.5 8h13" />
          <path d="M8 1.5c1.8 2 2.75 4.1 2.75 6.5S9.8 12.5 8 14.5" />
          <path d="M8 1.5c-1.8 2-2.75 4.1-2.75 6.5S6.2 12.5 8 14.5" />
        </svg>
      </span>
      <span class="whitespace-nowrap">GitHub</span>
    </button>
  )
}

// LarpCode Reset pill. Pinned to the bottom-left corner so it clears the
// Windows window chrome (min / max / close at top-right) and the composer
// (bottom-right).
//
// The server clears local usage counters and cooldowns. Sessions and
// provider-side limits are left untouched.
export function LarpcodeResetFab() {
  const servers = useServers()
  const [s, set] = createStore({
    running: false,
    done: false,
    failed: false,
    count: 0,
    errorMsg: "" as string,
    phase: "" as "" | "reset",
  })
  const trigger = async () => {
    // Reset local usage state only; this must not remove chat history.
    set({ running: true, done: false, failed: false, count: 0, errorMsg: "", phase: "reset" })
    let hit = 0
    let lastError = ""
    let serverCount = 0
    try {
      for (const conn of servers.list) {
        if (!("http" in conn) || !conn.http?.url) continue
        serverCount++
        const headers: Record<string, string> = { "content-type": "application/json" }
        if (conn.http.password)
          headers.authorization = `Basic ${authTokenFromCredentials({ password: conn.http.password })}`

        const url = new URL("/_larpcode/reset-limits", conn.http.url)
        // No `credentials: "include"`: Electron's main process injects the
        // sidecar Authorization header for every renderer→loopback request
        // (see packages/desktop/src/main/windows/security.ts), and adding
        // credentials here forces a CORS preflight the server does not allow.
        const response = await fetch(url, { method: "POST", headers })
        if (response.ok) {
          const body = await response.json().catch(() => undefined)
          if (body?.ok !== true) {
            lastError = String(body?.error || body?.handler_error || "reset failed")
            continue
          }
          hit++
          lastError = ""
          continue
        }
        // Prefer a backend-supplied error message. When the response has no
        // parseable JSON body (common for 404/405/method-not-allowed), fall
        // back to the HTTP status so the user sees something actionable
        // instead of a generic "no servers". "no servers" used to swallow
        // every 4xx — a 405 on an un-registered /_larpcode route is a very
        // different problem from zero servers in the list.
        let msg = ""
        try {
          const body = (await response.json()) as { error?: string }
          if (body?.error) msg = body.error
        } catch {}
        if (!msg) msg = `HTTP ${response.status}`
        lastError = msg
      }
      if (hit === 0) {
        // Three distinguishable failure modes: no servers were registered,
        // a server was there but every request failed, or something else.
        if (serverCount === 0) throw new Error("no backend connected — open a project first")
        throw new Error(lastError || "reset failed")
      }
      set({ running: false, done: true, failed: false, count: hit, errorMsg: lastError, phase: "" })
      // Refresh usage totals after the local counters are cleared.
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload()
      }, 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : lastError || "reset failed"
      set({ running: false, done: false, failed: true, count: 0, errorMsg: msg, phase: "" })
      setTimeout(
        () => set({ running: false, done: false, failed: false, count: 0, errorMsg: "", phase: "" }),
        6000,
      )
    }
  }
  const label = () => {
    if (s.running) return "Resetting…"
    if (s.done) return "Reset ✓"
    if (s.failed) {
      if (!s.errorMsg) return "Retry"
      // Short label on the fixed-width pill; full error available on hover
      // via the `title` attribute set on the button element.
      return s.errorMsg.length > 16 ? s.errorMsg.slice(0, 13) + "…" : s.errorMsg
    }
    return "Usage reset"
  }
  return (
    <button
      data-slot="larpcode-reset-pill"
      type="button"
      onClick={() => trigger()}
      disabled={s.running || s.done}
      aria-busy={s.running}
      aria-label="Reset local usage counters and cooldowns"
      title={s.errorMsg || undefined}
      class="group fixed bottom-4 left-4 z-[9999] inline-flex h-8 w-[8rem] items-center gap-1.5 rounded-full border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 text-[11px] leading-4 font-[530] text-v2-text-text-muted shadow-sm transition-[background-color,border-color,color] duration-150 ease-out hover:border-v2-border-border-base hover:bg-v2-background-bg-layer-03 hover:text-v2-text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-border-border-focus disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none [app-region:no-drag]"
      classList={{
        "border-v2-state-fg-danger! text-v2-state-fg-danger! hover:bg-v2-state-bg-danger!": s.failed,
        "border-v2-text-text-success! text-v2-text-text-success!": s.done,
      }}
    >
      <span class="flex h-4 w-4 shrink-0 items-center justify-center">
        <Show
          when={!s.running}
          fallback={
            <span
              aria-hidden="true"
              class="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-80"
            />
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <Show
              when={s.done}
              fallback={
                <Show
                  when={s.failed}
                  fallback={
                    <>
                      <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" />
                      <path d="M13.5 3v3h-3" />
                    </>
                  }
                >
                  <path d="M8 3v5" />
                  <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                </Show>
              }
            >
              <path d="M3 8.5l3 3 7-7" />
            </Show>
          </svg>
        </Show>
      </span>
      <span class="whitespace-nowrap">{label()}</span>
    </button>
  )
}

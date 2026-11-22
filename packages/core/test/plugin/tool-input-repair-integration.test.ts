import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Agent } from "@opencode/core/agent"
import { Plugin } from "@opencode/core/plugin"
import { ToolInputRepairPlugin } from "@opencode/core/plugin/tool-input-repair"
import { Session } from "@opencode/core/session"
import { SessionMessage } from "@opencode/core/session/message"
import { Tool } from "@opencode/core/tool"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)
const identity = {
  sessionID: Session.ID.make("ses_repair"),
  agent: Agent.ID.make("build"),
  messageID: SessionMessage.ID.make("msg_repair"),
}

it.effect("repairs tool input before validating its original schema", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const registry = yield* Tool.Service
    const executed: unknown[] = []
    yield* plugins.activate([
      { ...ToolInputRepairPlugin.Plugin, revision: "1" },
      {
        id: "repairable-tool",
        revision: "1",
        effect: (ctx) =>
          ctx.tool.transform((draft) =>
            draft.add({
              name: "repairable",
              options: { codemode: false },
              description: "Repairable",
              input: Schema.Struct({ count: Schema.Int, enabled: Schema.Boolean }),
              execute: (input) => Effect.sync(() => executed.push(input)).pipe(Effect.as({ content: "ok" })),
            }),
          ),
      },
    ])
    const snapshot = yield* registry.snapshot()
    yield* snapshot.execute({
      ...identity,
      call: {
        type: "tool-call",
        id: "call-repair",
        name: "repairable",
        input: '{"count":"2","enabled":"true","extra":true}',
      },
    })
    expect(executed).toEqual([{ count: 2, enabled: true }])

    yield* registry.transform((draft) => {
      draft.update("repairable", (tool) => {
        tool.input = Schema.Struct({ count: Schema.Boolean, enabled: Schema.Boolean })
      })
    })
    const updated = yield* registry.snapshot()
    yield* updated.execute({
      ...identity,
      call: {
        type: "tool-call",
        id: "call-updated",
        name: "repairable",
        input: { count: "false", enabled: "true" },
      },
    })
    expect(executed).toEqual([
      { count: 2, enabled: true },
      { count: false, enabled: true },
    ])

    yield* registry.transform((draft) => draft.remove("repairable"))
    const removed = yield* registry.snapshot()
    expect(
      (yield* removed
        .execute({
          ...identity,
          call: { type: "tool-call", id: "call-removed", name: "repairable", input: {} },
        })
        .pipe(Effect.flip)).message,
    ).toBe('No tool named "repairable" is currently available. Available tools: execute.')
  }),
)

it.effect("runs a call to another harness's tool name as the matching tool and says so", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const registry = yield* Tool.Service
    const executed: unknown[] = []
    yield* plugins.activate([
      { ...ToolInputRepairPlugin.Plugin, revision: "1" },
      {
        id: "shell-tool",
        revision: "1",
        effect: (ctx) =>
          ctx.tool.transform((draft) =>
            draft.add({
              name: "shell",
              options: { codemode: false },
              description: "Shell",
              input: Schema.Struct({ command: Schema.String, timeout: Schema.optionalKey(Schema.Int) }),
              execute: (input) => Effect.sync(() => executed.push(input)).pipe(Effect.as({ content: "done" })),
            }),
          ),
      },
    ])
    const snapshot = yield* registry.snapshot()
    const result = yield* snapshot.execute({
      ...identity,
      call: { type: "tool-call", id: "call-bash", name: "bash", input: { command: "ls", timeout: "5000" } },
    })
    expect(executed).toEqual([{ command: "ls", timeout: 5000 }])
    expect(result.content).toEqual([
      { type: "text", text: "done" },
      { type: "text", text: 'There is no "bash" tool, so this ran as "shell". Call "shell" directly.' },
    ])

    const direct = yield* snapshot.execute({
      ...identity,
      call: { type: "tool-call", id: "call-shell", name: "shell", input: { command: "pwd" } },
    })
    expect(direct.content).toEqual([{ type: "text", text: "done" }])
  }),
)

it.effect("maps search aliases to grep and repairs its argument names", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const registry = yield* Tool.Service
    const executed: unknown[] = []
    yield* plugins.activate([
      { ...ToolInputRepairPlugin.Plugin, revision: "1" },
      {
        id: "grep-tool",
        revision: "1",
        effect: (ctx) =>
          ctx.tool.transform((draft) =>
            draft.add({
              name: "grep",
              options: { codemode: false },
              description: "Grep",
              input: Schema.Struct({
                pattern: Schema.String,
                path: Schema.optionalKey(Schema.String),
                include: Schema.optionalKey(Schema.String),
              }),
              execute: (input) => Effect.sync(() => executed.push(input)).pipe(Effect.as({ content: "matches" })),
            }),
          ),
      },
    ])
    const snapshot = yield* registry.snapshot()
    const result = yield* snapshot.execute({
      ...identity,
      call: {
        type: "tool-call",
        id: "call-search",
        name: "search",
        input: { query: "needle", directory: "src", glob: "*.ts" },
      },
    })
    expect(executed).toEqual([{ pattern: "needle", path: "src", include: "*.ts" }])
    expect(result.content).toEqual([
      { type: "text", text: "matches" },
      { type: "text", text: 'There is no "search" tool, so this ran as "grep". Call "grep" directly.' },
    ])
  }),
)

it.effect("repairs read path aliases", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const registry = yield* Tool.Service
    const executed: unknown[] = []
    yield* plugins.activate([
      { ...ToolInputRepairPlugin.Plugin, revision: "1" },
      {
        id: "read-tool",
        revision: "1",
        effect: (ctx) =>
          ctx.tool.transform((draft) =>
            draft.add({
              name: "read",
              options: { codemode: false },
              description: "Read",
              input: Schema.Struct({ path: Schema.String }),
              execute: (input) => Effect.sync(() => executed.push(input)).pipe(Effect.as({ content: "read" })),
            }),
          ),
      },
    ])
    const snapshot = yield* registry.snapshot()
    yield* snapshot.execute({
      ...identity,
      call: {
        type: "tool-call",
        id: "call-read",
        name: "read_file",
        input: { filePath: "C:\\Users\\me\\Downloads\\random shit\\a.ts" },
      },
    })
    expect(executed).toEqual([{ path: "C:\\Users\\me\\Downloads\\random shit\\a.ts" }])
  }),
)

it.effect("repairs namespaced inner tool input called from Code Mode", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const registry = yield* Tool.Service
    const executed: unknown[] = []
    yield* plugins.activate([{ ...ToolInputRepairPlugin.Plugin, revision: "1" }])
    yield* registry.transform((draft) =>
      draft.add({
        name: "count",
        options: { namespace: "example" },
        description: "Record a count",
        input: Schema.Struct({ count: Schema.Int }),
        execute: (input) => Effect.sync(() => executed.push(input)).pipe(Effect.as({ content: "ok" })),
      }),
    )

    const snapshot = yield* registry.snapshot()
    yield* snapshot.execute({
      ...identity,
      call: {
        type: "tool-call",
        id: "call-codemode-repair",
        name: "execute",
        input: { code: 'return await tools.example.count({ count: "3" })' },
      },
    })
    expect(executed).toEqual([{ count: 3 }])
  }),
)

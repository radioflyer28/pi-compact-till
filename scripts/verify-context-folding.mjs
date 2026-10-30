// Reproduce Pi's context-hook system folding with non-sensitive synthetic input.
// node scripts/verify-context-folding.mjs <installed-pi-package-path>
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2]);
const { ExtensionRunner } = await import(pathToFileURL(join(root, "dist/core/extensions/runner.js")));
const { convertToLlm } = await import(pathToFileURL(join(root, "dist/core/messages.js")));
const { convertResponsesMessages } = await import(pathToFileURL(join(dirname(root), "pi-ai/dist/api/openai-responses-shared.js")));
const { registerAdvisoryDelivery } = await import("../extensions/advisory-delivery.ts");
const tool = { name: "read", description: "Read", parameters: { type: "object", properties: {} } };
const model = { id: "test", provider: "openai", api: "openai-responses", reasoning: true, input: ["text"] };
const messages = [
	{ role: "system", content: "Initial instructions", toolsAdded: [], timestamp: 0 },
	{ role: "user", content: "Continue the task", timestamp: 1 },
	{ role: "system", content: "Later instructions", toolsAdded: [tool], timestamp: 2 },
];
const serialize = (input) => convertResponsesMessages(model, { messages: convertToLlm(input) }, new Set(["openai"]), { supportsMidConvoSystemMessages: true, supportsAdditionalTools: true });
const oldHandlers = new Map([["context", [(event) => ({ messages: [...event.messages, { role: "custom", customType: "advisory", content: "Choose a boundary", display: false, timestamp: 3 }] })]]]);
const runner = (handlers) => new ExtensionRunner([{ path: "synthetic-test", handlers }], {}, process.cwd(), {}, {});
const folded = await runner(oldHandlers).emitContext(messages);
assert.equal(folded.filter((message) => message.role === "system").length, 1);
assert.notDeepEqual(serialize(folded)[0], serialize(messages)[0], "Old context injection rewrites the leading provider input");

const handlers = new Map();
registerAdvisoryDelivery({ on: (name, handler) => handlers.set(name, [handler]) }, () => "Choose a boundary");
assert(!handlers.has("context"));
const event = { content: [{ type: "text", text: "Original result" }], isError: false };
const update = handlers.get("tool_result")[0](event, {});
const result = { role: "toolResult", toolCallId: "call", toolName: "read", ...event, ...update, timestamp: 4 };
const assistant = { role: "assistant", api: model.api, provider: model.provider, model: model.id, content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }], stopReason: "toolUse", timestamp: 3 };
const next = [...messages, assistant, result];
const preserved = await runner(handlers).emitContext(next);
assert.equal(preserved.filter((message) => message.role === "system").length, 2);
assert.deepEqual(serialize(preserved).slice(0, serialize(messages).length), serialize(messages), "New delivery preserves the system/tool prefix through the real context runner");
assert.equal(preserved.filter((message) => message.role === "user").length, 1);
console.log(JSON.stringify({ oldDeliveryFoldsSystemHistory: true, newDeliveryPreservesPrefix: true, network: false, passed: true }));

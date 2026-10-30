// Offline real-runtime persistence and OpenAI serialization test. No provider network calls.
// node scripts/verify-advisory-cache.mjs <installed-pi-package-path> [proactive|threshold] [ignore|defer|native|failed|supersede] [extension-path]
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2]);
const mode = process.argv[3] ?? "proactive";
const action = process.argv[4] ?? "defer";
assert(["proactive", "threshold"].includes(mode));
assert(["ignore", "defer", "native", "failed", "supersede"].includes(action));
assert(mode !== "threshold" || !["failed", "supersede"].includes(action), "Threshold execution has a separate regression harness");
const sdk = await import(pathToFileURL(join(root, "dist/index.js")));
const aiRoot = join(dirname(root), "pi-ai");
const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import(pathToFileURL(join(aiRoot, "dist/index.js")));
const { convertResponsesMessages } = await import(pathToFileURL(join(aiRoot, "dist/api/openai-responses-shared.js")));
const temporary = await mkdtemp(join(tmpdir(), "pi-advisory-cache-"));
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
const oldOffline = process.env.PI_OFFLINE;
process.env.PI_CODING_AGENT_DIR = temporary;
process.env.PI_OFFLINE = "1";
let session;
try {
	const runtime = await sdk.ModelRuntime.create({ authPath: join(temporary, "auth.json"), modelsPath: null, modelsStorePath: join(temporary, "models-store.json"), refreshOnCreate: false, allowModelNetwork: false });
	const fake = fauxProvider({ provider: "cache-test", models: [{ id: "local", contextWindow: 120_000, maxTokens: 8192 }], tokensPerSecond: 0 });
	runtime.registerNativeProvider(fake.provider);
	const model = fake.getModel();
	const manager = sdk.SessionManager.inMemory(temporary);
	// Seed historical system state so later prompt/tool updates must remain in place.
	manager.appendMessage({ role: "system", content: "Historical developer instructions.", toolsAdded: [], timestamp: 0 });
	manager.appendMessage({ role: "user", content: "Investigate. " + "evidence ".repeat(6000), timestamp: 1 });
	const prior = fauxAssistantMessage("Completed investigation. " + "detail ".repeat(20_000));
	prior.model = model.id; prior.provider = model.provider;
	const usage = { input: 84_000, output: 1000, cacheRead: 0, cacheWrite: 0, totalTokens: 85_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	prior.usage = usage;
	manager.appendMessage(prior);
	const settings = sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, defaultThinkingLevel: "off" });
	const loader = new sdk.DefaultResourceLoader({ cwd: temporary, agentDir: temporary, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, additionalExtensionPaths: [resolve(process.argv[5] ?? "extensions/compact-until.ts")], systemPrompt: "Offline cache stability test." });
	await loader.reload();
	assert.deepEqual(loader.getExtensions().errors, []);
	loader.getExtensions().runtime.flagValues.set("compact-until-advisory-mode", mode);
	if (action === "supersede") loader.getExtensions().runtime.flagValues.set("compact-until-high-pressure", "85");
	const snapshots = [];
	let offer;
	let delivered;
	const marker = "--- Pi compaction advisory (extension-generated; not tool output) ---";
	const wire = (context) => convertResponsesMessages(model, context, new Set([model.provider]), { supportsMidConvoSystemMessages: true, supportsAdditionalTools: true });
	const capture = (context) => {
		assert(context.messages.filter((message) => message.role === "system").length >= 2, "Fixture must exercise incremental system state, not only a single leading prompt");
		const input = wire(context);
		const previous = snapshots.at(-1);
		if (previous) assert.deepEqual(input.slice(0, previous.length), previous, "Every main request must preserve the entire preceding serialized prefix");
		snapshots.push(structuredClone(input));
		assert.equal(context.messages.filter((message) => message.role === "user").length, 2, "Advisories must not create user turns");
		const results = context.messages.filter((message) => message.role === "toolResult" && JSON.stringify(message.content).includes(marker));
		if (snapshots.length > 1) {
			assert.equal(results.length, action === "supersede" && snapshots.length === 4 ? 2 : 1, "Advisories must remain in place; only escalation appends a second one");
			if (delivered) assert.deepEqual(results[0], delivered);
			else delivered = structuredClone(results[0]);
		}
	};
	const call = (name, args) => {
		const response = fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
		response.usage = { ...usage, input: 85_000, output: 100, totalTokens: 85_100 };
		return response;
	};
	const steps = [
		(context) => { capture(context); return call("list_compaction_boundaries", {}); },
		(context) => {
			capture(context);
			const record = manager.getBranch().find((entry) => entry.type === "custom" && (mode === "proactive" ? entry.customType === "compact-until-proactive-v1" && entry.data.kind === "offer" : entry.customType === "compact-until-advisory-offer"));
			offer = mode === "proactive" ? record?.data.offer : record?.data;
			assert(offer, "Offer state must be persisted before the model sees it");
			return mode === "proactive" ? call("inspect_compaction_option", { offerId: offer.id, optionId: offer.options[0].optionId }) : call("list_compaction_boundaries", {});
		},
		(context) => {
			capture(context);
			if (action === "supersede") {
				// Force escalation independently of host-specific usage estimation.
				loader.getExtensions().runtime.flagValues.set("compact-until-proactive-threshold", "30");
				loader.getExtensions().runtime.flagValues.set("compact-until-high-pressure", "40");
				const response = call("list_compaction_boundaries", {});
				response.usage = { ...usage, input: 90_000, output: 100, totalTokens: 90_100 };
				return response;
			}
			if (action === "ignore" || (mode === "threshold" && action === "defer")) return call("list_compaction_boundaries", {});
			if (mode === "threshold") return call("choose_compaction_boundary", { offerId: offer.offerId, optionId: "native" });
			return call("respond_compaction_advisory", { offerId: offer.id, action: action === "failed" ? "compact" : action, optionId: offer.options[0].optionId, reason: "Offline verification", preserve: [] });
		},
	];
	if (action === "failed") steps.push(() => fauxAssistantMessage("Invalid summary"), () => fauxAssistantMessage("Still invalid"));
	steps.push((context) => { capture(context); return fauxAssistantMessage("Finished without compaction."); });
	fake.setResponses(steps);
	const errors = [];
	({ session } = await sdk.createAgentSession({ cwd: temporary, agentDir: temporary, modelRuntime: runtime, model, thinkingLevel: "off", settingsManager: settings, sessionManager: manager, resourceLoader: loader, tools: ["list_compaction_boundaries", "inspect_compaction_option", "respond_compaction_advisory", "choose_compaction_boundary"] }));
	await session.bindExtensions({ onError: (error) => errors.push(error) });
	await session.prompt("Verify the current fix.");
	assert.deepEqual(errors, []);
	assert.equal(session.getLastAssistantText(), "Finished without compaction.", JSON.stringify({ usage: session.getContextUsage(), offers: manager.getBranch().filter((entry) => entry.type === "custom" && entry.data?.kind === "offer").map((entry) => ({ pressure: entry.data.offer.pressure, percent: entry.data.offer.percent })), last: manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "assistant").at(-1)?.message.errorMessage }));
	assert.equal(snapshots.length, 4);
	assert.equal(fake.state.callCount, action === "failed" ? 6 : 4);
	assert.equal(manager.getBranch().filter((entry) => entry.type === "compaction").length, 0);
	if (action === "failed") assert(manager.getBranch().some((entry) => entry.type === "custom" && entry.data?.status === "invalid-summary"));
	// Rebuild from persisted entries, the same source used for reload/resume.
	const rebuilt = wire({ messages: sdk.convertToLlm(manager.buildSessionContext().messages) });
	assert.deepEqual(rebuilt.slice(0, snapshots.at(-1).length), snapshots.at(-1));
	const stored = manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "toolResult" && JSON.stringify(entry.message.content).includes(marker));
	assert.equal(stored.length, action === "supersede" ? 2 : 1);
	assert.deepEqual(stored[0].message, delivered);
	console.log(JSON.stringify({ runtime: sdk.VERSION, mode, action, passed: true, mainRequests: snapshots.length, persistentAdvisories: stored.length, prefixPreserved: true, syntheticUserMessages: 0, network: false }));
} finally {
	session?.dispose();
	if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
	if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline;
	await rm(temporary, { recursive: true, force: true });
}

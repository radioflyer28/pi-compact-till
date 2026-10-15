// Offline native-threshold regression. No real provider calls or installed-file writes.
// node scripts/verify-native-threshold-pi12.mjs <pi-package> <repair|fallback|baseline> [extension-entry]
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
const [packagePath, scenario = "repair", extensionPath = "extensions/compact-until.ts"] = process.argv.slice(2);
assert(packagePath && ["repair", "fallback", "baseline"].includes(scenario));
const root = resolve(packagePath);
const sdk = await import(pathToFileURL(join(root, "dist/index.js")));
const { fauxProvider, fauxAssistantMessage } = await import(pathToFileURL(join(dirname(root), "pi-ai/dist/index.js")));
const temporary = await mkdtemp(join(tmpdir(), "pi-threshold-regression-"));
const oldDir = process.env.PI_CODING_AGENT_DIR;
const oldOffline = process.env.PI_OFFLINE;
process.env.PI_CODING_AGENT_DIR = temporary;
process.env.PI_OFFLINE = "1";
let session;
try {
	const runtime = await sdk.ModelRuntime.create({ authPath: join(temporary, "auth.json"), modelsPath: null, modelsStorePath: join(temporary, "models-store.json"), refreshOnCreate: false, allowModelNetwork: false });
	const fake = fauxProvider({ provider: "threshold-test", models: [{ id: "local", contextWindow: 120_000, maxTokens: 8_192 }], tokensPerSecond: 0 });
	runtime.registerNativeProvider(fake.provider);
	const manager = sdk.SessionManager.inMemory(temporary);
	manager.appendMessage({ role: "user", content: "Original regression request. " + "initial ".repeat(37_500), timestamp: 1 });
	for (const content of ["Older investigation. " + "older ".repeat(10_000), "KEEP-EXACT-EVIDENCE " + "keep ".repeat(12_000)]) {
		const message = fauxAssistantMessage(content);
		message.model = "local"; message.provider = "threshold-test";
		message.usage = { input: 109_000, output: 1_000, cacheRead: 0, cacheWrite: 0, totalTokens: 110_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
		manager.appendMessage(message);
	}
	const selectedId = manager.getLeafId();
	const original = manager.getBranch().filter((entry) => entry.type === "message");
	// Rehydrate the same persisted authorization schema used by the real selection
	// tool. The trigger and compaction lifecycle below are native, not mocked hooks.
	const identity = { schemaVersion: 1, offerId: "threshold-regression", sessionId: manager.getSessionId(), epochId: `${manager.getSessionId()}:initial` };
	manager.appendCustomEntry("compact-until-advisory-offer", { ...identity, thresholdPercent: 70, options: [{ optionId: "B1", firstKeptEntryId: selectedId, kind: "agent-checkpoint", preview: "KEEP-EXACT-EVIDENCE", retainedTokens: 15_000, reclaimedTokens: 90_000, projectedTokensAfter: 23_192, splitTurn: true }] });
	manager.appendCustomEntry("compact-until-advisory-decision", { ...identity, decision: "targeted", firstKeptEntryId: selectedId, kind: "agent-checkpoint", summaryFocus: "Preserve regression focus" });
	const settings = sdk.SettingsManager.inMemory({ compaction: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 }, retry: { enabled: false }, defaultThinkingLevel: "off" });
	const reasons = [], warnings = [], errors = [], prompts = [];
	const loader = new sdk.DefaultResourceLoader({ cwd: temporary, agentDir: temporary, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, additionalExtensionPaths: [resolve(extensionPath)], systemPrompt: "Offline native compaction regression.", extensionFactories: [(pi) => {
		pi.on("session_before_compact", (event) => { reasons.push(event.reason); });
	}] });
	await loader.reload();
	assert.deepEqual(loader.getExtensions().errors, []);
	loader.getExtensions().runtime.flagValues.set("compact-until-advisory-mode", "threshold");
	const valid = "## Original Request\nFix the regression.\n\n## Progress So Far\n- Investigation complete.\n\n## Context Needed to Continue\n- Preserve regression focus and retained evidence.";
	const malformed = "## Original Request\nFix the regression.\n\nMissing progress and continuation sections.";
	const summarize = (context) => {
		const text = JSON.stringify(context); prompts.push(text);
		return fauxAssistantMessage(scenario === "repair" && text.includes("Required structural repair") ? valid : malformed);
	};
	const continuation = (context) => {
		assert(JSON.stringify(context).includes("KEEP-EXACT-EVIDENCE"));
		assert(JSON.stringify(context).includes("Context Needed to Continue"));
		const commits = manager.getBranch().filter((entry) => entry.type === "compaction");
		assert.equal(commits.length, 1);
		if (scenario === "repair") {
			assert.equal(commits[0].firstKeptEntryId, selectedId);
			assert.equal(commits[0].details.compactUntil.advisory.trigger, "threshold");
		} else {
			assert.equal(commits[0].details?.compactUntil, undefined, "Fallback must be native, not an invalid targeted draft");
		}
		return fauxAssistantMessage("Continued safely after native threshold.");
	};
	fake.setResponses(scenario === "repair" ? [summarize, summarize, continuation] : [summarize, summarize, (context) => {
		prompts.push(JSON.stringify(context));
		assert(!JSON.stringify(context).includes("Required structural repair"), "Native fallback has its own prompt");
		return fauxAssistantMessage(valid);
	}, continuation]);
	({ session } = await sdk.createAgentSession({ cwd: temporary, agentDir: temporary, modelRuntime: runtime, model: fake.getModel(), thinkingLevel: "off", settingsManager: settings, sessionManager: manager, resourceLoader: loader, tools: [] }));
	const ui = new Proxy({ notify: (message, level) => warnings.push({ message, level }) }, { get: (target, key) => target[key] ?? (() => {}) });
	await session.bindExtensions({ uiContext: ui, onError: (error) => errors.push(error) });
	await session.prompt("Continue verifying the regression.");
	assert.deepEqual(reasons, ["threshold"], "Must enter actual native threshold once");
	assert.deepEqual(errors, []);
	assert.equal(session.getLastAssistantText(), "Continued safely after native threshold.");
	assert.equal(fake.state.callCount, scenario === "repair" ? 3 : 4);
	assert.equal(prompts.length, scenario === "repair" ? 2 : 3);
	if (scenario !== "baseline") {
		assert(prompts[0].includes("Preserve regression focus"));
		assert(prompts[1].includes("Required structural repair"));
	}
	if (scenario === "repair") assert.equal(warnings.length, 0);
	else {
		assert.equal(warnings.length, 1);
		assert.match(warnings[0].message, /two invalid summaries.*native threshold compaction instead/s);
		if (scenario === "baseline") {
			assert(!prompts[1].includes("Required structural repair"));
			assert.match(warnings[0].message, /## Early Progress.*## Context for Suffix/s);
		}
	}
	for (const entry of original) assert.deepEqual(manager.getEntries().find((item) => item.id === entry.id), entry, "Raw history must remain unchanged");
	console.log(JSON.stringify({ runtime: sdk.VERSION, scenario, passed: true, trigger: reasons[0], modelRequests: fake.state.callCount, warnings, extensionErrors: errors.length }));
} finally {
	session?.dispose();
	if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldDir;
	if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline;
	await rm(temporary, { recursive: true, force: true });
}

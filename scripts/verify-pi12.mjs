// Offline integration smoke test using an explicitly supplied installed Pi >=1.2.
// Usage: node scripts/verify-pi12.mjs <path-to-pi-coding-agent-package>
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = process.argv[2];
assert(packageRoot, "Supply the installed Pi package path; this test never installs dependencies.");
const scenario = process.argv[3] ?? "proactive";
assert(["proactive", "scheduled", "scheduled-low", "manual-race", "queued", "split-repair"].includes(scenario));
const scheduled = scenario === "scheduled";
let competingSender;
const root = resolve(packageRoot);
const sdk = await import(pathToFileURL(join(root, "dist/index.js")).href);
const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import(pathToFileURL(join(dirname(root), "pi-ai/dist/index.js")).href);
assert.match(sdk.VERSION, /^(?:1\.(?:[2-9]|\d{2,})\.|[2-9]\.)/, "Requires actionable boundary support in Pi >=1.2");
const temporary = await mkdtemp(join(tmpdir(), "pi-proactive-smoke-"));
const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
const oldOffline = process.env.PI_OFFLINE;
process.env.PI_CODING_AGENT_DIR = temporary;
process.env.PI_OFFLINE = "1";
const summary = `## Goal
Verify the proactive compaction workflow.

## Constraints & Preferences
- Keep current evidence verbatim.

## Progress
### Done
- [x] Completed the investigation.
### In Progress
- [ ] Verify the fix.
### Blocked
- (none)

## Key Decisions
- **Boundary**: Keep the current user request.

## Next Steps
1. Continue verification.

## Critical Context
- Preserve regression evidence.`;
let session;
try {
	const runtime = await sdk.ModelRuntime.create({ authPath: join(temporary, "auth.json"), modelsPath: null, modelsStorePath: join(temporary, "models-store.json"), refreshOnCreate: false, allowModelNetwork: false });
	const fake = fauxProvider({ provider: "proactive-test", models: [{ id: "local", contextWindow: scenario === "scheduled-low" ? 272_000 : 120_000, maxTokens: 8_192 }], tokensPerSecond: 0 });
	runtime.registerNativeProvider(fake.provider);
	const manager = sdk.SessionManager.inMemory(temporary);
	manager.appendMessage({ role: "user", content: "Investigate the regression. " + "evidence ".repeat(scenario === "split-repair" ? 16_000 : scheduled ? 18_000 : 10_000), timestamp: 1 });
	const prior = fauxAssistantMessage("Investigation complete. " + "detail ".repeat(scenario === "split-repair" ? 12_000 : 20_000));
	prior.model = "local"; prior.provider = "proactive-test";
	prior.usage = { input: 74_000, output: 1_000, cacheRead: 0, cacheWrite: 0, totalTokens: 75_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	if (scenario === "scheduled-low") prior.usage = { ...prior.usage, input: 107_800, output: 1_000, totalTokens: 108_800 };
	manager.appendMessage(prior);
	const settings = sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, defaultThinkingLevel: "off" });
	const errors = [];
	const loader = new sdk.DefaultResourceLoader({ cwd: temporary, agentDir: temporary, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
		additionalExtensionPaths: [resolve("extensions/compact-until.ts")], systemPrompt: "Local offline test. Follow the scripted tools.",
		extensionFactories: scheduled || scenario === "manual-race" ? [(pi) => {
			competingSender = () => pi.sendUserMessage("Competing prompt during manual summary", { deliverAs: "followUp" });
			let sent = false;
			pi.on("agent_settled", () => { if (scheduled && !sent) { sent = true; pi.sendUserMessage("Follow-up from a settled observer", { deliverAs: "followUp" }); } });
		}] : [],
	});
	await loader.reload();
	const cacheDiagnostics = process.argv.includes("--cache-diagnostics");
	if (cacheDiagnostics) loader.getExtensions().runtime.flagValues.set("compact-until-cache-diagnostics", true);
	assert.deepEqual(loader.getExtensions().errors, [], "Extension must load against installed runtime");
	let selectedId;
	const responseSteps = [
		(context) => {
			const text = JSON.stringify(context);
			const offerId = text.match(/Proactive compaction offer (proactive-[a-f0-9-]+)/)?.[1];
			assert(offerId, "Provider must receive a proactive advisory before the mandatory threshold");
			const offer = manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === "compact-until-proactive-v1" && entry.data.kind === "offer").at(-1).data.offer;
			const option = offer.options.find((item) => item.kind === (scenario === "split-repair" ? "agent-checkpoint" : "user-exchange"));
			assert(option, "Must offer the requested safe boundary kind"); selectedId = option.firstKeptEntryId;
			const selection = fauxAssistantMessage(fauxToolCall("respond_compaction_advisory", { offerId, action: "compact", optionId: option.optionId, reason: "Investigation complete", preserve: ["Regression evidence"] }), { stopReason: "toolUse" });
			// Faux defaults to zero usage. Keep the synthetic pressure consistent with
			// the seeded history so the execution-time benefit check is meaningful.
			selection.usage = { ...prior.usage, input: 75_000, output: 100, totalTokens: 75_100 };
			return selection;
		},
		async (context) => {
			assert(JSON.stringify(context).includes("Regression evidence"), "Summary generation must receive preservation instructions");
			const branch = manager.getBranch();
			assert(branch.some((entry) => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "respond_compaction_advisory"), "Selection result must be persisted before generation");
			if (scenario === "queued") await session.followUp("User input arriving during summary generation");
			return fauxAssistantMessage(scenario === "split-repair" ? "## Original Request\nFix the regression.\n\nMissing progress and continuation headings." : summary);
		},
		(context) => {
			assert(JSON.stringify(context).includes(scenario === "queued" ? "Investigation complete" : scenario === "split-repair" ? "## Context Needed to Continue" : "Verify the proactive compaction workflow"), "Next model request must see preserved context or committed summary");
			const compactions = manager.getBranch().filter((entry) => entry.type === "compaction");
			assert.equal(compactions.length, scenario === "queued" ? 0 : 1, "Queued input cancels; otherwise exactly one compaction before continuation");
			if (compactions.length) assert.equal(compactions[0].firstKeptEntryId, selectedId);
			return fauxAssistantMessage("Continued after committed compaction.");
		},
	];
	if (scenario === "split-repair") {
		// The completed delivery tool adds a later agent checkpoint. Splitting there
		// now requires both history and turn-prefix summaries on each attempt.
		responseSteps.splice(1, 0, () => fauxAssistantMessage(summary));
		responseSteps.splice(3, 0, () => fauxAssistantMessage(summary), (context) => {
			assert(JSON.stringify(context).includes("Required structural repair"), "Pi 1.2 split-prefix repair must receive feedback");
			return fauxAssistantMessage("## Original Request\nFix the regression.\n\n## Progress So Far\n- Investigation completed.\n\n## Context Needed to Continue\n- Preserve regression evidence.");
		});
	}
	if (scenario === "queued") responseSteps.push((context) => {
		assert(JSON.stringify(context).includes("User input arriving during summary generation"), "Queued follow-up must be delivered normally");
		assert.equal(manager.getBranch().filter((entry) => entry.type === "compaction").length, 0);
		return fauxAssistantMessage("Continued after committed compaction.");
	});
	// Offers are appended to a newly completed tool result, never to a user message.
	responseSteps.unshift(() => {
		const message = fauxAssistantMessage(fauxToolCall("list_compaction_boundaries", {}), { stopReason: "toolUse" });
		message.usage = { ...prior.usage, input: 75_000, output: 100, totalTokens: 75_100 };
		return message;
	});
	fake.setResponses(responseSteps);
	if (scheduled) fake.setResponses([
		() => fauxAssistantMessage(fauxToolCall("list_compaction_boundaries", {}), { stopReason: "toolUse" }),
		() => {
			const request = manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "user").at(-1);
			selectedId = request.id;
			return fauxAssistantMessage(fauxToolCall("schedule_compaction", { firstKeptEntryId: selectedId, summaryFocus: "Regression evidence" }), { stopReason: "toolUse" });
		},
		() => fauxAssistantMessage("Finished task; scheduled compaction should run before observer follow-up."),
		() => fauxAssistantMessage(summary),
		(context) => {
			assert(JSON.stringify(context).includes("Verify the proactive compaction workflow"));
			assert.equal(manager.getBranch().filter((entry) => entry.type === "compaction").length, 1);
			return fauxAssistantMessage("Continued after committed compaction.");
		},
	]);
	if (scenario === "scheduled-low") fake.setResponses([
		() => fauxAssistantMessage(fauxToolCall("list_compaction_boundaries", {}), { stopReason: "toolUse" }),
		() => {
			selectedId = manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "user").at(-1).id;
			return fauxAssistantMessage(fauxToolCall("schedule_compaction", { firstKeptEntryId: selectedId }), { stopReason: "toolUse" });
		},
		() => {
			const result = manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "schedule_compaction").at(-1).message;
			assert.equal(result.details.scheduled, false);
			assert.equal(result.details.reason, "below-moderate-pressure");
			assert(result.details.percent < result.details.moderatePercent);
			assert.equal(manager.getBranch().filter((entry) => entry.type === "compaction").length, 0);
			return fauxAssistantMessage("Continued after committed compaction.");
		},
	]);
	({ session } = await sdk.createAgentSession({ cwd: temporary, agentDir: temporary, modelRuntime: runtime, model: fake.getModel(), thinkingLevel: "off", settingsManager: settings, sessionManager: manager, resourceLoader: loader, tools: ["respond_compaction_advisory", "inspect_compaction_option", "list_compaction_boundaries", "schedule_compaction"] }));
	await session.bindExtensions({ onError: (error) => errors.push(error) });
	if (scenario === "manual-race") {
		fake.setResponses([
			() => {
				competingSender();
				return fauxAssistantMessage("## Original Request\nInvestigate the regression.\n\n## Progress So Far\nInvestigation complete.\n\n## Context Needed to Continue\nPreserve regression evidence.");
			},
			(context) => {
				assert(JSON.stringify(context).includes("Context Needed to Continue"));
				assert.equal(manager.getBranch().filter((entry) => entry.type === "compaction").length, 1);
				return fauxAssistantMessage("Continued after committed compaction.");
			},
		]);
		// Unlike awaited scheduled compaction, this runs outside agent_settled's
		// special deferred-prompt scope, matching the prompt guard's precondition.
		await session.compact();
	}
	await session.prompt("Verify the fix and continue.");
	if (scenario === "manual-race") {
		assert.equal(errors.length, 1);
		assert.equal(errors[0].extensionPath, "<runtime>");
		assert.equal(errors[0].event, "send_user_message");
		assert.equal(errors[0].error, "Cannot submit a prompt while compaction is in progress. Wait for compaction to finish and retry.");
		assert(!JSON.stringify(manager.getBranch()).includes("Competing prompt during manual summary"), "Rejected prompt was not queued despite deliverAs followUp");
	} else assert.deepEqual(errors, [], "No extension runtime errors, including prompt-during-compaction");
	assert.equal(session.getLastAssistantText(), "Continued after committed compaction.", JSON.stringify({ calls: fake.state.callCount, outcomes: manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === "compact-until-proactive-v1").map((entry) => ({ kind: entry.data.kind, status: entry.data.status, action: entry.data.action, metrics: entry.data.metrics })), toolResults: manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "toolResult").map((entry) => ({ error: entry.message.isError, content: entry.message.content })) }));
	assert.equal(fake.state.callCount, scenario === "manual-race" ? 2 : scheduled ? 5 : scenario === "scheduled-low" ? 3 : scenario === "split-repair" ? 7 : scenario === "queued" ? 5 : 4, "Bounded selection, summary and continuation; no loop");
	if (cacheDiagnostics) {
		const diagnostics = manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === "compact-until-cache-diagnostic-v1");
		assert(diagnostics.length >= 2, "Capture must include selection and continuation, but not nested summaries");
		assert.equal(diagnostics.length, fake.state.callCount - (scenario === "split-repair" ? 4 : scenario === "scheduled-low" ? 0 : 1));
		assert(!JSON.stringify(sdk.convertToLlm(manager.buildSessionContext().messages)).includes("compact-until-cache-diagnostic-v1"), "Diagnostics must not enter model context");
		console.log(JSON.stringify({ cacheDiagnostics: true, records: diagnostics.length, transportObserved: diagnostics.some((entry) => entry.data.attemptCount > 0) }));
	}
	console.log(JSON.stringify({ runtime: sdk.VERSION, scenario, passed: true, modelRequests: fake.state.callCount, compactions: manager.getBranch().filter((entry) => entry.type === "compaction").length, ordering: scenario === "scheduled-low" ? "below-moderate scheduling declined -> continuation without compaction" : scenario === "manual-race" ? "manual summary -> competing prompt rejected -> committed compaction -> explicit continuation" : scenario === "queued" ? "summary discarded -> normal continuation -> queued follow-up delivered" : "persisted tool result -> summary -> committed compaction -> next provider request", extensionErrors: errors.length }));
} finally {
	session?.dispose();
	if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
	if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline;
	await rm(temporary, { recursive: true, force: true });
}

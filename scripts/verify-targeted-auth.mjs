// Offline OAuth/API-key regression through the supplied Pi >=1.5 runtime and real compact().
// node scripts/verify-targeted-auth.mjs <installed-pi-package-path>
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

assert(process.argv[2], "Supply an installed Pi >=1.5 package path; no dependencies are installed.");
const root = resolve(process.argv[2]);
const sdk = await import(pathToFileURL(join(root, "dist/index.js")));
const ai = await import(pathToFileURL(join(dirname(root), "pi-ai/dist/index.js")));
const { createJiti } = await import(pathToFileURL(join(root, "dist/core/extensions/jiti-loader.js")));
const jiti = createJiti(import.meta.url, { moduleCache: false, alias: { "@earendil-works/pi-coding-agent": join(root, "dist/index.js") } });
const { executeTargetedCompaction } = await jiti.import(resolve("extensions/targeted-executor.ts"));
const { getSafeBoundaryCandidates } = await jiti.import(resolve("extensions/turns.ts"));
const temporary = await mkdtemp(join(tmpdir(), "pi-targeted-auth-"));
const summary = `## Goal
Continue safely.

## Constraints & Preferences
- Preserve the cutoff.

## Progress
### Done
- [x] Checked authentication.
### In Progress
- [ ] Continue verification.
### Blocked
- (none)

## Key Decisions
- **Auth**: Resolve at request time.

## Next Steps
1. Continue.

## Critical Context
- Keep the current request verbatim.`;
const entries = [
	["u1", "user", "Investigate authentication."],
	["a1", "assistant", "Investigation completed."],
	["u2", "user", "Keep this request."],
].map(([id, role, text]) => ({ type: "message", id, parentId: null, timestamp: new Date(0).toISOString(), message: { role, content: [{ type: "text", text }], timestamp: 1 } }));
const candidate = getSafeBoundaryCandidates(entries).find((item) => item.firstKeptEntryId === "u2");
assert(candidate);
try {
	const stored = new Map([["auth-test", { type: "oauth", access: "synthetic-oauth", refresh: "synthetic-refresh", expires: Date.now() + 3_600_000 }]]);
	const credentials = {
		read: async (id) => stored.get(id),
		list: async () => [...stored].map(([providerId, value]) => ({ providerId, type: value.type })),
		modify: async (id, fn) => { const value = await fn(stored.get(id)); if (value) stored.set(id, value); return stored.get(id); },
		delete: async (id) => { stored.delete(id); },
	};
	const runtime = await sdk.ModelRuntime.create({ credentials, modelsPath: null, modelsStorePath: join(temporary, "models-store.json"), allowModelNetwork: false, refreshOnCreate: false });
	const fake = ai.fauxProvider({ provider: "auth-test", models: [{ id: "physical", maxTokens: 512, contextWindow: 16_384, reasoning: true }], tokensPerSecond: 0 });
	let violations = 0;
	let oauthResolutions = 0;
	let keyResolutions = 0;
	const requests = [];
	const provider = {
		...fake.provider,
		auth: {
			apiKey: {
				resolve: async ({ credential }) => {
					if (credential?.key === "synthetic-oauth") { violations++; throw new Error("Stored OAuth echoed as explicit API key"); }
					if (!credential?.key) return undefined;
					keyResolutions++;
					return { auth: { apiKey: credential.key, baseUrl: "https://key.invalid", headers: { removed: null, authKind: "key" } }, env: { TEST_SCOPE: "key" } };
				},
			},
			oauth: {
				name: "Offline OAuth",
				login: async () => { throw new Error("No interactive auth in tests"); },
				refresh: async () => { throw new Error("No network refresh in tests"); },
				toAuth: async () => { oauthResolutions++; return { apiKey: "synthetic-oauth", baseUrl: "https://oauth.invalid", headers: { removed: null, authKind: "oauth" } }; },
			},
		},
		streamSimple(model, context, options) {
			requests.push({ model, options });
			assert.equal(model.id, "physical");
			assert.equal(model.maxTokens, 512);
			assert.equal(options.headers.removed, null, "Header deletion marker survives runtime auth resolution");
			assert.equal(options.reasoning, "high");
			assert(options.maxTokens === undefined || options.maxTokens <= 512, "Virtual routing must respect physical output limits");
			return fake.provider.streamSimple(model, context, options);
		},
	};
	runtime.registerNativeProvider(provider);
	await runtime.refresh({ allowNetwork: false, providers: ["auth-test"] });
	const registry = new sdk.ModelRegistry(runtime);
	const model = runtime.getModel("auth-test", "physical");
	assert(model);
	// Negative control: the old extension's explicit-key echo must take the wrong auth path.
	const negative = await registry.streamSimple(model, { messages: [] }, { apiKey: "synthetic-oauth" }).result();
	assert.equal(negative.stopReason, "error");
	assert.equal(violations, 1);
	assert.equal(requests.length, 0);
	const resolvedAuth = registry.getApiKeyAndHeaders.bind(registry);
	registry.getApiKeyAndHeaders = () => { throw new Error("Targeted runtime stream must not pre-resolve auth"); };
	const run = async (selectedModel, responses) => {
		const controller = new AbortController();
		fake.setResponses(responses.map((text) => () => ai.fauxAssistantMessage(text)));
		const result = await executeTargetedCompaction({ contextEntries: entries, candidate, provenance: { agentDirected: false }, ctx: { model: selectedModel, modelRegistry: registry, thinkingLevel: "high" }, event: { reason: "manual", signal: controller.signal, preparation: { firstKeptEntryId: "native", messagesToSummarize: [], turnPrefixMessages: [], isSplitTurn: false, tokensBefore: 1000, fileOps: { read: new Set(), written: new Set(), edited: new Set() }, settings: { enabled: true, reserveTokens: 8192, keepRecentTokens: 100 } } } });
		assert.equal(result.ok, true, result.ok ? undefined : result.message);
		assert.equal(result.compaction.firstKeptEntryId, "u2");
		assert.equal(requests.at(-1).options.signal, controller.signal);
	};
	await run(model, ["Malformed summary", summary]); // Actual compact() repair also resolves stored OAuth.
	assert.equal(requests.length, 2);
	assert.equal(requests.at(-1).model.baseUrl, "https://oauth.invalid");
	assert.equal(requests.at(-1).options.headers.authKind, "oauth");
	assert(oauthResolutions >= 2);
	stored.set("auth-test", { type: "api_key", key: "synthetic-api-key", env: { TEST_SCOPE: "key" } });
	await run(model, [summary]);
	assert.equal(requests.at(-1).model.baseUrl, "https://key.invalid");
	assert.equal(requests.at(-1).options.env.TEST_SCOPE, "key");
	assert(keyResolutions > 0);
	let routes = 0;
	runtime.registerVirtualModel({ provider: "router-test", id: "virtual", name: "Offline router", contextWindow: 100_000, maxTokens: 32_768, thinkingLevels: ["off", "high"], route: async () => { routes++; return { model: { provider: "auth-test", id: "physical" }, thinkingLevel: "high" }; } });
	const virtual = runtime.getModel("router-test", "virtual");
	assert(virtual);
	await run(virtual, [summary]);
	assert.equal(routes, 1);
	// Pi 1.5 summaries currently leave output sizing to the physical model.
	// Also prove the runtime clamps an explicit caller budget after virtual routing.
	fake.setResponses([() => ai.fauxAssistantMessage(summary)]);
	const capped = await registry.streamSimple(virtual, { messages: [] }, { maxTokens: 8192, reasoning: "high" }).result();
	assert.equal(capped.stopReason, "stop");
	assert.equal(requests.at(-1).options.maxTokens, 512);
	assert.equal(routes, 2);
	assert.equal(violations, 1, "Only the deliberate negative control violates the auth contract");
	registry.getApiKeyAndHeaders = resolvedAuth;
	console.log(JSON.stringify({ runtime: sdk.VERSION, storedOAuth: true, apiKey: true, repair: true, virtualRouting: true, physicalLimits: true, authEndpoint: true, headerDeletion: true, network: false, passed: true }));
} finally {
	await rm(temporary, { recursive: true, force: true });
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import compactUntil from "../extensions/compact-until.js";
import {
	ADVISORY_DECISION_DETAIL_KEY,
	ADVISORY_OFFER_ENTRY_TYPE,
	createDecisionRecord,
	createOfferRecord,
} from "../extensions/advisory-state.js";
import { getSafeBoundaryCandidates } from "../extensions/turns.js";

const { piCompact } = vi.hoisted(() => ({ piCompact: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...await importOriginal<typeof import("@earendil-works/pi-coding-agent")>(),
	compact: piCompact,
}));

const stamp = "2026-08-24T00:00:00.000Z";
const validSummary = `## Goal
Continue threshold work.

## Constraints & Preferences
- Preserve selected context.

## Progress
### Done
- [x] Selected a boundary.

### In Progress
- [ ] Continue work.

### Blocked
- (none)

## Key Decisions
- **Boundary**: Retain it.

## Next Steps
1. Continue.

## Critical Context
- The selected suffix remains verbatim.`;

function message(id: string, role: "user" | "assistant", text: string): SessionEntry {
	return { type: "message", id, parentId: null, timestamp: stamp, message: { role, content: [{ type: "text", text }], timestamp: Date.now() } } as unknown as SessionEntry;
}

function custom(id: string, data: unknown): SessionEntry {
	return { type: "custom", id, parentId: null, timestamp: stamp, customType: ADVISORY_OFFER_ENTRY_TYPE, data } as SessionEntry;
}

function decisionMessage(id: string, data: unknown): SessionEntry {
	return {
		type: "message", id, parentId: null, timestamp: stamp,
		message: { role: "toolResult", toolCallId: id, toolName: "choose_compaction_boundary", content: [{ type: "text", text: "recorded" }], details: { [ADVISORY_DECISION_DETAIL_KEY]: data }, isError: false, timestamp: Date.now() },
	} as unknown as SessionEntry;
}

function setup(options: { decision?: "targeted" | "native"; includeOffer?: boolean } = { decision: "targeted", includeOffer: true }) {
	const contextEntries = [
		message("u1", "user", "first request"), message("a1", "assistant", "first result"),
		message("u2", "user", "selected request"), message("a2", "assistant", "selected result"),
	];
	const candidate = getSafeBoundaryCandidates(contextEntries).find((item) => item.firstKeptEntryId === "u2")!;
	const offered = {
		optionId: "B1", firstKeptEntryId: candidate.firstKeptEntryId, kind: candidate.kind, preview: candidate.preview,
		retainedTokens: 20, reclaimedTokens: 60_000, projectedTokensAfter: 8_212, splitTurn: candidate.isSplitTurn,
	};
	const offer = createOfferRecord({ offerId: "offer-1", sessionId: "session", epochId: "session:initial", thresholdPercent: 70, boundaries: [offered] });
	const branch = [...contextEntries];
	if (options.includeOffer !== false) branch.push(custom("offer-entry", offer));
	if (options.decision) {
		const decision = createDecisionRecord({ offer, optionId: options.decision === "native" ? "native" : "B1", summaryFocus: "preserve tests" })!;
		branch.push(decisionMessage("decision-entry", decision));
	}
	const callbacks = new Map<string, any>();
	const tools = new Map<string, any>();
	const ctx = {
		model: { id: "model", maxTokens: 16_000, contextWindow: 100_000 }, thinkingLevel: "high",
		modelRegistry: { getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "key", headers: {}, env: {} }) },
		getContextUsage: () => ({ tokens: 80_000, contextWindow: 100_000, percent: 80 }),
		sessionManager: { getSessionId: () => "session", getBranch: () => branch, buildContextEntries: () => contextEntries },
		ui: { notify: vi.fn() },
		compact: vi.fn(), hasPendingMessages: () => false,
	};
	const pi = {
		registerFlag: vi.fn(), getFlag: vi.fn(), appendEntry: vi.fn(), registerCommand: vi.fn(),
		registerTool: (definition: any) => tools.set(definition.name, definition),
		on: (name: string, handler: unknown) => callbacks.set(name, handler),
	} as unknown as ExtensionAPI;
	compactUntil(pi);
	const event = (reason: "manual" | "threshold" | "overflow", reserveTokens = 10_000) => ({
		reason, customInstructions: undefined, willRetry: false, signal: new AbortController().signal, branchEntries: contextEntries,
		preparation: { firstKeptEntryId: "native-cutoff", messagesToSummarize: [], turnPrefixMessages: [], isSplitTurn: false, tokensBefore: 80_000, fileOps: { read: new Set(), written: new Set(), edited: new Set() }, settings: { enabled: true, reserveTokens, keepRecentTokens: 20_000 } },
	});
	return { branch, callbacks, candidate, contextEntries, ctx, event, offer, tools };
}

beforeEach(() => piCompact.mockReset());

describe("threshold advisory application", () => {
	it("applies the selected suffix and records threshold advisory provenance", async () => {
		const fixture = setup();
		piCompact.mockResolvedValue({ summary: validSummary, firstKeptEntryId: "u2", tokensBefore: 80_000, details: { validated: true } });
		const result = await fixture.callbacks.get("session_before_compact")(fixture.event("threshold"), fixture.ctx);

		expect(piCompact.mock.calls[0]?.[0]).toMatchObject({ firstKeptEntryId: "u2", messagesToSummarize: expect.any(Array) });
		expect(result).toMatchObject({ compaction: { details: { validated: true, compactUntil: { firstKeptEntryId: "u2", kind: "user-exchange", agentDirected: true, advisory: { offerId: "offer-1", trigger: "threshold" } } } } });
		expect(piCompact.mock.calls[0]?.[4]).toContain("preserve tests");
	});

	it("leaves missing, ignored, native, stale, off-branch, and oversized preferences native", async () => {
		for (const fixture of [setup({ includeOffer: false }), setup({ includeOffer: true }), setup({ includeOffer: true, decision: "native" })]) {
			expect(await fixture.callbacks.get("session_before_compact")(fixture.event("threshold"), fixture.ctx)).toBeUndefined();
		}
		const stale = setup();
		stale.contextEntries.splice(0, stale.contextEntries.length, message("u9", "user", "different branch"));
		expect(await stale.callbacks.get("session_before_compact")(stale.event("threshold"), stale.ctx)).toBeUndefined();

		const expired = setup();
		expired.branch.push({ type: "compaction", id: "cmp1", parentId: null, timestamp: stamp } as SessionEntry);
		expect(await expired.callbacks.get("session_before_compact")(expired.event("threshold"), expired.ctx)).toBeUndefined();

		const oversized = setup();
		oversized.ctx.getContextUsage = () => ({ tokens: 19_000, contextWindow: 20_000, percent: 95 });
		expect(await oversized.callbacks.get("session_before_compact")(oversized.event("threshold", 10_000), oversized.ctx)).toBeUndefined();
		expect(piCompact).not.toHaveBeenCalled();
	});

	it("never applies advisory state to manual or overflow compaction", async () => {
		const fixture = setup();
		expect(await fixture.callbacks.get("session_before_compact")(fixture.event("manual"), fixture.ctx)).toBeUndefined();
		expect(await fixture.callbacks.get("session_before_compact")(fixture.event("overflow"), fixture.ctx)).toBeUndefined();
		expect(piCompact).not.toHaveBeenCalled();
	});

	it("falls back to native threshold compaction after credential, generation, validation-repair, and cancellation failures", async () => {
		const unauthenticated = setup();
		unauthenticated.ctx.modelRegistry.getApiKeyAndHeaders.mockResolvedValue({ ok: false, error: "missing key" });
		expect(await unauthenticated.callbacks.get("session_before_compact")(unauthenticated.event("threshold"), unauthenticated.ctx)).toBeUndefined();
		expect(piCompact).not.toHaveBeenCalled();

		const generated = setup();
		piCompact.mockRejectedValueOnce(new Error("provider failed"));
		expect(await generated.callbacks.get("session_before_compact")(generated.event("threshold"), generated.ctx)).toBeUndefined();
		expect(generated.ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("native threshold compaction instead"), "warning");

		const invalid = setup();
		piCompact.mockReset().mockResolvedValue({ summary: "invalid", firstKeptEntryId: "u2", tokensBefore: 80_000 });
		expect(await invalid.callbacks.get("session_before_compact")(invalid.event("threshold"), invalid.ctx)).toBeUndefined();
		expect(piCompact).toHaveBeenCalledTimes(2);

		const cancelled = setup();
		const cancelledEvent = cancelled.event("threshold");
		const controller = new AbortController();
		cancelledEvent.signal = controller.signal;
		controller.abort();
		piCompact.mockReset().mockRejectedValueOnce(new Error("aborted"));
		expect(await cancelled.callbacks.get("session_before_compact")(cancelledEvent, cancelled.ctx)).toBeUndefined();
	});

	it("keeps scheduled-agent behavior and lets the resulting epoch expire an advisory", async () => {
		const fixture = setup();
		const schedule = fixture.tools.get("schedule_compaction");
		const result = await schedule.execute("schedule", { firstKeptEntryId: "u2" }, undefined, undefined, fixture.ctx);
		expect(result.details).toMatchObject({ scheduled: true });
		fixture.callbacks.get("agent_settled")({}, fixture.ctx);
		expect(fixture.ctx.compact).toHaveBeenCalledTimes(1);

		fixture.branch.push({ type: "compaction", id: "cmp-after-scheduled", parentId: null, timestamp: stamp } as SessionEntry);
		expect(await fixture.callbacks.get("session_before_compact")(fixture.event("threshold"), fixture.ctx)).toBeUndefined();
	});
});

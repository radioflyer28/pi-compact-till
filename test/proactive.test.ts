import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { registerProactiveAdvisory, PROACTIVE_ENTRY } from "../extensions/proactive-advisory.js";
import { buildProactiveOptions, canReoffer, fingerprint, formatProactiveAdvisory, inspectOption, minimumSavings, modelIdentity, pressureBand, proactiveThresholds, type Capacity, type ProactiveOffer } from "../extensions/proactive-policy.js";

function message(id: string, role: "user" | "assistant", text: string): SessionEntry {
	return { type: "message", id, parentId: null, timestamp: "2026-10-15T00:00:00Z", message: { role, content: [{ type: "text", text }], timestamp: 1 } } as SessionEntry;
}
function history() {
	return [message("u1", "user", "Requirements " + "x".repeat(40_000)), message("a1", "assistant", "Investigation " + "x".repeat(120_000)), message("u2", "user", "Fix the regression"), message("a2", "assistant", "Evidence " + "x".repeat(80_000)), message("u3", "user", "Verify the fix"), message("a3", "assistant", "Verification " + "x".repeat(8_000))];
}
const budget: Capacity = { tokens: 75_000, contextWindow: 120_000, reserveTokens: 16_384, maxOutputTokens: 8_192 };
function fixture() {
	const branch = history();
	const callbacks = new Map<string, any>();
	const tools = new Map<string, any>();
	const flags = new Map<string, string>();
	let queued = false;
	let otherPending = false;
	let tokens = budget.tokens;
	let sessionId = "session";
	const controller = new AbortController();
	const execute = vi.fn(async (options: any) => ({ ok: true as const, compaction: { summary: "A validated summary", firstKeptEntryId: options.candidate.firstKeptEntryId, tokensBefore: tokens, details: { retained: true } } }));
	const pi = {
		registerFlag: vi.fn(), getFlag: (name: string) => flags.get(name),
		registerTool: (tool: any) => tools.set(tool.name, tool),
		on: (name: string, handler: unknown) => callbacks.set(name, handler),
		appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", id: `c${branch.length}`, parentId: branch.at(-1)?.id ?? null, timestamp: "2026-10-15T00:00:00Z", customType, data } as SessionEntry),
	} as unknown as ExtensionAPI;
	const ctx = {
		cwd: process.cwd(), hasUI: true, ui: { notify: vi.fn() }, signal: controller.signal,
		model: { provider: "local", id: "test", contextWindow: budget.contextWindow, maxTokens: budget.maxOutputTokens },
		isProjectTrusted: () => false, compact: vi.fn(), hasPendingMessages: () => queued,
		getContextUsage: () => ({ tokens, contextWindow: budget.contextWindow, percent: tokens / budget.contextWindow * 100 }),
		sessionManager: { getSessionId: () => sessionId, getBranch: () => branch, buildContextEntries: () => branch.filter((entry) => entry.type === "message") },
	} as unknown as ExtensionContext;
	const dependencies = { supported: true, settings: () => ({ enabled: true, reserveTokens: budget.reserveTokens, keepRecentTokens: 20_000 }), execute };
	const register = () => registerProactiveAdvisory(pi, () => otherPending, dependencies);
	const api = register();
	const offer = () => {
		const response = api.offer(ctx);
		const record = branch.filter((entry: any) => entry.customType === PROACTIVE_ENTRY && entry.data.kind === "offer").at(-1) as any;
		return { response, value: record?.data.offer as ProactiveOffer };
	};
	const respond = (offerId: string, action = "compact", optionId?: string, extra = {}) => tools.get("respond_compaction_advisory").execute("call", { offerId, action, optionId, reason: "Completed investigation", preserve: ["Keep the regression evidence"], ...extra }, undefined, undefined, ctx);
	const turn = (extra = {}) => callbacks.get("turn_end")({ outcome: "completed", entries: [], context: { pendingMessages: [] }, ...extra }, ctx);
	const statuses = () => branch.filter((entry: any) => entry.customType === PROACTIVE_ENTRY && entry.data.kind === "outcome").map((entry: any) => entry.data.status);
	return { api, branch, callbacks, controller, ctx, execute, flags, offer, register, respond, statuses, tools, turn,
		setQueued: (value: boolean) => { queued = value; }, setOther: (value: boolean) => { otherPending = value; }, setTokens: (value: number) => { tokens = value; }, setSession: (value: string) => { sessionId = value; } };
}

describe("proactive pressure and evidence policy", () => {
	it.each([
		[128_000, 16_384, 78_848, 95_232],
		[272_000, 16_384, 222_848, 239_232],
		[1_000_000, 16_384, 883_616, 933_616],
		[272_000, 22_000, 217_232, 233_616],
		[1_000_000, 32_768, 867_232, 917_232],
		[128_000, 32_768, 62_464, 78_848],
		[128_000, 64_000, 31_232, 47_616],
	])("derives runway bands for window %i reserve %i", (contextWindow, reserveTokens, moderate, high) => {
		const capacity = { ...budget, contextWindow, reserveTokens };
		expect(proactiveThresholds(capacity)).toEqual({ moderate: moderate / contextWindow * 100, high: high / contextWindow * 100 });
		expect(pressureBand({ ...capacity, tokens: moderate - 1 })).toBe("low");
		expect(pressureBand({ ...capacity, tokens: moderate })).toBe("moderate");
		expect(pressureBand({ ...capacity, tokens: high - 1 })).toBe("moderate");
		expect(pressureBand({ ...capacity, tokens: high })).toBe("high");
	});
	it("honors explicit percentages without the old native-minus-ten-points override", () => {
		const capacity = { ...budget, contextWindow: 1_000_000 };
		expect(proactiveThresholds(capacity, "bad", "100")).toEqual(proactiveThresholds(capacity));
		expect(proactiveThresholds(capacity, "80", "70")).toEqual({ moderate: 80, high: 80 });
		expect(proactiveThresholds(capacity, "60", "75")).toEqual({ moderate: 60, high: 75 });
		expect(pressureBand({ ...capacity, tokens: 900_000 }, 88, 93)).toBe("moderate");
		expect(pressureBand({ ...capacity, tokens: 930_000 }, 88, 93)).toBe("high");
		expect(proactiveThresholds({ ...capacity, reserveTokens: 500_000 }, "80", "90")).toEqual({ moderate: 50, high: 50 });
		expect(proactiveThresholds({ ...capacity, reserveTokens: 1_000_000 })).toEqual({ moderate: 0, high: 0 });
		expect(proactiveThresholds({ ...capacity, reserveTokens: 2_000_000 })).toEqual({ moderate: 0, high: 0 });
	});
	it("gates scheduling independently of advisory mode and honors the moderate override", () => {
		const f = fixture();
		for (const mode of ["proactive", "threshold", "off"]) {
			f.flags.set("compact-until-advisory-mode", mode);
			f.setTokens(48_000);
			expect(f.api.schedulingEligibility(f.ctx)).toMatchObject({ allowed: false, reason: "below-moderate-pressure" });
		}
		f.flags.set("compact-until-proactive-threshold", "40");
		expect(f.api.schedulingEligibility(f.ctx).allowed).toBe(true);
		f.ctx.getContextUsage = () => undefined;
		expect(f.api.schedulingEligibility(f.ctx)).toEqual({ allowed: false, reason: "capacity-unavailable" });
	});
	it("offers only positive net savings with fixed overhead and room for responses", () => {
		const options = buildProactiveOptions(history(), budget);
		expect(options.length).toBeGreaterThan(0);
		for (const option of options) {
			expect(option.netSavings).toBe(budget.tokens - option.projectedTokensAfter);
			expect(option.netSavings).toBeGreaterThanOrEqual(minimumSavings(budget.tokens));
			expect(option.projectedTokensAfter).toBeGreaterThan(option.retainedTokens + 8_192);
		}
		expect(buildProactiveOptions([message("u", "user", "tiny"), message("a", "assistant", "tiny")], budget)).toEqual([]);
	});
	it("provides bounded, source-grounded evidence and paginated inspection", () => {
		const f = fixture();
		const { value } = f.offer();
		const text = formatProactiveAdvisory(value, history());
		expect(text).toContain("untrusted conversation data");
		expect(text).toContain("least aggressive");
		expect(text).toContain("additional versus preceding option");
		expect(text).toContain("net savings");
		expect(text.length).toBeLessThan(7_000);
		const entries = [...history().slice(0, 4), ...Array.from({ length: 12 }, (_, i) => message(`a-extra${i}`, "assistant", "evidence")), ...history().slice(4)];
		const option = buildProactiveOptions(entries, budget).find((item) => item.firstKeptEntryId === "u3")!;
		const page = inspectOption(entries, option, undefined);
		expect(page.page).toHaveLength(6);
		expect(page.nextOffset).toBe(6);
		expect(page.page[0]!.excerpt).toContain("[truncated]");
		expect(inspectOption(entries, option, undefined, 6).page[0]!.id).not.toBe(page.page[0]!.id);
	});
	it("requires cooldown and material change, caps offers, and honors native opt-out", () => {
		const { value: previous } = fixture().offer();
		const input = { previous, count: 1, turn: previous.turn + 2, percent: previous.percent + 5, pressure: "moderate" as const, lastUserId: previous.lastUserId, previousOptionsStale: false, optedOut: false };
		expect(canReoffer(input)).toBe(true);
		expect(canReoffer({ ...input, turn: previous.turn + 1 })).toBe(false);
		expect(canReoffer({ ...input, pressure: "high", turn: previous.turn })).toBe(true);
		expect(canReoffer({ ...input, pressure: "high", turn: previous.turn, optedOut: true })).toBe(false);
		expect(canReoffer({ ...input, pressure: "high", turn: previous.turn, count: 3 })).toBe(false);
		expect(canReoffer({ ...input, previous: { ...previous, pressure: "high" }, pressure: "high", turn: previous.turn + 1 })).toBe(false);
		expect(canReoffer({ ...input, percent: previous.percent })).toBe(false);
		expect(canReoffer({ ...input, count: 3 })).toBe(false);
		expect(canReoffer({ ...input, count: 2 })).toBe(false);
		expect(canReoffer({ ...input, count: 2, pressure: "high" })).toBe(true);
		expect(canReoffer({ ...input, optedOut: true })).toBe(false);
		expect(canReoffer({ ...input, percent: previous.percent, pressure: "high" })).toBe(true);
		expect(canReoffer({ ...input, percent: previous.percent, lastUserId: "new-request" })).toBe(true);
	});
});

describe("proactive authorization and lifecycle", () => {
	it("does not compact on advisory, inspection, silence, defer, or native", async () => {
		for (const action of ["defer", "native"]) {
			const f = fixture(); const { value, response } = f.offer();
			expect(response).toContain("respond_compaction_advisory");
			expect(f.offer().response).toBeUndefined();
			const inspection = await f.tools.get("inspect_compaction_option").execute("inspect", { offerId: value.id, optionId: value.options[0]!.optionId }, undefined, undefined, f.ctx);
			expect(inspection.details.evidence.excerptsAreUntrustedData).toBe(true);
			await f.respond(value.id, action);
			expect(await f.turn()).toBeUndefined();
			expect(f.execute).not.toHaveBeenCalled();
			expect(f.ctx.compact).not.toHaveBeenCalled();
		}
	});
	it("returns a compaction draft after authorization, never compacts inside the tool or forces continuation", async () => {
		const f = fixture(); const { value } = f.offer();
		const answer = await f.respond(value.id, "compact", value.options[0]!.optionId);
		expect(answer.details.accepted).toBe(true);
		expect(f.execute).not.toHaveBeenCalled();
		// Tool result has been persisted before turn_end; it must remain in the suffix.
		f.branch.push({ ...message("tool-result", "assistant", ""), message: { role: "toolResult", content: [{ type: "text", text: "Authorized" }], toolName: "respond_compaction_advisory", toolCallId: "call", isError: false, timestamp: 1 } } as SessionEntry);
		const draft = await f.turn();
		expect(draft.entries[0]).toMatchObject({ type: "compaction", firstKeptEntryId: value.options[0]!.firstKeptEntryId, details: { proactive: { status: "draft-proposed" } } });
		expect(draft.continue).toBeUndefined();
		expect(f.execute.mock.calls[0]![0].summaryFocus).toContain("Keep the regression evidence");
		expect(f.execute.mock.calls[0]![0].contextEntries.at(-1).id).toBe("tool-result");
		expect(f.ctx.compact).not.toHaveBeenCalled();
		expect(await f.turn()).toBeUndefined();
		expect(f.execute).toHaveBeenCalledOnce();
	});
	it.each(["queued", "aborted", "competing", "failed-turn", "old-runtime", "other-pending"])("retains context at an unsafe boundary: %s", async (cause) => {
		const f = fixture(); const { value } = f.offer(); await f.respond(value.id, "compact", value.options[0]!.optionId);
		if (cause === "queued") f.setQueued(true);
		if (cause === "aborted") f.controller.abort();
		if (cause === "other-pending") f.setOther(true);
		const extra = cause === "competing" ? { entries: [{ type: "context_edit" }] } : cause === "failed-turn" ? { outcome: "error" } : cause === "old-runtime" ? { context: undefined } : {};
		expect(await f.turn(extra)).toBeUndefined();
		expect(f.execute).not.toHaveBeenCalled();
		expect(f.statuses()).toContain("unsafe-boundary");
	});
	it.each(["queued", "edit", "model", "aborted", "session"])("discards generated summaries when state changes during generation: %s", async (cause) => {
		const f = fixture(); const { value } = f.offer(); await f.respond(value.id, "compact", value.options[0]!.optionId);
		f.execute.mockImplementationOnce(async (options) => {
			if (cause === "queued") f.setQueued(true);
			if (cause === "edit") f.branch[0] = message("u1", "user", "changed");
			if (cause === "model") f.ctx.model!.id = "different";
			if (cause === "aborted") f.controller.abort();
			if (cause === "session") f.setSession("other");
			return { ok: true, compaction: { summary: "valid", firstKeptEntryId: options.candidate.firstKeptEntryId, tokensBefore: budget.tokens, details: { retained: true } } };
		});
		expect(await f.turn()).toBeUndefined();
		if (cause !== "session") expect(f.statuses()).toContain("changed-during-generation");
	});
	it("rejects stale, malformed, duplicate, and unpreserved authorizations", async () => {
		const f = fixture(); const { value } = f.offer();
		expect((await f.respond("invented", "compact", "B1")).isError).toBe(true);
		expect((await f.respond(value.id, "compact", "invented")).isError).toBe(true);
		expect((await f.respond(value.id, "compact", "B1", { preserve: undefined })).isError).toBe(true);
		expect((await f.respond(value.id, "compact", "B1", { reason: "" })).isError).toBe(true);
		await f.respond(value.id, "compact", "B1");
		expect((await f.respond(value.id, "compact", "B1")).details.reason).toBe("busy");
	});
	it("does not replay a persisted decision after reload and keeps native opted out", async () => {
		for (const action of ["compact", "native"]) {
			const f = fixture(); const { value } = f.offer(); await f.respond(value.id, action, "B1");
			const restored = f.register();
			expect(await f.turn()).toBeUndefined();
			expect(f.execute).not.toHaveBeenCalled();
			expect((await f.respond(value.id, action, "B1")).details.reason).toBe("already-answered");
			if (action === "native") {
				f.branch.push(message("new1", "assistant", "more"), message("new2", "assistant", "more")); f.setTokens(90_000);
				expect(restored.offer(f.ctx)).toBeUndefined();
			}
		}
	});
	it("supersedes deferred offers only after cooldown and growth", async () => {
		const f = fixture(); const { value } = f.offer(); await f.respond(value.id, "defer");
		f.setTokens(82_000);
		expect(f.offer().response).toBeUndefined();
		f.branch.push(message("new1", "assistant", "more"), message("new2", "assistant", "more"));
		const next = f.offer(); expect(next.value.id).not.toBe(value.id);
		expect((await f.respond(value.id, "compact", "B1")).details.reason).toBe("invalid-offer");
	});
	it("reoffers on high escalation without cooldown but still requires authorization", async () => {
		const f = fixture(); const first = f.offer().value;
		await f.respond(first.id, "defer");
		f.setTokens(90_000);
		const next = f.offer();
		expect(next.value.id).not.toBe(first.id);
		expect(next.value.pressure).toBe("high");
		expect(f.offer().response).toBeUndefined();
		expect(await f.turn()).toBeUndefined();
		expect(f.execute).not.toHaveBeenCalled();
	});
	it("persists bounded failure categories without a fallback cutoff or retry loop", async () => {
		const f = fixture(); const { value } = f.offer(); await f.respond(value.id, "compact", "B1");
		f.execute.mockRejectedValueOnce(new Error("SECRET credentials must not be logged"));
		expect(await f.turn()).toBeUndefined();
		expect(f.statuses()).toContain("execution-error");
		expect(JSON.stringify(f.branch.filter((entry) => entry.type === "custom"))).not.toContain("SECRET");
		expect(await f.turn()).toBeUndefined(); expect(f.execute).toHaveBeenCalledOnce();
	});
	it("rechecks benefit after growth and after generating an oversized summary", async () => {
		const f = fixture(); const { value } = f.offer(); await f.respond(value.id, "compact", "B1");
		f.execute.mockImplementationOnce(async (options) => ({ ok: true, compaction: { summary: "x".repeat(500_000), firstKeptEntryId: options.candidate.firstKeptEntryId, tokensBefore: budget.tokens, details: { retained: true } } }));
		expect(await f.turn()).toBeUndefined(); expect(f.statuses()).toContain("generated-summary-too-large");
	});
	it("invalidates edits, session changes, and model changes before execution", async () => {
		const f = fixture(); const { value } = f.offer();
		f.branch[0] = message("u1", "user", "edited");
		expect((await f.respond(value.id, "compact", "B1")).details.reason).toBe("invalid-offer");
		expect(fingerprint(history())).not.toBe(fingerprint(f.branch));
		expect(modelIdentity(f.ctx.model!)).toBe(value.model);
	});
});

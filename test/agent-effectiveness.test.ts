import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import compactUntil from "../extensions/compact-until.js";

const state = vi.hoisted(() => ({ reserve: 22_000, execute: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (original) => {
	const actual = await original();
	return { ...actual as object, VERSION: "1.4.0", SettingsManager: { create: () => ({ drainErrors: () => [], getCompactionSettings: () => ({ enabled: true, reserveTokens: state.reserve, keepRecentTokens: 20_000 }) }) } };
});
vi.mock("../extensions/targeted-executor.js", async (original) => {
	const actual = await original();
	return { ...actual as object, executeTargetedCompaction: state.execute };
});
const message = (id: string, role: "user" | "assistant", text: string): SessionEntry => ({
	type: "message", id, parentId: null, timestamp: "2026-10-30T00:00:00Z", message: { role, content: [{ type: "text", text }], timestamp: 1 },
} as SessionEntry);
function fixture(tiny = false, mode = "proactive") {
	const branch = [message("u1", "user", tiny ? "Short task" : "Evidence ".repeat(30_000)), message("a1", "assistant", "Done"), message("u2", "user", "Continue verification")];
	const tools = new Map<string, any>();
	const hooks = new Map<string, any[]>();
	const pi = {
		registerCommand: vi.fn(), registerFlag: vi.fn(), getFlag: (name: string) => name === "compact-until-advisory-mode" ? mode : undefined,
		registerTool: (tool: any) => tools.set(tool.name, tool),
		on: (name: string, fn: any) => hooks.set(name, [...hooks.get(name) ?? [], fn]),
		appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", id: `c${branch.length}`, parentId: null, timestamp: "2026-10-30T00:00:00Z", customType, data } as SessionEntry),
	} as unknown as ExtensionAPI;
	compactUntil(pi);
	const ctx = {
		cwd: process.cwd(), hasUI: true, isProjectTrusted: () => false, signal: new AbortController().signal,
		model: { id: "test", provider: "local", contextWindow: 272_000, maxTokens: 8192 },
		getContextUsage: () => ({ tokens: 220_000, contextWindow: 272_000 }), hasPendingMessages: () => false,
		sessionManager: { getSessionId: () => "s", getBranch: () => branch, buildContextEntries: () => branch.filter((entry) => entry.type === "message") },
		ui: { notify: vi.fn() }, compact: vi.fn((options: any) => options.onComplete({})),
	};
	const hook = async (name: string, event: any = {}) => {
		let result;
		for (const fn of hooks.get(name) ?? []) result = await fn(event, ctx) ?? result;
		return result;
	};
	const call = (name: string, params: any) => tools.get(name).execute("call", params, undefined, undefined, ctx);
	const schedule = () => call("schedule_compaction", { firstKeptEntryId: "u2" });
	const offer = async () => {
		await hook("tool_result", { content: [], isError: false });
		return (branch.find((entry: any) => entry.data?.kind === "offer") as any).data.offer;
	};
	const respond = (value: any) => call("respond_compaction_advisory", { offerId: value.id, optionId: value.options.find((o: any) => o.firstKeptEntryId === "u2").optionId, action: "compact", reason: "Phase finished", preserve: [] });
	const event = () => ({ reason: "manual", signal: ctx.signal, preparation: { settings: { reserveTokens: state.reserve } } });
	return { ctx, branch, hook, call, schedule, offer, respond, event };
}
beforeEach(() => {
	state.reserve = 22_000;
	state.execute.mockReset().mockImplementation(async ({ candidate }) => ({ ok: true, compaction: { firstKeptEntryId: candidate.firstKeptEntryId, summary: "Preserved evidence", tokensBefore: 220_000 } }));
});
function changeState(f: ReturnType<typeof fixture>, change: string) {
	if (change === "pressure") f.ctx.getContextUsage = () => ({ tokens: 100_000, contextWindow: 272_000 });
	if (change === "reserve") state.reserve = 200_000;
	if (change === "capacity") f.ctx.getContextUsage = () => undefined as any;
	if (change === "model") f.ctx.model.maxTokens = 200_000;
	if (change === "stale") f.branch.pop();
	if (change === "queued") f.ctx.hasPendingMessages = () => true;
}

describe("shared agent-directed effectiveness safeguards", () => {
	it.each(["proactive", "threshold", "off"])("rejects negligible savings in %s mode without consuming a request", async (mode) => {
		const f = fixture(true, mode);
		expect((await f.schedule()).details).toMatchObject({ scheduled: false, reason: "insufficient-savings" });
		f.branch[0] = message("u1", "user", "Evidence ".repeat(30_000));
		expect((await f.schedule()).details.scheduled).toBe(true);
	});
	it("accepts an effective cutoff offered by proactive selection", async () => {
		const f = fixture(); const offer = await f.offer();
		expect(offer.options.some((o: any) => o.firstKeptEntryId === "u2")).toBe(true);
		expect((await f.schedule()).details.scheduled).toBe(true);
	});
	it.each(["pressure", "reserve", "capacity", "model"])("both authorization paths reject changed %s", async (change) => {
		const f = fixture(); const value = await f.offer(); changeState(f, change);
		const scheduled = await f.schedule(); const proactive = await f.respond(value);
		expect(scheduled.details.scheduled).toBe(false);
		expect(proactive.details.accepted).not.toBe(true);
		if (change !== "model") expect(proactive.details.reason).toBe(scheduled.details.reason);
		expect(state.execute).not.toHaveBeenCalled();
	});
	it.each(["pressure", "reserve", "model", "capacity", "stale", "queued"])("revalidates scheduling at settled time: %s", async (change) => {
		const f = fixture(); expect((await f.schedule()).details.scheduled).toBe(true); changeState(f, change);
		await f.hook("agent_settled");
		expect(f.ctx.compact).not.toHaveBeenCalled(); expect(state.execute).not.toHaveBeenCalled();
	});
	it("uses actual native preparation reserve at the scheduled execution hook", async () => {
		const f = fixture(); await f.schedule(); await f.hook("agent_settled");
		const event = f.event(); event.preparation.settings.reserveTokens = 200_000;
		expect(await f.hook("session_before_compact", event)).toEqual({ cancel: true });
		expect(state.execute).not.toHaveBeenCalled();
	});
	it.each(["scheduled", "proactive"])("rejects oversized summaries and changed reserves in the %s path", async (path) => {
		for (const change of ["oversized", "reserve"]) {
			state.reserve = 22_000; const f = fixture();
			state.execute.mockImplementation(async ({ candidate }) => {
				if (change === "reserve") state.reserve = 200_000;
				return { ok: true, compaction: { firstKeptEntryId: candidate.firstKeptEntryId, summary: change === "oversized" ? "x".repeat(500_000) : "Short summary" } };
			});
			if (path === "scheduled") {
				await f.schedule(); await f.hook("agent_settled");
				expect(await f.hook("session_before_compact", f.event())).toEqual({ cancel: true });
			} else {
				await f.respond(await f.offer());
				expect(await f.hook("turn_end", { outcome: "completed", entries: [], context: { pendingMessages: [] } })).toBeUndefined();
			}
		}
	});
	it.each(["queued", "edit", "model", "session"])("discards a scheduled summary after a concurrent %s change", async (change) => {
		const f = fixture(); await f.schedule(); await f.hook("agent_settled");
		state.execute.mockImplementation(async ({ candidate }) => {
			if (change === "queued") f.ctx.hasPendingMessages = () => true;
			if (change === "edit") f.branch[0] = message("u1", "user", "Changed evidence");
			if (change === "model") f.ctx.model.id = "different";
			if (change === "session") f.ctx.sessionManager.getSessionId = () => "other";
			return { ok: true, compaction: { firstKeptEntryId: candidate.firstKeptEntryId, summary: "Short summary" } };
		});
		expect(await f.hook("session_before_compact", f.event())).toEqual({ cancel: true });
		expect(state.execute).toHaveBeenCalledOnce();
	});
	it("leaves native manual, threshold, and overflow paths alone without a triggering request", async () => {
		const f = fixture(true); state.reserve = 200_000;
		for (const reason of ["manual", "threshold", "overflow"]) expect(await f.hook("session_before_compact", { reason })).toBeUndefined();
		expect(state.execute).not.toHaveBeenCalled();
	});
});

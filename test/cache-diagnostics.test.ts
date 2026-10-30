import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CACHE_DIAGNOSTIC_ENTRY, createRequestInspector, registerCacheDiagnostics } from "../extensions/cache-diagnostics.js";

const payload = (input: unknown[], extra = {}) => ({ model: "private-model", input, reasoning: { effort: "high" }, ...extra });
const user = { role: "user", content: "SECRET user prompt" };

describe("cache request fingerprints", () => {
	it("distinguishes append-only input from prefix and settings changes", () => {
		const inspect = createRequestInspector();
		expect(inspect(payload([user])).comparison).toBeUndefined();
		expect(inspect(payload([user, { role: "user", content: "advisory" }])).comparison).toMatchObject({ previousPrefixPreserved: true, settingsChanged: false });
		expect(inspect(payload([user], { reasoning: { effort: "low" } })).comparison).toMatchObject({ previousPrefixPreserved: false, settingsChanged: true });
		expect(inspect(payload([{ ...user, content: "changed" }])).comparison?.commonPrefixItems).toBe(0);
	});
	it("does not persist content, raw settings or stable cross-capture hashes", () => {
		const input = payload([user], { instructions: "SECRET instructions", metadata: { token: "SECRET credential" }, reasoning: { context: "SECRET unexpected enum" } });
		const a = createRequestInspector()(input);
		const b = createRequestInspector()(input);
		expect(JSON.stringify(a)).not.toContain("SECRET");
		expect(JSON.stringify(a)).not.toContain("private-model");
		expect(a.inputFingerprint).not.toBe(b.inputFingerprint);
		expect(a.requestedReasoningContext).toBe("unspecified-or-unknown");
	});
	it("bounds fingerprints and does not claim a complete prefix comparison when capped", () => {
		const inspect = createRequestInspector();
		const large = payload(Array.from({ length: 8200 }, () => user));
		inspect(large);
		expect(inspect(large)).toMatchObject({ fingerprintedItems: 8192, comparison: { previousPrefixPreserved: null } });
		expect(inspect({ messages: [user] })).toEqual({ format: "unsupported" });
		expect(inspect(payload([user])).comparison).toBeUndefined();
	});
});

function fixture(enabled = true) {
	const callbacks = new Map<string, any>();
	const appendEntry = vi.fn();
	let id = "session";
	const pi = { registerFlag: vi.fn(), getFlag: () => enabled, on: (name: string, handler: any) => callbacks.set(name, handler), appendEntry } as unknown as ExtensionAPI;
	registerCacheDiagnostics(pi);
	const ctx = { sessionManager: { getSessionId: () => id } };
	const emit = (name: string, event = {}) => callbacks.get(name)(event, ctx);
	const end = () => emit("message_end", { message: { role: "assistant", stopReason: "toolUse", usage: { input: 226692, cacheRead: 0 }, content: [{ text: "SECRET output" }] } });
	return { emit, end, appendEntry, session: (value: string) => { id = value; } };
}

describe("opt-in diagnostic lifecycle", () => {
	it("does nothing when disabled", () => {
		const f = fixture(false);
		f.emit("turn_start"); f.emit("before_provider_request", { payload: payload([user]) }); f.end();
		expect(f.appendEntry).not.toHaveBeenCalled();
	});
	it("records an advisory, effective reasoning mode and usage without mutating input", () => {
		const f = fixture();
		f.emit("turn_start");
		f.emit("context_with_system", { messages: [{ role: "custom", customType: "compact-until-proactive-advisory", content: "SECRET advisory" }] });
		const request = payload([user]); const before = structuredClone(request);
		f.emit("before_provider_request", { payload: request });
		f.emit("provider_stream_event", { data: { type: "response.created", response: { id: "SECRET id", reasoning: { context: "current_turn" }, output: "SECRET response" } } });
		f.end();
		expect(request).toEqual(before);
		expect(f.appendEntry).toHaveBeenCalledWith(CACHE_DIAGNOSTIC_ENTRY, expect.objectContaining({ inputTokens: 226692, cachedTokens: 0, attempts: [expect.objectContaining({ advisoryPresent: true, effectiveReasoningContext: "current_turn" })] }));
		expect(JSON.stringify(f.appendEntry.mock.calls)).not.toContain("SECRET");
		f.emit("before_provider_request", { payload: payload([user]) }); f.end();
		expect(f.appendEntry).toHaveBeenCalledOnce();
	});
	it("recognizes persisted tool-result advisories", () => {
		const f = fixture(); f.emit("turn_start");
		f.emit("context_with_system", { messages: [{ role: "toolResult", content: [{ type: "text", text: "--- Pi compaction advisory (extension-generated; not tool output) ---\nOffer" }] }] });
		f.emit("before_provider_request", { payload: payload([user]) }); f.end();
		expect(f.appendEntry.mock.calls[0]![1].attempts[0].advisoryPresent).toBe(true);
	});

	it("compares consecutive main requests but resets on session changes", () => {
		const f = fixture();
		for (const id of ["session", "session", "other"]) {
			f.session(id); f.emit("turn_start"); f.emit("before_provider_request", { payload: payload([user]) }); f.end();
		}
		expect(f.appendEntry.mock.calls[1]![1].attempts[0].comparison.previousPrefixPreserved).toBe(true);
		expect(f.appendEntry.mock.calls[2]![1].attempts[0].comparison).toBeUndefined();
	});
	it("bounds retries and reports unsupported payloads and missing stream metadata honestly", () => {
		const f = fixture(); f.emit("turn_start");
		for (let i = 0; i < 12; i++) f.emit("before_provider_request", { payload: { messages: [user] } });
		f.end();
		const record = f.appendEntry.mock.calls[0]![1];
		expect(record.attemptCount).toBe(12);
		expect(record.attempts).toHaveLength(8);
		expect(record.attempts[0]).toMatchObject({ attempt: 5, format: "unsupported" });
		expect(record.attempts[0].effectiveReasoningContext).toBeUndefined();
	});
});

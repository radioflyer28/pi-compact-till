import { describe, expect, it } from "vitest";
import { findCutPoint, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { buildProactiveOptions, pressureBand } from "../extensions/proactive-policy.js";
import { buildCompactionOfferOptions, entryTokens, evaluateTriggerEffectiveness } from "../extensions/compaction-offers.js";
import { getSafeBoundaryCandidates } from "../extensions/turns.js";

// Deterministic mechanical baseline, NOT a model-quality benchmark. Replay the
// same initial decision against a growing suffix and contrast native/delayed/now.
function entry(id: string, role: "user" | "assistant", tokens: number): SessionEntry {
	return { type: "message", id, parentId: null, timestamp: "2026-10-15T00:00:00Z", message: { role, content: [{ type: "text", text: "x".repeat(tokens * 4) }], timestamp: 1 } } as SessionEntry;
}
const replays = [
	{ name: "finished phase, small continuation", growth: 4_000, delayedEffective: true },
	{ name: "large diagnostic output after selection", growth: 85_000, delayedEffective: false },
];

describe("native / delayed / proactive mechanical replay", () => {
	it.each(replays)("$name", ({ growth, delayedEffective }) => {
		const start = [entry("u1", "user", 2_000), entry("a1", "assistant", 40_000), entry("u2", "user", 2_000), entry("a2", "assistant", 20_000), entry("u3", "user", 2_000)];
		const capacity = { tokens: entryTokens(start) + 4_000, contextWindow: 120_000, reserveTokens: 16_384, maxOutputTokens: 8_192 };
		const proactive = buildProactiveOptions(start, capacity);
		const delayed = buildCompactionOfferOptions({ entries: start, candidates: getSafeBoundaryCandidates(start), totalTokens: capacity.tokens, contextWindow: capacity.contextWindow, maxOutputTokens: capacity.maxOutputTokens });
		const later = [...start, entry("a3", "assistant", growth)];
		const native = findCutPoint(later, 0, later.length, 20_000);
		const chosen = proactive.find((option) => option.firstKeptEntryId === "u2")!;
		expect(chosen.netSavings).toBeGreaterThan(0);
		expect(delayed.some((option) => option.firstKeptEntryId === chosen.firstKeptEntryId)).toBe(true);
		const laterCandidate = getSafeBoundaryCandidates(later).find((candidate) => candidate.firstKeptEntryId === chosen.firstKeptEntryId)!;
		expect(evaluateTriggerEffectiveness({ entries: later, candidate: laterCandidate, contextWindow: capacity.contextWindow, reserveTokens: capacity.reserveTokens }).effective).toBe(delayedEffective);
		expect(getSafeBoundaryCandidates(later).some((candidate) => candidate.firstKeptEntryId === later[native.firstKeptEntryIndex]!.id)).toBe(true);
		// Native might still be necessary after massive new output, even when the
		// earlier proactive decision was good. No policy guarantees zero compactions.
		expect(pressureBand({ ...capacity, tokens: capacity.tokens + growth })).toBe(growth > 10_000 ? "high" : "moderate");
	});
});

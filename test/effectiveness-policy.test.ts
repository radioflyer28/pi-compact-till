import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { entryTokens } from "../extensions/compaction-offers.js";
import { buildProactiveOptions, evaluateAgentBoundary, evaluateBoundaryEffectiveness, fixedOverhead, minimumSavings, requiredHeadroom, type Capacity } from "../extensions/proactive-policy.js";
const entries = [
	{ type: "message", id: "u1", message: { role: "user", content: "Evidence ".repeat(30_000), timestamp: 1 } },
	{ type: "message", id: "a1", message: { role: "assistant", content: [{ type: "text", text: "Done" }], timestamp: 2 } },
	{ type: "message", id: "u2", message: { role: "user", content: "Continue", timestamp: 3 } },
] as SessionEntry[];
const capacity: Capacity = { tokens: 220_000, contextWindow: 272_000, reserveTokens: 22_000, maxOutputTokens: 8192 };
describe("agent boundary effectiveness arithmetic", () => {
	it("requires the same effectiveness for every offered option", () => {
		const options = buildProactiveOptions(entries, capacity);
		expect(options.length).toBeGreaterThan(0);
		for (const option of options) expect(evaluateAgentBoundary(entries, option.firstKeptEntryId, capacity)).toMatchObject({ allowed: true, projectedTokensAfter: option.projectedTokensAfter, netSavings: option.netSavings });
	});
	it("accepts exactly minimum savings and rejects one token less", () => {
		const suffixAndOverhead = entryTokens(entries.slice(2)) + fixedOverhead(entries, capacity);
		const summaryTokens = capacity.tokens - suffixAndOverhead - minimumSavings(capacity.tokens);
		expect(evaluateAgentBoundary(entries, "u2", capacity, undefined, undefined, summaryTokens).allowed).toBe(true);
		expect(evaluateAgentBoundary(entries, "u2", capacity, undefined, undefined, summaryTokens + 1).reason).toBe("insufficient-savings");
	});
	it("accepts exact headroom and rejects one token less", () => {
		const c = { ...capacity, reserveTokens: 80_000 };
		const summaryTokens = c.contextWindow - requiredHeadroom(c) - entryTokens(entries.slice(2)) - fixedOverhead(entries, c);
		expect(evaluateAgentBoundary(entries, "u2", c, undefined, undefined, summaryTokens).allowed).toBe(true);
		expect(evaluateAgentBoundary(entries, "u2", c, undefined, undefined, summaryTokens + 1).reason).toBe("insufficient-headroom");
	});
	it("fails closed on missing, nonfinite, or negative capacity and summary size", () => {
		expect(evaluateAgentBoundary(entries, "u2", undefined).reason).toBe("capacity-unavailable");
		for (const key of Object.keys(capacity)) for (const value of [NaN, Infinity, -1]) expect(evaluateAgentBoundary(entries, "u2", { ...capacity, [key]: value }).reason).toBe("capacity-unavailable");
		for (const value of [NaN, Infinity, -1]) expect(evaluateBoundaryEffectiveness(entries, "u2", capacity, value).reason).toBe("capacity-unavailable");
		expect(evaluateAgentBoundary(entries, "u2", { ...capacity, contextWindow: 0 }).allowed).toBe(false);
	});
	it("rejects missing IDs and the first user entry, which cannot summarize a prefix", () => {
		for (const id of ["missing", "u1"]) expect(evaluateAgentBoundary(entries, id, capacity).reason).toBe("invalid-boundary");
	});
	it("honors a moderate override without bypassing benefit checks", () => {
		const c = { ...capacity, tokens: 200_000 };
		expect(evaluateAgentBoundary(entries, "u2", c).reason).toBe("below-moderate-pressure");
		expect(evaluateAgentBoundary(entries, "u2", c, "70").allowed).toBe(true);
		expect(buildProactiveOptions(entries, c, "70").length).toBeGreaterThan(0);
	});
});

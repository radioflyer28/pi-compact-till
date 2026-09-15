import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_ADVISORY_THRESHOLD_PERCENT,
	compactionEpochId,
	hasReachedAdvisoryThreshold,
	parseAdvisoryThreshold,
} from "../extensions/advisory-policy.js";
import {
	buildCompactionOfferOptions,
	formatCompactionAdvisory,
} from "../extensions/compaction-offers.js";
import {
	ADVISORY_DECISION_DETAIL_KEY,
	ADVISORY_OFFER_ENTRY_TYPE,
	activeDecision,
	activeOffer,
	createDecisionRecord,
	createOfferRecord,
} from "../extensions/advisory-state.js";
import { getSafeBoundaryCandidates } from "../extensions/turns.js";

const stamp = "2026-08-24T00:00:00.000Z";

function message(id: string, role: "user" | "assistant", text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: stamp,
		message: { role, content: [{ type: "text", text }], timestamp: Date.now() },
	} as unknown as SessionEntry;
}

function history(): SessionEntry[] {
	const large = (label: string) => `${label} ${"detail ".repeat(2_000)}`;
	return [
		message("u1", "user", large("request one")), message("a1", "assistant", large("result one")),
		message("u2", "user", large("request two")), message("a2", "assistant", large("result two")),
		message("u3", "user", large("request three")), message("a3", "assistant", large("result three")),
		message("u4", "user", "current request"), message("a4", "assistant", "current checkpoint"),
	];
}

function customOffer(data: unknown): SessionEntry {
	return { type: "custom", id: "offer-entry", parentId: null, timestamp: stamp, customType: ADVISORY_OFFER_ENTRY_TYPE, data } as SessionEntry;
}

function decisionEntry(id: string, decision: unknown): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: stamp,
		message: {
			role: "toolResult",
			toolCallId: `call-${id}`,
			toolName: "choose_compaction_boundary",
			content: [{ type: "text", text: "recorded" }],
			details: { [ADVISORY_DECISION_DETAIL_KEY]: decision },
			isError: false,
			timestamp: Date.now(),
		},
	} as unknown as SessionEntry;
}

describe("advisory threshold policy", () => {
	it("parses a configured percentage and falls back to 70 for invalid values", () => {
		expect(parseAdvisoryThreshold("62.5")).toEqual({ percent: 62.5, usedDefault: false });
		expect(parseAdvisoryThreshold("0")).toEqual({ percent: DEFAULT_ADVISORY_THRESHOLD_PERCENT, usedDefault: true });
		expect(parseAdvisoryThreshold("not-a-number")).toEqual({ percent: DEFAULT_ADVISORY_THRESHOLD_PERCENT, usedDefault: true });
		expect(parseAdvisoryThreshold(undefined)).toEqual({ percent: DEFAULT_ADVISORY_THRESHOLD_PERCENT, usedDefault: false });
	});

	it("requires known usage at or above the threshold", () => {
		expect(hasReachedAdvisoryThreshold(undefined, 70)).toBe(false);
		expect(hasReachedAdvisoryThreshold({ tokens: null, contextWindow: 100_000, percent: null }, 70)).toBe(false);
		expect(hasReachedAdvisoryThreshold({ tokens: 70_000, contextWindow: 100_000, percent: 70 }, 70)).toBe(true);
	});

	it("changes epoch after compaction", () => {
		const before = compactionEpochId(history(), "session");
		const after = compactionEpochId([...history(), { type: "compaction", id: "cmp1" } as SessionEntry], "session");
		expect(before).toBe("session:initial");
		expect(after).toBe("session:cmp1");
	});
});

describe("deterministic compaction offers", () => {
	it("selects a bounded diverse menu with stable opaque IDs and a useful agent checkpoint", () => {
		const entries = history();
		const input = {
			entries,
			candidates: getSafeBoundaryCandidates(entries),
			totalTokens: 70_000,
			contextWindow: 120_000,
			maxOutputTokens: 16_000,
		};
		const first = buildCompactionOfferOptions(input);
		const second = buildCompactionOfferOptions(input);

		expect(first.length).toBeGreaterThan(1);
		expect(first.length).toBeLessThanOrEqual(4);
		expect(first.map((option) => option.optionId)).toEqual(second.map((option) => option.optionId));
		expect(first.map((option) => option.firstKeptEntryId)).toEqual(second.map((option) => option.firstKeptEntryId));
		expect(first.some((option) => option.kind === "user-exchange")).toBe(true);
		expect(first.some((option) => option.kind === "agent-checkpoint" && option.firstKeptEntryId === "a4")).toBe(true);
		expect(new Set(first.map((option) => option.retainedTokens)).size).toBe(first.length);
		expect(formatCompactionAdvisory("offer-1", first)).toContain("native — let Pi compute");
	});

	it("excludes every candidate when conservative headroom cannot be met", () => {
		const entries = history();
		const result = buildCompactionOfferOptions({
			entries,
			candidates: getSafeBoundaryCandidates(entries),
			totalTokens: 19_000,
			contextWindow: 20_000,
			maxOutputTokens: 16_000,
		});
		expect(result).toEqual([]);
	});
});

describe("branch-local advisory state", () => {
	it("restores offers and the latest matching decision from session entries", () => {
		const entries = history();
		const boundaries = buildCompactionOfferOptions({ entries, candidates: getSafeBoundaryCandidates(entries), totalTokens: 70_000, contextWindow: 120_000, maxOutputTokens: 16_000 });
		const offer = createOfferRecord({ offerId: "offer-1", sessionId: "session", epochId: "session:initial", thresholdPercent: 70, boundaries });
		const firstDecision = createDecisionRecord({ offer, optionId: "native" })!;
		const latestDecision = createDecisionRecord({ offer, optionId: boundaries[0]!.optionId, summaryFocus: " preserve tests " })!;
		const branch = [...entries, customOffer(offer), decisionEntry("decision-1", firstDecision), decisionEntry("decision-2", latestDecision)];

		expect(activeOffer(branch, "session")).toEqual(offer);
		expect(activeDecision(branch, "session")).toEqual({ ...latestDecision, summaryFocus: "preserve tests" });
	});

	it("rejects off-branch, wrong-session, unknown-option, and expired state", () => {
		const entries = history();
		const boundaries = buildCompactionOfferOptions({ entries, candidates: getSafeBoundaryCandidates(entries), totalTokens: 70_000, contextWindow: 120_000, maxOutputTokens: 16_000 });
		const offer = createOfferRecord({ offerId: "offer-1", sessionId: "session", epochId: "session:initial", thresholdPercent: 70, boundaries });
		expect(activeOffer(entries, "session")).toBeUndefined();
		expect(activeOffer([...entries, customOffer(offer)], "other-session")).toBeUndefined();
		expect(createDecisionRecord({ offer, optionId: "missing" })).toBeUndefined();
		expect(activeOffer([...entries, customOffer(offer), { type: "compaction", id: "cmp1" } as SessionEntry], "session")).toBeUndefined();
	});
});

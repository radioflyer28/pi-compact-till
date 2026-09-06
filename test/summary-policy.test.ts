import { describe, expect, it, vi } from "vitest";
import {
	CALLER_FOCUS_END,
	CALLER_FOCUS_START,
	CompactionSummaryValidationError,
	REPAIR_END,
	REPAIR_START,
	type CompactArguments,
	combineCompactionUsage,
	composeCompactionInstructions,
	runValidatedCompaction,
	validateCompactionSummary,
} from "../extensions/summary-policy.js";

export const VALID_HISTORY_SUMMARY = `## Goal
Ship validated targeted compaction.

## Constraints & Preferences
- Preserve Pi's native compactor.

## Progress
### Done
- [x] Prepared the boundary.

### In Progress
- [ ] Validate the summary.

### Blocked
- (none)

## Key Decisions
- **Reuse Pi**: Preserve provider behavior.

## Next Steps
1. Run the package tests.

## Critical Context
- extensions/compact-until.ts owns the lifecycle.`;

const VALID_TURN_SUMMARY = `## Original Request
Add structural validation.

## Early Progress
- The boundary was selected.

## Context for Suffix
- Continue from the retained assistant message.`;

describe("compaction instruction composition", () => {
	it("always emits the package rubric when caller focus is omitted", () => {
		const instructions = composeCompactionInstructions();
		expect(instructions).toContain("Package coding-continuation requirements");
		expect(instructions).toContain("exact technical identifiers");
		expect(instructions).not.toContain(CALLER_FOCUS_START);
		expect(instructions).not.toContain(REPAIR_START);
	});

	it.each(["Preserve the user's approval", "Keep the agent's verification results"])(
		"preserves supplemental caller focus: %s",
		(focus) => {
			const instructions = composeCompactionInstructions(focus);
			expect(instructions).toContain(`${CALLER_FOCUS_START}\n${focus}\n${CALLER_FOCUS_END}`);
			expect(instructions.indexOf("Package coding-continuation requirements")).toBeLessThan(instructions.indexOf(focus));
		},
	);

	it("delimits concrete repair instructions with stable issue codes", () => {
		const instructions = composeCompactionInstructions("keep focus", [
			{ code: "missing-history-heading", message: "Missing required heading: ## Goal" },
		]);
		expect(instructions).toContain("keep focus");
		expect(instructions).toContain(`${REPAIR_START}\nThe previous generated checkpoint was rejected.`);
		expect(instructions).toContain("[missing-history-heading] Missing required heading: ## Goal");
		expect(instructions).toContain(REPAIR_END);
	});
});

describe("compaction summary validation", () => {
	it("accepts a complete normal summary with required headings, order, content, and explicit none", () => {
		expect(validateCompactionSummary(VALID_HISTORY_SUMMARY, { messagesToSummarize: 2, isSplitTurn: false })).toEqual({ valid: true, issues: [] });
	});

	it("accepts split summaries with normal history or explicit no-prior-history", () => {
		const split = `${VALID_HISTORY_SUMMARY}\n\n---\n\n**Turn Context (split turn):**\n\n${VALID_TURN_SUMMARY}`;
		const noHistory = `No prior history.\n\n---\n\n**Turn Context (split turn):**\n\n${VALID_TURN_SUMMARY}`;
		expect(validateCompactionSummary(split, { messagesToSummarize: 2, isSplitTurn: true }).valid).toBe(true);
		expect(validateCompactionSummary(noHistory, { messagesToSummarize: 0, isSplitTurn: true }).valid).toBe(true);
	});

	it("rejects empty output and missing, duplicate, empty, or out-of-order history headings", () => {
		expect(validateCompactionSummary("", { messagesToSummarize: 1, isSplitTurn: false }).issues.map((issue) => issue.code)).toContain("empty-summary");
		expect(validateCompactionSummary(VALID_HISTORY_SUMMARY.replace("## Goal\nShip validated targeted compaction.\n\n", ""), { messagesToSummarize: 1, isSplitTurn: false }).issues.map((issue) => issue.code)).toContain("missing-history-heading");
		expect(validateCompactionSummary(`${VALID_HISTORY_SUMMARY}\n\n## Goal\nDuplicate`, { messagesToSummarize: 1, isSplitTurn: false }).issues.map((issue) => issue.code)).toContain("duplicate-history-heading");
		expect(validateCompactionSummary(VALID_HISTORY_SUMMARY.replace("## Goal\nShip validated targeted compaction.", "## Goal"), { messagesToSummarize: 1, isSplitTurn: false }).issues.map((issue) => issue.code)).toContain("empty-history-section");
		const reordered = VALID_HISTORY_SUMMARY.replace("## Goal\nShip validated targeted compaction.\n\n", "").replace("## Critical Context", "## Goal\nShip validated targeted compaction.\n\n## Critical Context");
		expect(validateCompactionSummary(reordered, { messagesToSummarize: 1, isSplitTurn: false }).issues.map((issue) => issue.code)).toContain("history-heading-order");
	});

	it("rejects missing split markers, incomplete turn sections, and invalid no-history text", () => {
		const facts = { messagesToSummarize: 0, isSplitTurn: true };
		expect(validateCompactionSummary(`No prior history.\n\n${VALID_TURN_SUMMARY}`, facts).issues.map((issue) => issue.code)).toContain("missing-split-marker");
		expect(validateCompactionSummary(`No prior history.\n\n---\n\n**Turn Context (split turn):**\n\n${VALID_TURN_SUMMARY.replace("## Early Progress\n- The boundary was selected.\n\n", "")}`, facts).issues.map((issue) => issue.code)).toContain("missing-turn-heading");
		expect(validateCompactionSummary(`Nothing earlier.\n\n---\n\n**Turn Context (split turn):**\n\n${VALID_TURN_SUMMARY}`, facts).issues.map((issue) => issue.code)).toContain("invalid-no-history");
	});

	it("rejects Pi template placeholders but accepts markdown task checkboxes", () => {
		const invalid = VALID_HISTORY_SUMMARY.replace("Ship validated targeted compaction.", "[What is the user trying to accomplish?]");
		expect(validateCompactionSummary(invalid, { messagesToSummarize: 1, isSplitTurn: false }).issues.map((issue) => issue.code)).toContain("template-placeholder");
		expect(validateCompactionSummary(VALID_HISTORY_SUMMARY, { messagesToSummarize: 1, isSplitTurn: false }).issues.map((issue) => issue.code)).not.toContain("template-placeholder");
	});
});

describe("compaction usage aggregation", () => {
	it("adds every supported token and cost field without mutating either attempt", () => {
		const first = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cacheWrite1h: 5, reasoning: 6, totalTokens: 10, cost: { input: 0.1, output: 0.2, cacheRead: 0.3, cacheWrite: 0.4, total: 1 } };
		const second = { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cacheWrite1h: 50, reasoning: 60, totalTokens: 100, cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 } };
		const beforeFirst = structuredClone(first);
		const beforeSecond = structuredClone(second);

		expect(combineCompactionUsage(first, second)).toEqual({
			input: 11, output: 22, cacheRead: 33, cacheWrite: 44, cacheWrite1h: 55, reasoning: 66, totalTokens: 110,
			cost: { input: 1.1, output: 2.2, cacheRead: 3.3, cacheWrite: 4.4, total: 11 },
		});
		expect(first).toEqual(beforeFirst);
		expect(second).toEqual(beforeSecond);
	});

	it("preserves optional usage fields when only one attempt reports them", () => {
		const base = { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, totalTokens: 4, cost: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, total: 4 } };
		expect(combineCompactionUsage({ ...base, cacheWrite1h: 2, reasoning: 3 }, base)).toMatchObject({ cacheWrite1h: 2, reasoning: 3 });
	});
});

function compactArguments(focus = "Preserve caller focus"): CompactArguments {
	return [
		{
			firstKeptEntryId: "kept-entry",
			messagesToSummarize: [{ role: "user", content: "old context", timestamp: 1 }],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 123,
			previousSummary: "previous summary",
			fileOps: { read: new Set(["read.ts"]), written: new Set(["write.ts"]), edited: new Set(["edit.ts"]) },
			settings: { enabled: true, reserveTokens: 1_000, keepRecentTokens: 2_000 },
		},
		{ id: "model" },
		"api-key",
		{ authorization: "header" },
		focus,
		new AbortController().signal,
		"high",
		vi.fn(),
		{ API_HOST: "host" },
		{ maxAttempts: 3 },
		{ onRetry: vi.fn() },
	] as unknown as CompactArguments;
}

function result(summary: string, usage?: { multiplier?: number }) {
	const multiplier = usage?.multiplier ?? 1;
	return {
		summary,
		firstKeptEntryId: "kept-entry",
		tokensBefore: 123,
		estimatedTokensAfter: 45,
		details: { providerDetail: true },
		usage: {
			input: multiplier,
			output: 2 * multiplier,
			cacheRead: 3 * multiplier,
			cacheWrite: 4 * multiplier,
			cacheWrite1h: 5 * multiplier,
			reasoning: 6 * multiplier,
			totalTokens: 10 * multiplier,
			cost: { input: 1 * multiplier, output: 2 * multiplier, cacheRead: 3 * multiplier, cacheWrite: 4 * multiplier, total: 10 * multiplier },
		},
	};
}

describe("validated compaction runner", () => {
	it("returns a valid first checkpoint in one call while preserving every Pi argument", async () => {
		const args = compactArguments("Keep exact decisions");
		const expected = result(VALID_HISTORY_SUMMARY);
		const compactFn = vi.fn().mockResolvedValue(expected);

		const actual = await runValidatedCompaction(args, compactFn as never);

		expect(actual).toBe(expected);
		expect(compactFn).toHaveBeenCalledOnce();
		const call = compactFn.mock.calls[0]!;
		for (const index of [0, 1, 2, 3, 5, 6, 7, 8, 9, 10]) expect(call[index]).toBe(args[index]);
		expect(call[4]).toContain("Package coding-continuation requirements");
		expect(call[4]).toContain("Keep exact decisions");
	});

	it("repairs one invalid checkpoint from the same input, retains focus, and combines usage", async () => {
		const args = compactArguments("Preserve benchmark results");
		const rejected = result("missing structure", { multiplier: 1 });
		const corrected = result(VALID_HISTORY_SUMMARY, { multiplier: 10 });
		const compactFn = vi.fn().mockResolvedValueOnce(rejected).mockResolvedValueOnce(corrected);

		const actual = await runValidatedCompaction(args, compactFn as never);

		expect(compactFn).toHaveBeenCalledTimes(2);
		expect(compactFn.mock.calls[1]![0]).toBe(args[0]);
		expect(compactFn.mock.calls[1]![4]).toContain("Preserve benchmark results");
		expect(compactFn.mock.calls[1]![4]).toContain(REPAIR_START);
		expect(compactFn.mock.calls[1]![4]).toContain("missing-history-heading");
		expect(compactFn.mock.calls[1]![4]).not.toContain("missing structure");
		expect(actual.summary).toBe(VALID_HISTORY_SUMMARY);
		expect(actual.details).toBe(corrected.details);
		expect(actual.usage).toMatchObject({ input: 11, output: 22, cacheRead: 33, cacheWrite: 44, cacheWrite1h: 55, reasoning: 66, totalTokens: 110 });
	});

	it("throws a typed failure after exactly two invalid returned checkpoints", async () => {
		const compactFn = vi.fn().mockResolvedValue(result("still invalid"));
		await expect(runValidatedCompaction(compactArguments(), compactFn as never)).rejects.toBeInstanceOf(CompactionSummaryValidationError);
		expect(compactFn).toHaveBeenCalledTimes(2);
	});

	it("does not add a package retry when Pi throws", async () => {
		const failure = new Error("provider failed after Pi retries");
		const compactFn = vi.fn().mockRejectedValue(failure);
		await expect(runValidatedCompaction(compactArguments(), compactFn as never)).rejects.toBe(failure);
		expect(compactFn).toHaveBeenCalledOnce();
	});
});

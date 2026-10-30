import { describe, expect, it } from "vitest";
import { fixtures, continuationInput, scoreContinuation, scoreRun, SUITE_VERSION } from "../eval/continuation.js";
import { validateCompactionSummary } from "../extensions/summary-policy.js";
function run() {
	return { suiteVersion: SUITE_VERSION, run: { kind: "fixture-control", provider: "none", model: "none", settings: "none", runtime: "offline", extensionCommit: "fixture", summarySource: "authored-controls" },
		results: fixtures.flatMap((item) => ["original", "candidate"].map((condition) => ({ id: item.id, condition, trial: 1, output: { ...item.expected } as unknown, error: undefined as string | undefined }))) };
}
describe("semantic continuation evaluation contracts (authored controls, no model claims)", () => {
	it.each(fixtures)("$id: structurally valid summaries can imply a wrong downstream action", (item) => {
		const facts = { messagesToSummarize: item.isSplitTurn ? 0 : 2, isSplitTurn: item.isSplitTurn };
		expect(validateCompactionSummary(item.goodSummary, facts).valid).toBe(true);
		expect(validateCompactionSummary(item.badSummary, facts).valid).toBe(true);
		expect(scoreContinuation(item, item.expected).status).toBe("pass");
		expect(scoreContinuation(item, item.counterexample).status).toBe("fail");
		// Correct keywords in rationale cannot excuse an incorrect action or extra output.
		expect(scoreContinuation(item, { ...item.counterexample, rationale: JSON.stringify(item.expected) }).status).toBe("invalid-output");
	});
	it.each(fixtures)("$id: a missing answer is not a successful continuation", (item) => {
		expect(scoreContinuation(item, { action: "ask-for-context" }).status).toBe("abstain");
		expect(scoreContinuation(item, {}).status).toBe("invalid-output");
		expect(scoreContinuation(item, undefined, "provider failed").status).toBe("provider-error");
	});
	it("separates original context from candidate summaries without leaking answer keys", () => {
		for (const item of fixtures) {
			const original = continuationInput(item, "original");
			const candidate = continuationInput(item, "candidate", "Unique candidate summary");
			expect(original.messages[1]!.content).toContain(item.prefix);
			expect(candidate.messages[1]!.content).not.toContain(item.prefix);
			expect(candidate.messages[1]!.content).toContain(item.retained);
			expect(candidate).not.toHaveProperty("expected");
			expect(() => continuationInput(item, "candidate")).toThrow("Missing candidate summary");
		}
	});
	it("reports regressions only against a passing baseline and distinguishes operational failures", () => {
		const input = run();
		expect(scoreRun(input)).toMatchObject({ allPassed: true, pairs: 6, regressions: 0, kind: "fixture-control" });
		input.results[1]!.output = fixtures[0]!.counterexample;
		expect(scoreRun(input)).toMatchObject({ allPassed: false, regressions: 1 });
		input.results[0]!.output = fixtures[0]!.counterexample;
		expect(scoreRun(input).comparisons[0]!.outcome).toBe("baseline-not-passing");
		input.results[1]!.error = "timeout";
		expect(scoreRun(input).comparisons[0]!.outcome).toBe("operational-failure");
	});
	it("rejects incomplete, duplicate, unknown, or unversioned runs", () => {
		const incomplete = run(); incomplete.results.pop(); expect(() => scoreRun(incomplete)).toThrow("Incomplete");
		const duplicate = run(); duplicate.results.push(duplicate.results[0]!); expect(() => scoreRun(duplicate)).toThrow("Duplicate");
		const unknown = run(); unknown.results[0]!.id = "unknown"; expect(() => scoreRun(unknown)).toThrow("Unknown");
		expect(() => scoreRun({ ...run(), suiteVersion: 0 })).toThrow();
		expect(() => scoreRun({ ...run(), results: [] })).toThrow("No trials");
	});
});

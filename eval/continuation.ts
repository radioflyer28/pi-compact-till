// Synthetic development probes, not a held-out benchmark or a runtime validator.
export const SUITE_VERSION = 1;
type Decision = Record<string, string | number | boolean | string[]>;
export interface ContinuationFixture {
	id: string;
	prefix: string;
	retained: string;
	isSplitTurn: boolean;
	goodSummary: string;
	badSummary: string;
	continuation: string;
	expected: Decision;
	counterexample: Decision;
}
function summary(fact: string, split = false): string {
	if (split) return `No prior history.\n\n---\n\n**Turn Context (split turn):**\n\n## Original Request\nContinue the investigation.\n\n## Progress So Far\n- Evidence was collected.\n\n## Context Needed to Continue\n- ${fact}`;
	return `## Goal\nContinue the task correctly.\n\n## Constraints & Preferences\n- Follow the recorded decisions.\n\n## Progress\n### Done\n- [x] Collected evidence.\n### In Progress\n- [ ] Continue the task.\n### Blocked\n- (none)\n\n## Key Decisions\n- Use the evidence below.\n\n## Next Steps\n1. Complete the next requested action.\n\n## Critical Context\n- ${fact}`;
}
function fixture(id: string, prefix: string, retained: string, good: string, bad: string, continuation: string, expected: Decision, counterexample: Decision, isSplitTurn = false): ContinuationFixture {
	return { id, prefix, retained, isSplitTurn, goodSummary: summary(good, isSplitTurn), badSummary: summary(bad, isSplitTurn), continuation, expected, counterexample };
}
export const fixtures: ContinuationFixture[] = [
	fixture("early-constraint",
		"User: Build a search preview for confidential documents. Queries must remain in memory; never write them to disk or transmit telemetry.\nAssistant: Local indexing investigation completed.",
		"User: Implement the query cache now.",
		"Query cache must be memory-only. Disk persistence and telemetry are forbidden.",
		"Memory-only storage was discussed, but persistent disk caching and telemetry are now approved.",
		'Return the implementation decision as JSON: {"storage":"memory" or "disk","telemetry":boolean}. No extra keys.',
		{ storage: "memory", telemetry: false }, { storage: "disk", telemetry: true }),
	fixture("rejected-approach",
		"User: Fix retries for payment submission.\nAssistant: Retrying every POST caused duplicate charges in the experiment. We rejected blanket retries.\nUser: Use retries only with a stable idempotency key. Do not retry requests without a key.",
		"User: Choose the retry behavior for the patch.",
		"Blanket POST retries caused duplicate charges and were rejected. Retry only with a stable idempotency key.",
		"Duplicate charges and idempotency keys were investigated; blanket POST retries are the selected approach.",
		'Return JSON: {"retryPolicy":"all-posts" or "keyed-only","retryWithoutKey":boolean}. No extra keys.',
		{ retryPolicy: "keyed-only", retryWithoutKey: false }, { retryPolicy: "all-posts", retryWithoutKey: true }),
	fixture("exact-evidence",
		"User: Diagnose the index loader.\nTool evidence: loader.test.ts::rejects_truncated_index failed. expected=4096 actual=4095; code=E_INDEX_TRUNCATED.\nAssistant: Other cases passed; this failure is unresolved.",
		"User: Prepare the precise regression assertion, not a generic failure description.",
		"Unresolved: loader.test.ts::rejects_truncated_index failed with E_INDEX_TRUNCATED, expected 4096, actual 4095.",
		"loader.test.ts::rejects_truncated_index and E_INDEX_TRUNCATED were investigated. Expected 4095, actual 4096; the suite now passes.",
		'Return JSON: {"test":string,"expected":number,"actual":number,"errorCode":string,"resolved":boolean}. No extra keys.',
		{ test: "loader.test.ts::rejects_truncated_index", expected: 4096, actual: 4095, errorCode: "E_INDEX_TRUNCATED", resolved: false },
		{ test: "loader.test.ts::rejects_truncated_index", expected: 4095, actual: 4096, errorCode: "E_INDEX_TRUNCATED", resolved: true }),
	fixture("unfinished-work",
		"User: Fix the migration and verify it before release.\nAssistant: Patch applied.\nTool: Unit tests passed. Integration tests were not run: the database fixture is unavailable.\nUser: Do not mark this ready until integration tests have passed.",
		"User: Give the release decision and immediate next action.",
		"Unit tests passed; integration tests have NOT run because the database fixture is unavailable. Release is blocked until they pass.",
		"Unit and integration tests passed after the database fixture was restored. Release is ready.",
		'Return JSON: {"ready":boolean,"nextAction":"restore-fixture-and-run-integration" or "release"}. No extra keys.',
		{ ready: false, nextAction: "restore-fixture-and-run-integration" }, { ready: true, nextAction: "release" }),
	fixture("split-turn-request",
		"User: Investigate the cache mismatch only; do not modify files yet.\nAssistant: I compared ordinary request headers.\nTool: Headers match; serializer output has not yet been compared.",
		"Assistant checkpoint: Header comparison is complete. Continue the investigation.",
		"Investigation only: do not edit files. Headers match; the unresolved next check is serialized request comparison.",
		"The investigation is complete. Editing the cache policy is authorized; serialized request comparison is unnecessary.",
		'Return JSON: {"nextAction":"compare-serialized-requests" or "edit-cache-policy","modifyFiles":boolean}. No extra keys.',
		{ nextAction: "compare-serialized-requests", modifyFiles: false }, { nextAction: "edit-cache-policy", modifyFiles: true }, true),
	fixture("repeated-compaction",
		"Previous compaction summary: Webhook signatures cover the original request bytes. JSON reserialization breaks validation and was rejected. Verify using raw bytes before parsing.\nUser: Next, add support for the partner endpoint.\nAssistant: Endpoint routing is implemented; signature validation remains to be connected.",
		"User: Choose the verification input and operation order for the partner handler.",
		"Carry forward the earlier summary: signatures cover raw request bytes, not reserialized JSON. Verify first, then parse. Routing is ready; verification still needs wiring.",
		"The earlier summary mentioned raw bytes and JSON. Use reserialized JSON for signatures; parse first, then verify.",
		'Return JSON: {"signatureInput":"raw-bytes" or "reserialized-json","order":[string,string]}. No extra keys.',
		{ signatureInput: "raw-bytes", order: ["verify", "parse"] }, { signatureInput: "reserialized-json", order: ["parse", "verify"] }),
];
export type Condition = "original" | "good" | "bad" | "candidate";
export function continuationInput(item: ContinuationFixture, condition: Condition, candidateSummary?: string) {
	if (condition === "candidate" && (!candidateSummary || !candidateSummary.trim())) throw new Error(`Missing candidate summary: ${item.id}`);
	const context = condition === "original" ? item.prefix : condition === "good" ? item.goodSummary : condition === "bad" ? item.badSummary : candidateSummary!;
	return { id: item.id, suiteVersion: SUITE_VERSION, condition, messages: [
		{ role: "system", content: 'Continue the recorded task. Return only the requested JSON decision. If essential information is missing or contradictory, return {"action":"ask-for-context"} instead of guessing.' },
		{ role: "user", content: `Task history${condition === "original" ? "" : " summary"}:\n${context}\n\nRetained context:\n${item.retained}\n\nNext task:\n${item.continuation}` },
	] };
}
export type Verdict = { status: "pass" | "fail" | "abstain" | "invalid-output" | "provider-error"; failedFields: string[] };
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function scoreContinuation(item: ContinuationFixture, output: unknown, error?: unknown): Verdict {
	if (error !== undefined) return { status: "provider-error", failedFields: [] };
	if (!object(output)) return { status: "invalid-output", failedFields: [] };
	if (Object.keys(output).length === 1 && output.action === "ask-for-context") return { status: "abstain", failedFields: [] };
	const keys = Object.keys(item.expected);
	if (Object.keys(output).length !== keys.length || keys.some((key) => !Object.hasOwn(output, key) || typeof output[key] !== typeof item.expected[key] || Array.isArray(output[key]) !== Array.isArray(item.expected[key]))) return { status: "invalid-output", failedFields: [] };
	if (keys.some((key) => Array.isArray(item.expected[key]) && (output[key] as unknown[]).some((value) => typeof value !== "string") || typeof output[key] === "number" && !Number.isFinite(output[key]))) return { status: "invalid-output", failedFields: [] };
	const failedFields = keys.filter((key) => JSON.stringify(output[key]) !== JSON.stringify(item.expected[key]));
	return { status: failedFields.length ? "fail" : "pass", failedFields };
}
/** Score paired, externally produced original/candidate continuations. Never sends requests. */
export function scoreRun(input: unknown) {
	if (!object(input) || input.suiteVersion !== SUITE_VERSION || !object(input.run) || !Array.isArray(input.results)) throw new Error("Expected suiteVersion, run metadata, and results array");
	for (const key of ["provider", "model", "settings", "runtime", "extensionCommit", "summarySource"]) if (typeof input.run[key] !== "string" || !input.run[key].trim()) throw new Error(`Missing public run metadata: ${key}`);
	if (input.run.kind !== "model" && input.run.kind !== "fixture-control") throw new Error("run.kind must be model or fixture-control");
	const records = new Map<string, Verdict>();
	const trials = new Set<number>();
	for (const row of input.results) {
		if (!object(row) || typeof row.id !== "string" || !Number.isSafeInteger(row.trial) || (row.trial as number) < 1 || !["original", "candidate"].includes(String(row.condition))) throw new Error("Invalid result identity");
		const item = fixtures.find((f) => f.id === row.id);
		if (!item) throw new Error(`Unknown fixture: ${row.id}`);
		const key = `${row.trial}:${row.id}:${row.condition}`;
		if (records.has(key)) throw new Error(`Duplicate result: ${key}`);
		records.set(key, scoreContinuation(item, row.output, row.error)); trials.add(row.trial as number);
	}
	if (!trials.size) throw new Error("No trials provided");
	const comparisons = [...trials].sort((a, b) => a - b).flatMap((trial) => fixtures.map((item) => {
		const original = records.get(`${trial}:${item.id}:original`);
		const candidate = records.get(`${trial}:${item.id}:candidate`);
		if (!original || !candidate) throw new Error(`Incomplete paired trial: ${trial}:${item.id}`);
		const outcome = [original.status, candidate.status].some((s) => s === "provider-error" || s === "invalid-output") ? "operational-failure"
			: original.status !== "pass" ? "baseline-not-passing"
			: candidate.status === "fail" ? "regression" : candidate.status === "abstain" ? "abstained" : "retained";
		return { id: item.id, trial, original, candidate, outcome };
	}));
	const metadata = Object.fromEntries(["kind", "provider", "model", "settings", "runtime", "extensionCommit", "summarySource"].map((key) => [key, (input.run as Record<string, unknown>)[key]]));
	return { suiteVersion: SUITE_VERSION, kind: input.run.kind, run: metadata, pairs: comparisons.length, comparisons,
		regressions: comparisons.filter((r) => r.outcome === "regression").length,
		allPassed: comparisons.every((r) => r.original.status === "pass" && r.candidate.status === "pass"),
		limitations: "Synthetic fixed-cut structured-decision probes; no automatic boundary selection, tool execution, cost measurement, or production-quality guarantee." };
}

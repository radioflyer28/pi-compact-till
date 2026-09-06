import {
	compact,
	type CompactionResult,
} from "@earendil-works/pi-coding-agent";

export const CALLER_FOCUS_START = "--- Supplemental caller focus (preserve in addition to the required handoff) ---";
export const CALLER_FOCUS_END = "--- End supplemental caller focus ---";
export const REPAIR_START = "--- Required structural repair ---";
export const REPAIR_END = "--- End required structural repair ---";

const CONTINUATION_RUBRIC = `Package coding-continuation requirements:
- Preserve the current goal and acceptance criteria.
- Preserve user constraints, preferences, approvals, and explicit non-goals.
- Distinguish completed work, current work, blockers, and verification outcomes.
- Preserve important decisions and their rationale.
- Preserve exact technical identifiers such as file paths, symbols, commands, error messages, versions, and boundary IDs.
- State the immediate next action and the context needed to understand retained messages.
- Follow Pi's required checkpoint headings and order exactly. These requirements affect section content; do not add them as output headings.`;

export interface SummaryValidationIssue {
	code: string;
	message: string;
}

export interface SummaryValidationResult {
	valid: boolean;
	issues: SummaryValidationIssue[];
}

export interface SummaryValidationFacts {
	messagesToSummarize: number;
	isSplitTurn: boolean;
}

/** Compose package requirements, optional caller emphasis, and optional retry feedback. */
export function composeCompactionInstructions(
	callerFocus?: string,
	repairIssues: readonly SummaryValidationIssue[] = [],
): string {
	const sections = [CONTINUATION_RUBRIC];
	const focus = callerFocus?.trim();
	if (focus) {
		sections.push(`${CALLER_FOCUS_START}\n${focus}\n${CALLER_FOCUS_END}`);
	}
	if (repairIssues.length > 0) {
		const repairs = repairIssues.map((issue) => `- [${issue.code}] ${issue.message}`).join("\n");
		sections.push(`${REPAIR_START}\nThe previous generated checkpoint was rejected. Regenerate it from the original conversation and fix every issue below:\n${repairs}\nReturn only the corrected checkpoint in Pi's required format.\n${REPAIR_END}`);
	}
	return sections.join("\n\n");
}

const HISTORY_HEADINGS = [
	"## Goal",
	"## Constraints & Preferences",
	"## Progress",
	"### Done",
	"### In Progress",
	"### Blocked",
	"## Key Decisions",
	"## Next Steps",
	"## Critical Context",
] as const;

const HISTORY_CONTENT_HEADINGS = HISTORY_HEADINGS.filter((heading) => heading !== "## Progress");
const TURN_HEADINGS = ["## Original Request", "## Early Progress", "## Context for Suffix"] as const;
const SPLIT_MARKER = "**Turn Context (split turn):**";

function exactLineIndexes(text: string, heading: string): number[] {
	return text.split(/\r?\n/).flatMap((line, index) => line.trim() === heading ? [index] : []);
}

function validateHeadings(
	text: string,
	headings: readonly string[],
	contentHeadings: readonly string[],
	prefix: "history" | "turn",
): SummaryValidationIssue[] {
	const issues: SummaryValidationIssue[] = [];
	const lines = text.split(/\r?\n/);
	const indexes = new Map<string, number>();

	for (const heading of headings) {
		const matches = exactLineIndexes(text, heading);
		if (matches.length === 0) {
			issues.push({ code: `missing-${prefix}-heading`, message: `Missing required heading: ${heading}` });
			continue;
		}
		if (matches.length > 1) {
			issues.push({ code: `duplicate-${prefix}-heading`, message: `Heading must appear exactly once: ${heading}` });
		}
		indexes.set(heading, matches[0]!);
	}

	const present = headings.filter((heading) => indexes.has(heading));
	for (let index = 1; index < present.length; index += 1) {
		if (indexes.get(present[index - 1]!)! >= indexes.get(present[index]!)!) {
			issues.push({ code: `${prefix}-heading-order`, message: `${present[index]!} must appear after ${present[index - 1]!}.` });
			break;
		}
	}

	for (const heading of contentHeadings) {
		const start = indexes.get(heading);
		if (start === undefined) continue;
		const level = heading.startsWith("### ") ? 3 : 2;
		let end = lines.length;
		for (let index = start + 1; index < lines.length; index += 1) {
			const match = /^(#{1,6})\s+/.exec(lines[index]!.trim());
			if (match && match[1]!.length <= level) {
				end = index;
				break;
			}
		}
		const content = lines.slice(start + 1, end).join("\n").trim();
		const meaningful = content.replace(/^[-*+]\s*/gm, "").replace(/^\d+\.\s*/gm, "").trim();
		if (!meaningful) {
			issues.push({ code: `empty-${prefix}-section`, message: `Required section has no content: ${heading}` });
		}
	}

	return issues;
}

function placeholderIssue(text: string): SummaryValidationIssue | undefined {
	const templatePlaceholder = /\[(?![ xX]\])(?:What|Any|Or\s+"?\(none\)|Completed|Current|Issues|Decision|Brief|Ordered|Preserve|Include|Update|Information|Key)[^\]\n]*\]/i;
	return templatePlaceholder.test(text)
		? { code: "template-placeholder", message: "Replace every unfilled template placeholder with concrete content or an explicit (none)." }
		: undefined;
}

/** Validate Pi's normal and split-turn checkpoint shapes against the prepared input. */
export function validateCompactionSummary(summary: string, facts: SummaryValidationFacts): SummaryValidationResult {
	const issues: SummaryValidationIssue[] = [];
	const text = summary.trim();
	if (!text) {
		return { valid: false, issues: [{ code: "empty-summary", message: "The generated checkpoint is empty." }] };
	}

	const placeholder = placeholderIssue(text);
	if (placeholder) issues.push(placeholder);

	if (!facts.isSplitTurn) {
		issues.push(...validateHeadings(text, HISTORY_HEADINGS, HISTORY_CONTENT_HEADINGS, "history"));
		return { valid: issues.length === 0, issues };
	}

	const markerMatches = exactLineIndexes(text, SPLIT_MARKER);
	if (markerMatches.length === 0) {
		issues.push({ code: "missing-split-marker", message: `Missing required split-turn marker: ${SPLIT_MARKER}` });
		return { valid: false, issues };
	}
	if (markerMatches.length > 1) {
		issues.push({ code: "duplicate-split-marker", message: `Split-turn marker must appear exactly once: ${SPLIT_MARKER}` });
	}

	const lines = text.split(/\r?\n/);
	const markerIndex = markerMatches[0]!;
	const history = lines.slice(0, markerIndex).join("\n").replace(/\n?---\s*$/, "").trim();
	const turn = lines.slice(markerIndex + 1).join("\n").trim();
	if (facts.messagesToSummarize === 0) {
		if (history !== "No prior history.") {
			issues.push({ code: "invalid-no-history", message: "A split turn with no earlier history must begin with: No prior history." });
		}
	} else {
		issues.push(...validateHeadings(history, HISTORY_HEADINGS, HISTORY_CONTENT_HEADINGS, "history"));
	}
	issues.push(...validateHeadings(turn, TURN_HEADINGS, TURN_HEADINGS, "turn"));
	return { valid: issues.length === 0, issues };
}

type CompactionUsage = NonNullable<CompactionResult["usage"]>;

/** Add usage from both generations without changing either returned result. */
export function combineCompactionUsage(first: CompactionUsage, second: CompactionUsage): CompactionUsage {
	const combined: CompactionUsage = {
		input: first.input + second.input,
		output: first.output + second.output,
		cacheRead: first.cacheRead + second.cacheRead,
		cacheWrite: first.cacheWrite + second.cacheWrite,
		totalTokens: first.totalTokens + second.totalTokens,
		cost: {
			input: first.cost.input + second.cost.input,
			output: first.cost.output + second.cost.output,
			cacheRead: first.cost.cacheRead + second.cost.cacheRead,
			cacheWrite: first.cost.cacheWrite + second.cost.cacheWrite,
			total: first.cost.total + second.cost.total,
		},
	};
	if (first.cacheWrite1h !== undefined || second.cacheWrite1h !== undefined) {
		combined.cacheWrite1h = (first.cacheWrite1h ?? 0) + (second.cacheWrite1h ?? 0);
	}
	if (first.reasoning !== undefined || second.reasoning !== undefined) {
		combined.reasoning = (first.reasoning ?? 0) + (second.reasoning ?? 0);
	}
	return combined;
}

export class CompactionSummaryValidationError extends Error {
	readonly issues: readonly SummaryValidationIssue[];

	constructor(issues: readonly SummaryValidationIssue[]) {
		super(`Two generated checkpoints failed structural validation: ${issues.map((issue) => `[${issue.code}] ${issue.message}`).join("; ")}`);
		this.name = "CompactionSummaryValidationError";
		this.issues = issues;
	}
}

export type CompactFunction = typeof compact;
export type CompactArguments = Parameters<CompactFunction>;

function withInstructions(args: CompactArguments, instructions: string): CompactArguments {
	return [args[0], args[1], args[2], args[3], instructions, args[5], args[6], args[7], args[8], args[9], args[10]];
}

/** Run Pi compaction, allowing one repair only for a returned structurally invalid checkpoint. */
export async function runValidatedCompaction(
	args: CompactArguments,
	compactFn: CompactFunction = compact,
): Promise<CompactionResult> {
	const input = args[0];
	const callerFocus = args[4];
	const facts = { messagesToSummarize: input.messagesToSummarize.length, isSplitTurn: input.isSplitTurn };
	const first = await compactFn(...withInstructions(args, composeCompactionInstructions(callerFocus)));
	const firstValidation = validateCompactionSummary(first.summary, facts);
	if (firstValidation.valid) return first;

	const second = await compactFn(...withInstructions(args, composeCompactionInstructions(callerFocus, firstValidation.issues)));
	const secondValidation = validateCompactionSummary(second.summary, facts);
	if (!secondValidation.valid) throw new CompactionSummaryValidationError(secondValidation.issues);

	if (!first.usage || !second.usage) return second;
	return { ...second, usage: combineCompactionUsage(first.usage, second.usage) };
}

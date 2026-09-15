import {
	estimateTokens,
	sessionEntryToContextMessages,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { BoundaryCandidate } from "./turns.js";

export const MAX_TARGETED_OPTIONS = 4;
export const SUMMARY_ALLOWANCE_TOKENS = 8_192;
export const MIN_DISTINCT_RETENTION_TOKENS = 2_048;
export const MIN_AGENT_CHECKPOINT_DIFFERENCE_TOKENS = 4_096;

export interface OfferedBoundary {
	optionId: string;
	firstKeptEntryId: string;
	kind: BoundaryCandidate["kind"];
	preview: string;
	retainedTokens: number;
	reclaimedTokens: number;
	projectedTokensAfter: number;
	splitTurn: boolean;
}

export interface TriggerEffectiveness {
	effective: boolean;
	retainedTokens: number;
	projectedTokensAfter: number;
	requiredHeadroom: number;
}

export interface BuildCompactionOfferOptions {
	entries: SessionEntry[];
	candidates: BoundaryCandidate[];
	totalTokens: number;
	contextWindow: number;
	maxOutputTokens: number;
	maxOptions?: number;
	summaryAllowanceTokens?: number;
}

export function entryTokens(entries: SessionEntry[]): number {
	return entries
		.flatMap(sessionEntryToContextMessages)
		.reduce((total, message) => total + estimateTokens(message), 0);
}

function candidateMetric(
	entries: SessionEntry[],
	candidate: BoundaryCandidate,
	totalTokens: number,
	summaryAllowance: number,
): Omit<OfferedBoundary, "optionId"> | undefined {
	const firstKeptIndex = entries.findIndex((entry) => entry.id === candidate.firstKeptEntryId);
	if (firstKeptIndex < 0) return undefined;
	const retainedTokens = entryTokens(entries.slice(firstKeptIndex));
	return {
		firstKeptEntryId: candidate.firstKeptEntryId,
		kind: candidate.kind,
		preview: candidate.preview,
		retainedTokens,
		reclaimedTokens: Math.max(0, totalTokens - retainedTokens),
		projectedTokensAfter: retainedTokens + summaryAllowance,
		splitTurn: candidate.isSplitTurn,
	};
}

function retentionDistance(candidate: Omit<OfferedBoundary, "optionId">, selected: Array<Omit<OfferedBoundary, "optionId">>): number {
	if (selected.length === 0) return Number.POSITIVE_INFINITY;
	return Math.min(...selected.map((item) => Math.abs(item.retainedTokens - candidate.retainedTokens)));
}

function distinctFrom(candidate: Omit<OfferedBoundary, "optionId">, selected: Array<Omit<OfferedBoundary, "optionId">>, minimum: number): boolean {
	return selected.every((item) => Math.abs(item.retainedTokens - candidate.retainedTokens) >= minimum);
}

function spreadUserOptions(
	users: Array<Omit<OfferedBoundary, "optionId">>,
	limit: number,
): Array<Omit<OfferedBoundary, "optionId">> {
	if (users.length === 0 || limit <= 0) return [];
	const sorted = [...users].sort((left, right) => right.retainedTokens - left.retainedTokens);
	const selected = [sorted[0]!];
	const newest = sorted[sorted.length - 1]!;
	if (selected.length < limit && distinctFrom(newest, selected, MIN_DISTINCT_RETENTION_TOKENS)) selected.push(newest);

	while (selected.length < limit) {
		const next = sorted
			.filter((candidate) => !selected.includes(candidate) && distinctFrom(candidate, selected, MIN_DISTINCT_RETENTION_TOKENS))
			.sort((left, right) => retentionDistance(right, selected) - retentionDistance(left, selected))[0];
		if (!next) break;
		selected.push(next);
	}
	return selected.sort((left, right) => right.retainedTokens - left.retainedTokens);
}

/** Build a small deterministic menu of structurally safe, capacity-effective boundaries. */
export function buildCompactionOfferOptions(options: BuildCompactionOfferOptions): OfferedBoundary[] {
	const {
		entries,
		candidates,
		totalTokens,
		contextWindow,
		maxOutputTokens,
		maxOptions = MAX_TARGETED_OPTIONS,
		summaryAllowanceTokens = SUMMARY_ALLOWANCE_TOKENS,
	} = options;
	const responseReserve = Math.max(16_384, maxOutputTokens);
	const maximumProjected = contextWindow - responseReserve;
	const measured = candidates
		.map((candidate) => candidateMetric(entries, candidate, totalTokens, summaryAllowanceTokens))
		.filter((candidate): candidate is Omit<OfferedBoundary, "optionId"> => Boolean(candidate))
		.filter((candidate) => candidate.projectedTokensAfter <= maximumProjected && candidate.reclaimedTokens > 0);

	const users = measured.filter((candidate) => candidate.kind === "user-exchange");
	const agents = measured.filter((candidate) => candidate.kind === "agent-checkpoint");
	const selected = spreadUserOptions(users, Math.max(0, maxOptions - 1));

	if (selected.length < maxOptions && agents.length > 0) {
		const lastUserId = [...entries].reverse().find((entry) => entry.type === "message" && entry.message.role === "user")?.id;
		const eligibleAgents = agents
			.filter((agent) => {
				const source = candidates.find((candidate) => candidate.firstKeptEntryId === agent.firstKeptEntryId);
				const inCurrentTurn = source?.selectedUserEntryId === lastUserId;
				return inCurrentTurn || distinctFrom(agent, selected, MIN_AGENT_CHECKPOINT_DIFFERENCE_TOKENS);
			})
			.sort((left, right) => left.retainedTokens - right.retainedTokens);
		if (eligibleAgents[0]) selected.push(eligibleAgents[0]);
	}

	return selected
		.slice(0, maxOptions)
		.sort((left, right) => right.retainedTokens - left.retainedTokens)
		.map((candidate, index) => ({ ...candidate, optionId: `B${index + 1}` }));
}

/** Recheck a chosen suffix against Pi's resolved trigger-time reserve and extra advisory margin. */
export function evaluateTriggerEffectiveness(options: {
	entries: SessionEntry[];
	candidate: BoundaryCandidate;
	contextWindow: number;
	reserveTokens: number;
	summaryAllowanceTokens?: number;
}): TriggerEffectiveness {
	const firstKeptIndex = options.entries.findIndex((entry) => entry.id === options.candidate.firstKeptEntryId);
	if (firstKeptIndex < 0) return { effective: false, retainedTokens: 0, projectedTokensAfter: 0, requiredHeadroom: 0 };
	const retainedTokens = entryTokens(options.entries.slice(firstKeptIndex));
	const projectedTokensAfter = retainedTokens + (options.summaryAllowanceTokens ?? SUMMARY_ALLOWANCE_TOKENS);
	const safetyMargin = Math.max(4_096, Math.ceil(options.contextWindow * 0.05));
	const requiredHeadroom = options.reserveTokens + safetyMargin;
	return {
		effective: projectedTokensAfter + requiredHeadroom <= options.contextWindow,
		retainedTokens,
		projectedTokensAfter,
		requiredHeadroom,
	};
}

export function formatCompactionAdvisory(offerId: string, options: readonly OfferedBoundary[]): string {
	const lines = [
		"Pi context is approaching automatic compaction.",
		`Compaction offer ${offerId}: choose where verbatim retained context should begin.`,
		"The selected message and everything after it stay verbatim; earlier context is summarized.",
		"",
	];
	for (const option of options) {
		lines.push(`${option.optionId} — ${option.kind}: ${option.preview}`);
		lines.push(`    projected after ~${option.projectedTokensAfter.toLocaleString()} tokens; reclaim ~${option.reclaimedTokens.toLocaleString()} tokens`);
	}
	lines.push("native — let Pi compute its normal token-based cutoff at compaction time");
	lines.push("Call choose_compaction_boundary with this offerId and one optionId. If you do not respond, Pi remains native.");
	return lines.join("\n");
}

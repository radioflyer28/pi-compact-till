import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { compactionEpochId } from "./advisory-policy.js";
import type { OfferedBoundary } from "./compaction-offers.js";

export const ADVISORY_OFFER_ENTRY_TYPE = "compact-until-advisory-offer";
export const ADVISORY_DECISION_DETAIL_KEY = "compactionAdvisoryDecision";
export const ADVISORY_SCHEMA_VERSION = 1;

export interface CompactionOfferEntry {
	schemaVersion: 1;
	offerId: string;
	sessionId: string;
	epochId: string;
	thresholdPercent: number;
	options: OfferedBoundary[];
}

export interface CompactionAdvisoryDecision {
	schemaVersion: 1;
	offerId: string;
	sessionId: string;
	epochId: string;
	decision: "targeted" | "native";
	firstKeptEntryId?: string;
	kind?: OfferedBoundary["kind"];
	summaryFocus?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOfferedBoundary(value: unknown): value is OfferedBoundary {
	if (!isRecord(value)) return false;
	return typeof value.optionId === "string"
		&& typeof value.firstKeptEntryId === "string"
		&& (value.kind === "user-exchange" || value.kind === "agent-checkpoint")
		&& typeof value.preview === "string"
		&& typeof value.retainedTokens === "number"
		&& typeof value.reclaimedTokens === "number"
		&& typeof value.projectedTokensAfter === "number"
		&& typeof value.splitTurn === "boolean";
}

export function parseOffer(value: unknown): CompactionOfferEntry | undefined {
	if (!isRecord(value) || value.schemaVersion !== ADVISORY_SCHEMA_VERSION) return undefined;
	if (typeof value.offerId !== "string" || typeof value.sessionId !== "string" || typeof value.epochId !== "string") return undefined;
	if (typeof value.thresholdPercent !== "number" || !Array.isArray(value.options) || !value.options.every(isOfferedBoundary)) return undefined;
	return value as unknown as CompactionOfferEntry;
}

export function parseDecision(value: unknown): CompactionAdvisoryDecision | undefined {
	if (!isRecord(value) || value.schemaVersion !== ADVISORY_SCHEMA_VERSION) return undefined;
	if (typeof value.offerId !== "string" || typeof value.sessionId !== "string" || typeof value.epochId !== "string") return undefined;
	if (value.decision !== "targeted" && value.decision !== "native") return undefined;
	if (value.decision === "targeted") {
		if (typeof value.firstKeptEntryId !== "string") return undefined;
		if (value.kind !== "user-exchange" && value.kind !== "agent-checkpoint") return undefined;
	}
	if (value.summaryFocus !== undefined && typeof value.summaryFocus !== "string") return undefined;
	return value as unknown as CompactionAdvisoryDecision;
}

export function activeOffer(entries: readonly SessionEntry[], sessionId: string): CompactionOfferEntry | undefined {
	const epochId = compactionEpochId(entries, sessionId);
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== ADVISORY_OFFER_ENTRY_TYPE) continue;
		const offer = parseOffer(entry.data);
		if (offer?.sessionId === sessionId && offer.epochId === epochId) return offer;
	}
	return undefined;
}

export function activeDecision(
	entries: readonly SessionEntry[],
	sessionId: string,
	offer: CompactionOfferEntry | undefined = activeOffer(entries, sessionId),
): CompactionAdvisoryDecision | undefined {
	if (!offer) return undefined;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "message" || entry.message.role !== "toolResult") continue;
		const details = entry.message.details;
		if (!isRecord(details)) continue;
		const decision = parseDecision(details[ADVISORY_DECISION_DETAIL_KEY]);
		if (decision?.sessionId === sessionId && decision.epochId === offer.epochId && decision.offerId === offer.offerId) return decision;
	}
	return undefined;
}

export function createOfferRecord(options: {
	offerId: string;
	sessionId: string;
	epochId: string;
	thresholdPercent: number;
	boundaries: OfferedBoundary[];
}): CompactionOfferEntry {
	return {
		schemaVersion: ADVISORY_SCHEMA_VERSION,
		offerId: options.offerId,
		sessionId: options.sessionId,
		epochId: options.epochId,
		thresholdPercent: options.thresholdPercent,
		options: options.boundaries,
	};
}

export function createDecisionRecord(options: {
	offer: CompactionOfferEntry;
	optionId: string;
	summaryFocus?: string;
}): CompactionAdvisoryDecision | undefined {
	const focus = options.summaryFocus?.trim() || undefined;
	if (options.optionId === "native") {
		return {
			schemaVersion: ADVISORY_SCHEMA_VERSION,
			offerId: options.offer.offerId,
			sessionId: options.offer.sessionId,
			epochId: options.offer.epochId,
			decision: "native",
			summaryFocus: focus,
		};
	}
	const boundary = options.offer.options.find((candidate) => candidate.optionId === options.optionId);
	if (!boundary) return undefined;
	return {
		schemaVersion: ADVISORY_SCHEMA_VERSION,
		offerId: options.offer.offerId,
		sessionId: options.offer.sessionId,
		epochId: options.offer.epochId,
		decision: "targeted",
		firstKeptEntryId: boundary.firstKeptEntryId,
		kind: boundary.kind,
		summaryFocus: focus,
	};
}

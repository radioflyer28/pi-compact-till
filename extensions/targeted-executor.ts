import type {
	compact,
	CompactionResult,
	ExtensionContext,
	SessionBeforeCompactEvent,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	CompactionSummaryValidationError,
	runValidatedCompaction,
	type SummaryValidationIssue,
} from "./summary-policy.js";
import { buildTargetedCompactionInput } from "./targeted-compaction.js";
import type { BoundaryCandidate } from "./turns.js";

export interface AdvisoryCompactionProvenance {
	offerId: string;
	trigger: "threshold";
}

export interface TargetedCompactionProvenance {
	agentDirected: boolean;
	advisory?: AdvisoryCompactionProvenance;
}

export type TargetedExecutionFailureCode =
	| "missing-model"
	| "authentication"
	| "cancelled"
	| "invalid-summary"
	| "compaction-failed";

export type TargetedExecutionResult =
	| { ok: true; compaction: CompactionResult }
	| {
		ok: false;
		code: TargetedExecutionFailureCode;
		message: string;
		issues?: readonly SummaryValidationIssue[];
		error?: unknown;
	};

function nonNullHeaders(headers: Record<string, string | null> | undefined): Record<string, string> | undefined {
	if (!headers) return undefined;
	return Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== null));
}

function objectDetails(details: unknown): Record<string, unknown> {
	return typeof details === "object" && details !== null && !Array.isArray(details)
		? details as Record<string, unknown>
		: {};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function compactUntilDetails(
	candidate: BoundaryCandidate,
	provenance: TargetedCompactionProvenance,
): Record<string, unknown> {
	return {
		kind: candidate.kind,
		selectedUserEntryId: candidate.selectedUserEntryId,
		firstKeptEntryId: candidate.firstKeptEntryId,
		agentDirected: provenance.agentDirected,
		...(provenance.advisory ? {
			advisory: {
				offerId: provenance.advisory.offerId,
				trigger: provenance.advisory.trigger,
			},
		} : {}),
	};
}

/** Execute one already-resolved targeted boundary without choosing caller failure policy. */
export async function executeTargetedCompaction(options: {
	contextEntries: SessionEntry[];
	candidate: BoundaryCandidate;
	event: SessionBeforeCompactEvent;
	ctx: ExtensionContext;
	provenance: TargetedCompactionProvenance;
	summaryFocus?: string;
}): Promise<TargetedExecutionResult> {
	const { contextEntries, candidate, event, ctx, provenance, summaryFocus } = options;
	if (!ctx.model) {
		return { ok: false, code: "missing-model", message: "Targeted compaction requires an active Pi model." };
	}

	try {
		if (event.signal.aborted) {
			return { ok: false, code: "cancelled", message: "Targeted compaction was cancelled." };
		}
		type SummarizationStreamFn = NonNullable<Parameters<typeof compact>[7]>;
		const registry = ctx.modelRegistry as typeof ctx.modelRegistry & { streamSimple?: SummarizationStreamFn };
		// Session-owned streams resolve request-time auth (and virtual models) themselves.
		// Echoing stored OAuth as an explicit apiKey changes the provider's auth path.
		const streamFn = typeof registry.streamSimple === "function" ? registry.streamSimple.bind(registry) : undefined;
		let model = ctx.model;
		let auth: { apiKey?: string; headers?: Record<string, string>; env?: Record<string, string> } = {};
		if (!streamFn) {
			// Older hosts use the global compactor, which needs explicit request auth.
			let resolved;
			try {
				resolved = await registry.getApiKeyAndHeaders(model);
			} catch (error) {
				if (event.signal.aborted) throw error;
				return { ok: false, code: "authentication", message: "Targeted compaction could not resolve model credentials.", error };
			}
			if (event.signal.aborted) {
				return { ok: false, code: "cancelled", message: "Targeted compaction was cancelled." };
			}
			if (!resolved.ok) {
				return { ok: false, code: "authentication", message: `Targeted compaction could not resolve model credentials: ${resolved.error}` };
			}
			if (resolved.baseUrl) model = { ...model, baseUrl: resolved.baseUrl };
			auth = { apiKey: resolved.apiKey, headers: nonNullHeaders(resolved.headers), env: resolved.env };
		}
		const input = buildTargetedCompactionInput(contextEntries, candidate, event.preparation);
		const result = await runValidatedCompaction([
			input,
			model,
			auth.apiKey,
			auth.headers,
			summaryFocus,
			event.signal,
			ctx.thinkingLevel,
			streamFn,
			auth.env,
		]);
		return {
			ok: true,
			compaction: {
				...result,
				details: {
					...objectDetails(result.details),
					compactUntil: compactUntilDetails(candidate, provenance),
				},
			},
		};
	} catch (error) {
		if (error instanceof CompactionSummaryValidationError) {
			return {
				ok: false,
				code: "invalid-summary",
				message: `Targeted compaction produced two invalid summaries: ${error.issues.map((issue) => `[${issue.code}] ${issue.message}`).join("; ")}`,
				issues: error.issues,
				error,
			};
		}
		if (event.signal.aborted) {
			return { ok: false, code: "cancelled", message: "Targeted compaction was cancelled.", error };
		}
		return { ok: false, code: "compaction-failed", message: `Targeted compaction failed: ${errorMessage(error)}`, error };
	}
}

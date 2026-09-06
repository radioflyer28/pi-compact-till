import {
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
	CompactionSummaryValidationError,
	runValidatedCompaction,
} from "./summary-policy.js";
import { buildTargetedCompactionInput } from "./targeted-compaction.js";
import {
	findCandidateByFirstKeptEntryId,
	getSafeBoundaryCandidates,
	type BoundaryCandidate,
} from "./turns.js";

interface PendingBoundary {
	sessionId: string;
	firstKeptEntryId: string;
	source: "user" | "agent";
	state: "scheduled" | "triggering";
	summaryFocus?: string;
}

export type PickerView = "user-exchanges" | "all-boundaries";

type TerminalPickerResult =
	| { kind: "candidate"; candidate: BoundaryCandidate }
	| { kind: "toggle" };

const SHOW_AGENT_ACTIVITY = "Show agent activity";
const HIDE_AGENT_ACTIVITY = "Show only user exchanges";
const PICKER_DETAIL_WIDGET = "compact-until-boundary-detail";
// Pi tool schemas are JSON Schema-compatible TypeBox values. Keeping these
// literal avoids adding a runtime dependency beyond Pi itself.
const EMPTY_OBJECT_PARAMETERS = { type: "object", properties: {}, additionalProperties: false };
const SCHEDULE_COMPACTION_PARAMETERS = {
	type: "object",
	properties: {
		firstKeptEntryId: { type: "string", description: "A firstKeptEntryId returned by list_compaction_boundaries." },
		summaryFocus: { type: "string", description: "Optional details the compaction summary must preserve." },
	},
	required: ["firstKeptEntryId"],
	additionalProperties: false,
};

export function togglePickerView(view: PickerView): PickerView {
	return view === "user-exchanges" ? "all-boundaries" : "user-exchanges";
}

export function isAgentActivityToggle(data: string): boolean {
	return data === "a";
}

export function isPickerDetailToggle(data: string): boolean {
	return data === "i";
}

export function pickerNavigation(data: string): "up" | "down" | undefined {
	if (data === "\u001b[A" || data === "k") return "up";
	if (data === "\u001b[B" || data === "j") return "down";
	return undefined;
}

export function pickerCandidates(candidates: BoundaryCandidate[], view: PickerView): BoundaryCandidate[] {
	return view === "all-boundaries"
		? candidates
		: candidates.filter((candidate) => candidate.kind === "user-exchange");
}

function pickerTitle(view: PickerView): string {
	return view === "all-boundaries"
		? "Keep context starting from which message? (a: hide agent activity, i: show detail)"
		: "Keep context starting from which user message? (a: show agent activity, i: show detail)";
}

class ScrollableBoundaryPicker {
	private activeIndex: number;

	constructor(
		private readonly title: string,
		private readonly candidates: BoundaryCandidate[],
		private readonly theme: any,
		private readonly done: (result: TerminalPickerResult | undefined) => void,
		private readonly showDetail: (candidate: BoundaryCandidate | undefined) => void,
	) {
		this.activeIndex = candidates.length - 1;
	}

	render(width: number): string[] {
		const maxVisible = 5;
		const startIndex = Math.max(0, Math.min(this.activeIndex - maxVisible + 1, this.candidates.length - maxVisible));
		const endIndex = Math.min(startIndex + maxVisible, this.candidates.length);
		const lines = [this.theme.fg("accent", this.title), ""];

		for (let index = startIndex; index < endIndex; index += 1) {
			const candidate = this.candidates[index]!;
			const prefix = index === this.activeIndex ? "→ " : "  ";
			const label = `${prefix}${candidate.label}`;
			lines.push(index === this.activeIndex ? this.theme.fg("accent", label) : label.slice(0, width));
		}
		if (startIndex > 0 || endIndex < this.candidates.length) {
			lines.push(this.theme.fg("dim", `  (${this.activeIndex + 1}/${this.candidates.length})`));
		}
		lines.push("", this.theme.fg("dim", "↑↓ navigate • Enter select • Esc cancel"));
		return lines;
	}

	handleInput(data: string): void {
		if (isAgentActivityToggle(data)) {
			this.showDetail(undefined);
			this.done({ kind: "toggle" });
			return;
		}
		if (isPickerDetailToggle(data)) {
			this.showDetail(this.candidates[this.activeIndex]);
			return;
		}
		const direction = pickerNavigation(data);
		if (direction) {
			this.activeIndex = direction === "up"
				? Math.max(0, this.activeIndex - 1)
				: Math.min(this.candidates.length - 1, this.activeIndex + 1);
			this.showDetail(undefined);
			return;
		}
		if (data === "\r" || data === "\n") {
			this.showDetail(undefined);
			this.done({ kind: "candidate", candidate: this.candidates[this.activeIndex]! });
			return;
		}
		if (data === "\u001b") {
			this.showDetail(undefined);
			this.done(undefined);
		}
	}
}

async function selectBoundary(ctx: any, candidates: BoundaryCandidate[]): Promise<BoundaryCandidate | undefined> {
	let view: PickerView = "user-exchanges";
	if (ctx.mode !== "tui") {
		while (true) {
			const visibleCandidates = pickerCandidates(candidates, view);
			const switchAction = view === "user-exchanges" ? SHOW_AGENT_ACTIVITY : HIDE_AGENT_ACTIVITY;
			const selection = await ctx.ui.select(pickerTitle(view), [switchAction, ...visibleCandidates.map((candidate) => candidate.label)]);
			if (!selection) return undefined;
			if (selection === switchAction) {
				view = togglePickerView(view);
				continue;
			}
			return visibleCandidates.find((candidate) => candidate.label === selection);
		}
	}

	while (true) {
		const candidatesInView = pickerCandidates(candidates, view);
		const result = await ctx.ui.custom(
			(_tui: unknown, theme: unknown, _keybindings: unknown, done: (result: TerminalPickerResult | undefined) => void) => new ScrollableBoundaryPicker(
				pickerTitle(view),
				candidatesInView,
				theme,
				(result) => {
					ctx.ui.setWidget(PICKER_DETAIL_WIDGET, undefined);
					done(result);
				},
				(candidate) => ctx.ui.setWidget(
					PICKER_DETAIL_WIDGET,
					candidate ? [candidate.detail.title, candidate.detail.content] : undefined,
				),
			),
		);
		if (!result) return undefined;
		if (result.kind === "toggle") {
			view = togglePickerView(view);
			continue;
		}
		return result.candidate;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function nonNullHeaders(headers: Record<string, string | null> | undefined): Record<string, string> | undefined {
	if (!headers) return undefined;
	return Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== null));
}

function objectDetails(details: unknown): Record<string, unknown> {
	return typeof details === "object" && details !== null && !Array.isArray(details)
		? details as Record<string, unknown>
		: {};
}

export function compactUntilDetails(candidate: BoundaryCandidate, agentDirected: boolean): Record<string, unknown> {
	return {
		kind: candidate.kind,
		selectedUserEntryId: candidate.selectedUserEntryId,
		firstKeptEntryId: candidate.firstKeptEntryId,
		agentDirected,
	};
}

function toolResult(text: string, details: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text }],
		details,
	};
}

function cancelPending(ctx: any, message: string): void {
	ctx.ui.notify(message, "warning");
}

export default function (pi: ExtensionAPI) {
	let pending: PendingBoundary | undefined;

	pi.registerTool({
		name: "list_compaction_boundaries",
		label: "List compaction boundaries",
		description: "List safe context boundaries that can be retained for a later targeted compaction. Use this before schedule_compaction, at a deliberate milestone such as after tests pass or a change is archived.",
		promptSnippet: "List safe boundaries before scheduling an intentional context compaction",
		promptGuidelines: ["Use this before schedule_compaction; choose a boundary only after a deliberate work transition."],
		parameters: EMPTY_OBJECT_PARAMETERS as any,
		executionMode: "sequential",
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const candidates = getSafeBoundaryCandidates(ctx.sessionManager.buildContextEntries());
			const boundaries = candidates.map((candidate) => ({
				firstKeptEntryId: candidate.firstKeptEntryId,
				kind: candidate.kind,
				preview: candidate.preview,
			}));
			if (boundaries.length === 0) {
				return toolResult("No safe compaction boundary is currently available. Do not schedule compaction.", { boundaries });
			}
			return toolResult(JSON.stringify({ boundaries }), { boundaries });
		},
	});

	pi.registerTool({
		name: "schedule_compaction",
		label: "Schedule compaction",
		description: "Schedule one safe targeted compaction after this agent run settles. Call list_compaction_boundaries first and pass one returned firstKeptEntryId. Use only after a deliberate milestone; this does not interrupt the current run.",
		promptSnippet: "Schedule a safe compaction after this run settles",
		promptGuidelines: ["Call list_compaction_boundaries first. Schedule compaction only at deliberate milestones, such as after tests pass or a change is archived."],
		parameters: SCHEDULE_COMPACTION_PARAMETERS as any,
		executionMode: "sequential",
		async execute(_toolCallId, params: { firstKeptEntryId: string; summaryFocus?: string }, _signal, _onUpdate, ctx) {
			if (pending) {
				return toolResult("A compaction request is already scheduled or executing. Keep that request unchanged.", { scheduled: false, reason: "already-pending" });
			}
			const candidate = findCandidateByFirstKeptEntryId(
				ctx.sessionManager.buildContextEntries(),
				params.firstKeptEntryId,
			);
			if (!candidate) {
				return toolResult("The requested compaction boundary is unavailable or stale. List boundaries again before scheduling.", { scheduled: false, reason: "invalid-boundary" });
			}

			pending = {
				sessionId: ctx.sessionManager.getSessionId(),
				firstKeptEntryId: candidate.firstKeptEntryId,
				source: "agent",
				state: "scheduled",
				summaryFocus: params.summaryFocus?.trim() || undefined,
			};
			ctx.ui.notify("Agent-directed compaction scheduled for after this run settles.", "info");
			return toolResult("Compaction scheduled. Continue or finish this run normally; compaction will start only after the run settles.", {
				scheduled: true,
				firstKeptEntryId: candidate.firstKeptEntryId,
				kind: candidate.kind,
			});
		},
	});

	pi.registerCommand("compact-until", {
		description: "Compact context before a selected first-retained message",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const candidates = getSafeBoundaryCandidates(ctx.sessionManager.buildContextEntries());
			if (candidates.length === 0) {
				ctx.ui.notify("No safe compaction boundary is available in the active context.", "warning");
				return;
			}

			const candidate = await selectBoundary(ctx, candidates);
			if (!candidate) {
				return;
			}

			const confirmed = await ctx.ui.confirm(
				"Confirm targeted compaction",
				`First retained message:\n${candidate.label}\n\nThis message and everything after it remain verbatim. ${candidate.kind === "user-exchange" ? "The preceding completed user exchange will be summarized." : "Earlier active context will be summarized."}`,
			);
			if (!confirmed) return;

			pending = {
				sessionId: ctx.sessionManager.getSessionId(),
				firstKeptEntryId: candidate.firstKeptEntryId,
				source: "user",
				state: "triggering",
				summaryFocus: args.trim() || undefined,
			};
			ctx.compact({
				customInstructions: pending.summaryFocus,
				onComplete: () => ctx.ui.notify("Targeted compaction complete.", "info"),
				onError: (error) => {
					pending = undefined;
					ctx.ui.notify(`Targeted compaction failed: ${error.message}`, "error");
				},
			});
		},
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const activePending = pending;
		if (
			!activePending ||
			activePending.state !== "triggering" ||
			event.reason !== "manual" ||
			activePending.sessionId !== ctx.sessionManager.getSessionId()
		) {
			return;
		}
		pending = undefined;

		const contextEntries = ctx.sessionManager.buildContextEntries();
		const candidate = findCandidateByFirstKeptEntryId(contextEntries, activePending.firstKeptEntryId);
		if (!candidate) {
			ctx.ui.notify("Targeted compaction was cancelled because the selected boundary is stale.", "error");
			return { cancel: true };
		}
		if (!ctx.model) {
			ctx.ui.notify("Targeted compaction requires an active Pi model.", "error");
			return { cancel: true };
		}

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
		if (!auth.ok) {
			ctx.ui.notify(`Targeted compaction could not resolve model credentials: ${auth.error}`, "error");
			return { cancel: true };
		}

		try {
			const input = buildTargetedCompactionInput(contextEntries, candidate, event.preparation);
			const result = await runValidatedCompaction([
				input,
				ctx.model,
				auth.apiKey,
				nonNullHeaders(auth.headers),
				event.customInstructions,
				event.signal,
				ctx.thinkingLevel,
				undefined,
				auth.env,
			]);
			return {
				compaction: {
					...result,
						details: {
							...objectDetails(result.details),
							compactUntil: compactUntilDetails(candidate, activePending.source === "agent"),
					},
				},
			};
		} catch (error) {
			if (error instanceof CompactionSummaryValidationError) {
				ctx.ui.notify(`Targeted compaction cancelled after two invalid summaries: ${error.issues.map((issue) => `[${issue.code}] ${issue.message}`).join("; ")}`, "error");
				return { cancel: true };
			}
			ctx.ui.notify(`Targeted compaction failed: ${errorMessage(error)}`, "error");
			return { cancel: true };
		}
	});

	pi.on("agent_settled", (_event, ctx) => {
		const activePending = pending;
		if (!activePending || activePending.source !== "agent" || activePending.state !== "scheduled") return;
		if (activePending.sessionId !== ctx.sessionManager.getSessionId()) {
			pending = undefined;
			cancelPending(ctx, "Agent-directed compaction was cancelled because the active session changed.");
			return;
		}
		if (ctx.hasPendingMessages()) {
			pending = undefined;
			cancelPending(ctx, "Agent-directed compaction was cancelled because user input is pending.");
			return;
		}
		const candidate = findCandidateByFirstKeptEntryId(
			ctx.sessionManager.buildContextEntries(),
			activePending.firstKeptEntryId,
		);
		if (!candidate) {
			pending = undefined;
			cancelPending(ctx, "Agent-directed compaction was cancelled because the selected boundary is stale.");
			return;
		}

		pending = { ...activePending, state: "triggering" };
		ctx.compact({
			customInstructions: activePending.summaryFocus,
			onComplete: () => ctx.ui.notify("Agent-directed compaction complete.", "info"),
			onError: (error) => {
				pending = undefined;
				ctx.ui.notify(`Agent-directed compaction failed: ${error.message}`, "error");
			},
		});
	});

	pi.on("session_shutdown", () => {
		pending = undefined;
	});
}

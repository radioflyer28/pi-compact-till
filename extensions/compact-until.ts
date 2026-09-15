import {
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
	compactUntilDetails as buildCompactUntilDetails,
	executeTargetedCompaction,
} from "./targeted-executor.js";
import {
	compactionEpochId,
	hasReachedAdvisoryThreshold,
	parseAdvisoryThreshold,
} from "./advisory-policy.js";
import {
	buildCompactionOfferOptions,
	evaluateTriggerEffectiveness,
	formatCompactionAdvisory,
} from "./compaction-offers.js";
import {
	ADVISORY_DECISION_DETAIL_KEY,
	ADVISORY_OFFER_ENTRY_TYPE,
	activeDecision,
	activeOffer,
	createDecisionRecord,
	createOfferRecord,
} from "./advisory-state.js";
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
const CHOOSE_ADVISORY_PARAMETERS = {
	type: "object",
	properties: {
		offerId: { type: "string", description: "The active compaction advisory offer ID." },
		optionId: { type: "string", description: "One opaque option ID from the offer, or native." },
		summaryFocus: { type: "string", description: "Optional details the compaction summary should preserve." },
	},
	required: ["offerId", "optionId"],
	additionalProperties: false,
};
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
			lines.push(index === this.activeIndex ? this.theme.fg("accent", label) : label);
		}
		if (startIndex > 0 || endIndex < this.candidates.length) {
			lines.push(this.theme.fg("dim", `  (${this.activeIndex + 1}/${this.candidates.length})`));
		}
		lines.push("", this.theme.fg("dim", "↑↓ navigate • Enter select • Esc cancel"));
		return lines.map((line) => truncateToWidth(line, width));
	}

	invalidate(): void {}

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

export function compactUntilDetails(candidate: BoundaryCandidate, agentDirected: boolean): Record<string, unknown> {
	return buildCompactUntilDetails(candidate, { agentDirected });
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
	let invalidThresholdWarningShown = false;

	pi.registerFlag("compact-until-advisory-threshold", {
		description: "Context usage percentage at which to offer targeted threshold-compaction choices (default: 70)",
		type: "string",
	});

	pi.registerTool({
		name: "choose_compaction_boundary",
		label: "Choose compaction boundary",
		description: "Record a preference from the active compaction advisory for Pi's next automatic threshold compaction. This does not start or schedule compaction.",
		promptSnippet: "Choose an offered threshold-compaction boundary",
		promptGuidelines: ["Use only in response to an active compaction advisory, with its exact offerId and optionId."],
		parameters: CHOOSE_ADVISORY_PARAMETERS as any,
		executionMode: "sequential",
		async execute(_toolCallId, params: { offerId: string; optionId: string; summaryFocus?: string }, _signal, _onUpdate, ctx) {
			const sessionId = ctx.sessionManager.getSessionId();
			const branch = ctx.sessionManager.getBranch();
			const offer = activeOffer(branch, sessionId);
			if (!offer || offer.offerId !== params.offerId) {
				return toolResult("The compaction advisory offer is unavailable, expired, or from another branch. Do not record this preference.", { recorded: false, reason: "invalid-offer" });
			}
			const decision = createDecisionRecord({ offer, optionId: params.optionId, summaryFocus: params.summaryFocus });
			if (!decision) {
				return toolResult("The requested option is not part of the active compaction advisory. Use an exact offered optionId or native.", { recorded: false, reason: "invalid-option" });
			}
			if (decision.decision === "targeted") {
				const candidate = findCandidateByFirstKeptEntryId(ctx.sessionManager.buildContextEntries(), decision.firstKeptEntryId!);
				if (!candidate || candidate.kind !== decision.kind) {
					return toolResult("The requested advisory boundary is stale. Leave Pi's threshold compaction behavior unchanged.", { recorded: false, reason: "stale-boundary" });
				}
			}
			return toolResult(
				decision.decision === "native"
					? "Native threshold compaction selected for this offer. No compaction was started or scheduled."
					: "Targeted threshold boundary recorded for this offer. No compaction was started or scheduled.",
				{ recorded: true, [ADVISORY_DECISION_DETAIL_KEY]: decision },
			);
		},
	});

	pi.on("context", (event, ctx) => {
		const configuredThreshold = parseAdvisoryThreshold(pi.getFlag("compact-until-advisory-threshold"));
		if (configuredThreshold.usedDefault && !invalidThresholdWarningShown) {
			invalidThresholdWarningShown = true;
			ctx.ui.notify("Invalid --compact-until-advisory-threshold value; using 70 percent.", "warning");
		}
		const usage = ctx.getContextUsage();
		if (!hasReachedAdvisoryThreshold(usage, configuredThreshold.percent) || usage?.tokens == null || !ctx.model) return;

		const sessionId = ctx.sessionManager.getSessionId();
		const branch = ctx.sessionManager.getBranch();
		if (activeOffer(branch, sessionId)) return;
		const contextEntries = ctx.sessionManager.buildContextEntries();
		const boundaries = buildCompactionOfferOptions({
			entries: contextEntries,
			candidates: getSafeBoundaryCandidates(contextEntries),
			totalTokens: usage.tokens,
			contextWindow: usage.contextWindow,
			maxOutputTokens: ctx.model.maxTokens,
		});
		if (boundaries.length === 0) return;

		const offerId = `offer-${Date.now().toString(36)}-${branch.length.toString(36)}`;
		const offer = createOfferRecord({
			offerId,
			sessionId,
			epochId: compactionEpochId(branch, sessionId),
			thresholdPercent: configuredThreshold.percent,
			boundaries,
		});
		pi.appendEntry(ADVISORY_OFFER_ENTRY_TYPE, offer);
		return {
			messages: [
				...event.messages,
				{
					role: "custom" as const,
					customType: "compact-until-advisory",
					content: formatCompactionAdvisory(offerId, boundaries),
					display: false,
					details: { offerId },
					timestamp: Date.now(),
				},
			],
		};
	});

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
		if (event.reason === "threshold") {
			const sessionId = ctx.sessionManager.getSessionId();
			const branch = ctx.sessionManager.getBranch();
			const offer = activeOffer(branch, sessionId);
			const decision = activeDecision(branch, sessionId, offer);
			if (!offer || decision?.decision !== "targeted") return;

			const contextEntries = ctx.sessionManager.buildContextEntries();
			const candidate = findCandidateByFirstKeptEntryId(contextEntries, decision.firstKeptEntryId!);
			if (!candidate || candidate.kind !== decision.kind) return;
			const contextWindow = ctx.getContextUsage()?.contextWindow ?? ctx.model?.contextWindow;
			if (!contextWindow) return;
			const effectiveness = evaluateTriggerEffectiveness({
				entries: contextEntries,
				candidate,
				contextWindow,
				reserveTokens: event.preparation.settings.reserveTokens,
			});
			if (!effectiveness.effective) return;

			const execution = await executeTargetedCompaction({
				contextEntries,
				candidate,
				event,
				ctx,
				provenance: {
					agentDirected: true,
					advisory: { offerId: offer.offerId, trigger: "threshold" },
				},
				summaryFocus: decision.summaryFocus,
			});
			if (execution.ok) return { compaction: execution.compaction };
			ctx.ui.notify(`${execution.message} Pi will use native threshold compaction instead.`, "warning");
			return;
		}

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
		const execution = await executeTargetedCompaction({
			contextEntries,
			candidate,
			event,
			ctx,
			provenance: { agentDirected: activePending.source === "agent" },
			summaryFocus: event.customInstructions,
		});
		if (execution.ok) return { compaction: execution.compaction };

		const message = execution.code === "invalid-summary"
			? execution.message.replace("produced", "cancelled after")
			: execution.message;
		ctx.ui.notify(message, "error");
		return { cancel: true };
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

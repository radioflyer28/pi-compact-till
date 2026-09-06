import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import compactUntil, {
	compactUntilDetails,
	isAgentActivityToggle,
	isPickerDetailToggle,
	pickerCandidates,
	pickerNavigation,
	togglePickerView,
} from "../extensions/compact-until.js";
import { getSafeBoundaryCandidates } from "../extensions/turns.js";

const { piCompact } = vi.hoisted(() => ({ piCompact: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...await importOriginal<typeof import("@earendil-works/pi-coding-agent")>(),
	compact: piCompact,
}));

const stamp = "2026-08-21T00:00:00.000Z";
const validHistorySummary = `## Goal
Continue targeted compaction.

## Constraints & Preferences
- Preserve the selected boundary.

## Progress
### Done
- [x] Generated the checkpoint.

### In Progress
- [ ] Continue from retained context.

### Blocked
- (none)

## Key Decisions
- **Reuse Pi**: Preserve native behavior.

## Next Steps
1. Continue the task.

## Critical Context
- Keep exact identifiers.`;

beforeEach(() => {
	piCompact.mockReset();
});

function entry(id: string, role: "user" | "assistant", text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: stamp,
		message: { role, content: [{ type: "text", text }], timestamp: Date.now() },
	} as unknown as SessionEntry;
}

function toolResult(id: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: stamp,
		message: { role: "toolResult", content: [{ type: "text", text: "tool output" }], timestamp: Date.now() },
	} as unknown as SessionEntry;
}

function assistantWithTool(id: string, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: stamp,
		message: {
			role: "assistant",
			content: [{ type: "text", text }, { type: "toolCall", name: "read" }],
			timestamp: Date.now(),
		},
	} as unknown as SessionEntry;
}

function completedTurns(count: number): SessionEntry[] {
	const entries: SessionEntry[] = [];
	for (let turn = 1; turn <= count; turn += 1) {
		entries.push(entry(`u${turn}`, "user", `user ${turn}`), entry(`a${turn}`, "assistant", `assistant ${turn}`));
	}
	return entries;
}

function registerExtension() {
	let command: { handler: (args: string, ctx: any) => Promise<void> } | undefined;
	let beforeCompact: ((event: any, ctx: any) => Promise<unknown>) | undefined;
	let agentSettled: ((event: any, ctx: any) => unknown) | undefined;
	const tools = new Map<string, any>();
	const pi = {
		registerCommand: (_name: string, definition: typeof command) => { command = definition; },
		registerTool: (definition: any) => { tools.set(definition.name, definition); },
		on: (event: string, handler: unknown) => {
			if (event === "session_before_compact") beforeCompact = handler as typeof beforeCompact;
			if (event === "agent_settled") agentSettled = handler as typeof agentSettled;
		},
	} as unknown as ExtensionAPI;
	compactUntil(pi);
	return { command: () => command!, beforeCompact: () => beforeCompact!, agentSettled: () => agentSettled!, tools: () => tools };
}

function piCompactionResult(summary = validHistorySummary) {
	return {
		summary,
		firstKeptEntryId: "u2",
		tokensBefore: 100,
		details: { readFiles: ["read.ts"] },
		usage: {
			input: 1,
			output: 2,
			cacheRead: 3,
			cacheWrite: 4,
			totalTokens: 10,
			cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
		},
	};
}

function executionContext(entries: SessionEntry[]) {
	return {
		model: { id: "test-model" },
		thinkingLevel: "high",
		sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
		modelRegistry: { getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "key", headers: { valid: "header", omitted: null }, env: { HOST: "local" } }) },
		ui: { notify: vi.fn() },
	};
}

function beforeCompactEvent(customInstructions?: string) {
	return {
		reason: "manual",
		customInstructions,
		signal: new AbortController().signal,
		preparation: {
			firstKeptEntryId: "default",
			messagesToSummarize: [],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 100,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 1_000, keepRecentTokens: 2_000 },
		},
	};
}

describe("compact-until command", () => {
	it("does not start compaction when selection is dismissed", async () => {
		const { command } = registerExtension();
		const compact = vi.fn();
		const ctx = {
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later"), entry("a2", "assistant", "done")], getSessionId: () => "session" },
			ui: { select: vi.fn().mockResolvedValue(undefined), notify: vi.fn(), confirm: vi.fn() },
			compact,
		};

		await command().handler("focus on decisions", ctx);

		expect(ctx.waitForIdle).toHaveBeenCalledOnce();
		expect(compact).not.toHaveBeenCalled();
	});

	it("passes optional focus only after confirmation", async () => {
		const { command } = registerExtension();
		const compact = vi.fn();
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later"), entry("a2", "assistant", "done")];
		const ctx = {
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { select: vi.fn().mockResolvedValue("Keep user message: later [u2]"), confirm: vi.fn().mockResolvedValue(true), notify: vi.fn() },
			compact,
		};

		await command().handler("preserve decisions", ctx);

		expect(compact).toHaveBeenCalledWith(expect.objectContaining({ customInstructions: "preserve decisions" }));
		expect(ctx.ui.confirm).toHaveBeenCalledWith(
			"Confirm targeted compaction",
			expect.stringContaining("First retained message"),
		);
		expect(ctx.ui.confirm).toHaveBeenCalledWith(
			"Confirm targeted compaction",
			expect.stringContaining("preceding completed user exchange will be summarized"),
		);
	});

	it("offers an explicit agent-activity view switch outside the terminal picker", async () => {
		const { command } = registerExtension();
		const compact = vi.fn();
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later"), entry("a2", "assistant", "done")];
		const select = vi.fn()
			.mockResolvedValueOnce("Show agent activity")
			.mockResolvedValueOnce("Keep agent checkpoint: done [a1]");
		const ctx = {
			mode: "rpc",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { select, notify: vi.fn(), confirm: vi.fn().mockResolvedValue(false) },
			compact,
		};

		await command().handler("", ctx);

		expect(select).toHaveBeenCalledTimes(2);
		expect(select.mock.calls[1]?.[1]).toContain("Keep agent checkpoint: done [a1]");
		expect(compact).not.toHaveBeenCalled();
	});

	it("leaves ordinary manual compaction untouched when no boundary is pending", async () => {
		const { beforeCompact } = registerExtension();
		const result = await beforeCompact()({ reason: "manual" }, { sessionManager: { getSessionId: () => "session" } });
		expect(result).toBeUndefined();
		expect(piCompact).not.toHaveBeenCalled();
	});

	it("cancels a stale selected boundary without falling back to ordinary compaction", async () => {
		const { command, beforeCompact } = registerExtension();
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later"), entry("a2", "assistant", "done")];
		const commandCtx = {
			mode: "rpc",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { select: vi.fn().mockResolvedValue("Keep user message: later [u2]"), confirm: vi.fn().mockResolvedValue(true), notify: vi.fn() },
			compact: vi.fn(),
		};
		await command().handler("", commandCtx);
		const executionCtx = {
			sessionManager: { buildContextEntries: () => [], getSessionId: () => "session" },
			ui: { notify: vi.fn() },
		};

		const result = await beforeCompact()({ reason: "manual" }, executionCtx);

		expect(result).toEqual({ cancel: true });
		expect(executionCtx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("stale"), "error");
	});
});

describe("validated targeted compaction integration", () => {
	it("applies the rubric and user focus while preserving boundary and provenance", async () => {
		const { command, beforeCompact } = registerExtension();
		const entries = completedTurns(2);
		const commandCtx = {
			mode: "rpc",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { select: vi.fn().mockResolvedValue("Keep user message: user 2 [u2]"), confirm: vi.fn().mockResolvedValue(true), notify: vi.fn() },
			compact: vi.fn(),
		};
		await command().handler("preserve user benchmark", commandCtx);
		piCompact.mockResolvedValue(piCompactionResult());
		const ctx = executionContext(entries);

		const hookResult = await beforeCompact()(beforeCompactEvent("preserve user benchmark"), ctx);

		expect(piCompact).toHaveBeenCalledOnce();
		expect(piCompact.mock.calls[0]?.[4]).toContain("Package coding-continuation requirements");
		expect(piCompact.mock.calls[0]?.[4]).toContain("preserve user benchmark");
		expect(piCompact.mock.calls[0]?.[3]).toEqual({ valid: "header" });
		expect(hookResult).toMatchObject({
			compaction: {
				firstKeptEntryId: "u2",
				details: { readFiles: ["read.ts"], compactUntil: { firstKeptEntryId: "u2", kind: "user-exchange", agentDirected: false } },
			},
		});
	});

	it("applies agent summaryFocus after deferred execution and records agent provenance", async () => {
		const { tools, agentSettled, beforeCompact } = registerExtension();
		const entries = completedTurns(2);
		await tools().get("schedule_compaction").execute("call", { firstKeptEntryId: "u2", summaryFocus: "preserve agent test evidence" }, undefined, undefined, {
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { notify: vi.fn() },
		});
		const compactRequest = vi.fn();
		await agentSettled()({}, {
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			hasPendingMessages: () => false,
			ui: { notify: vi.fn() },
			compact: compactRequest,
		});
		expect(compactRequest).toHaveBeenCalledWith(expect.objectContaining({ customInstructions: "preserve agent test evidence" }));
		piCompact.mockResolvedValue(piCompactionResult());

		const hookResult = await beforeCompact()(beforeCompactEvent("preserve agent test evidence"), executionContext(entries));

		expect(piCompact.mock.calls[0]?.[4]).toContain("preserve agent test evidence");
		expect(hookResult).toMatchObject({ compaction: { details: { compactUntil: { firstKeptEntryId: "u2", agentDirected: true } } } });
	});

	it("accepts a no-history split checkpoint at an agent-message boundary", async () => {
		const { command, beforeCompact } = registerExtension();
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "checkpoint"), entry("u2", "user", "later")];
		const select = vi.fn().mockResolvedValueOnce("Show agent activity").mockResolvedValueOnce("Keep agent checkpoint: checkpoint [a1]");
		await command().handler("", {
			mode: "rpc",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { select, confirm: vi.fn().mockResolvedValue(true), notify: vi.fn() },
			compact: vi.fn(),
		});
		const splitSummary = `No prior history.\n\n---\n\n**Turn Context (split turn):**\n\n## Original Request\nKeep the current turn.\n\n## Early Progress\n- An assistant checkpoint was reached.\n\n## Context for Suffix\n- Continue with the retained assistant message.`;
		piCompact.mockResolvedValue(piCompactionResult(splitSummary));

		const hookResult = await beforeCompact()(beforeCompactEvent(), executionContext(entries));

		expect(piCompact.mock.calls[0]?.[0]).toMatchObject({ firstKeptEntryId: "a1", isSplitTurn: true, messagesToSummarize: [] });
		expect(hookResult).toMatchObject({ compaction: { summary: splitSummary, details: { compactUntil: { kind: "agent-checkpoint", firstKeptEntryId: "a1" } } } });
	});

	it("cancels and precisely notifies after two invalid generated summaries", async () => {
		const { command, beforeCompact } = registerExtension();
		const entries = completedTurns(2);
		await command().handler("", {
			mode: "rpc",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { select: vi.fn().mockResolvedValue("Keep user message: user 2 [u2]"), confirm: vi.fn().mockResolvedValue(true), notify: vi.fn() },
			compact: vi.fn(),
		});
		piCompact.mockResolvedValue(piCompactionResult("invalid checkpoint"));
		const ctx = executionContext(entries);

		const hookResult = await beforeCompact()(beforeCompactEvent(), ctx);

		expect(hookResult).toEqual({ cancel: true });
		expect(piCompact).toHaveBeenCalledTimes(2);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("cancelled after two invalid summaries"), "error");
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("missing-history-heading"), "error");
	});
});

describe("compact-until picker state", () => {
	it("starts with user exchanges and toggles agent activity in both directions", () => {
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later"), entry("a2", "assistant", "done")];
		const candidates = getSafeBoundaryCandidates(entries);
		const advanced = togglePickerView("user-exchanges");

		expect(pickerCandidates(candidates, "user-exchanges").every((candidate) => candidate.kind === "user-exchange")).toBe(true);
		expect(advanced).toBe("all-boundaries");
		expect(pickerCandidates(candidates, advanced).some((candidate) => candidate.kind === "agent-checkpoint")).toBe(true);
		expect(togglePickerView(advanced)).toBe("user-exchanges");
		expect(isAgentActivityToggle("a")).toBe(true);
		expect(isAgentActivityToggle("A")).toBe(false);
	});

	it("provides full detail from the message represented by each boundary", () => {
		const entries = [
			entry("u1", "user", "first user prompt with the details to inspect"),
			assistantWithTool("a1", "assistant checkpoint with a full explanation"),
			entry("u2", "user", "later"),
		];
		const candidates = getSafeBoundaryCandidates(entries);
		const userExchange = candidates.find((candidate) => candidate.kind === "user-exchange")!;
		const agentCheckpoint = candidates.find((candidate) => candidate.kind === "agent-checkpoint")!;

		expect(userExchange.detail).toEqual({
			title: "User message to keep [u2]",
			content: "later",
		});
		expect(agentCheckpoint.detail).toEqual({
			title: "Agent checkpoint to keep [a1]",
			content: "assistant checkpoint with a full explanation\n\nTool calls: read",
		});
	});

	it("uses fallbacks for empty message content and tool-only checkpoints", () => {
		const entries = [entry("u1", "user", "source"), assistantWithTool("a1", ""), entry("u2", "user", "")];
		const candidates = getSafeBoundaryCandidates(entries);

		expect(candidates.find((candidate) => candidate.kind === "user-exchange")!.detail.content).toBe("(user message)");
		expect(candidates.find((candidate) => candidate.kind === "agent-checkpoint")!.detail.content).toBe("Tool calls: read");
	});

	it("shows detail for the highlighted terminal row without selecting or compacting", async () => {
		const { command } = registerExtension();
		const compact = vi.fn();
		let picker: { handleInput(data: string): void } | undefined;
		const custom = vi.fn((factory) => new Promise((resolve) => {
			picker = factory(undefined, { fg: (_style: string, text: string) => text }, undefined, resolve);
		}));
		const setWidget = vi.fn();
		const entries = [
			entry("u1", "user", "first user prompt"),
			entry("a1", "assistant", "done"),
			entry("u2", "user", "second user prompt to inspect"),
			entry("a2", "assistant", "done"),
			entry("u3", "user", "later"),
		];
		const ctx = {
			mode: "tui",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: {
				custom,
				setWidget,
				notify: vi.fn(),
				confirm: vi.fn(),
			},
			compact,
		};

		const run = command().handler("", ctx);
		await Promise.resolve();
		expect(custom.mock.calls[0]?.[0]).toBeTypeOf("function");
		picker!.handleInput("\u001b[A");
		picker!.handleInput("i");
		expect(setWidget).toHaveBeenCalledWith(
			"compact-until-boundary-detail",
			["User message to keep [u2]", "second user prompt to inspect"],
		);
		expect(compact).not.toHaveBeenCalled();

		picker!.handleInput("\u001b");
		await run;

		expect(setWidget).toHaveBeenLastCalledWith("compact-until-boundary-detail", undefined);
		expect(compact).not.toHaveBeenCalled();
	});

	it("shows the newest five boundaries initially and scrolls upward to older detail", async () => {
		const { command } = registerExtension();
		let picker: { render(width: number): string[]; handleInput(data: string): void } | undefined;
		const custom = vi.fn((factory) => new Promise((resolve) => {
			picker = factory(undefined, { fg: (_style: string, text: string) => text }, undefined, resolve);
		}));
		const setWidget = vi.fn();
		const ctx = {
			mode: "tui",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => completedTurns(7), getSessionId: () => "session" },
			ui: { custom, setWidget, notify: vi.fn(), confirm: vi.fn() },
			compact: vi.fn(),
		};

		const run = command().handler("", ctx);
		await Promise.resolve();
		const initialRows = picker!.render(120).join("\n");
		expect(initialRows).toContain("Keep user message: user 7 [u7]");
		expect(initialRows).toContain("Keep user message: user 3 [u3]");
		expect(initialRows).not.toContain("Keep user message: user 2 [u2]");
		for (let index = 0; index < 5; index += 1) picker!.handleInput("\u001b[A");
		picker!.handleInput("i");
		expect(setWidget).toHaveBeenCalledWith(
			"compact-until-boundary-detail",
			["User message to keep [u2]", "user 2"],
		);

		picker!.handleInput("\u001b");
		await run;
	});

	it("uses an older default-view boundary as the retained message for compaction", async () => {
		const { command, beforeCompact } = registerExtension();
		let picker: { handleInput(data: string): void } | undefined;
		const custom = vi.fn((factory) => new Promise((resolve) => {
			picker = factory(undefined, { fg: (_style: string, text: string) => text }, undefined, resolve);
		}));
		const commandCtx = {
			mode: "tui",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => completedTurns(7), getSessionId: () => "session" },
			ui: { custom, setWidget: vi.fn(), notify: vi.fn(), confirm: vi.fn().mockResolvedValue(true) },
			compact: vi.fn(),
		};

		const run = command().handler("", commandCtx);
		await Promise.resolve();
		for (let index = 0; index < 5; index += 1) picker!.handleInput("\u001b[A");
		picker!.handleInput("\r");
		await run;
		expect(commandCtx.ui.confirm).toHaveBeenCalledWith("Confirm targeted compaction", expect.stringContaining("[u2]"));

		const executionCtx = {
			sessionManager: { buildContextEntries: () => completedTurns(2), getSessionId: () => "session" },
			ui: { notify: vi.fn() },
		};
		const result = await beforeCompact()({ reason: "manual" }, executionCtx);

		expect(result).toEqual({ cancel: true });
		expect(executionCtx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("requires an active Pi model"), "error");
		expect(executionCtx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining("stale"), "error");
	});

	it("selects an older boundary and resets a toggled view to its newest row", async () => {
		const { command } = registerExtension();
		const pickers: Array<{ render(width: number): string[]; handleInput(data: string): void }> = [];
		const custom = vi.fn((factory) => new Promise((resolve) => {
			pickers.push(factory(undefined, { fg: (_style: string, text: string) => text }, undefined, resolve));
		}));
		const confirm = vi.fn().mockResolvedValue(false);
		const ctx = {
			mode: "tui",
			waitForIdle: vi.fn(),
			sessionManager: { buildContextEntries: () => completedTurns(7), getSessionId: () => "session" },
			ui: { custom, setWidget: vi.fn(), notify: vi.fn(), confirm },
			compact: vi.fn(),
		};

		const run = command().handler("", ctx);
		await Promise.resolve();
		pickers[0]!.handleInput("a");
		await Promise.resolve();
		await Promise.resolve();
		expect(pickers[1]!.render(120).join("\n")).toContain("Keep agent checkpoint: assistant 7 [a7]");
		for (let index = 0; index < 12; index += 1) pickers[1]!.handleInput("\u001b[A");
		pickers[1]!.handleInput("\r");
		await run;

		expect(confirm).toHaveBeenCalledWith("Confirm targeted compaction", expect.stringContaining("[a1]"));
		expect(ctx.compact).not.toHaveBeenCalled();
	});

	it("recognizes only the documented detail hotkey and supported navigation input", () => {
		expect(isPickerDetailToggle("i")).toBe(true);
		expect(isPickerDetailToggle("I")).toBe(false);
		expect(pickerNavigation("\u001b[A")).toBe("up");
		expect(pickerNavigation("\u001b[B")).toBe("down");
		expect(pickerNavigation("j")).toBe("down");
		expect(pickerNavigation("x")).toBeUndefined();
	});
});

describe("agent-directed compaction tools", () => {
	it("lists only safe boundary candidates and leaves the session unchanged when none exist", async () => {
		const { tools } = registerExtension();
		const list = tools().get("list_compaction_boundaries");
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "inspect"), toolResult("r1"), entry("u2", "user", "later")];
		const ctx = { sessionManager: { buildContextEntries: () => entries }, ui: { notify: vi.fn() } };

		const result = await list.execute("call", {}, undefined, undefined, ctx);

		expect(result.details.boundaries.map((boundary: any) => boundary.firstKeptEntryId)).toEqual(["a1", "u2"]);
		expect(result.details.boundaries.some((boundary: any) => boundary.firstKeptEntryId === "r1")).toBe(false);
		expect(ctx.ui.notify).not.toHaveBeenCalled();

		const emptyResult = await list.execute("call", {}, undefined, undefined, { sessionManager: { buildContextEntries: () => [] }, ui: { notify: vi.fn() } });
		expect(emptyResult.details.boundaries).toEqual([]);
		expect(emptyResult.content[0]?.text).toContain("No safe");
		expect(list.description).toContain("schedule_compaction");
		expect(list.promptGuidelines[0]).toContain("before");
	});

	it("lists every safe boundary for the model, including boundaries older than five rows", async () => {
		const { tools } = registerExtension();
		const list = tools().get("list_compaction_boundaries");
		const ctx = { sessionManager: { buildContextEntries: () => completedTurns(7) }, ui: { notify: vi.fn() } };

		const result = await list.execute("call", {}, undefined, undefined, ctx);
		const boundaryIds = result.details.boundaries.map((boundary: any) => boundary.firstKeptEntryId);

		expect(boundaryIds).toHaveLength(13);
		expect(boundaryIds).toContain("a1");
		expect(boundaryIds).toContain("u7");
	});

	it("schedules one validated request with optional summary focus without compacting inline", async () => {
		const { tools } = registerExtension();
		const schedule = tools().get("schedule_compaction");
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later")];
		const ctx = {
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { notify: vi.fn() },
			compact: vi.fn(),
		};

		const result = await schedule.execute("call", { firstKeptEntryId: "a1", summaryFocus: "Preserve the test result" }, undefined, undefined, ctx);
		const duplicate = await schedule.execute("call", { firstKeptEntryId: "a1" }, undefined, undefined, ctx);

		expect(result.details).toMatchObject({ scheduled: true, firstKeptEntryId: "a1", kind: "agent-checkpoint" });
		expect(result.content[0]?.text).toContain("scheduled");
		expect(duplicate.details).toEqual({ scheduled: false, reason: "already-pending" });
		expect(ctx.compact).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("scheduled"), "info");
		expect(schedule.description).toContain("deliberate milestone");
		expect(schedule.promptGuidelines[0]).toContain("list_compaction_boundaries");
	});

	it("rejects an invalid scheduling identifier", async () => {
		const { tools } = registerExtension();
		const schedule = tools().get("schedule_compaction");
		const ctx = { sessionManager: { buildContextEntries: () => [], getSessionId: () => "session" }, ui: { notify: vi.fn() } };

		const result = await schedule.execute("call", { firstKeptEntryId: "missing" }, undefined, undefined, ctx);

		expect(result.details).toEqual({ scheduled: false, reason: "invalid-boundary" });
		expect(ctx.ui.notify).not.toHaveBeenCalled();
	});

	it("defers compaction until the agent settles and preserves native manual compaction while scheduled", async () => {
		const { tools, agentSettled, beforeCompact } = registerExtension();
		const schedule = tools().get("schedule_compaction");
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later")];
		const schedulingCtx = { sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" }, ui: { notify: vi.fn() } };
		await schedule.execute("call", { firstKeptEntryId: "a1", summaryFocus: "keep decisions" }, undefined, undefined, schedulingCtx);

		const nativeResult = await beforeCompact()({ reason: "manual" }, { sessionManager: { getSessionId: () => "session" } });
		const compact = vi.fn();
		const settledCtx = {
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			hasPendingMessages: () => false,
			ui: { notify: vi.fn() },
			compact,
		};

		await agentSettled()({}, settledCtx);

		expect(nativeResult).toBeUndefined();
		expect(compact).toHaveBeenCalledWith(expect.objectContaining({ customInstructions: "keep decisions" }));
	});

	it("cancels a deferred request when user input is pending", async () => {
		const { tools, agentSettled } = registerExtension();
		const schedule = tools().get("schedule_compaction");
		const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later")];
		await schedule.execute("call", { firstKeptEntryId: "a1" }, undefined, undefined, {
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			ui: { notify: vi.fn() },
		});
		const ctx = {
			sessionManager: { buildContextEntries: () => entries, getSessionId: () => "session" },
			hasPendingMessages: () => true,
			ui: { notify: vi.fn() },
			compact: vi.fn(),
		};

		await agentSettled()({}, ctx);

		expect(ctx.compact).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("cancelled"), "warning");
	});

	it("records agent-directed boundary provenance", () => {
		const candidate = getSafeBoundaryCandidates([entry("u1", "user", "first"), entry("a1", "assistant", "done")])[0]!;
		expect(compactUntilDetails(candidate, true)).toMatchObject({
			kind: "agent-checkpoint",
			selectedUserEntryId: "u1",
			firstKeptEntryId: "a1",
			agentDirected: true,
		});
	});
});

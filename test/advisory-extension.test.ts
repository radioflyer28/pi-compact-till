import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import compactUntil from "../extensions/compact-until.js";
import { ADVISORY_DECISION_DETAIL_KEY, ADVISORY_DECISION_ENTRY_TYPE, ADVISORY_OFFER_ENTRY_TYPE, activeDecision, parseOffer } from "../extensions/advisory-state.js";

const stamp = "2026-08-24T00:00:00.000Z";

function entry(id: string, role: "user" | "assistant", text: string): SessionEntry {
	return { type: "message", id, parentId: null, timestamp: stamp, message: { role, content: [{ type: "text", text }], timestamp: Date.now() } } as unknown as SessionEntry;
}

function setup(initialEntries: SessionEntry[], flag?: string) {
	const branch = [...initialEntries];
	const callbacks = new Map<string, any>();
	const tools = new Map<string, any>();
	const flags = new Map<string, any>();
	const compact = vi.fn();
	let sequence = 0;
	const pi = {
		registerFlag: (name: string, definition: unknown) => flags.set(name, definition),
		getFlag: (name: string) => name === "compact-until-advisory-mode" ? "threshold" : name === "compact-until-advisory-threshold" ? flag : undefined,
		registerTool: (definition: any) => tools.set(definition.name, definition),
		registerCommand: vi.fn(),
		on: (name: string, handler: unknown) => callbacks.set(name, handler),
		appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", id: `custom-${++sequence}`, parentId: branch.at(-1)?.id ?? null, timestamp: stamp, customType, data } as SessionEntry),
	} as unknown as ExtensionAPI;
	compactUntil(pi);
	const contextEntries = () => branch.filter((item) => item.type !== "custom" && item.type !== "compaction");
	const ctx = {
		model: { id: "model", maxTokens: 16_000, contextWindow: 100_000 },
		getContextUsage: () => ({ tokens: 70_000, contextWindow: 100_000, percent: 70 }),
		sessionManager: {
			getSessionId: () => "session",
			getBranch: () => branch,
			buildContextEntries: contextEntries,
		},
		ui: { notify: vi.fn() },
		compact,
	};
	return { branch, callbacks, compact, ctx, flags, tools };
}

const baseEntries = () => [
	entry("u1", "user", "first request"), entry("a1", "assistant", "first result"),
	entry("u2", "user", "second request"), entry("a2", "assistant", "second result"),
];

describe("advisory extension interface", () => {
	it("registers the threshold flag and response-tool contract", () => {
		const { flags, tools } = setup(baseEntries());
		expect(flags.get("compact-until-advisory-threshold")).toMatchObject({ type: "string", description: expect.stringContaining("default: 70") });
		const tool = tools.get("choose_compaction_boundary");
		expect(tool).toMatchObject({
			name: "choose_compaction_boundary",
			executionMode: "sequential",
			parameters: { required: ["offerId", "optionId"], additionalProperties: false },
		});
		expect(tool.promptGuidelines.join(" ")).toContain("active compaction advisory");
	});

	it("appends an advisory to a tool result without registering a context rewrite", async () => {
		const { branch, callbacks, compact, ctx } = setup(baseEntries());
		const deliver = callbacks.get("tool_result");
		const content = [{ type: "text", text: "original result" }];
		const first = await deliver({ content, isError: false, structuredContent: { ok: true } }, ctx);
		const offerEntries = branch.filter((item) => item.type === "custom" && item.customType === ADVISORY_OFFER_ENTRY_TYPE);
		expect(callbacks.has("context")).toBe(false);
		expect(first.content).toHaveLength(2);
		expect(first.content[0]).toEqual(content[0]);
		expect(first.content[1].text).toContain("choose_compaction_boundary");
		expect(first.structuredContent).toEqual({ ok: true });
		expect(content).toHaveLength(1);
		expect(offerEntries).toHaveLength(1);
		expect(await deliver({ content, isError: false }, ctx)).toBeUndefined();
		expect(compact).not.toHaveBeenCalled();
	});

	it("does not consume offers on nested or failed results", async () => {
		const { branch, callbacks, ctx } = setup(baseEntries());
		const deliver = callbacks.get("tool_result");
		for (const event of [{ content: [], parentToolCallId: "parent", isError: false }, { content: [], isError: true }]) {
			expect(await deliver(event, ctx)).toBeUndefined();
		}
		expect(branch.some((item) => item.type === "custom")).toBe(false);
		expect((await deliver({ content: [], isError: false }, ctx)).content[0].text).toContain("choose_compaction_boundary");
	});

	it("omits an offer when usage or safe candidates are unavailable", async () => {
		const unavailable = setup(baseEntries());
		unavailable.ctx.getContextUsage = () => ({ tokens: null, contextWindow: 100_000, percent: null }) as any;
		expect(await unavailable.callbacks.get("tool_result")({ content: [], isError: false }, unavailable.ctx)).toBeUndefined();
		expect(unavailable.branch.some((item) => item.type === "custom")).toBe(false);

		const empty = setup([]);
		expect(await empty.callbacks.get("tool_result")({ content: [], isError: false }, empty.ctx)).toBeUndefined();
		expect(empty.branch.some((item) => item.type === "custom")).toBe(false);
	});

	it("warns once and uses 70 percent when the threshold flag is invalid", async () => {
		const { callbacks, ctx } = setup(baseEntries(), "101");
		await callbacks.get("tool_result")({ content: [], isError: false }, ctx);
		await callbacks.get("tool_result")({ content: [], isError: false }, ctx);
		expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("using 70 percent"), "warning");
	});

	it("records native and targeted decisions without starting compaction", async () => {
		const { branch, callbacks, compact, ctx, tools } = setup(baseEntries());
		await callbacks.get("tool_result")({ content: [], isError: false }, ctx);
		const offerEntry = branch.find((item) => item.type === "custom" && item.customType === ADVISORY_OFFER_ENTRY_TYPE)!;
		const offer = parseOffer((offerEntry as any).data)!;
		const choose = tools.get("choose_compaction_boundary");

		const native = await choose.execute("call-1", { offerId: offer.offerId, optionId: "native" }, undefined, undefined, ctx);
		expect(native.details).toMatchObject({ recorded: true, [ADVISORY_DECISION_DETAIL_KEY]: { decision: "native", offerId: offer.offerId } });
		const targeted = await choose.execute("call-2", { offerId: offer.offerId, optionId: offer.options[0]!.optionId, summaryFocus: " preserve tests " }, undefined, undefined, ctx);
		expect(targeted.details).toMatchObject({ recorded: true, [ADVISORY_DECISION_DETAIL_KEY]: { decision: "targeted", summaryFocus: "preserve tests", firstKeptEntryId: offer.options[0]!.firstKeptEntryId } });
		expect(compact).not.toHaveBeenCalled();
	});

	it("restores a nested-call decision without persisting the nested tool result", async () => {
		const { branch, callbacks, ctx, tools } = setup(baseEntries());
		await callbacks.get("tool_result")({ content: [], isError: false }, ctx);
		const offer = parseOffer((branch.find((item) => item.type === "custom") as any).data)!;
		await tools.get("choose_compaction_boundary").execute("codemode-call/1", {
			offerId: offer.offerId,
			optionId: offer.options[0]!.optionId,
			summaryFocus: "preserve nested work",
		}, undefined, undefined, ctx);

		// Pi stores only the parent's result; nested results/details are not transcript entries.
		expect(branch.some((item) => item.type === "message" && item.message.role === "toolResult")).toBe(false);
		const restoredBranch = JSON.parse(JSON.stringify(branch)) as SessionEntry[];
		expect(activeDecision(restoredBranch, "session")).toMatchObject({
			decision: "targeted", firstKeptEntryId: offer.options[0]!.firstKeptEntryId, summaryFocus: "preserve nested work",
		});
		expect(restoredBranch.filter((item) => item.type === "custom" && item.customType === ADVISORY_DECISION_ENTRY_TYPE)).toHaveLength(1);
		expect(activeDecision(restoredBranch.filter((item) => item.type !== "custom" || item.customType !== ADVISORY_DECISION_ENTRY_TYPE), "session")).toBeUndefined();
		expect(activeDecision(restoredBranch, "other-session")).toBeUndefined();
		expect(activeDecision([...restoredBranch, { type: "compaction", id: "new-epoch" } as SessionEntry], "session")).toBeUndefined();
	});

	it("rejects mismatched offers, options, and stale selected boundaries", async () => {
		const { branch, callbacks, ctx, tools } = setup(baseEntries());
		await callbacks.get("tool_result")({ content: [], isError: false }, ctx);
		const offer = parseOffer((branch.find((item) => item.type === "custom") as any).data)!;
		const choose = tools.get("choose_compaction_boundary");
		expect((await choose.execute("x", { offerId: "wrong", optionId: "native" }, undefined, undefined, ctx)).details).toMatchObject({ recorded: false, reason: "invalid-offer" });
		expect((await choose.execute("x", { offerId: offer.offerId, optionId: "wrong" }, undefined, undefined, ctx)).details).toMatchObject({ recorded: false, reason: "invalid-option" });
		const targeted = offer.options[0]!;
		branch.splice(0, branch.length, branch.find((item) => item.type === "custom")!);
		expect((await choose.execute("x", { offerId: offer.offerId, optionId: targeted.optionId }, undefined, undefined, ctx)).details).toMatchObject({ recorded: false, reason: "stale-boundary" });
		expect(branch.some((item) => item.type === "custom" && item.customType === ADVISORY_DECISION_ENTRY_TYPE)).toBe(false);
	});
});

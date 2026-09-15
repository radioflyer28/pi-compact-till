import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import compactUntil from "../extensions/compact-until.js";
import { ADVISORY_DECISION_DETAIL_KEY, ADVISORY_OFFER_ENTRY_TYPE, parseOffer } from "../extensions/advisory-state.js";

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
		getFlag: (name: string) => name === "compact-until-advisory-threshold" ? flag : undefined,
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

	it("injects advisory prose for one provider call while persisting only hidden offer state", async () => {
		const { branch, callbacks, compact, ctx } = setup(baseEntries());
		const context = callbacks.get("context");
		const messages = [{ role: "user", content: [{ type: "text", text: "hello" }], timestamp: Date.now() }];
		const first = await context({ messages }, ctx);
		const offerEntries = branch.filter((item) => item.type === "custom" && item.customType === ADVISORY_OFFER_ENTRY_TYPE);

		expect(first.messages).toHaveLength(2);
		expect(first.messages[1]).toMatchObject({ role: "custom", display: false, content: expect.stringContaining("choose_compaction_boundary") });
		expect(offerEntries).toHaveLength(1);
		expect(JSON.stringify(offerEntries[0])).not.toContain("Pi context is approaching");
		expect(await context({ messages }, ctx)).toBeUndefined();
		expect(branch.filter((item) => item.type === "custom" && item.customType === ADVISORY_OFFER_ENTRY_TYPE)).toHaveLength(1);
		expect(compact).not.toHaveBeenCalled();
	});

	it("omits an offer when usage or safe candidates are unavailable", async () => {
		const unavailable = setup(baseEntries());
		unavailable.ctx.getContextUsage = () => ({ tokens: null, contextWindow: 100_000, percent: null }) as any;
		expect(await unavailable.callbacks.get("context")({ messages: [] }, unavailable.ctx)).toBeUndefined();
		expect(unavailable.branch.some((item) => item.type === "custom")).toBe(false);

		const empty = setup([]);
		expect(await empty.callbacks.get("context")({ messages: [] }, empty.ctx)).toBeUndefined();
		expect(empty.branch.some((item) => item.type === "custom")).toBe(false);
	});

	it("warns once and uses 70 percent when the threshold flag is invalid", async () => {
		const { callbacks, ctx } = setup(baseEntries(), "101");
		await callbacks.get("context")({ messages: [] }, ctx);
		await callbacks.get("context")({ messages: [] }, ctx);
		expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("using 70 percent"), "warning");
	});

	it("records native and targeted decisions without starting compaction", async () => {
		const { branch, callbacks, compact, ctx, tools } = setup(baseEntries());
		await callbacks.get("context")({ messages: [] }, ctx);
		const offerEntry = branch.find((item) => item.type === "custom" && item.customType === ADVISORY_OFFER_ENTRY_TYPE)!;
		const offer = parseOffer((offerEntry as any).data)!;
		const choose = tools.get("choose_compaction_boundary");

		const native = await choose.execute("call-1", { offerId: offer.offerId, optionId: "native" }, undefined, undefined, ctx);
		expect(native.details).toMatchObject({ recorded: true, [ADVISORY_DECISION_DETAIL_KEY]: { decision: "native", offerId: offer.offerId } });
		const targeted = await choose.execute("call-2", { offerId: offer.offerId, optionId: offer.options[0]!.optionId, summaryFocus: " preserve tests " }, undefined, undefined, ctx);
		expect(targeted.details).toMatchObject({ recorded: true, [ADVISORY_DECISION_DETAIL_KEY]: { decision: "targeted", summaryFocus: "preserve tests", firstKeptEntryId: offer.options[0]!.firstKeptEntryId } });
		expect(compact).not.toHaveBeenCalled();
	});

	it("rejects mismatched offers, options, and stale selected boundaries", async () => {
		const { branch, callbacks, ctx, tools } = setup(baseEntries());
		await callbacks.get("context")({ messages: [] }, ctx);
		const offer = parseOffer((branch.find((item) => item.type === "custom") as any).data)!;
		const choose = tools.get("choose_compaction_boundary");
		expect((await choose.execute("x", { offerId: "wrong", optionId: "native" }, undefined, undefined, ctx)).details).toMatchObject({ recorded: false, reason: "invalid-offer" });
		expect((await choose.execute("x", { offerId: offer.offerId, optionId: "wrong" }, undefined, undefined, ctx)).details).toMatchObject({ recorded: false, reason: "invalid-option" });
		const targeted = offer.options[0]!;
		branch.splice(0, branch.length, branch.find((item) => item.type === "custom")!);
		expect((await choose.execute("x", { offerId: offer.offerId, optionId: targeted.optionId }, undefined, undefined, ctx)).details).toMatchObject({ recorded: false, reason: "stale-boundary" });
	});
});

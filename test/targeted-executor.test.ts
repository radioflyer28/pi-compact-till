import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { executeTargetedCompaction } from "../extensions/targeted-executor.js";
import { getSafeBoundaryCandidates } from "../extensions/turns.js";

const { piCompact } = vi.hoisted(() => ({ piCompact: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...await importOriginal<typeof import("@earendil-works/pi-coding-agent")>(),
	compact: piCompact,
}));

const stamp = "2026-08-24T00:00:00.000Z";
const validSummary = `## Goal
Continue safely.

## Constraints & Preferences
- Preserve the boundary.

## Progress
### Done
- [x] Prepared context.

### In Progress
- [ ] Continue work.

### Blocked
- (none)

## Key Decisions
- **Boundary**: Keep it.

## Next Steps
1. Continue.

## Critical Context
- Exact IDs remain available.`;

function entry(id: string, role: "user" | "assistant", text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: stamp,
		message: { role, content: [{ type: "text", text }], timestamp: Date.now() },
	} as unknown as SessionEntry;
}

function fixture() {
	const entries = [entry("u1", "user", "first"), entry("a1", "assistant", "done"), entry("u2", "user", "later")];
	const candidate = getSafeBoundaryCandidates(entries).find((item) => item.firstKeptEntryId === "u2")!;
	const controller = new AbortController();
	const event = {
		reason: "manual",
		willRetry: false,
		customInstructions: "focus",
		signal: controller.signal,
		branchEntries: entries,
		preparation: {
			firstKeptEntryId: "default",
			messagesToSummarize: [],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 100,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 1_000, keepRecentTokens: 2_000 },
		},
	} as any;
	const ctx = {
		model: { id: "model" },
		thinkingLevel: "high",
		modelRegistry: { getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "key", headers: { kept: "yes", removed: null }, env: {} }) },
	} as any;
	return { entries, candidate, controller, event, ctx };
}

beforeEach(() => piCompact.mockReset());

describe("targeted compaction executor", () => {
	it("returns a validated result with filtered headers and provenance", async () => {
		const { entries, candidate, event, ctx } = fixture();
		piCompact.mockResolvedValue({ summary: validSummary, firstKeptEntryId: "u2", tokensBefore: 100, details: { native: true } });

		const result = await executeTargetedCompaction({
			contextEntries: entries,
			candidate,
			event,
			ctx,
			provenance: { agentDirected: true },
			summaryFocus: "preserve tests",
		});

		expect(result).toMatchObject({ ok: true, compaction: { details: { native: true, compactUntil: { firstKeptEntryId: "u2", agentDirected: true } } } });
		expect(piCompact.mock.calls[0]?.[3]).toEqual({ kept: "yes" });
		expect(piCompact.mock.calls[0]?.[4]).toContain("preserve tests");
	});

	it("returns typed model and authentication failures", async () => {
		const { entries, candidate, event, ctx } = fixture();
		expect(await executeTargetedCompaction({ contextEntries: entries, candidate, event, ctx: { ...ctx, model: undefined }, provenance: { agentDirected: false } })).toMatchObject({ ok: false, code: "missing-model" });
		ctx.modelRegistry.getApiKeyAndHeaders.mockResolvedValue({ ok: false, error: "missing key" });
		expect(await executeTargetedCompaction({ contextEntries: entries, candidate, event, ctx, provenance: { agentDirected: false } })).toMatchObject({ ok: false, code: "authentication", message: expect.stringContaining("missing key") });
	});

	it("returns a typed validation failure after one repair", async () => {
		const { entries, candidate, event, ctx } = fixture();
		piCompact.mockResolvedValue({ summary: "invalid", firstKeptEntryId: "u2", tokensBefore: 100 });
		const result = await executeTargetedCompaction({ contextEntries: entries, candidate, event, ctx, provenance: { agentDirected: false } });
		expect(result).toMatchObject({ ok: false, code: "invalid-summary", issues: expect.any(Array) });
		expect(piCompact).toHaveBeenCalledTimes(2);
	});

	it("distinguishes cancellation from an underlying compaction failure", async () => {
		const cancelled = fixture();
		cancelled.controller.abort();
		piCompact.mockRejectedValueOnce(new Error("aborted"));
		expect(await executeTargetedCompaction({ contextEntries: cancelled.entries, candidate: cancelled.candidate, event: cancelled.event, ctx: cancelled.ctx, provenance: { agentDirected: false } })).toMatchObject({ ok: false, code: "cancelled" });

		const failed = fixture();
		piCompact.mockRejectedValueOnce(new Error("provider failed"));
		expect(await executeTargetedCompaction({ contextEntries: failed.entries, candidate: failed.candidate, event: failed.event, ctx: failed.ctx, provenance: { agentDirected: false } })).toMatchObject({ ok: false, code: "compaction-failed", message: expect.stringContaining("provider failed") });
	});
});

import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext, SessionBeforeCompactEvent, SessionEntry } from "@earendil-works/pi-coding-agent";
import { executeTargetedCompaction } from "../extensions/targeted-executor.js";
import { getSafeBoundaryCandidates } from "../extensions/turns.js";
import { runValidatedCompaction } from "../extensions/summary-policy.js";

// No SDK mock: use Pi's real compact(), serialization and validation with a local stream.
const summary = `## Goal
Continue safely.

## Constraints & Preferences
- Keep the boundary.

## Progress
### Done
- [x] Checked context.

### In Progress
- [ ] Continue work.

### Blocked
- (none)

## Key Decisions
- **Routing**: Use the configured runtime.

## Next Steps
1. Continue.

## Critical Context
- Preserve identifiers.`;

function entry(id: string, role: "user" | "assistant", text: string): SessionEntry {
	return { type: "message", id, parentId: null, timestamp: "2026-10-12T00:00:00.000Z", message: { role, content: [{ type: "text", text }], timestamp: 1 } } as unknown as SessionEntry;
}

describe("targeted compaction with the native SDK", () => {
	it("uses the configured stream without global provider registration or network access", async () => {
		const entries = [entry("u1", "user", "request"), entry("a1", "assistant", "finished investigation"), entry("u2", "user", "keep")];
		const usage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
		const registry = {
			getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "local-key" }),
			streamSimple: vi.fn(function (this: unknown, _model: unknown, context: unknown, options: any) {
				expect(this).toBe(registry);
				expect(JSON.stringify(context)).toContain("finished investigation");
				expect(options).toMatchObject({ cacheRetention: "none", signal: controller.signal });
				return { result: async () => ({ role: "assistant", content: [{ type: "text", text: summary }], usage, stopReason: "stop", timestamp: 1 }) };
			}),
		};
		const controller = new AbortController();
		const event = {
			reason: "manual", signal: controller.signal,
			preparation: {
				firstKeptEntryId: "native", messagesToSummarize: [], turnPrefixMessages: [], isSplitTurn: false,
				tokensBefore: 100, fileOps: { read: new Set(), written: new Set(), edited: new Set() },
				settings: { enabled: true, reserveTokens: 1000, keepRecentTokens: 10 },
			},
		} as unknown as SessionBeforeCompactEvent;
		const ctx = { model: { id: "local-model", provider: "unregistered-local-provider", api: "local-only", maxTokens: 1000, reasoning: false }, modelRegistry: registry } as unknown as ExtensionContext;
		const result = await executeTargetedCompaction({
			contextEntries: entries, candidate: getSafeBoundaryCandidates(entries).find((item) => item.firstKeptEntryId === "u2")!, event, ctx, provenance: { agentDirected: false },
		});
		expect(result).toMatchObject({ ok: true, compaction: { summary, firstKeptEntryId: "u2", usage } });
		expect(registry.streamSimple).toHaveBeenCalledOnce();
	});
});

// Pi's native split-prefix summarizer does not receive customInstructions.
// Exercise the real compactor: repair and preservation must reach that stream too.
describe("split-prefix instruction delivery", () => {
	it("repairs malformed split headings using feedback delivered to the prefix request", async () => {
		const prompts: string[] = [];
		const usage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
		const stream = vi.fn((_model: unknown, context: unknown) => {
			const prompt = JSON.stringify(context);
			prompts.push(prompt);
			const text = prompt.includes("Required structural repair")
				? "## Original Request\nFix the race.\n\n## Progress So Far\n- Reproduced the race.\n\n## Context Needed to Continue\n- Keep the queued-message evidence."
				: "## Original Request\nFix the race.\n\nProgress happened but required sections are missing.";
			return { result: async () => ({ role: "assistant", content: [{ type: "text", text }], usage, stopReason: "stop", timestamp: 1 }) };
		});
		const result = await runValidatedCompaction([
			{ firstKeptEntryId: "keep", messagesToSummarize: [], turnPrefixMessages: [{ role: "user", content: "Fix the race", timestamp: 1 }], isSplitTurn: true, tokensBefore: 1000, fileOps: { read: new Set(), written: new Set(), edited: new Set() }, settings: { enabled: true, reserveTokens: 4000, keepRecentTokens: 100 } },
			{ id: "local", provider: "local", api: "local", maxTokens: 4000, reasoning: false } as any,
			"local-key", undefined, "Preserve queued-message evidence", new AbortController().signal, "off", stream as any,
		]);
		expect(prompts).toHaveLength(2);
		expect(prompts[0]).toContain("Preserve queued-message evidence");
		expect(prompts[1]).toContain("Required structural repair");
		expect(result.summary).toContain("## Context Needed to Continue");
		expect(result.usage?.totalTokens).toBe(60);
	});
});

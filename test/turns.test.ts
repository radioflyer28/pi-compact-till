import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { buildTargetedCompactionInput } from "../extensions/targeted-compaction.js";
import { getEligibleTurnCandidates, getSafeBoundaryCandidates } from "../extensions/turns.js";

const stamp = "2026-08-21T00:00:00.000Z";

function message(id: string, role: "user" | "assistant" | "toolResult", content: unknown): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: stamp,
		message: { role, content, timestamp: Date.now() },
	} as unknown as SessionEntry;
}

function user(id: string, text: string): SessionEntry {
	return message(id, "user", [{ type: "text", text }]);
}

function assistant(id: string, content: unknown = [{ type: "text", text: "Done." }]): SessionEntry {
	return message(id, "assistant", content);
}

function toolResult(id: string): SessionEntry {
	return message(id, "toolResult", [{ type: "text", text: "tool output" }]);
}

describe("getEligibleTurnCandidates", () => {
	it("includes a selected exchange's tool activity and keeps from the next user turn", () => {
		const entries = [
			user("u1", "Investigate caching"),
			assistant("a1", [{ type: "toolCall", name: "read", arguments: { path: "config.ts" }, id: "call-1" }]),
			toolResult("r1"),
			user("u2", "Implement the extension"),
			assistant("a2"),
			user("u3", "Run tests"),
			assistant("a3"),
		];

		const candidates = getEligibleTurnCandidates(entries);

		expect(candidates).toHaveLength(2);
		expect(candidates[0]?.firstKeptEntryId).toBe("u2");
		expect(candidates[0]?.entriesToSummarize.map((entry) => entry.id)).toEqual(["u1", "a1", "r1"]);
		expect(candidates[0]?.label).toBe("Keep user message: Implement the extension [u2]");
		expect(candidates[0]?.detail).toEqual({ title: "User message to keep [u2]", content: "Implement the extension" });
		expect(candidates[1]?.firstKeptEntryId).toBe("u3");
		expect(candidates[1]?.entriesToSummarize.map((entry) => entry.id)).toEqual(["u1", "a1", "r1", "u2", "a2"]);
	});

	it("uses only the retained tail after the latest compaction", () => {
		const entries = [
			user("old-user", "old history"),
			assistant("old-assistant"),
			{
				type: "compaction",
				id: "compact-1",
				parentId: null,
				timestamp: stamp,
				summary: "old history",
				firstKeptEntryId: "u1",
				tokensBefore: 100,
			},
			user("u1", "retained work"),
			assistant("a1"),
			user("u2", "newer work"),
			assistant("a2"),
		] as SessionEntry[];

		const candidates = getEligibleTurnCandidates(entries);

		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.selectedUserEntryId).toBe("u1");
		expect(candidates[0]?.firstKeptEntryId).toBe("u2");
	});

	it("excludes an incomplete or final exchange", () => {
		expect(getEligibleTurnCandidates([user("u1", "queued"), user("u2", "newer"), assistant("a2")])).toEqual([]);
		expect(getEligibleTurnCandidates([user("u1", "only turn"), assistant("a1")])).toEqual([]);
	});
});

describe("getSafeBoundaryCandidates", () => {
	it("reveals assistant checkpoints but never tool-result entries", () => {
		const entries = [
			user("u1", "Investigate caching"),
			assistant("a1", [{ type: "toolCall", name: "read", arguments: { path: "config.ts" }, id: "call-1" }]),
			toolResult("r1"),
			assistant("a2", [{ type: "text", text: "The cache key is stable." }]),
			user("u2", "Implement the extension"),
			assistant("a3"),
		];

		const candidates = getSafeBoundaryCandidates(entries);

		expect(candidates.map((candidate) => candidate.firstKeptEntryId)).toEqual(["a1", "a2", "u2", "a3"]);
		expect(candidates.map((candidate) => candidate.kind)).toEqual([
			"agent-checkpoint",
			"agent-checkpoint",
			"user-exchange",
			"agent-checkpoint",
		]);
		expect(candidates.find((candidate) => candidate.firstKeptEntryId === "r1")).toBeUndefined();
	});

	it("builds split-turn context for an assistant checkpoint and keeps its tool results", () => {
		const entries = [
			user("u1", "Investigate caching"),
			assistant("a1", [{ type: "text", text: "I will inspect the config." }]),
			assistant("a2", [{ type: "toolCall", name: "read", arguments: { path: "config.ts" }, id: "call-1" }]),
			toolResult("r1"),
			assistant("a3", [{ type: "text", text: "The cache key is stable." }]),
		];
		const candidate = getSafeBoundaryCandidates(entries).find((item) => item.firstKeptEntryId === "a2")!;
		const input = buildTargetedCompactionInput(entries, candidate, {
			firstKeptEntryId: "ignored",
			messagesToSummarize: [],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 1234,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 10 },
		});

		expect(candidate.turnPrefixEntries.map((entry) => entry.id)).toEqual(["u1", "a1"]);
		expect(input.isSplitTurn).toBe(true);
		expect(input.turnPrefixMessages).toHaveLength(2);
		expect(input.firstKeptEntryId).toBe("a2");
	});
});

describe("buildTargetedCompactionInput", () => {
	it("preserves previous file details and adds selected tool operations", () => {
		const entries = [
			{
				type: "compaction",
				id: "compact-1",
				parentId: null,
				timestamp: stamp,
				summary: "prior summary",
				firstKeptEntryId: "u1",
				tokensBefore: 100,
				details: { readFiles: ["old-read.ts"], modifiedFiles: ["old-edit.ts"] },
			},
			user("u1", "make a change"),
			assistant("a1", [{ type: "toolCall", name: "write", arguments: { path: "new-file.ts" }, id: "call-1" }]),
			user("u2", "keep this"),
			assistant("a2"),
		] as SessionEntry[];
		const candidate = getEligibleTurnCandidates(entries)[0]!;
		const input = buildTargetedCompactionInput(entries, candidate, {
			firstKeptEntryId: "ignored",
			messagesToSummarize: [],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 1234,
			fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 10 },
		});

		expect(input.firstKeptEntryId).toBe("u2");
		expect(input.previousSummary).toBe("prior summary");
		expect(input.fileOps.read).toEqual(new Set(["old-read.ts"]));
		expect(input.fileOps.edited).toEqual(new Set(["old-edit.ts"]));
		expect(input.fileOps.written).toEqual(new Set(["new-file.ts"]));
	});
});

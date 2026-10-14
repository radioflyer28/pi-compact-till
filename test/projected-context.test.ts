import { describe, expect, it } from "vitest";
import * as piSdk from "@earendil-works/pi-coding-agent";
import { sessionEntryToContextMessages, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { projectedContextEntries } from "../extensions/projected-context.js";
import { buildTargetedCompactionInput } from "../extensions/targeted-compaction.js";
import { getSafeBoundaryCandidates } from "../extensions/turns.js";

function message(id: string, role: "user" | "assistant" | "system", text: string): SessionEntry {
	return {
		type: "message", id, parentId: null, timestamp: "2026-10-12T00:00:00.000Z",
		message: { role, content: text, timestamp: 1 },
	} as unknown as SessionEntry;
}

const preparation = () => ({
	firstKeptEntryId: "native", messagesToSummarize: [], turnPrefixMessages: [], isSplitTurn: false,
	tokensBefore: 100, fileOps: { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() },
	settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 10 },
});

describe("projectedContextEntries", () => {
	it("excludes omissions and uses replacement content with original boundary IDs and metadata", () => {
		const u1 = message("u1", "user", "request");
		const omitted = message("omitted", "assistant", "abandoned attempt");
		const a1 = message("a1", "assistant", "raw answer");
		const u2 = message("u2", "user", "raw follow-up");
		const replacedAnswer = message("a1", "assistant", "edited answer");
		const replacedFollowUp = message("u2", "user", "edited follow-up");
		const entries = projectedContextEntries({
			buildContextEntries: () => [u1, omitted, a1, u2],
			buildSessionProjection: () => ({ entries: [
				{ sourceEntry: u1, messages: sessionEntryToContextMessages(u1) },
				{ sourceEntry: omitted, messages: [] },
				{ sourceEntry: a1, messages: sessionEntryToContextMessages(replacedAnswer) },
				{ sourceEntry: u2, messages: sessionEntryToContextMessages(replacedFollowUp) },
			] }),
		});
		expect(entries.map((entry) => entry.id)).toEqual(["u1", "a1", "u2"]);
		const candidate = getSafeBoundaryCandidates(entries).find((item) => item.firstKeptEntryId === "u2")!;
		expect(candidate.preview).toBe("edited follow-up");
		const input = buildTargetedCompactionInput(entries, candidate, preparation());
		expect(JSON.stringify(input.messagesToSummarize)).toContain("edited answer");
		expect(JSON.stringify(input.messagesToSummarize)).not.toMatch(/abandoned attempt|raw answer/);
		expect((a1 as any).message.content).toBe("raw answer");
		expect(entries[1]?.parentId).toBe(a1.parentId);
	});

	it("keeps compaction/custom metadata and excludes system state from conversation summaries", () => {
		const compaction = {
			type: "compaction", id: "cmp", parentId: null, timestamp: "stamp", summary: "previous summary",
			firstKeptEntryId: "u1", tokensBefore: 100, details: { readFiles: ["previous.ts"] },
		} as SessionEntry;
		const custom = { type: "custom", id: "state", parentId: null, timestamp: "stamp", customType: "state", data: { n: 1 } } as SessionEntry;
		const raw = [compaction, message("u1", "user", "request"), message("sys", "system", "prompt/tool state"), message("a1", "assistant", "answer"), custom, message("u2", "user", "keep")];
		const entries = projectedContextEntries({
			buildContextEntries: () => raw,
			buildSessionProjection: () => ({ entries: raw.map((sourceEntry) => ({ sourceEntry, messages: sessionEntryToContextMessages(sourceEntry) })) }),
		});
		expect(entries[0]).toBe(compaction);
		expect(entries).toContain(custom);
		const candidates = getSafeBoundaryCandidates(entries);
		expect(candidates.some((item) => item.firstKeptEntryId === "sys")).toBe(false);
		const input = buildTargetedCompactionInput(entries, candidates.find((item) => item.firstKeptEntryId === "u2")!, preparation());
		expect(input.previousSummary).toBe("previous summary");
		expect(input.fileOps.read).toEqual(new Set(["previous.ts"]));
		expect(input.messagesToSummarize.map((message) => message.role)).toEqual(["user", "assistant"]);
	});

	it("does not resurrect an older compaction checkpoint inside the retained range", () => {
		const latest = { type: "compaction", id: "latest", summary: "latest summary", firstKeptEntryId: "u1", tokensBefore: 100 } as SessionEntry;
		const older = { type: "compaction", id: "older", summary: "obsolete summary", firstKeptEntryId: "old-u", tokensBefore: 50 } as SessionEntry;
		const entries = projectedContextEntries({
			buildContextEntries: () => [latest, older],
			buildSessionProjection: () => ({ entries: [
				{ sourceEntry: latest, messages: sessionEntryToContextMessages(latest) },
				{ sourceEntry: older, messages: [] },
			] }),
		});
		expect(entries).toEqual([latest]);
	});

	it("uses projected custom-message replacement content", () => {
		const sourceEntry = { type: "custom_message", id: "custom", parentId: null, timestamp: "stamp", customType: "input", content: "raw", display: false } as SessionEntry;
		const replacement = { ...sourceEntry, content: "edited" } as SessionEntry;
		const entries = projectedContextEntries({
			buildContextEntries: () => [sourceEntry],
			buildSessionProjection: () => ({ entries: [{ sourceEntry, messages: sessionEntryToContextMessages(replacement) }] }),
		});
		expect(entries[0]).toMatchObject({ id: "custom", content: "edited", display: false });
	});

	it("fails closed when projected messages cannot map uniquely to their source role", () => {
		const sourceEntry = message("u1", "user", "request");
		const userMessages = sessionEntryToContextMessages(sourceEntry);
		for (const messages of [[...userMessages, ...userMessages], sessionEntryToContextMessages(message("a1", "assistant", "wrong role"))]) {
			expect(projectedContextEntries({
				buildContextEntries: () => [sourceEntry],
				buildSessionProjection: () => ({ entries: [{ sourceEntry, messages }] }),
			})).toEqual([]);
		}
	});

	it("preserves legacy runtimes without the projection API", () => {
		const raw = [message("u1", "user", "request")];
		expect(projectedContextEntries({ buildContextEntries: () => raw })).toBe(raw);
	});
});

// The baseline dev SDK predates projections; the installed-1.2 alias run exercises this contract.
const buildSessionProjection = (piSdk as unknown as {
	buildSessionProjection?: (entries: SessionEntry[]) => {
		entries: { sourceEntry: SessionEntry; messages: ReturnType<typeof sessionEntryToContextMessages> }[];
	};
}).buildSessionProjection;

it.skipIf(!buildSessionProjection)("uses the actual Pi session projection for omissions and normalized replacements", () => {
	const raw: SessionEntry[] = [
		message("u1", "user", "request"),
		message("omitted", "assistant", "abandoned attempt"),
		message("a1", "assistant", "raw answer"),
		message("sys", "system", "prompt state"),
		message("u2", "user", "keep"),
		{ type: "context_edit", id: "omit-edit", targetId: "omitted", replacement: null } as unknown as SessionEntry,
		{ type: "context_edit", id: "replace-edit", targetId: "a1", replacement: { content: "edited answer" } } as unknown as SessionEntry,
	];
	for (let index = 0; index < raw.length; index += 1) {
		raw[index] = { ...raw[index]!, parentId: raw[index - 1]?.id ?? null, timestamp: "2026-10-12T00:00:00.000Z" };
	}
	const entries = projectedContextEntries({
		buildContextEntries: () => raw,
		buildSessionProjection: () => buildSessionProjection!(raw),
	});
	expect(entries.some((entry) => entry.id === "omitted")).toBe(false);
	const candidate = getSafeBoundaryCandidates(entries).find((item) => item.firstKeptEntryId === "u2")!;
	const input = buildTargetedCompactionInput(entries, candidate, preparation());
	expect(input.messagesToSummarize.map((message) => message.role)).toEqual(["user", "assistant"]);
	expect(JSON.stringify(input.messagesToSummarize)).toContain("edited answer");
	expect(JSON.stringify(input.messagesToSummarize)).not.toMatch(/abandoned attempt|raw answer|prompt state/);
});

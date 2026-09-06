import {
	getLatestCompactionEntry,
	sessionEntryToContextMessages,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { compact } from "@earendil-works/pi-coding-agent";
import type { BoundaryCandidate } from "./turns.js";

type CompactionInput = Parameters<typeof compact>[0];

function collectFileOperations(
	entries: SessionEntry[],
	messages: Array<CompactionInput["messagesToSummarize"][number]>,
): CompactionInput["fileOps"] {
	const fileOps: CompactionInput["fileOps"] = {
		read: new Set<string>(),
		written: new Set<string>(),
		edited: new Set<string>(),
	};
	const previous = getLatestCompactionEntry(entries);
	const previousDetails = previous?.details;
	if (typeof previousDetails === "object" && previousDetails !== null) {
		const details = previousDetails as { readFiles?: unknown; modifiedFiles?: unknown };
		if (Array.isArray(details.readFiles)) {
			for (const path of details.readFiles) if (typeof path === "string") fileOps.read.add(path);
		}
		if (Array.isArray(details.modifiedFiles)) {
			for (const path of details.modifiedFiles) if (typeof path === "string") fileOps.edited.add(path);
		}
	}

	for (const message of messages) {
		if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const block of message.content) {
			if (block.type !== "toolCall" || typeof block.arguments.path !== "string") continue;
			switch (block.name) {
				case "read":
					fileOps.read.add(block.arguments.path);
					break;
				case "write":
					fileOps.written.add(block.arguments.path);
					break;
				case "edit":
					fileOps.edited.add(block.arguments.path);
					break;
			}
		}
	}

	return fileOps;
}

/** Builds the same input shape Pi's standard compactor accepts for a selected safe boundary. */
export function buildTargetedCompactionInput(
	contextEntries: SessionEntry[],
	candidate: BoundaryCandidate,
	defaultInput: CompactionInput,
): CompactionInput {
	const messagesToSummarize = candidate.entriesToSummarize.flatMap(sessionEntryToContextMessages);
	const turnPrefixMessages = candidate.turnPrefixEntries.flatMap(sessionEntryToContextMessages);
	const previousSummary = getLatestCompactionEntry(contextEntries)?.summary;
	return {
		firstKeptEntryId: candidate.firstKeptEntryId,
		messagesToSummarize,
		turnPrefixMessages,
		isSplitTurn: candidate.isSplitTurn,
		tokensBefore: defaultInput.tokensBefore,
		previousSummary,
		fileOps: collectFileOperations(contextEntries, [...messagesToSummarize, ...turnPrefixMessages]),
		settings: defaultInput.settings,
	};
}

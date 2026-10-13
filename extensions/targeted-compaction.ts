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

	const addFileOperation = (name: string, args: unknown) => {
		if (typeof args !== "object" || args === null || !("path" in args) || typeof args.path !== "string") return;
		switch (name) {
			case "read": fileOps.read.add(args.path); break;
			case "write": fileOps.written.add(args.path); break;
			case "edit": fileOps.edited.add(args.path); break;
		}
	};
	for (const message of messages) {
		if (message.role === "toolResult") {
			// Pi stores bounded nested-call metadata, not nested results, on the parent result.
			const nested = (message as typeof message & {
				nestedCalls?: { calls: readonly { name: string; arguments?: unknown }[] };
			}).nestedCalls;
			for (const call of nested?.calls ?? []) addFileOperation(call.name, call.arguments);
		} else if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === "toolCall") addFileOperation(block.name, block.arguments);
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
	// Prompt/tool state is checkpointed by Pi, not summarized as conversation.
	const conversationMessages = (entries: SessionEntry[]) => entries
		.flatMap(sessionEntryToContextMessages)
		.filter((message) => (message.role as string) !== "system");
	const messagesToSummarize = conversationMessages(candidate.entriesToSummarize);
	const turnPrefixMessages = conversationMessages(candidate.turnPrefixEntries);
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

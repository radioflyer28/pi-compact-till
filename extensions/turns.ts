import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export type BoundaryKind = "user-exchange" | "agent-checkpoint";

export interface BoundaryDetail {
	title: string;
	content: string;
}

export interface BoundaryCandidate {
	kind: BoundaryKind;
	firstKeptEntryId: string;
	selectedUserEntryId: string;
	entriesToSummarize: SessionEntry[];
	turnPrefixEntries: SessionEntry[];
	isSplitTurn: boolean;
	label: string;
	preview: string;
	detail: BoundaryDetail;
}

const PREVIEW_LIMIT = 96;

function messageRole(entry: SessionEntry): string | undefined {
	return entry.type === "message" ? entry.message.role : undefined;
}

function compactPreview(text: string, fallback: string): string {
	const normalized = text.replace(/\s+/g, " ").trim() || fallback;
	return normalized.length > PREVIEW_LIMIT ? `${normalized.slice(0, PREVIEW_LIMIT - 1)}…` : normalized;
}

function messagePreview(entry: SessionEntry): string {
	return compactPreview(messageDetailContent(entry), "(message)");
}

function messageDetailContent(entry: SessionEntry): string {
	if (entry.type !== "message") return "(message)";
	const message = entry.message;
	if (message.role !== "user" && message.role !== "assistant") return "(tool result)";
	const { content } = message;
	if (typeof content === "string") return content.trim() || `(${message.role} message)`;

	const text = content
		.filter((block): block is { type: "text"; text: string } => block.type === "text")
		.map((block) => block.text)
		.join("\n\n")
		.trim();
	const tools = content
		.filter((block) => block.type === "toolCall")
		.map((block) => block.name);
	const toolDetail = tools.length > 0 ? `Tool calls: ${tools.join(", ")}` : "";
	return [text, toolDetail].filter(Boolean).join("\n\n") || `(${message.role} message)`;
}

function messageDetail(kind: BoundaryKind, entry: SessionEntry): BoundaryDetail {
	const title = kind === "user-exchange" ? "User message to keep" : "Agent checkpoint to keep";
	return { title: `${title} [${entry.id.slice(0, 8)}]`, content: messageDetailContent(entry) };
}

function lastCompactionIndex(entries: SessionEntry[]): number {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		if (entries[index]?.type === "compaction") return index;
	}
	return -1;
}

function uncompactedStartIndex(entries: SessionEntry[]): number {
	const compactionIndex = lastCompactionIndex(entries);
	if (compactionIndex < 0) return 0;
	const compaction = entries[compactionIndex];
	if (compaction?.type !== "compaction") return compactionIndex + 1;
	const retainedIndex = entries.findIndex((entry, index) => index > compactionIndex && entry.id === compaction.firstKeptEntryId);
	return retainedIndex >= 0 ? retainedIndex : compactionIndex + 1;
}

function lastUserIndex(entries: SessionEntry[], beforeIndex: number, startIndex: number): number {
	for (let index = beforeIndex - 1; index >= startIndex; index -= 1) {
		if (messageRole(entries[index]!) === "user") return index;
	}
	return -1;
}

function label(kind: BoundaryKind, preview: string, entryId: string): string {
	const prefix = kind === "user-exchange" ? "Keep user message" : "Keep agent checkpoint";
	return `${prefix}: ${preview} [${entryId.slice(0, 8)}]`;
}

/**
 * Returns Pi-safe first-retained boundaries from the active uncompacted context.
 * User exchanges retain the next user message; agent checkpoints retain an
 * assistant message (and therefore its following tool results) with split-turn
 * context for the earlier part of that request.
 */
export function getSafeBoundaryCandidates(contextEntries: SessionEntry[]): BoundaryCandidate[] {
	const startIndex = uncompactedStartIndex(contextEntries);
	const candidates: BoundaryCandidate[] = [];

	for (let firstKeptIndex = startIndex; firstKeptIndex < contextEntries.length; firstKeptIndex += 1) {
		const firstKeptEntry = contextEntries[firstKeptIndex]!;
		const role = messageRole(firstKeptEntry);
		if (role === "user") {
			const selectedUserIndex = lastUserIndex(contextEntries, firstKeptIndex, startIndex);
			if (selectedUserIndex < startIndex) continue;
			const selectedEntries = contextEntries.slice(selectedUserIndex, firstKeptIndex);
			if (!selectedEntries.some((entry) => messageRole(entry) === "assistant")) continue;
			const selectedUser = contextEntries[selectedUserIndex]!;
			const preview = messagePreview(firstKeptEntry);
			candidates.push({
				kind: "user-exchange",
				firstKeptEntryId: firstKeptEntry.id,
				selectedUserEntryId: selectedUser.id,
				entriesToSummarize: contextEntries.slice(startIndex, firstKeptIndex),
				turnPrefixEntries: [],
				isSplitTurn: false,
				preview,
				detail: messageDetail("user-exchange", firstKeptEntry),
				label: label("user-exchange", preview, firstKeptEntry.id),
			});
			continue;
		}

		if (role !== "assistant") continue;
		const turnStartIndex = lastUserIndex(contextEntries, firstKeptIndex, startIndex);
		if (turnStartIndex < startIndex) continue;
		const turnStart = contextEntries[turnStartIndex]!;
		const preview = messagePreview(firstKeptEntry);
		candidates.push({
			kind: "agent-checkpoint",
			firstKeptEntryId: firstKeptEntry.id,
			selectedUserEntryId: turnStart.id,
			entriesToSummarize: contextEntries.slice(startIndex, turnStartIndex),
			turnPrefixEntries: contextEntries.slice(turnStartIndex, firstKeptIndex),
			isSplitTurn: true,
			preview,
			detail: messageDetail("agent-checkpoint", firstKeptEntry),
			label: label("agent-checkpoint", preview, firstKeptEntry.id),
		});
	}

	return candidates;
}

export function getEligibleTurnCandidates(contextEntries: SessionEntry[]): BoundaryCandidate[] {
	return getSafeBoundaryCandidates(contextEntries).filter((candidate) => candidate.kind === "user-exchange");
}

export function findCandidateByFirstKeptEntryId(
	contextEntries: SessionEntry[],
	firstKeptEntryId: string,
): BoundaryCandidate | undefined {
	return getSafeBoundaryCandidates(contextEntries).find((candidate) => candidate.firstKeptEntryId === firstKeptEntryId);
}

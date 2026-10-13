import {
	sessionEntryToContextMessages,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";

type ContextMessages = ReturnType<typeof sessionEntryToContextMessages>;

interface ContextEntryReader {
	buildContextEntries(): SessionEntry[];
	buildSessionProjection?(): {
		entries: { sourceEntry: SessionEntry; messages: ContextMessages }[];
	};
}

/** Preserve boundary IDs while using Pi's canonical, context-edited message content. */
export function projectedContextEntries(sessionManager: ContextEntryReader): SessionEntry[] {
	// Older Pi versions have no context edits or projection API.
	if (!sessionManager.buildSessionProjection) return sessionManager.buildContextEntries();
	const entries: SessionEntry[] = [];
	for (const { sourceEntry, messages } of sessionManager.buildSessionProjection().entries) {
		// Older compactions can lie in the retained range but contribute no checkpoint.
		if (sourceEntry.type === "compaction" && messages.length === 0) continue;
		if (sourceEntry.type === "message" || sourceEntry.type === "custom_message") {
			if (messages.length === 0) continue;
			// A boundary must map to exactly one message with its original role.
			if (messages.length !== 1) return [];
			const message = messages[0]!;
			if (sourceEntry.type === "message") {
				if (message.role !== sourceEntry.message.role) return [];
				entries.push({ ...sourceEntry, message });
			} else {
				if (message.role !== "custom") return [];
				entries.push({ ...sourceEntry, content: message.content });
			}
		} else {
			entries.push(sourceEntry);
		}
	}
	return entries;
}

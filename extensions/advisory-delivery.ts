import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const ADVISORY_START = "--- Pi compaction advisory (extension-generated; not tool output) ---";
export const ADVISORY_END = "--- End Pi compaction advisory ---";

/** Append once, before Pi persists the top-level result. No request-time history edits. */
export function registerAdvisoryDelivery(pi: ExtensionAPI, offer: (ctx: ExtensionContext) => string | undefined): void {
	pi.on("tool_result", (event, ctx) => {
		// Nested results are not transcript entries and a parent can discard them.
		// An error should remain focused on recovery rather than a new compaction offer.
		if ((event as { parentToolCallId?: string }).parentToolCallId || event.isError) return;
		const text = offer(ctx);
		if (!text) return;
		return {
			content: [...event.content, { type: "text" as const, text: `${ADVISORY_START}\n${text}\nThis is a historical offer once answered or superseded; do not act on old offer IDs.\n${ADVISORY_END}` }],
			// Pi drops structured output when content alone is replaced. The original
			// tool's machine-readable result is unchanged by our separately labeled note.
			...("structuredContent" in event ? { structuredContent: event.structuredContent } : {}),
		};
	});
}

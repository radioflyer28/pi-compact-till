import { createHmac, randomBytes } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ADVISORY_START } from "./advisory-delivery.js";

export const CACHE_DIAGNOSTIC_ENTRY = "compact-until-cache-diagnostic-v1";
const FLAG = "compact-until-cache-diagnostics";
const MAX_ITEMS = 8192;
const MAX_ATTEMPTS = 8;
type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const choice = (value: unknown, allowed: string[]) => typeof value === "string" && allowed.includes(value) ? value : undefined;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Obj)[key])}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? "undefined";
}

/** Keyed fingerprints are comparable only during this capture, not guessable plain-text hashes. */
export function createRequestInspector() {
	const key = randomBytes(32);
	const hash = (value: unknown) => createHmac("sha256", key).update(canonical(value)).digest("hex");
	let previous: { items: string[]; count: number; settings: string } | undefined;
	return (payload: unknown) => {
		const body = object(payload);
		if (!Array.isArray(body.input)) {
			previous = undefined;
			return { format: "unsupported" as const };
		}
		const { input, ...settings } = body;
		const items = input.slice(0, MAX_ITEMS).map(hash);
		const settingsFingerprint = hash(settings);
		let common = 0;
		if (previous) while (common < previous.items.length && common < items.length && previous.items[common] === items[common]) common++;
		const comparison = previous ? {
			previousInputItems: previous.count,
			commonPrefixItems: common,
			previousPrefixPreserved: previous.count > MAX_ITEMS ? null : common === previous.count,
			settingsChanged: previous.settings !== settingsFingerprint,
		} : undefined;
		previous = { items, count: input.length, settings: settingsFingerprint };
		return {
			format: "responses" as const,
			inputItems: input.length,
			fingerprintedItems: items.length,
			inputFingerprint: hash(items),
			settingsFingerprint,
			reasoningItems: input.filter((item) => object(item).type === "reasoning").length,
			userItems: input.filter((item) => object(item).role === "user").length,
			requestedReasoningContext: choice(object(body.reasoning).context, ["auto", "current_turn", "all_turns"]) ?? "unspecified-or-unknown",
			requestedReasoningEffort: choice(object(body.reasoning).effort, ["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
			cacheMode: choice(object(body.prompt_cache_options).mode, ["implicit", "explicit"]),
			comparison,
		};
	};
}

/** Observe only main-turn requests. Never modify payloads or capture raw response bodies. */
export function registerCacheDiagnostics(pi: ExtensionAPI): void {
	pi.registerFlag(FLAG, { type: "boolean", description: "Record content-free advisory/cache diagnostics in this session (default: off)" });
	// The development SDK predates raw provider events; older hosts simply never emit them.
	const on = pi.on.bind(pi) as (name: string, handler: (event: any, ctx: any) => void) => unknown;
	let inspect = createRequestInspector();
	let sessionId: string | undefined;
	let active = false;
	let advisoryPresent = false;
	let attempts: Obj[] = [];
	let attemptCount = 0;
	let current: Obj | undefined;
	let responseId: unknown;
	let started = 0;
	const enabled = () => pi.getFlag(FLAG) === true;
	function reset() {
		inspect = createRequestInspector();
		sessionId = undefined;
		active = false;
		attempts = [];
		current = undefined;
		responseId = undefined;
	}
	on("session_start", reset);
	on("session_shutdown", reset);
	on("turn_start", (_event, ctx) => {
		if (sessionId !== ctx.sessionManager.getSessionId()) reset();
		sessionId = ctx.sessionManager.getSessionId();
		active = enabled();
		advisoryPresent = false;
		attempts = [];
		attemptCount = 0;
		current = undefined;
		responseId = undefined;
		started = Date.now();
	});
	on("context_with_system", (event) => {
		if (!active) return;
		advisoryPresent = event.messages.some((message: any) =>
			(message.role === "custom" && ["compact-until-proactive-advisory", "compact-until-advisory"].includes(message.customType)) ||
			(message.role === "toolResult" && Array.isArray(message.content) && message.content.some((block: any) => block.type === "text" && block.text.startsWith(ADVISORY_START))));
	});
	on("before_provider_request", (event) => {
		if (!active || !enabled()) return;
		attemptCount++;
		responseId = undefined;
		try { current = { attempt: attemptCount, advisoryPresent, ...inspect(event.payload) }; }
		catch { current = { attempt: attemptCount, advisoryPresent, format: "inspection-failed" }; }
		attempts.push(current);
		if (attempts.length > MAX_ATTEMPTS) attempts.shift();
	});
	on("provider_stream_event", (event) => {
		if (!active || !current || !enabled()) return;
		const data = object(event.data);
		if (!["response.created", "response.completed", "response.incomplete"].includes(String(data.type))) return;
		const response = object(data.response);
		if (data.type === "response.created") responseId = response.id;
		else if (responseId !== undefined && response.id !== responseId) return;
		const mode = choice(object(response.reasoning).context, ["current_turn", "all_turns"]);
		if (mode) current.effectiveReasoningContext = mode;
	});
	on("message_end", (event, ctx) => {
		if (!active || event.message.role !== "assistant") return;
		active = false; // nested summarization/tool requests must not contaminate main-turn evidence
		if (!enabled() || sessionId !== ctx.sessionManager.getSessionId()) return;
		const usage = object(event.message.usage);
		pi.appendEntry(CACHE_DIAGNOSTIC_ENTRY, {
			version: 1,
			elapsedMs: Date.now() - started,
			attemptCount,
			attempts,
			inputTokens: number(usage.input),
			cachedTokens: number(usage.cacheRead),
			cacheWriteTokens: number(usage.cacheWrite),
			stopReason: choice(event.message.stopReason, ["stop", "length", "toolUse", "error", "aborted"]),
		});
		current = undefined;
		attempts = [];
	});
	on("turn_end", () => { active = false; current = undefined; attempts = []; });
}

// Standalone loading supports diagnosing an older installed compact-till release.
export default registerCacheDiagnostics;

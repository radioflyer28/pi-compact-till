import type { ContextUsage, SessionEntry } from "@earendil-works/pi-coding-agent";

export const DEFAULT_ADVISORY_THRESHOLD_PERCENT = 70;

export interface AdvisoryThreshold {
	percent: number;
	usedDefault: boolean;
}

export function parseAdvisoryThreshold(value: unknown): AdvisoryThreshold {
	if (typeof value !== "string" || value.trim() === "") {
		return { percent: DEFAULT_ADVISORY_THRESHOLD_PERCENT, usedDefault: value !== undefined };
	}
	const percent = Number(value);
	if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
		return { percent: DEFAULT_ADVISORY_THRESHOLD_PERCENT, usedDefault: true };
	}
	return { percent, usedDefault: false };
}

export function hasReachedAdvisoryThreshold(usage: ContextUsage | undefined, thresholdPercent: number): boolean {
	return usage?.percent !== null && usage?.percent !== undefined && usage.percent >= thresholdPercent;
}

export function compactionEpochId(entries: readonly SessionEntry[], sessionId: string): string {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type === "compaction") return `${sessionId}:${entry.id}`;
	}
	return `${sessionId}:initial`;
}

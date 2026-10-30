import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ADVISORY_START, registerAdvisoryDelivery } from "../extensions/advisory-delivery.js";

describe("advisory result transport", () => {
	it("preserves tool data and appends a separate frozen text block only once per policy offer", () => {
		let handler: any;
		const offer = vi.fn().mockReturnValueOnce("Offer B1").mockReturnValue(undefined);
		const pi = { on: (name: string, callback: any) => { expect(name).toBe("tool_result"); handler = callback; } } as unknown as ExtensionAPI;
		registerAdvisoryDelivery(pi, offer);
		const event = { content: [{ type: "image", data: "image", mimeType: "image/png" }, { type: "text", text: "original" }], structuredContent: { items: [1] }, details: { original: true }, usage: { input: 20 }, isError: false };
		const before = structuredClone(event);
		const update = handler(event, {});
		expect(update.content.slice(0, 2)).toEqual(event.content);
		expect(update.content[2].text).toContain(ADVISORY_START);
		expect(update.structuredContent).toBe(event.structuredContent);
		expect({ ...event, ...update }).toMatchObject({ details: event.details, usage: event.usage, isError: false });
		expect(event).toEqual(before);
		expect(handler(event, {})).toBeUndefined();
		expect(update.content[2].text).toContain("Offer B1");
	});
});

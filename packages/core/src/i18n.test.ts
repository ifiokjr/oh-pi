import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale, t } from "./i18n.js";

afterEach(() => setLocale("en"));

describe("t", () => {
	it("returns known en key", () => {
		expect(t("welcome.title")).toContain("oh-pi");
	});

	it("interpolates vars", () => {
		const result = t("welcome.piDetected", { version: "1.0" });
		expect(result).toContain("1.0");
	});

	it("falls back to en when zh key missing", () => {
		setLocale("zh");
		const enVal = t("welcome.title");
		expect(enVal).toBeTruthy();
		expect(enVal).not.toBe("welcome.title");
	});

	it("falls back to key string when key missing in all locales", () => {
		expect(t("nonexistent.key.xyz")).toBe("nonexistent.key.xyz");
	});

	it("setLocale/getLocale round-trip en", () => {
		setLocale("en");
		expect(getLocale()).toBe("en");
	});

	it("setLocale/getLocale round-trip zh", () => {
		setLocale("zh");
		expect(getLocale()).toBe("zh");
	});

	it("setLocale/getLocale round-trip fr", () => {
		setLocale("fr");
		expect(getLocale()).toBe("fr");
	});

	it("returns zh translation after setLocale zh", () => {
		const enResult = t("welcome.title");
		setLocale("zh");
		const zhResult = t("welcome.title");
		expect(zhResult).toContain("oh-pi");
		expect(zhResult).not.toBe(enResult);
	});

	it("interpolates multiple vars", () => {
		const result = t("welcome.envInfo", { terminal: "xterm", os: "linux", node: "v20" });
		expect(result).toContain("xterm");
		expect(result).toContain("linux");
	});

	it("returns string without vars unchanged", () => {
		expect(typeof t("cancelled")).toBe("string");
	});

	it("does not crash with empty vars", () => {
		expect(t("welcome.title", {})).toContain("oh-pi");
	});

	it("fr locale returns fr translation", () => {
		setLocale("fr");
		const result = t("welcome.title");
		expect(result).toContain("oh-pi");
	});
});

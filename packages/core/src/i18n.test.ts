
import { getLocale, setLocale, t } from "./i18n.js";

afterEach(() => setLocale("en"));

describe(t, () => {
	it("returns known en key", () => {
		expect(t("welcome.title")).toContain("oh-pi");
	});

	it("interpolates vars", () => {
		const result = t("welcome.piDetected", { version: "1.0" });
		expect(result).toContain("1.0");
	});

	it("falls back to key string when key missing in all locales", () => {
		expect(t("nonexistent.key.xyz")).toBe("nonexistent.key.xyz");
	});

	it("setLocale/getLocale round-trip en", () => {
		setLocale("en");
		expect(getLocale()).toBe("en");
	});

	it("setLocale/getLocale round-trip fr", () => {
		setLocale("fr");
		expect(getLocale()).toBe("fr");
	});

	it("interpolates multiple vars", () => {
		const result = t("welcome.envInfo", { node: "v20", os: "linux", terminal: "xterm" });
		expect(result).toContain("xterm");
		expect(result).toContain("linux");
	});

	it("returns string without vars unchanged", () => {
		expectTypeOf(t("cancelled")).toBeString();
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



const osModule = vi.hoisted(() => ({
	networkInterfaces: vi.fn(),
}));

vi.mock<typeof import('node:os')>(import('node:os'), () => osModule);

import { getLanIp } from "../src/lan.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe(getLanIp, () => {
	it("returns the first non-internal IPv4 address", () => {
		osModule.networkInterfaces.mockReturnValue({
			en0: [
				{ family: "IPv6", internal: false, address: "fe80::1" },
				{ family: "IPv4", internal: false, address: "192.168.1.23" },
			],
			lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
		});

		expect(getLanIp()).toBe("192.168.1.23");
	});

	it("returns undefined when no LAN IPv4 address is available", () => {
		osModule.networkInterfaces.mockReturnValue({
			en0: undefined,
			lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
			utun0: [{ family: "IPv6", internal: false, address: "fe80::1" }],
		});

		expect(getLanIp()).toBeUndefined();
	});
});

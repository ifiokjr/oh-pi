

const run = vi.fn();
const parseArgs = vi.fn();

vi.mock<typeof import('../index.js')>(import('../index.js'), () => ({ run }));
vi.mock<typeof import('../utils/args.js')>(import('../utils/args.js'), () => ({ parseArgs }));

describe("oh-pi bin", () => {
	beforeEach(() => {
		vi.resetModules();
		parseArgs.mockClear();
		run.mockClear();
	});

	it("parses args and runs the installer", async () => {
		parseArgs.mockReturnValue({ yes: true });
		run.mockResolvedValue();

		const originalArgv = process.argv;
		process.argv = ["node", "oh-pi", "-y"];

		await import("./oh-pi.js");

		expect(parseArgs).toHaveBeenCalledWith(["-y"]);
		expect(run).toHaveBeenCalledWith({ yes: true });

		process.argv = originalArgv;
	});
});

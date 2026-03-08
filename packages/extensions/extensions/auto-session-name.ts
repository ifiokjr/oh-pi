/**
 * oh-pi Auto Session Name Extension
 *
 * Automatically names sessions based on the first user message content.
 * If the session already has a name (e.g. from a previous run), no rename occurs.
 * The name is derived from the first 60 characters of the user's initial message.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Extension entry point — hooks into `session_start` to check for existing names
 * and `agent_end` to derive and assign a session name from the first user message.
 */
export default function (pi: ExtensionAPI) {
	/** Tracks whether this session has already been named. */
	let named = false;

	pi.on("session_start", (_event, _ctx) => {
		named = !!pi.getSessionName();
	});

	pi.on("agent_end", async (event) => {
		if (named) {
			return;
		}
		const userMsg = event.messages.find((m) => m.role === "user");
		if (!userMsg) {
			return;
		}
		const text =
			typeof userMsg.content === "string"
				? userMsg.content
				: userMsg.content
						.filter((b) => b.type === "text")
						.map((b) => (b as { text: string }).text)
						.join(" ");
		if (!text) {
			return;
		}
		const name = text.slice(0, 60).replace(/\n/g, " ").trim();
		if (name) {
			pi.setSessionName(name);
			named = true;
		}
	});
}

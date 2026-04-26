#!/usr/bin/env node

const [libraryName, query = libraryName] = process.argv.slice(2);
if (!libraryName) {
	console.error("Usage: search.js <libraryName> [query]");
	process.exit(1);
}

const res = await fetch("https://mcp.context7.com/mcp", {
	body: JSON.stringify({
		jsonrpc: "2.0",
		id: 1,
		method: "tools/call",
		params: { name: "resolve-library-id", arguments: { query, libraryName } },
	}),
	headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
	method: "POST",
});
const data = await res.json();
if (data.error) {
	console.error("Error:", data.error.message);
	process.exit(1);
}
console.log(data.result.content[0].text);

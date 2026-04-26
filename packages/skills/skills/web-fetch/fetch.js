#!/usr/bin/env node

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const args = process.argv.slice(2);
const raw = args.includes("--raw");
const url = args.find((a) => !a.startsWith("--"));

if (!url) {
	console.error("Usage: fetch.js <url> [--raw]");
	process.exit(1);
}

const res = await fetch(url);
const html = await res.text();

if (raw) {
	console.log(html);
} else {
	const text = html
		.replaceAll(/<script[\s\S]*?<\/script>/gi, "")
		.replaceAll(/<style[\s\S]*?<\/style>/gi, "")
		.replaceAll(/<[^>]+>/g, " ")
		.replaceAll(/&nbsp;/g, " ")
		.replaceAll(/&amp;/g, "&")
		.replaceAll(/&lt;/g, "<")
		.replaceAll(/&gt;/g, ">")
		.replaceAll(/&#(\d+);/g, (_, n) => String.fromCodePoint(n))
		.replaceAll(/[ \t]+/g, " ")
		.replaceAll(/\n\s*\n/g, "\n")
		.trim();
	console.log(text);
}

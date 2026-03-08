#!/usr/bin/env node

const args = process.argv.slice(2);
let n = 5, query;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-n' && args[i + 1]) { n = parseInt(args[++i], 10); }
  else { query = args[i]; }
}

if (!query) { console.error('Usage: search.js [-n count] "query"'); process.exit(1); }

const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
const html = await res.text();

const results = [];
const blockRe = /<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
let m;
while ((m = blockRe.exec(html)) && results.length < n) {
  const url = decodeURIComponent(m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '').replace(/&amp;rut=.*$/, '').replace(/&rut=.*$/, ''));
  const title = m[2].replace(/<[^>]*>/g, '').trim();
  const snippet = m[3].replace(/<[^>]*>/g, '').trim();
  results.push({ title, url, snippet });
}

if (!results.length) { console.log('No results found.'); }
else { results.forEach((r, i) => console.log(`${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}\n`)); }

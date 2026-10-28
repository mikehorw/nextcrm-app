/**
 * OKR Hub fork (OKR-172): read-only export of Capsule CRM to JSON files.
 *
 *   CAPSULE_API_TOKEN=... pnpm exec tsx scripts/okrhub/capsule-export.ts --dir <out dir>
 *
 * GET requests only. Writes parties, opportunities, entries (emails/notes),
 * tasks and kases (projects) for capsule-import.ts.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const i = args.indexOf("--dir");
const DIR = i >= 0 ? args[i + 1] : "capsule-export";
const TOKEN = process.env.CAPSULE_API_TOKEN;
if (!TOKEN) throw new Error("CAPSULE_API_TOKEN is not set");
const BASE = "https://api.capsulecrm.com/api/v2/";

async function getAll(p: string, key: string, embed?: string) {
  const items: unknown[] = [];
  for (let page = 1; ; page++) {
    const sep = p.includes("?") ? "&" : "?";
    const url = `${BASE}${p}${sep}perPage=100&page=${page}${embed ? `&embed=${embed}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
    if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown[]>;
    items.push(...(body[key] ?? []));
    if (!(res.headers.get("link") ?? "").includes('rel="next"')) return items;
  }
}

const targets: [string, string, string, string?][] = [
  ["parties", "parties", "parties", "tags,fields,organisation"],
  ["opportunities", "opportunities", "opportunities", "tags,fields,party,milestone"],
  ["kases", "kases", "kases", "tags,fields"],
  ["tasks", "tasks?status=open,completed", "tasks"],
  ["entries", "entries", "entries"],
];

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const [name, p, key, embed] of targets) {
    const data = await getAll(p, key, embed);
    fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(data, null, 1));
    console.log(`${name}: ${data.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkLinks, listPages } from "./check-links";

// Checks the assembled site (`bun run site:build`) before it is published: every internal link, asset and #anchor
// must resolve. Exits 1 with one line per broken reference, so the Pages deploy stops instead of shipping it.
const site = resolve(import.meta.dirname, "..", "..", "..", "site");

if (!existsSync(site)) {
  console.error(`No assembled site at ${site}. Run \`bun run site:build\` first.`);
  process.exit(1);
}

const problems = checkLinks(site, { origin: "https://damped.dagadev.net" });
for (const problem of problems) console.error(`${problem.page}  ->  ${problem.target}  (${problem.reason})`);
if (problems.length > 0) {
  console.error(`${problems.length} broken reference(s) in ${site}`);
  process.exit(1);
}
console.log(`${listPages(site).length} pages checked, no broken links.`);

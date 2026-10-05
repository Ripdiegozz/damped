import { expect, test } from "@playwright/test";
import { join, resolve } from "node:path";
import { checkLinks, listPages } from "../apps/docs/scripts/check-links";

// The assembled site is what Pages publishes: docs at the root, Northbook under /playground/. Every internal link
// and asset of every page must resolve to a file in it, and every #anchor to an element. No page is exempt.
const site = resolve(import.meta.dirname, "..", "site");

test("no internal link, asset or anchor of any page is broken", () => {
  const problems = checkLinks(site, { origin: "https://damped.dagadev.net" });
  const list = problems.map((problem) => `${problem.page}  ->  ${problem.target}  (${problem.reason})`);
  expect(list, `${list.length} broken reference(s) in ${join(site)}`).toEqual([]);
});

test("the crawl covers the landing page, the docs and Northbook, so an empty crawl cannot pass", () => {
  const pages = listPages(site);
  for (const expected of ["/", "/getting-started/", "/guides/demos/", "/reference/core/", "/playground/"]) expect(pages).toContain(expected);
});

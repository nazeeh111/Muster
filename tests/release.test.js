import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("browser entry and worker graphs resolve with the current release version", () => {
  const root = new URL("../", import.meta.url);
  const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const html = readFileSync(new URL("index.html", root), "utf8");
  const entry = html.match(/<script\s+type="module"\s+src="([^"]+)"/);
  assert.ok(entry, "browser module entry exists");
  const pending = [[entry[1], new URL("index.html", root)]];
  const visited = new Set();
  while (pending.length) {
    const [specifier, parent] = pending.pop();
    const target = new URL(specifier, parent);
    assert.equal(target.searchParams.get("v"), version,
      `${target.pathname} must not reuse a prior release's cached module`);
    assert.ok(target.pathname.startsWith(new URL("src/", root).pathname));
    if (visited.has(target.href)) continue;
    visited.add(target.href);
    const source = readFileSync(target, "utf8");
    for (const match of source.matchAll(/(?:\bfrom\s+|\bimport\s*)["'](\.\.?\/[^"']+)["']/g))
      pending.push([match[1], target]);
    for (const match of source.matchAll(/new URL\(["'](\.\.?\/[^"']+\.js[^"']*)["'],\s*import\.meta\.url\)/g))
      pending.push([match[1], target]);
  }
  assert.ok([...visited].some((url) => new URL(url).pathname.endsWith("/worker.js")),
    "worker entry is included in the release graph");
  assert.ok([...visited].some((url) => new URL(url).pathname.endsWith("/timed-solver.js")),
    "timed solver is reachable in the release graph");
});

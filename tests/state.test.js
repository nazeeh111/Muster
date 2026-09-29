import test from "node:test";
import assert from "node:assert/strict";
import {
  csvCell,
  assignmentsCsv,
  parseProject,
  saveModel,
} from "../src/state.js";
import { validateModel } from "../src/model.js";

test("CSV protects formula-like user names while retaining quoting and lines", () => {
  assert.equal(csvCell("=SUM(A1)"), '"\'=SUM(A1)"');
  assert.equal(csvCell(" \t@command"), '"\' \t@command"');
  assert.equal(csvCell('Ada, "A"'), '"Ada, ""A"""');
});
test("invalid imports are rejected before replacing any model", () => {
  assert.throws(
    () => parseProject('{"title":"first","title":"last"}'),
    /Duplicate/,
  );
  assert.throws(() => parseProject('{"name":1,"n\\u0061me":2}'), /Duplicate/);
  assert.throws(
    () => parseProject("[".repeat(70) + "0" + "]".repeat(70)),
    /deep/,
  );
  assert.throws(() => parseProject(" ".repeat(1048577)), /large/);
});
test("parse keeps ordinary nested values and strings untouched", () => {
  assert.deepEqual(
    parseProject('{"a":[{"b":"brace } and quote \\\""}],"c":null}'),
    { a: [{ b: 'brace } and quote "' }], c: null },
  );
});
test("storage failure returns a usable error without claiming a save", () => {
  const storage = {
    setItem() {
      throw new Error("quota");
    },
  };
  assert.equal(saveModel(storage, { title: "a" }).ok, false);
  const writes = [];
  assert.deepEqual(
    saveModel({ setItem: (...x) => writes.push(x) }, { title: "a" }),
    { ok: true },
  );
  assert.equal(JSON.parse(writes[0][1]).title, "a");
});
test("CSV includes unfilled positions and lock status", () => {
  const model = {
    roles: [{ id: "r", label: "Driver" }],
    blocks: [{ id: "b", label: "Saturday" }],
    people: [{ id: "p", name: "=Ada" }],
    positions: [
      {
        id: "x",
        label: "Delivery",
        roleId: "r",
        blockId: "b",
        lockedPersonId: "p",
      },
      { id: "y", label: "Pickup", roleId: "r", blockId: "b" },
    ],
  };
  const csv = assignmentsCsv(model, {
    assignments: [{ positionId: "x", personId: "p" }],
  });
  assert.match(csv, /'=Ada/);
  assert.match(csv, /Unfilled/);
  assert.match(csv, /Locked/);
  assert.equal(
    csv.split("\r\n")[0],
    '"Position","Block","Role","Person","Commitment"',
  );
});

test("timed CSV includes exact offset endpoints for assigned and unfilled positions", () => {
  const model = {
    format: "muster/v2",
    title: "Night rota",
    roles: [{ id: "helper", label: "Helper" }],
    blocks: [
      {
        id: "night",
        label: "Night",
        startAt: "2026-11-01T01:30-04:00",
        endAt: "2026-11-01T01:45-05:00",
      },
    ],
    people: [
      {
        id: "ada",
        name: "=Ada",
        roles: ["helper"],
        availability: ["night"],
        maxAssignments: 1,
      },
    ],
    positions: [
      {
        id: "a",
        label: "Welcome",
        blockId: "night",
        roleId: "helper",
        lockedPersonId: "ada",
      },
      { id: "b", label: "Packing", blockId: "night", roleId: "helper" },
    ],
  };
  validateModel(model);
  const rows = assignmentsCsv(model, {
    assignments: [{ positionId: "a", personId: "ada" }],
  })
    .trimEnd()
    .split("\r\n");
  assert.equal(
    rows[0],
    '"Position","Block","Role","Person","Commitment","Start","End"',
  );
  assert.equal(
    rows[1],
    '"Welcome","Night","Helper","\'=Ada","Locked","2026-11-01T01:30-04:00","2026-11-01T01:45-05:00"',
  );
  assert.equal(
    rows[2],
    '"Packing","Night","Helper","Unfilled","Proposed","2026-11-01T01:30-04:00","2026-11-01T01:45-05:00"',
  );
  assert.deepEqual(parseProject(JSON.stringify(model)), model);
});

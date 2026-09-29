import assert from "node:assert/strict";
import test from "node:test";
import { solve } from "../src/solver.js";

const role = [{ id: "r", label: "Helper" }];
const EPOCH = Date.parse("2026-09-29T00:00:00Z");
const at = (minute) => new Date(EPOCH + minute * 60_000).toISOString().slice(0, 16) + "Z";
const block = (id, startMinute, endMinute) => ({
  id, label: id, startAt: at(startMinute), endAt: at(endMinute),
});
const person = (id, availability, maxAssignments = 16) =>
  ({ id, name: id, roles: ["r"], availability, maxAssignments });
const position = (id, blockId, previousPersonId = null, lockedPersonId = null) =>
  ({ id, label: id, blockId, roleId: "r", previousPersonId, lockedPersonId });
const model = (blocks, people, positions) =>
  ({ format: "muster/v2", title: "Interval proof", roles: role, blocks, people, positions });
const tuple = (result) => [result.objective.uncovered, result.objective.changes,
  result.objective.squaredLoads];
const better = (a, b) => a.some((v, i) => v < b[i] && a.slice(0, i).every((x, j) => x === b[j]));

// Independent enumeration: no flow, no branch relaxation, no production helpers.
function enumerate(input) {
  const byBlock = new Map(input.blocks.map((b) => [b.id, {
    start: Date.parse(b.startAt), end: Date.parse(b.endAt),
  }]));
  let best = null;
  let bestAssignment = null;
  const assigned = new Map();
  const counts = new Map(input.people.map((p) => [p.id, 0]));
  function walk(i) {
    if (i === input.positions.length) {
      const score = [input.positions.length - assigned.size,
        input.positions.filter((p) => p.previousPersonId != null
          && assigned.get(p.id) !== p.previousPersonId).length,
        [...counts.values()].reduce((sum, n) => sum + n * n, 0)];
      if (!best || better(score, best)) {
        best = score;
        bestAssignment = new Map(assigned);
      }
      return;
    }
    const p = input.positions[i];
    const choices = p.lockedPersonId != null ? [p.lockedPersonId] :
      [null, ...input.people.filter((who) => who.roles.includes(p.roleId)
        && who.availability.includes(p.blockId)).map((who) => who.id)];
    for (const who of choices) {
      if (who != null) {
        const personRecord = input.people.find((x) => x.id === who);
        if (counts.get(who) >= personRecord.maxAssignments) continue;
        const a = byBlock.get(p.blockId);
        const collision = [...assigned].some(([otherId, otherWho]) => {
          if (otherWho !== who) return false;
          const other = input.positions.find((x) => x.id === otherId);
          const b = byBlock.get(other.blockId);
          return a.start < b.end && b.start < a.end;
        });
        if (collision) continue;
        assigned.set(p.id, who);
        counts.set(who, counts.get(who) + 1);
      }
      walk(i + 1);
      if (who != null) {
        counts.set(who, counts.get(who) - 1);
        assigned.delete(p.id);
      }
    }
  }
  walk(0);
  return { score: best, assignment: bestAssignment };
}

function assertFeasible(input, result) {
  const blocks = new Map(input.blocks.map((b) => [b.id, {
    start: Date.parse(b.startAt), end: Date.parse(b.endAt),
  }]));
  const positions = new Map(input.positions.map((p) => [p.id, p]));
  const byPerson = new Map(input.people.map((p) => [p.id, []]));
  for (const { positionId, personId } of result.assignments) {
    const p = positions.get(positionId);
    const who = input.people.find((x) => x.id === personId);
    assert.ok(who.roles.includes(p.roleId) && who.availability.includes(p.blockId));
    assert.ok(p.lockedPersonId == null || p.lockedPersonId === personId);
    for (const other of byPerson.get(personId)) {
      const a = blocks.get(p.blockId), b = blocks.get(other.blockId);
      assert.ok(!(a.start < b.end && b.start < a.end));
    }
    byPerson.get(personId).push(p);
  }
  for (const who of input.people) assert.ok(byPerson.get(who.id).length <= who.maxAssignments);
}

test("chain overlap preserves non-overlapping ends; no transitive grouping", () => {
  const input = model([block("a", 0, 10), block("b", 5, 15), block("c", 10, 20)],
    [person("ada", ["a", "b", "c"], 3)],
    [position("pa", "a"), position("pb", "b"), position("pc", "c")]);
  const got = solve(input);
  assert.equal(got.optimal, true);
  assert.deepEqual(tuple(got), [1, 0, 4]);
  assert.deepEqual(got.assignments.map((x) => x.positionId), ["pa", "pc"]);
  assert.deepEqual(got.shortage, { scope: "all-positions", positionIds: ["pa", "pb", "pc"],
    demand: 3, capacity: 2, deficit: 1 });
});

test("adjacent intervals are compatible", () => {
  const input = model([block("a", 0, 10), block("b", 10, 20)],
    [person("ada", ["a", "b"], 2)], [position("pa", "a"), position("pb", "b")]);
  const got = solve(input);
  assert.equal(got.optimal, true);
  assert.deepEqual(tuple(got), [0, 0, 4]);
});

test("locks on non-overlapping chain ends survive; overlapping locks reject", () => {
  const blocks = [block("a", 0, 10), block("b", 5, 15), block("c", 10, 20)];
  const people = [person("ada", ["a", "b", "c"], 3)];
  const valid = model(blocks, people, [position("pa", "a", null, "ada"),
    position("pb", "b"), position("pc", "c", null, "ada")]);
  const got = solve(valid);
  assert.deepEqual(tuple(got), [1, 0, 4]);
  assertFeasible(valid, got);
  const invalid = model(blocks, people, [position("pa", "a", null, "ada"),
    position("pb", "b", null, "ada")]);
  assert.throws(() => solve(invalid), /lock intervals overlap/);
});

test("UTC cross-day intervals use actual instants", () => {
  const input = model([
    block("late", 23 * 60 + 30, 25 * 60),
    block("early", 24 * 60 + 30, 26 * 60),
    block("after", 26 * 60, 27 * 60),
  ], [person("ada", ["late", "early", "after"], 3)],
  [position("p0", "late"), position("p1", "early"), position("p2", "after")]);
  const got = solve(input);
  assert.deepEqual(tuple(got), [1, 0, 4]);
  assertFeasible(input, got);
});

test("timeout returns only a feasible incumbent and no capacity certificate", () => {
  const input = model([block("a", 0, 10), block("b", 5, 15)],
    [person("ada", ["a", "b"], 2)], [position("pa", "a"), position("pb", "b")]);
  const got = solve(input, { budgetMs: 0 });
  assert.equal(got.optimal, false);
  assert.equal(got.shortage, null);
  assertFeasible(input, got);
});

test("size-limit timeout proposal remains feasible", () => {
  const blocks = Array.from({ length: 16 }, (_, i) => block(`b${i}`, i * 10, i * 10 + 80));
  const people = Array.from({ length: 32 }, (_, i) =>
    person(`p${i}`, blocks.map((b) => b.id), 16));
  const positions = Array.from({ length: 64 }, (_, i) =>
    position(`s${i}`, blocks[i % 16].id));
  const input = model(blocks, people, positions);
  const got = solve(input, { budgetMs: 0 });
  assert.equal(got.optimal, false);
  assert.equal(got.shortage, null);
  assertFeasible(input, got);
});

test("coverage, reference retention, and squared loads remain lexicographic", () => {
  const blocks = [block("a", 0, 10), block("b", 10, 20), block("cross", 5, 15)];
  const people = [person("ada", ["a", "b", "cross"], 2),
    person("bea", ["a", "b", "cross"], 2)];
  const reference = model(blocks, people,
    [position("pa", "a", "ada"), position("pb", "b", "ada")]);
  const kept = solve(reference);
  assert.equal(kept.optimal, true);
  assert.deepEqual(tuple(kept), [0, 0, 4]); // Beats 1/1 loads with one change.
  const expanded = model(blocks, people,
    [position("pa", "a", "ada"), position("px", "cross", "ada")]);
  const covered = solve(expanded);
  assert.deepEqual(tuple(covered), [0, 1, 2]); // Both fill despite one reference change.
  const fresh = model(blocks, people,
    [position("pa", "a"), position("pb", "b")]);
  assert.deepEqual(tuple(solve(fresh)), [0, 0, 2]);
});

test("seeded small cases match independent exhaustive objective", () => {
  let state = 57291;
  const next = (n) => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) % n;
  for (let trial = 0; trial < 120; trial++) {
    const blockCount = 3 + next(3);
    const blocks = Array.from({ length: blockCount }, (_, i) => {
      const start = next(8) * 5;
      return block(`b${i}`, start, start + 5 + next(4) * 5);
    });
    const people = Array.from({ length: 2 + next(2) }, (_, i) =>
      person(`p${i}`, blocks.filter(() => next(3) !== 0).map((b) => b.id), next(4)));
    const positions = Array.from({ length: 3 + next(4) }, (_, i) =>
      position(`s${i}`, blocks[next(blocks.length)].id,
        next(3) === 0 ? people[next(people.length)].id : null));
    // At most one valid fixed commitment, chosen before solving.
    if (next(3) === 0) {
      const chosen = positions[next(positions.length)];
      const possible = people.filter((p) => p.maxAssignments > 0
        && p.availability.includes(chosen.blockId));
      if (possible.length) chosen.lockedPersonId = possible[next(possible.length)].id;
    }
    const input = model(blocks, people, positions);
    const expected = enumerate(input);
    const got = solve(input, { budgetMs: 2000 });
    assert.equal(got.optimal, true, `trial ${trial}`);
    assert.deepEqual(tuple(got), expected.score, `trial ${trial}`);
    assertFeasible(input, got);
    if (got.shortage) {
      if (got.shortage.scope === "all-positions")
        assert.equal(got.shortage.capacity, positions.length - expected.score[0], `trial ${trial}`);
      else {
        assert.ok(got.shortage.capacity < got.shortage.demand, `trial ${trial}`);
        assert.equal(got.shortage.deficit, got.shortage.demand - got.shortage.capacity);
      }
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModel } from '../src/model.js';
import { solve } from '../src/solver.js';

function fixture() {
  return {
    format: 'muster/v1', title: 'Food drive',
    roles: [{ id: 'driver', label: 'Driver' }],
    blocks: [{ id: 'morning', label: 'Morning' }],
    people: [{ id: 'ada', name: 'Ada', roles: ['driver'], availability: ['morning'], maxAssignments: 1 }],
    positions: [{ id: 'van', label: 'Van', blockId: 'morning', roleId: 'driver' }],
  };
}

test('valid model is returned intact; unknown fields and bad references are rejected', () => {
  const input = fixture();
  assert.equal(validateModel(input), input);
  assert.throws(() => validateModel({ ...input, ignoredConstraint: true }), /unknown|field/i);
  assert.throws(() => validateModel({ ...input, positions: [{ ...input.positions[0], roleId: 'unknown' }] }), /role/i);
  assert.throws(() => validateModel({ ...input, people: [{ ...input.people[0], maxAssignments: 17 }] }), /maxAssignments/i);
});

test('locks cannot share a person and block or exceed total capacity', () => {
  const input = fixture();
  input.positions.push({ id: 'desk', label: 'Desk', blockId: 'morning', roleId: 'driver' });
  input.positions[0].lockedPersonId = 'ada';
  input.positions[1].lockedPersonId = 'ada';
  assert.throws(() => validateModel(input), /lock|block/i);
  input.positions[1].lockedPersonId = null;
  assert.equal(validateModel(input), input);
  input.blocks.push({ id: 'evening', label: 'Evening' });
  input.people[0].availability.push('evening');
  input.positions[1].blockId = 'evening';
  input.positions[1].lockedPersonId = 'ada';
  assert.throws(() => validateModel(input), /lock|maxAssignments/i);
});

test('simultaneous demand has a certified one-person block bottleneck despite total cap two', () => {
  const input = fixture();
  input.people[0].maxAssignments = 2;
  input.positions.push({ id: 'desk', label: 'Desk', blockId: 'morning', roleId: 'driver' });
  const result = solve(input);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.unfilled.length, 1);
  assert.equal(result.shortage.demand, 2);
  assert.equal(result.shortage.capacity, 1);
  assert.equal(result.shortage.deficit, 1);
  assert.deepEqual(result.shortage.positionIds, ['van', 'desk']);
  assert.ok(result.shortage.limits.some(limit => limit.kind === 'person-block' && limit.personId === 'ada'));
});

test('coverage precedes prior preservation, which precedes squared-load fairness', () => {
  const input = fixture();
  input.blocks.push({ id: 'evening', label: 'Evening' });
  input.positions.push({ id: 'desk', label: 'Desk', blockId: 'evening', roleId: 'driver', previousPersonId: 'ada' });
  input.positions[0].previousPersonId = 'ada';
  input.people[0].availability.push('evening');
  input.people[0].maxAssignments = 2;
  input.people.push({ id: 'bea', name: 'Bea', roles: ['driver'], availability: ['morning', 'evening'], maxAssignments: 2 });
  const kept = solve(input);
  assert.deepEqual(kept.objective, { uncovered: 0, changes: 0, squaredLoads: 4 });
  assert.deepEqual(kept.assignments.map(x => x.personId), ['ada', 'ada']);
  for (const position of input.positions) delete position.previousPersonId;
  const balanced = solve(input);
  assert.deepEqual(balanced.objective, { uncovered: 0, changes: 0, squaredLoads: 2 });
  assert.deepEqual(balanced.loads.map(x => x.count), [1, 1]);
});

test('a cancellation changes prior assignment while preserving a locked position', () => {
  const input = fixture();
  input.blocks.push({ id: 'evening', label: 'Evening' });
  input.people.push({ id: 'bea', name: 'Bea', roles: ['driver'], availability: ['evening'], maxAssignments: 1 });
  input.positions[0].lockedPersonId = 'ada';
  input.positions[0].previousPersonId = 'ada';
  input.positions.push({ id: 'desk', label: 'Desk', blockId: 'evening', roleId: 'driver', previousPersonId: 'ada' });
  const result = solve(input);
  assert.deepEqual(result.assignments, [{ positionId: 'van', personId: 'ada' }, { positionId: 'desk', personId: 'bea' }]);
  assert.deepEqual(result.changes, [{ positionId: 'desk', before: 'ada', after: 'bea' }]);
  assert.deepEqual(result.objective, { uncovered: 0, changes: 1, squaredLoads: 2 });
});

function exhaustive(input, selected = input.positions.map(p => p.id)) {
  const byId = new Map(input.people.map(p => [p.id, p]));
  const selectedSet = new Set(selected);
  const fixed = input.positions.filter(p => p.lockedPersonId && !selectedSet.has(p.id));
  const considered = input.positions.filter(p => selectedSet.has(p.id));
  let best = null;
  function walk(index, assigned) {
    if (index === considered.length) {
      const entire = [...fixed.map(p => [p, p.lockedPersonId]), ...assigned];
      const loads = input.people.map(person => entire.filter(([, id]) => id === person.id).length);
      if (loads.some((count, i) => count > input.people[i].maxAssignments)) return;
      for (const person of input.people) {
        for (const block of input.blocks) {
          if (entire.filter(([p, id]) => id === person.id && p.blockId === block.id).length > 1) return;
        }
      }
      const score = [considered.filter(p => !assigned.find(([q, id]) => q.id === p.id && id)).length,
        considered.filter(p => p.previousPersonId && assigned.find(([q]) => q.id === p.id)?.[1] !== p.previousPersonId).length,
        loads.reduce((sum, n) => sum + n * n, 0)];
      if (!best || score.some((v, i) => v < best[i] && score.slice(0, i).every((x, j) => x === best[j]))) best = score;
      return;
    }
    const position = considered[index];
    const options = position.lockedPersonId ? [position.lockedPersonId] : [null, ...input.people.filter(person => person.roles.includes(position.roleId) && person.availability.includes(position.blockId)).map(person => person.id)];
    for (const id of options) walk(index + 1, [...assigned, [position, id]]);
  }
  walk(0, []);
  return best;
}

test('seeded tiny cases match independent enumeration for objective and shortage subset capacity', () => {
  let state = 48711;
  const next = n => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) % n);
  for (let trial = 0; trial < 90; trial++) {
    const input = fixture();
    input.blocks.push({ id: 'evening', label: 'Evening' });
    input.people = ['ada', 'bea', 'cy'].map(id => ({ id, name: id, roles: ['driver'], availability: ['morning', 'evening'].filter(() => next(2)), maxAssignments: next(4) }));
    input.positions = [0, 1, 2, 3].map(i => ({ id: `slot${i}`, label: `Slot ${i}`, blockId: i < 2 ? 'morning' : 'evening', roleId: 'driver', ...(next(3) === 0 ? { previousPersonId: input.people[next(3)].id } : {}) }));
    if (next(3) === 0) {
      const position = input.positions[next(4)];
      const possible = input.people.filter(person => person.maxAssignments > 0 && person.availability.includes(position.blockId));
      if (possible.length) position.lockedPersonId = possible[next(possible.length)].id;
    }
    const got = solve(input);
    assert.deepEqual([got.objective.uncovered, got.objective.changes, got.objective.squaredLoads], exhaustive(input), `trial ${trial}`);
    if (got.shortage) {
      const want = exhaustive(input, got.shortage.positionIds);
      assert.equal(got.shortage.capacity, got.shortage.demand - want[0], `shortage trial ${trial}`);
      assert.ok(got.shortage.capacity < got.shortage.demand);
    }
  }
});

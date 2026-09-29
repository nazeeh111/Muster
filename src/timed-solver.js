// Exact interval search with a flow relaxation. All times are parsed UTC instants.
import { overlaps } from "./time.js?v=0.2.0";

const key = (positionId, personId) => `${positionId}\0${personId}`;
const compare = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

function edge(graph, from, to, capacity, cost = 0) {
  const forward = { to, reverse: graph[to].length, capacity, cost };
  const backward = { to: from, reverse: graph[from].length, capacity: 0, cost: -cost };
  graph[from].push(forward);
  graph[to].push(backward);
  return forward;
}

function relaxed(input, forbidden) {
  const open = input.positions.filter((p) => p.lockedPersonId == null);
  const n = open.length;
  const people = input.people;
  const sink = 1 + n + people.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const personNodes = new Map(people.map((p, i) => [p.id, 1 + n + i]));
  const byPerson = new Map(people.map((p) => [p.id, 0]));
  const assigned = new Map();
  for (const position of input.positions) {
    if (position.lockedPersonId == null) continue;
    assigned.set(position.id, position.lockedPersonId);
    byPerson.set(position.lockedPersonId, byPerson.get(position.lockedPersonId) + 1);
  }
  const assignmentEdges = new Map();
  const big = input.positions.length ** 2 + 1;
  for (const [i, position] of open.entries()) {
    const node = 1 + i;
    edge(graph, 0, node, 1);
    for (const person of people) {
      if (forbidden.has(key(position.id, person.id))
          || !person.roles.includes(position.roleId)
          || !person.availability.includes(position.blockId)) continue;
      const reward = position.previousPersonId === person.id ? -big : 0;
      assignmentEdges.set(key(position.id, person.id),
        edge(graph, node, personNodes.get(person.id), 1, reward));
    }
  }
  for (const person of people) {
    const prior = byPerson.get(person.id);
    for (let k = prior + 1; k <= person.maxAssignments; k++)
      edge(graph, personNodes.get(person.id), sink, 1, 2 * k - 1);
  }
  // The initial positive-capacity graph is topologically layered.
  const potential = Array(graph.length).fill(Infinity);
  potential[0] = 0;
  for (let u = 0; u < graph.length; u++) {
    if (potential[u] === Infinity) continue;
    for (const e of graph[u]) if (e.capacity)
      potential[e.to] = Math.min(potential[e.to], potential[u] + e.cost);
  }
  for (let i = 0; i < potential.length; i++) if (potential[i] === Infinity) potential[i] = 0;
  while (true) {
    const dist = Array(graph.length).fill(Infinity);
    const previous = Array(graph.length).fill(null);
    const used = Array(graph.length).fill(false);
    dist[0] = 0;
    for (let step = 0; step < graph.length; step++) {
      let u = -1;
      for (let v = 0; v < graph.length; v++)
        if (!used[v] && (u < 0 || dist[v] < dist[u])) u = v;
      if (u < 0 || dist[u] === Infinity) break;
      used[u] = true;
      for (const [index, e] of graph[u].entries()) {
        if (!e.capacity) continue;
        const next = dist[u] + e.cost + potential[u] - potential[e.to];
        if (next < dist[e.to]) {
          dist[e.to] = next;
          previous[e.to] = [u, index];
        }
      }
    }
    if (previous[sink] == null) break;
    for (let v = 0; v < graph.length; v++) if (dist[v] < Infinity) potential[v] += dist[v];
    for (let v = sink; v !== 0;) {
      const [u, index] = previous[v];
      const e = graph[u][index];
      e.capacity--;
      graph[v][e.reverse].capacity++;
      v = u;
    }
  }
  for (const position of open) {
    for (const person of people) {
      if (assignmentEdges.get(key(position.id, person.id))?.capacity === 0) {
        assigned.set(position.id, person.id);
        break;
      }
    }
  }
  return assigned;
}

function score(input, assigned) {
  const loads = new Map(input.people.map((p) => [p.id, 0]));
  for (const who of assigned.values()) loads.set(who, loads.get(who) + 1);
  return [
    input.positions.length - assigned.size,
    input.positions.filter((p) => p.previousPersonId != null
      && assigned.get(p.id) !== p.previousPersonId).length,
    [...loads.values()].reduce((sum, n) => sum + n * n, 0),
  ];
}

function firstConflict(input, blocks, assigned) {
  const positions = input.positions.filter((p) => assigned.has(p.id));
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i];
    for (let j = i + 1; j < positions.length; j++) {
      const b = positions[j];
      if (assigned.get(a.id) === assigned.get(b.id)
          && overlaps(blocks.get(a.blockId), blocks.get(b.blockId)))
        return [a, b, assigned.get(a.id)];
    }
  }
  return null;
}

function staticOverlapDeficit(input, blocks) {
  // At any instant each eligible person can fill at most one active position.
  // Union size is optimistic when qualifications are restrictive, hence safe.
  let deficit = 0;
  for (const instant of new Set([...blocks.values()].map((b) => b.start))) {
    const active = input.positions.filter((p) => {
      const b = blocks.get(p.blockId);
      return b.start <= instant && instant < b.end;
    });
    const candidates = new Set();
    for (const p of active) for (const who of input.people)
      if (who.roles.includes(p.roleId) && who.availability.includes(p.blockId))
        candidates.add(who.id);
    deficit = Math.max(deficit, active.length - candidates.size);
  }
  return Math.max(0, deficit);
}

function idealSquaredLoads(assignmentCount, peopleCount) {
  if (!peopleCount) return 0;
  const q = Math.floor(assignmentCount / peopleCount);
  const r = assignmentCount % peopleCount;
  return r * (q + 1) ** 2 + (peopleCount - r) * q ** 2;
}

function staticReferenceChangeFloor(input, blocks) {
  const referenced = input.positions.filter((p) => p.previousPersonId != null);
  let retainable = 0;
  for (const who of input.people) {
    const options = referenced.filter((p) => p.previousPersonId === who.id
      && who.roles.includes(p.roleId) && who.availability.includes(p.blockId))
      .sort((a, b) => blocks.get(a.blockId).end - blocks.get(b.blockId).end);
    let lastEnd = -Infinity;
    let count = 0;
    for (const p of options) {
      const interval = blocks.get(p.blockId);
      if (interval.start < lastEnd) continue;
      lastEnd = interval.end;
      count++;
      if (count === who.maxAssignments) break;
    }
    retainable += Math.min(count, who.maxAssignments);
  }
  return referenced.length - retainable;
}

function greedyIncumbent(input, blocks) {
  const assigned = new Map(input.positions.filter((p) => p.lockedPersonId != null)
    .map((p) => [p.id, p.lockedPersonId]));
  const loads = new Map(input.people.map((p) => [p.id, 0]));
  for (const who of assigned.values()) loads.set(who, loads.get(who) + 1);
  const eligible = (p) => input.people.filter((who) => who.roles.includes(p.roleId)
    && who.availability.includes(p.blockId));
  const open = input.positions.filter((p) => p.lockedPersonId == null)
    .map((p, index) => ({ p, index, options: eligible(p) }))
    .sort((a, b) => a.options.length - b.options.length || a.index - b.index);
  for (const { p, options } of open) {
    const ordered = [...options].sort((a, b) =>
      Number(b.id === p.previousPersonId) - Number(a.id === p.previousPersonId)
      || loads.get(a.id) - loads.get(b.id));
    for (const who of ordered) {
      if (loads.get(who.id) >= who.maxAssignments) continue;
      const conflict = input.positions.some((other) => assigned.get(other.id) === who.id
        && overlaps(blocks.get(p.blockId), blocks.get(other.blockId)));
      if (conflict) continue;
      assigned.set(p.id, who.id);
      loads.set(who.id, loads.get(who.id) + 1);
      break;
    }
  }
  return assigned;
}

function format(input, assigned, tuple, optimal) {
  const assignments = input.positions.filter((p) => assigned.has(p.id))
    .map((p) => ({ positionId: p.id, personId: assigned.get(p.id) }));
  const loads = input.people.map((person) => ({
    personId: person.id,
    count: assignments.filter((assignment) => assignment.personId === person.id).length,
  }));
  const changes = input.positions
    .filter((p) => (p.previousPersonId ?? null) !== (assigned.get(p.id) ?? null))
    .map((p) => ({ positionId: p.id, before: p.previousPersonId ?? null,
      after: assigned.get(p.id) ?? null }));
  const shortage = optimal && tuple[0] > 0 ? {
    scope: "all-positions",
    positionIds: input.positions.map((p) => p.id),
    demand: input.positions.length,
    capacity: input.positions.length - tuple[0],
    deficit: tuple[0],
  } : null;
  return {
    optimal,
    assignments,
    unfilled: input.positions.filter((p) => !assigned.has(p.id)).map((p) => p.id),
    loads,
    changes,
    objective: { uncovered: tuple[0], changes: tuple[1], squaredLoads: tuple[2] },
    shortage,
  };
}

export function solveTimed(input, blocks, { budgetMs = 6500, now = () => performance.now() } = {}) {
  const start = now();
  const globalUncoveredLower = staticOverlapDeficit(input, blocks);
  const globalChangesLower = staticReferenceChangeFloor(input, blocks);
  let best = greedyIncumbent(input, blocks);
  let bestTuple = score(input, best);
  let timedOut = false;
  const seen = new Set();
  const visit = (forbidden) => {
    if (timedOut) return;
    if (now() - start >= budgetMs) { timedOut = true; return; }
    const signature = [...forbidden].sort().join("|");
    if (seen.has(signature)) return;
    seen.add(signature);
    const proposal = relaxed(input, forbidden);
    const relaxedTuple = score(input, proposal);
    const lowerUncovered = Math.max(relaxedTuple[0], globalUncoveredLower);
    const lowerChanges = lowerUncovered === relaxedTuple[0]
      ? Math.max(relaxedTuple[1], globalChangesLower) : globalChangesLower;
    const lowerSquared = lowerUncovered === relaxedTuple[0]
      && lowerChanges === relaxedTuple[1]
      ? relaxedTuple[2]
      : idealSquaredLoads(input.positions.length - lowerUncovered, input.people.length);
    const lower = [lowerUncovered, lowerChanges, lowerSquared];
    if (compare(lower, bestTuple) >= 0) return;
    const conflict = firstConflict(input, blocks, proposal);
    if (!conflict) {
      best = proposal;
      bestTuple = relaxedTuple;
      return;
    }
    const [a, b, who] = conflict;
    for (const position of [a, b]) {
      if (position.lockedPersonId != null) continue;
      const child = new Set(forbidden);
      child.add(key(position.id, who));
      visit(child);
      if (timedOut) break;
    }
  };
  visit(new Set());
  return format(input, best, bestTuple, !timedOut);
}

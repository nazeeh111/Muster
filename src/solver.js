import { validateModel } from "./model.js";

function edge(graph, from, to, capacity, cost = 0) {
  const forward = { to, reverse: graph[to].length, capacity, cost };
  const backward = {
    to: from,
    reverse: graph[from].length,
    capacity: 0,
    cost: -cost,
  };
  graph[from].push(forward);
  graph[to].push(backward);
  return forward;
}

function lockedState(input) {
  const loads = new Map(input.people.map((person) => [person.id, 0]));
  const blocks = new Set();
  for (const position of input.positions) {
    if (position.lockedPersonId == null) continue;
    loads.set(position.lockedPersonId, loads.get(position.lockedPersonId) + 1);
    blocks.add(`${position.lockedPersonId}\0${position.blockId}`);
  }
  return { loads, blocks };
}

function eligible(person, position) {
  return (
    person.roles.includes(position.roleId) &&
    person.availability.includes(position.blockId)
  );
}

function network(input, selectedPositions, state, costed) {
  const pairKeys = [];
  const pairSet = new Set();
  for (const position of selectedPositions) {
    for (const person of input.people) {
      if (!eligible(person, position)) continue;
      const key = `${person.id}\0${position.blockId}`;
      if (!pairSet.has(key)) {
        pairSet.add(key);
        pairKeys.push(key);
      }
    }
  }
  const positionNodes = new Map(
    selectedPositions.map((position, i) => [position.id, i + 1]),
  );
  const pairNodes = new Map(
    pairKeys.map((key, i) => [key, selectedPositions.length + i + 1]),
  );
  const personNodes = new Map(
    input.people.map((person, i) => [
      person.id,
      selectedPositions.length + pairKeys.length + i + 1,
    ]),
  );
  const sink =
    1 + selectedPositions.length + pairKeys.length + input.people.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const assignmentEdges = new Map();
  const big = input.positions.length ** 2 + 1;
  for (const position of selectedPositions) {
    const from = positionNodes.get(position.id);
    edge(graph, 0, from, 1);
    for (const person of input.people) {
      if (!eligible(person, position)) continue;
      const key = `${person.id}\0${position.blockId}`;
      const reward =
        costed && position.previousPersonId === person.id ? -big : 0;
      const candidate = edge(graph, from, pairNodes.get(key), 1, reward);
      assignmentEdges.set(`${position.id}\0${person.id}`, candidate);
    }
  }
  for (const key of pairKeys) {
    const [personId] = key.split("\0");
    edge(
      graph,
      pairNodes.get(key),
      personNodes.get(personId),
      state.blocks.has(key) ? 0 : 1,
    );
  }
  for (const person of input.people) {
    const prior = state.loads.get(person.id);
    for (let k = 1; k <= person.maxAssignments - prior; k++) {
      const newLoad = prior + k;
      edge(
        graph,
        personNodes.get(person.id),
        sink,
        1,
        costed ? 2 * newLoad - 1 : 0,
      );
    }
  }
  return { graph, sink, positionNodes, assignmentEdges };
}

function initialPotential(graph) {
  const dist = Array(graph.length).fill(Infinity);
  dist[0] = 0;
  // The initial forward network is layered and acyclic; later residual
  // networks are handled by reduced-cost Dijkstra.
  for (let u = 0; u < graph.length; u++) {
    if (dist[u] === Infinity) continue;
    for (const item of graph[u]) {
      if (item.capacity > 0)
        dist[item.to] = Math.min(dist[item.to], dist[u] + item.cost);
    }
  }
  return dist.map((value) => (value === Infinity ? 0 : value));
}

function push(heap, item) {
  let i = heap.length;
  heap.push(item);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent][0] <= item[0]) break;
    heap[i] = heap[parent];
    i = parent;
  }
  heap[i] = item;
}

function pop(heap) {
  const result = heap[0];
  const tail = heap.pop();
  if (!heap.length) return result;
  let i = 0;
  while (true) {
    const left = 2 * i + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child =
      right < heap.length && heap[right][0] < heap[left][0] ? right : left;
    if (heap[child][0] >= tail[0]) break;
    heap[i] = heap[child];
    i = child;
  }
  heap[i] = tail;
  return result;
}

function minCostMaxFlow(net) {
  const { graph, sink } = net;
  const potential = initialPotential(graph);
  let flow = 0;
  while (true) {
    const dist = Array(graph.length).fill(Infinity);
    const previous = Array(graph.length).fill(null);
    const heap = [];
    dist[0] = 0;
    push(heap, [0, 0]);
    while (heap.length) {
      const [current, u] = pop(heap);
      if (current !== dist[u]) continue;
      for (const [index, item] of graph[u].entries()) {
        if (!item.capacity) continue;
        const next = current + item.cost + potential[u] - potential[item.to];
        if (next >= dist[item.to]) continue;
        dist[item.to] = next;
        previous[item.to] = [u, index];
        push(heap, [next, item.to]);
      }
    }
    if (previous[sink] === null) break;
    for (let i = 0; i < graph.length; i++)
      if (dist[i] < Infinity) potential[i] += dist[i];
    for (let v = sink; v !== 0; ) {
      const [u, index] = previous[v];
      const item = graph[u][index];
      item.capacity -= 1;
      graph[v][item.reverse].capacity += 1;
      v = u;
    }
    flow++;
  }
  return flow;
}

function reach(graph) {
  const seen = new Set([0]);
  const queue = [0];
  for (let head = 0; head < queue.length; head++) {
    for (const item of graph[queue[head]]) {
      if (!item.capacity || seen.has(item.to)) continue;
      seen.add(item.to);
      queue.push(item.to);
    }
  }
  return seen;
}

function subsetCapacity(input, selected, state) {
  const net = network(input, selected, state, false);
  let flow = 0;
  while (true) {
    const previous = Array(net.graph.length).fill(null);
    const queue = [0];
    previous[0] = [-1, -1];
    for (
      let head = 0;
      head < queue.length && previous[net.sink] === null;
      head++
    ) {
      const u = queue[head];
      for (const [index, item] of net.graph[u].entries()) {
        if (item.capacity && previous[item.to] === null) {
          previous[item.to] = [u, index];
          queue.push(item.to);
        }
      }
    }
    if (previous[net.sink] === null) break;
    for (let v = net.sink; v !== 0; ) {
      const [u, index] = previous[v];
      const item = net.graph[u][index];
      item.capacity--;
      net.graph[v][item.reverse].capacity++;
      v = u;
    }
    flow++;
  }
  return flow;
}

function explainShortage(input, selected, state) {
  const positionIds = selected.map((position) => position.id);
  const candidatePeople = input.people.filter((person) =>
    selected.some((position) => eligible(person, position)),
  );
  const personIds = candidatePeople.map((person) => person.id);
  const limits = [];
  for (const person of candidatePeople) {
    limits.push({
      kind: "person-total",
      personId: person.id,
      maximum: person.maxAssignments,
      lockedUsed: state.loads.get(person.id),
      remaining: person.maxAssignments - state.loads.get(person.id),
    });
    for (const block of input.blocks) {
      if (
        !selected.some(
          (position) =>
            position.blockId === block.id && eligible(person, position),
        )
      )
        continue;
      const lockedUsed = state.blocks.has(`${person.id}\0${block.id}`) ? 1 : 0;
      limits.push({
        kind: "person-block",
        personId: person.id,
        blockId: block.id,
        maximum: 1,
        lockedUsed,
        remaining: 1 - lockedUsed,
      });
    }
  }
  const capacity = subsetCapacity(input, selected, state);
  return {
    positionIds,
    personIds,
    demand: selected.length,
    capacity,
    deficit: selected.length - capacity,
    limits,
  };
}

export function solve(input) {
  validateModel(input);
  const state = lockedState(input);
  const open = input.positions.filter(
    (position) => position.lockedPersonId == null,
  );
  const net = network(input, open, state, true);
  const flow = minCostMaxFlow(net);
  const assigned = new Map(
    input.positions
      .filter((position) => position.lockedPersonId != null)
      .map((position) => [position.id, position.lockedPersonId]),
  );
  for (const position of open) {
    for (const person of input.people) {
      if (
        net.assignmentEdges.get(`${position.id}\0${person.id}`)?.capacity === 0
      ) {
        assigned.set(position.id, person.id);
        break;
      }
    }
  }
  const assignments = input.positions
    .filter((position) => assigned.has(position.id))
    .map((position) => ({
      positionId: position.id,
      personId: assigned.get(position.id),
    }));
  const unfilled = input.positions
    .filter((position) => !assigned.has(position.id))
    .map((position) => position.id);
  const loads = input.people.map((person) => ({
    personId: person.id,
    count: assignments.filter((assignment) => assignment.personId === person.id)
      .length,
  }));
  const changes = input.positions
    .filter(
      (position) =>
        (position.previousPersonId ?? null) !==
        (assigned.get(position.id) ?? null),
    )
    .map((position) => ({
      positionId: position.id,
      before: position.previousPersonId ?? null,
      after: assigned.get(position.id) ?? null,
    }));
  const objective = {
    uncovered: unfilled.length,
    changes: changes.filter((change) => change.before !== null).length,
    squaredLoads: loads.reduce((sum, load) => sum + load.count ** 2, 0),
  };
  let shortage = null;
  if (flow < open.length) {
    const reachable = reach(net.graph);
    const selected = open.filter((position) =>
      reachable.has(net.positionNodes.get(position.id)),
    );
    shortage = explainShortage(input, selected, state);
    if (shortage.deficit <= 0)
      throw new Error("internal error: shortage witness is not deficient");
  }
  return { assignments, unfilled, loads, changes, objective, shortage };
}

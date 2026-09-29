import { overlaps, parseTimestamp } from "./time.js?v=0.2.0";

const ID = /^[a-z][a-z0-9_-]{0,39}$/;
const MAX_BYTES = 1024 * 1024;

function fail(path, reason) {
  throw new Error(`${path}: ${reason}`);
}
function object(value, path, allowed) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    fail(path, "expected object");
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(`${path}.${key}`, "unknown field");
}
function list(value, path, max, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    fail(path, `expected ${min}..${max} items`);
}
function id(value, path) {
  if (typeof value !== "string" || !ID.test(value)) fail(path, "invalid ID");
}
function text(value, path) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    [...value].length > 120 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(path, "expected 1..120 visible characters");
}
function uniqueObjects(items, path) {
  const ids = new Set();
  for (const [i, item] of items.entries()) {
    if (ids.has(item.id)) fail(`${path}[${i}].id`, "duplicate ID");
    ids.add(item.id);
  }
  return ids;
}
function refs(value, path, valid, max) {
  list(value, path, max);
  const seen = new Set();
  for (const [i, item] of value.entries()) {
    id(item, `${path}[${i}]`);
    if (!valid.has(item)) fail(`${path}[${i}]`, "unknown reference");
    if (seen.has(item)) fail(`${path}[${i}]`, "duplicate reference");
    seen.add(item);
  }
}

export function validateModel(input) {
  object(input, "model", [
    "format",
    "title",
    "roles",
    "blocks",
    "people",
    "positions",
  ]);
  let serialized;
  try {
    serialized = JSON.stringify(input);
  } catch {
    fail("model", "must be serializable JSON");
  }
  if (
    typeof serialized !== "string" ||
    new TextEncoder().encode(serialized).length > MAX_BYTES
  )
    fail("model", "serialized input exceeds 1 MiB");
  if (input.format !== "muster/v1" && input.format !== "muster/v2")
    fail("format", "expected muster/v1 or muster/v2");
  const timed = input.format === "muster/v2";
  text(input.title, "title");
  list(input.roles, "roles", 12, 1);
  list(input.blocks, "blocks", 16, 1);
  list(input.people, "people", 32);
  list(input.positions, "positions", 64);
  for (const [i, role] of input.roles.entries()) {
    object(role, `roles[${i}]`, ["id", "label"]);
    id(role.id, `roles[${i}].id`);
    text(role.label, `roles[${i}].label`);
  }
  const intervals = new Map();
  for (const [i, block] of input.blocks.entries()) {
    object(
      block,
      `blocks[${i}]`,
      timed ? ["id", "label", "startAt", "endAt"] : ["id", "label"],
    );
    id(block.id, `blocks[${i}].id`);
    text(block.label, `blocks[${i}].label`);
    if (timed) {
      let start, end;
      try {
        start = parseTimestamp(block.startAt);
      } catch (error) {
        fail(`blocks[${i}].startAt`, error.message);
      }
      try {
        end = parseTimestamp(block.endAt);
      } catch (error) {
        fail(`blocks[${i}].endAt`, error.message);
      }
      if (end <= start) fail(`blocks[${i}].endAt`, "must be after startAt");
      intervals.set(block.id, { start, end });
    }
  }
  const roleIds = uniqueObjects(input.roles, "roles");
  const blockIds = uniqueObjects(input.blocks, "blocks");
  for (const [i, person] of input.people.entries()) {
    const path = `people[${i}]`;
    object(person, path, [
      "id",
      "name",
      "roles",
      "availability",
      "maxAssignments",
    ]);
    id(person.id, `${path}.id`);
    text(person.name, `${path}.name`);
    refs(person.roles, `${path}.roles`, roleIds, 12);
    refs(person.availability, `${path}.availability`, blockIds, 16);
    if (
      !Number.isInteger(person.maxAssignments) ||
      person.maxAssignments < 0 ||
      person.maxAssignments > 16
    )
      fail(`${path}.maxAssignments`, "expected integer 0..16");
  }
  const peopleIds = uniqueObjects(input.people, "people");
  const people = new Map(input.people.map((p) => [p.id, p]));
  for (const [i, position] of input.positions.entries()) {
    const path = `positions[${i}]`;
    object(position, path, [
      "id",
      "label",
      "blockId",
      "roleId",
      "previousPersonId",
      "lockedPersonId",
    ]);
    id(position.id, `${path}.id`);
    text(position.label, `${path}.label`);
    id(position.blockId, `${path}.blockId`);
    id(position.roleId, `${path}.roleId`);
    if (!blockIds.has(position.blockId))
      fail(`${path}.blockId`, "unknown block");
    if (!roleIds.has(position.roleId)) fail(`${path}.roleId`, "unknown role");
    for (const key of ["previousPersonId", "lockedPersonId"]) {
      const value = position[key];
      if (value !== undefined && value !== null) {
        id(value, `${path}.${key}`);
        if (!peopleIds.has(value)) fail(`${path}.${key}`, "unknown person");
      }
    }
  }
  uniqueObjects(input.positions, "positions");
  const usedBlocks = new Set();
  const lockedIntervals = new Map();
  const loads = new Map(input.people.map((p) => [p.id, 0]));
  for (const position of input.positions) {
    const who = position.lockedPersonId;
    if (who == null) continue;
    const person = people.get(who);
    if (!person.roles.includes(position.roleId))
      fail(`positions.${position.id}.lockedPersonId`, "lock lacks role");
    if (!person.availability.includes(position.blockId))
      fail(
        `positions.${position.id}.lockedPersonId`,
        "lock lacks availability",
      );
    if (timed) {
      const current = intervals.get(position.blockId);
      const prior = lockedIntervals.get(who) ?? [];
      if (prior.some((other) => overlaps(current, other)))
        fail(
          `positions.${position.id}.lockedPersonId`,
          "lock intervals overlap",
        );
      prior.push(current);
      lockedIntervals.set(who, prior);
    } else {
      const key = `${who}\0${position.blockId}`;
      if (usedBlocks.has(key))
        fail(
          `positions.${position.id}.lockedPersonId`,
          "lock conflicts in block",
        );
      usedBlocks.add(key);
    }
    loads.set(who, loads.get(who) + 1);
    if (loads.get(who) > person.maxAssignments)
      fail(
        `positions.${position.id}.lockedPersonId`,
        "lock exceeds maxAssignments",
      );
  }
  return input;
}

export const STORAGE_KEY = "muster.project.v1";
export const MAX_INPUT_BYTES = 1024 * 1024;

export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function assignmentsCsv(model, result) {
  const roles = new Map(model.roles.map((x) => [x.id, x.label]));
  const blocks = new Map(model.blocks.map((x) => [x.id, x.label]));
  const people = new Map(model.people.map((x) => [x.id, x.name]));
  const assigned = new Map(
    result.assignments.map((x) => [x.positionId, x.personId]),
  );
  const rows = [["Position", "Block", "Role", "Person", "Commitment"]];
  for (const position of model.positions)
    rows.push([
      position.label,
      blocks.get(position.blockId),
      roles.get(position.roleId),
      people.get(assigned.get(position.id)) ?? "Unfilled",
      position.lockedPersonId ? "Locked" : "Proposed",
    ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function parseProject(text) {
  if (
    typeof text !== "string" ||
    text.length > MAX_INPUT_BYTES ||
    new TextEncoder().encode(text).length > MAX_INPUT_BYTES
  )
    throw new Error("Project file is too large (maximum 1 MiB).");
  // Native parsing decides grammar. This bounded lexical pass additionally
  // rejects duplicate (including escaped) keys and excessive nesting first.
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|[^\s{}\[\]:,"]+/gu;
  const stack = [];
  for (const match of text.matchAll(tokens)) {
    const token = match[0];
    if (token === "{" || token === "[") {
      stack.push({
        object: token === "{",
        key: token === "{",
        keys: new Set(),
      });
      if (stack.length > 64)
        throw new Error("Project JSON is too deeply nested.");
    } else if (token === "}" || token === "]") stack.pop();
    else {
      const frame = stack.at(-1);
      if (frame?.object) {
        if (token === ",") frame.key = true;
        else if (token === ":") frame.key = false;
        else if (token.startsWith('"') && frame.key) {
          const key = JSON.parse(token);
          if (frame.keys.has(key)) throw new Error("Duplicate JSON property.");
          frame.keys.add(key);
        }
      }
    }
  }
  return JSON.parse(text, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("Numbers must be finite.");
    return value;
  });
}

export function saveModel(storage, model) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(model));
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "Changes are in memory only. Browser storage is unavailable or full; export your project before closing.",
    };
  }
}

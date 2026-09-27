import { validateModel } from "./model.js";
import { example } from "./example.js";
import {
  STORAGE_KEY,
  MAX_INPUT_BYTES,
  parseProject,
  saveModel,
  assignmentsCsv,
} from "./state.js";

const $ = (id) => document.getElementById(id);
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "checked") node.checked = Boolean(value);
    else if (key === "disabled") node.disabled = Boolean(value);
    else if (key === "value") node.value = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return node;
}
let model = example(),
  result = null,
  history = [],
  worker = null,
  timer = null,
  revision = 0,
  saveMessage = "Example data",
  synthetic = true;
let storedRaw = null,
  recovery = false,
  editorSave = null,
  editorDelete = null,
  jsonDirty = false,
  memoryOnly = false;
const counted = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clone = (x) => structuredClone(x);
const label = (collection, id, key = "label") =>
  model[collection].find((x) => x.id === id)?.[key] ?? "Unassigned";
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
  $("message").hidden = !text;
}
function ask(text) {
  const dialog = $("confirmation");
  $("confirmation-text").textContent = text;
  return new Promise((resolve) => {
    let accepted = false;
    $("confirm-yes").onclick = () => {
      accepted = true;
      dialog.close();
    };
    $("confirm-no").onclick = () => dialog.close();
    dialog.onclose = () => resolve(accepted);
    dialog.showModal();
  });
}
function download(name, data, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function persist() {
  let saved;
  try {
    saved = saveModel(window.localStorage, model);
  } catch {
    saved = {
      ok: false,
      message: "Changes are in memory only. Export a project before closing.",
    };
  }
  memoryOnly = !saved.ok;
  saveMessage = saved.ok ? "Saved in this browser" : saved.message;
  if (!saved.ok) message(saved.message, true);
}
function stop() {
  if (worker) worker.terminate();
  worker = null;
  clearTimeout(timer);
  $("cancel").hidden = true;
  $("solve").disabled = false;
}
function update(next) {
  validateModel(next);
  history.push(clone(model));
  if (history.length > 30) history.shift();
  model = next;
  result = null;
  revision++;
  stop();
  synthetic = false;
  persist();
  render();
}
function apply(edit) {
  const next = clone(model);
  edit(next);
  update(next);
}
function calculate() {
  try {
    validateModel(model);
  } catch (error) {
    message(error.message, true);
    return;
  }
  stop();
  result = null;
  render();
  const id = ++revision;
  $("result-status").textContent = "Calculating…";
  $("solve").disabled = true;
  $("cancel").hidden = false;
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
  } catch {
    stop();
    message(
      "The solver could not start. Serve the app over HTTP using the README instructions.",
      true,
    );
    return;
  }
  worker.onmessage = ({ data }) => {
    if (data.id !== revision) return;
    stop();
    if (data.error) {
      message(data.error, true);
      render();
      return;
    }
    result = data.result;
    message("");
    render();
  };
  worker.onerror = () => {
    stop();
    message(
      "The solver could not load. Reload the app; your saved inputs are retained.",
      true,
    );
    render();
  };
  timer = setTimeout(() => {
    revision++;
    stop();
    message(
      "The solver exceeded its 8-second limit. Inputs are retained. Reduce the project size and try again.",
      true,
    );
    render();
  }, 8000);
  worker.postMessage({ id, model: clone(model) });
}
function render() {
  $("project-title").textContent = model.title;
  $("project-kind").textContent = synthetic
    ? "SYNTHETIC EXAMPLE"
    : "LOCAL PROJECT";
  $("save-state").textContent = saveMessage;
  $("undo").disabled = !history.length;
  if (!jsonDirty) $("project-json").value = JSON.stringify(model, null, 2);
  $("json-draft-status").textContent = jsonDirty
    ? "Unapplied draft. Calculate uses the saved worksheet inputs."
    : "";
  $("discard-json").hidden = !jsonDirty;
  $("csv").disabled = !result;
  $("accept").disabled = !result;
  const assigned = new Map(
    result?.assignments.map((a) => [a.positionId, a.personId]) ?? [],
  );
  const body = $("rota-body");
  body.replaceChildren();
  for (const block of model.blocks)
    for (const position of model.positions.filter(
      (p) => p.blockId === block.id,
    )) {
      const proposed = assigned.get(position.id);
      const changed =
        position.previousPersonId && position.previousPersonId !== proposed;
      const status = !result
        ? "Not calculated"
        : proposed
          ? label("people", proposed, "name")
          : "Unfilled";
      const lock = el(
        "button",
        {
          "aria-label": `${position.lockedPersonId ? "Unlock" : "Lock proposal for"} ${position.label}`,
          class: position.lockedPersonId ? "lock-on" : "",
          disabled: !position.lockedPersonId && !proposed,
          onclick: () => {
            try {
              apply((next) => {
                const p = next.positions.find((x) => x.id === position.id);
                p.lockedPersonId = position.lockedPersonId ? null : proposed;
              });
              message("Lock updated. Recalculate to update the proposal.");
            } catch (error) {
              message(error.message, true);
            }
          },
        },
        position.lockedPersonId ? "Locked · unlock" : "Lock",
      );
      body.append(
        el(
          "tr",
          {},
          el(
            "td",
            {},
            el("strong", {}, position.label),
            el("small", {}, block.label),
          ),
          el("td", {}, label("roles", position.roleId)),
          el(
            "td",
            {},
            position.previousPersonId
              ? label("people", position.previousPersonId, "name")
              : "—",
          ),
          el(
            "td",
            {},
            el(
              "span",
              {
                class: `tag ${!result ? "stale" : !proposed ? "gap" : changed ? "changed" : ""}`,
              },
              status,
            ),
          ),
          el("td", {}, lock),
          el(
            "td",
            {},
            el(
              "button",
              {
                "aria-label": `Edit ${position.label}`,
                onclick: () => editPosition(position),
              },
              "Edit",
            ),
          ),
        ),
      );
    }
  if (!model.positions.length)
    body.append(
      el(
        "tr",
        {},
        el("td", { colspan: "6" }, "No positions yet. Add one to begin."),
      ),
    );
  $("result-status").textContent = result
    ? `${result.assignments.length} of ${model.positions.length} positions filled · ${counted(result.objective.changes, "changed reference assignment")}`
    : "Inputs changed. Recalculate to update the proposal.";
  renderExplanation();
  renderPeople();
  renderSetup();
}
function renderExplanation() {
  const area = $("explanation");
  area.replaceChildren(el("p", { class: "eyebrow" }, "CAPACITY"));
  area.classList.toggle("short", Boolean(result?.shortage));
  if (!result) {
    area.append(
      el("h3", {}, "No current proposal"),
      el("p", {}, "Calculate after editing the rota."),
    );
    if (synthetic)
      area.append(
        el(
          "p",
          {},
          "Example: Cy cancelled Saturday; Bob’s assignment is locked.",
        ),
      );
    return;
  }
  if (result.shortage) {
    const s = result.shortage;
    area.append(
      el("h3", {}, "A collective shortage"),
      el(
        "p",
        {},
        `These ${counted(s.demand, "position")} can receive at most ${counted(s.capacity, "assignment")} under the current inputs. ${s.deficit} must remain unfilled.`,
      ),
      el(
        "ul",
        {},
        s.positionIds.map((id) => el("li", {}, label("positions", id))),
      ),
      el(
        "button",
        { onclick: () => showView("people") },
        "Review availability",
      ),
    );
    if (s.personIds.length) {
      area.append(
        el("h4", {}, "Eligible people"),
        ...s.limits
          .filter((x) => x.kind === "person-total")
          .map((limit) =>
            el(
              "details",
              {},
              el(
                "summary",
                {},
                `${label("people", limit.personId, "name")}: ${counted(limit.remaining, "assignment")} left`,
              ),
              el(
                "ul",
                {},
                s.limits
                  .filter(
                    (x) =>
                      x.kind === "person-block" &&
                      x.personId === limit.personId,
                  )
                  .map((x) =>
                    el(
                      "li",
                      {},
                      `${label("blocks", x.blockId)}: ${x.remaining ? "one position maximum" : "occupied by a lock"}`,
                    ),
                  ),
              ),
            ),
          ),
      );
    } else
      area.append(
        el("p", {}, "No eligible person is available for these positions."),
      );
  } else
    area.append(
      el("h3", {}, "All positions covered"),
      el(
        "p",
        {},
        "Locks retained. No availability or capacity conflicts in the declared inputs.",
      ),
    );

  if (result.changes.length) {
    area.append(
      el("h4", {}, "Changes to review"),
      el(
        "ul",
        {},
        result.changes.map((change) =>
          el(
            "li",
            {},
            `${label("positions", change.positionId)}: ${change.before ? label("people", change.before, "name") : "unassigned"} → ${change.after ? label("people", change.after, "name") : "unfilled"}`,
          ),
        ),
      ),
    );
  }
  area.append(
    el(
      "div",
      { class: "measure" },
      el("strong", {}, "Assignment counts"),
      el(
        "p",
        {},
        result.loads
          .map((x) => `${label("people", x.personId, "name")} ${x.count}`)
          .join(" · "),
      ),
      el(
        "details",
        {},
        el("summary", {}, "Balancing score"),
        el(
          "p",
          {},
          `Sum of squared assignment counts: ${result.objective.squaredLoads}. Minimized after coverage and reference preservation.`,
        ),
      ),
    ),
  );
}
function renderPeople() {
  $("people-list").replaceChildren(
    ...model.people.map((person) =>
      el(
        "article",
        { class: "person" },
        el(
          "div",
          {},
          el("h4", {}, person.name),
          el(
            "p",
            {},
            person.roles.map((id) => label("roles", id)).join(" · ") ||
              "No eligible roles",
          ),
          el(
            "p",
            {},
            person.availability.map((id) => label("blocks", id)).join(" / ") ||
              "No availability",
          ),
          el(
            "p",
            {},
            `Maximum ${counted(person.maxAssignments, "assignment")}`,
          ),
        ),
        el(
          "button",
          {
            "aria-label": `Edit person ${person.name}`,
            onclick: () => editPerson(person),
          },
          "Edit",
        ),
      ),
    ),
  );
  if (!model.people.length)
    $("people-list").append(
      el("p", {}, "Add people and their availability to begin."),
    );
}
function renderSetup() {
  for (const kind of ["roles", "blocks"])
    $(kind + "-list").replaceChildren(
      ...model[kind].map((item) =>
        el(
          "div",
          { class: "setup-item" },
          el("span", {}, item.label),
          el(
            "button",
            {
              "aria-label": `Edit ${kind === "roles" ? "role" : "block"} ${item.label}`,
              onclick: () => editNamed(kind, item),
            },
            "Edit",
          ),
        ),
      ),
    );
}
function showView(name) {
  for (const n of ["rota", "people", "setup"])
    $(n + "-view").hidden = n !== name;
  for (const button of document.querySelectorAll("[data-view]")) {
    button.classList.toggle("active", button.dataset.view === name);
    if (button.dataset.view === name)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}
function idFor(prefix, collection) {
  let n = 1;
  while (collection.some((x) => x.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function field(title, name, value, type = "text", attrs = {}) {
  const input = el("input", {
    name,
    id: "edit-" + name,
    type,
    value,
    required: "",
    ...attrs,
  });
  return el(
    "div",
    { class: "field" },
    el("label", { for: "edit-" + name }, title),
    input,
  );
}
function choices(title, name, items, selected) {
  return el(
    "fieldset",
    {},
    el("legend", {}, title),
    items.map((item) =>
      el(
        "label",
        { class: "check" },
        el("input", {
          type: "checkbox",
          name,
          value: item.id,
          checked: selected.includes(item.id),
        }),
        item.label,
      ),
    ),
  );
}
function select(title, name, items, value) {
  const input = el(
    "select",
    { name, id: "edit-" + name },
    items.map((item) => el("option", { value: item.id }, item.label)),
  );
  input.value = value;
  return el(
    "div",
    { class: "field" },
    el("label", { for: "edit-" + name }, title),
    input,
  );
}
function openEditor(title, fields, onSave, onDelete = null) {
  $("editor-title").textContent = title;
  $("editor-fields").replaceChildren(...fields);
  $("editor-error").textContent = "";
  editorSave = onSave;
  editorDelete = onDelete;
  $("delete-item").hidden = !onDelete;
  $("editor").showModal();
}
function editPerson(person = null) {
  const p = person ?? {
    id: idFor("person", model.people),
    name: "",
    roles: [],
    availability: [],
    maxAssignments: 1,
  };
  openEditor(
    person ? `Edit ${p.name}` : "Add a person",
    [
      field("Name", "name", p.name, "text", { maxlength: "120" }),
      field("Maximum assignments", "max", p.maxAssignments, "number", {
        min: "0",
        max: "16",
        step: "1",
      }),
      choices("Eligible roles", "roles", model.roles, p.roles),
      choices(
        "Available time blocks",
        "availability",
        model.blocks,
        p.availability,
      ),
    ],
    (form) => {
      const next = {
        id: p.id,
        name: form.get("name").trim(),
        maxAssignments: Number(form.get("max")),
        roles: form.getAll("roles"),
        availability: form.getAll("availability"),
      };
      apply((data) => {
        if (person)
          data.people[data.people.findIndex((x) => x.id === p.id)] = next;
        else data.people.push(next);
      });
    },
    person
      ? async () => {
          if (
            model.positions.some(
              (x) => x.lockedPersonId === p.id || x.previousPersonId === p.id,
            )
          )
            throw new Error(
              "This person has a reference assignment or lock. Edit those positions first so commitments are not silently removed.",
            );
          if (await ask(`Remove ${p.name} from this project?`))
            apply((data) => {
              data.people = data.people.filter((x) => x.id !== p.id);
            });
          else return false;
        }
      : null,
  );
}
function editPosition(position = null) {
  const p = position ?? {
    id: idFor("position", model.positions),
    label: "",
    blockId: model.blocks[0].id,
    roleId: model.roles[0].id,
    previousPersonId: null,
    lockedPersonId: null,
  };
  openEditor(
    position ? "Edit position" : "Add a position",
    [
      field("Position label", "label", p.label, "text", { maxlength: "120" }),
      select("Time block", "block", model.blocks, p.blockId),
      select("Required role", "role", model.roles, p.roleId),
      select(
        "Reference assignment",
        "previous",
        [
          { id: "", label: "Unassigned" },
          ...model.people.map((x) => ({ id: x.id, label: x.name })),
        ],
        p.previousPersonId ?? "",
      ),
      select(
        "Locked commitment",
        "locked",
        [
          { id: "", label: "Not locked" },
          ...model.people.map((x) => ({ id: x.id, label: x.name })),
        ],
        p.lockedPersonId ?? "",
      ),
    ],
    (form) =>
      apply((data) => {
        const next = {
          id: p.id,
          label: form.get("label").trim(),
          blockId: form.get("block"),
          roleId: form.get("role"),
          previousPersonId: form.get("previous") || null,
          lockedPersonId: form.get("locked") || null,
        };
        if (position)
          data.positions[data.positions.findIndex((x) => x.id === p.id)] = next;
        else data.positions.push(next);
      }),
    position
      ? async () => {
          if (
            await ask(
              `Remove ${p.label} and its reference/lock from this project?`,
            )
          )
            apply((data) => {
              data.positions = data.positions.filter((x) => x.id !== p.id);
            });
          else return false;
        }
      : null,
  );
}
function editNamed(kind, item = null) {
  const singular = kind === "roles" ? "role" : "time block";
  const value = item ?? {
    id: idFor(kind === "roles" ? "role" : "block", model[kind]),
    label: "",
  };
  openEditor(
    `${item ? "Edit" : "Add"} ${singular}`,
    [field("Label", "label", value.label, "text", { maxlength: "120" })],
    (form) =>
      apply((data) => {
        if (item)
          data[kind].find((x) => x.id === value.id).label = form
            .get("label")
            .trim();
        else data[kind].push({ ...value, label: form.get("label").trim() });
      }),
    item
      ? async () => {
          if (
            model.positions.some(
              (x) => x[kind === "roles" ? "roleId" : "blockId"] === value.id,
            )
          )
            throw new Error(
              `This ${singular} is used by a position. Edit or remove that position first.`,
            );
          if (
            !(await ask(
              `Remove ${value.label}? Its entries in people's ${kind === "roles" ? "eligibility" : "availability"} will also be removed.`,
            ))
          )
            return false;
          apply((data) => {
            data[kind] = data[kind].filter((x) => x.id !== value.id);
            const key = kind === "roles" ? "roles" : "availability";
            data.people.forEach((p) => {
              p[key] = p[key].filter((id) => id !== value.id);
            });
          });
        }
      : null,
  );
}
async function replaceProject(input) {
  validateModel(input);
  if (
    await ask(
      "Replace the current project? Export first if you need a durable copy. You can undo this replacement during this session.",
    )
  ) {
    update(input);
    message("Project loaded. Recalculate to update the proposal.");
    return true;
  }
  return false;
}
$("editor-form").onsubmit = (event) => {
  event.preventDefault();
  try {
    editorSave(new FormData(event.currentTarget));
    $("editor").close();
    message("Inputs updated. Recalculate to update the proposal.");
  } catch (error) {
    $("editor-error").textContent = error.message;
  }
};
$("delete-item").onclick = async () => {
  try {
    if ((await editorDelete()) !== false) $("editor").close();
  } catch (error) {
    $("editor-error").textContent = error.message;
  }
};
$("close-editor").onclick = () => $("editor").close();
for (const button of document.querySelectorAll("[data-view]"))
  button.onclick = () => showView(button.dataset.view);
$("solve").onclick = calculate;
$("cancel").onclick = () => {
  revision++;
  stop();
  render();
  message("Calculation cancelled. Inputs are retained.");
};
$("add-person").onclick = () => editPerson();
$("add-position").onclick = () => editPosition();
$("add-role").onclick = () => editNamed("roles");
$("add-block").onclick = () => editNamed("blocks");
$("rename").onclick = () =>
  openEditor(
    "Rename project",
    [
      field("Project title", "title", model.title, "text", {
        maxlength: "120",
      }),
    ],
    (form) =>
      apply((data) => {
        data.title = form.get("title").trim();
      }),
  );
$("undo").onclick = () => {
  if (!history.length) return;
  stop();
  revision++;
  model = history.pop();
  result = null;
  persist();
  render();
  message("Undone. Recalculate to update the proposal.");
};
$("reset").onclick = () => replaceProject(example());
$("export").onclick = () =>
  download("muster-project.json", JSON.stringify(model, null, 2) + "\n");
$("csv").onclick = () => {
  if (result)
    download(
      "muster-assignments.csv",
      assignmentsCsv(model, result),
      "text/csv;charset=utf-8",
    );
};
$("accept").onclick = async () => {
  if (
    !result ||
    !(await ask(
      "Use this proposal as the new reference? Future repairs will measure changes from these assignments. Unfilled positions will have no reference.",
    ))
  )
    return;
  const assignments = new Map(
    result.assignments.map((x) => [x.positionId, x.personId]),
  );
  apply((data) =>
    data.positions.forEach((x) => {
      x.previousPersonId = assignments.get(x.id) ?? null;
    }),
  );
  calculate();
};
$("project-json").oninput = () => {
  jsonDirty = true;
  $("json-draft-status").textContent =
    "Unapplied draft. Calculate uses the saved worksheet inputs.";
  $("discard-json").hidden = false;
};
$("discard-json").onclick = async () => {
  if (
    await ask(
      "Discard the unapplied JSON draft and reload the current worksheet inputs?",
    )
  ) {
    jsonDirty = false;
    render();
  }
};
$("apply-json").onclick = async () => {
  try {
    if (await replaceProject(parseProject($("project-json").value))) {
      jsonDirty = false;
      render();
    }
  } catch (error) {
    message(error.message, true);
  }
};
window.addEventListener("beforeunload", (event) => {
  if (jsonDirty || memoryOnly) {
    event.preventDefault();
    event.returnValue = "";
  }
});
$("import").onclick = () => $("file").click();
$("file").onchange = async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const before = revision;
  try {
    if (file.size > MAX_INPUT_BYTES)
      throw new Error("Project file is too large (maximum 1 MiB).");
    const text = await file.text();
    if (before !== revision)
      throw new Error(
        "The worksheet changed while reading the file. Import it again to avoid replacing newer edits.",
      );
    await replaceProject(parseProject(text));
  } catch (error) {
    message(error.message, true);
  }
};
$("recover-download").onclick = () =>
  download("muster-saved-recovery.txt", storedRaw ?? "", "text/plain");
$("recover-reset").onclick = async () => {
  if (
    await ask(
      "Replace the unreadable saved project? Download its saved bytes first if you need to recover it.",
    )
  ) {
    recovery = false;
    $("recovery").hidden = true;
    $("workspace").hidden = false;
    model = example();
    synthetic = true;
    persist();
    render();
    calculate();
  }
};
try {
  storedRaw = window.localStorage.getItem(STORAGE_KEY);
  if (storedRaw) {
    model = parseProject(storedRaw);
    validateModel(model);
    synthetic = false;
    saveMessage = "Restored from this browser";
  }
} catch (error) {
  if (storedRaw !== null) {
    recovery = true;
    $("recovery").hidden = false;
    $("workspace").hidden = true;
    $("recovery-message").textContent =
      "The saved project could not be validated. It has not been overwritten. Download the original saved bytes before starting over.";
  } else {
    memoryOnly = true;
    saveMessage =
      "Browser storage is unavailable. Export before closing to keep your work.";
  }
}
if (!recovery) {
  render();
  calculate();
}

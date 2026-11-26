import { validateModel } from "./model.js?v=0.2.2-dev.0";
import { example } from "./example.js?v=0.2.2-dev.0";
import {
  STORAGE_KEY,
  MAX_INPUT_BYTES,
  parseProject,
  assignmentsCsv,
} from "./state.js?v=0.2.2-dev.0&session=2";
import { PlanningSession, readStoredProject } from "./session.js?v=0.2.2-dev.0";

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
let session, saveSequence = 0, editorRevision = 0;
let solveFocusWatch = null, editorReturn = null, editorGeneration = 0;
let editorSnapshot = null;
let draftLoadSequence = 0;
const editorCloseQueue = [];
function watchFocusActivity() {
  let changed = false;
  const mark = () => { changed = true; };
  for (const type of ["pointerdown", "keydown", "focusin"]) document.addEventListener(type, mark, true);
  return {
    changed: () => changed,
    dispose: () => { for (const type of ["pointerdown", "keydown", "focusin"]) document.removeEventListener(type, mark, true); },
  };
}
function focusKey(element) { return element?.getAttribute?.("data-focus-key") || null; }
function focusForKey(key) {
  return [...document.querySelectorAll("[data-focus-key]")].find((element) => focusKey(element) === key);
}
const counted = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clone = (x) => structuredClone(x);
const label = (collection, id, key = "label") =>
  model[collection].find((x) => x.id === id)?.[key] ?? "Unassigned";
function blockTime(block) {
  if (!block.startAt) return "";
  const display = (value) =>
    `${value.slice(0, 16).replace("T", " ")} UTC${value.slice(16) === "Z" ? "" : value.slice(16)}`;
  return `${display(block.startAt)} to ${display(block.endAt)}`;
}
function blockLabel(block) {
  return block.startAt ? `${block.label} · ${blockTime(block)}` : block.label;
}
function blockChoices() {
  return model.blocks.map((block) => ({
    id: block.id,
    label: blockLabel(block),
  }));
}
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
function staleNotice() {
  const text = "The project changed while confirmation was open. Your work is retained; review it and try again.";
  message(text, true);
  if ($("editor").open) $("editor-error").textContent = text;
}
async function askCurrent(text) {
  const before = revision;
  if (!(await ask(text))) return false;
  if (before !== revision) { staleNotice(); return false; }
  return true;
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
  const current = ++saveSequence;
  memoryOnly = true;
  saveMessage = "Saving… Export before closing.";
  session.save(model).then((saved) => {
    if (current !== saveSequence) return;
    memoryOnly = !saved.ok;
    saveMessage = saved.ok ? "Saved in this browser" : saved.message;
    if (!saved.ok) {
      if (saved.kind === "conflict") { revision++; stop(); result = null; }
      message(saved.message, true);
    }
    render();
  });
}

function stop(restoreSolveFocus = false) {
  const watch = solveFocusWatch;
  solveFocusWatch = null;
  watch?.dispose();
  if (worker) worker.terminate();
  worker = null;
  clearTimeout(timer);
  $("cancel").hidden = true;
  $("solve").disabled = false;
  if (restoreSolveFocus && watch && !watch.changed() && document.activeElement === document.body && document.hasFocus())
    $("solve").focus();
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
  const returnToSolve = document.activeElement === $("solve");
  $("solve").disabled = true;
  if (returnToSolve) solveFocusWatch = watchFocusActivity();
  $("cancel").hidden = false;
  try {
    worker = new Worker(new URL("./worker.js?v=0.2.2-dev.0", import.meta.url), {
      type: "module",
    });
  } catch {
    stop(true);
    message(
      "The solver could not start. Serve the app over HTTP using the README instructions.",
      true,
    );
    render();
    return;
  }
  const activeWorker = worker;
  worker.onmessage = ({ data }) => {
    if (data.id !== revision || worker !== activeWorker) return;
    stop(true);
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
    if (id !== revision || worker !== activeWorker) return;
    stop(true);
    message(
      "The solver could not load. Reload the app; your saved inputs are retained.",
      true,
    );
    render();
  };
  timer = setTimeout(() => {
    revision++;
    stop(true);
    message(
      "The solver exceeded its 8-second limit. Inputs are retained. Reduce the project size and try again.",
      true,
    );
    render();
  }, 8000);
  worker.postMessage({ id, model: clone(model) });
}
function render() {
  const focusedKey = focusKey(document.activeElement);
  $("project-title").textContent = model.title;
  $("project-kind").textContent = synthetic
    ? "Synthetic example"
    : model.format === "muster/v2"
      ? "Timed shifts"
      : "Named blocks";
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
          "data-focus-key": `position-lock:${position.id}`,
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
            { class: "position-cell" },
            el("strong", {}, position.label),
            el("small", {}, block.label),
            block.startAt
              ? el("small", { class: "block-time" }, blockTime(block))
              : null,
          ),
          el("td", { class: "role-cell" },
            el("span", { class: "phone-label", "aria-hidden": "true" }, "Role"),
            label("roles", position.roleId)),
          el(
            "td",
            { class: "reference-cell" },
            el("span", { class: "phone-label", "aria-hidden": "true" }, "Reference"),
            position.previousPersonId
              ? label("people", position.previousPersonId, "name")
              : "—",
            el("span", { class: "phone-arrow", "aria-hidden": "true" }, "→"),
          ),
          el(
            "td",
            { class: "proposal-cell" },
            el("span", { class: "phone-label", "aria-hidden": "true" }, "Proposal"),
            el(
              "span",
              {
                class: `tag ${!result ? "stale" : !proposed ? "gap" : changed ? "changed" : ""}`,
              },
              status,
            ),
          ),
          el("td", { class: "commitment-cell" }, lock),
          el(
            "td",
            { class: "edit-cell" },
            el(
              "button",
              {
                "aria-label": `Edit ${position.label}`,
                "data-focus-key": `position-edit:${position.id}`,
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
    ? `${result.assignments.length}/${model.positions.length} filled · ${counted(result.objective.changes, "reference change")}${result.optimal === false ? " · Not proven optimal" : ""}`
    : "Inputs changed. Recalculate to update the proposal.";
  renderExplanation();
  renderPeople();
  renderSetup();
  if (focusedKey && document.activeElement === document.body && document.hasFocus())
    focusForKey(focusedKey)?.focus();
}
function renderExplanation() {
  const area = $("explanation");
  area.replaceChildren();
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
  if (result.optimal === false) {
    area.append(
      el("h3", { class: "result-unproven" }, "Not proven optimal"),
      el("p", {}, "Search limit reached. A better assignment may exist."),
      el("dl", { class: "facts" },
        el("dt", {}, "Feasible coverage"),
        el("dd", {}, `${result.assignments.length}/${model.positions.length}`),
        el("dt", {}, "Unfilled"),
        el("dd", {}, result.unfilled.length)),
    );
  } else if (result.shortage) {
    const s = result.shortage;
    area.append(
      el("h3", {}, s.scope === "all-positions" ? "Whole-rota limit" : "Subset limit"),
      el("dl", { class: "facts" },
        el("dt", {}, "Maximum coverage"),
        el("dd", {}, `${s.capacity}/${s.demand}`),
        el("dt", {}, "Minimum unfilled"),
        el("dd", { class: "result-gap" }, s.deficit)),
      s.scope === "all-positions"
        ? el("button", { onclick: () => showView("people") }, "Review availability")
        : positionReview(s.positionIds),
    );
    if (s.scope !== "all-positions" && s.personIds.length) {
      area.append(
        el("h4", {}, "Eligible people"),
        ...s.limits.filter((x) => x.kind === "person-total").map((limit) =>
          el("details", {},
            el("summary", {}, `${label("people", limit.personId, "name")}: ${counted(limit.remaining, "assignment")} left`),
            el("ul", {}, s.limits.filter((x) => x.kind === "person-block" && x.personId === limit.personId)
              .map((x) => el("li", {}, `${label("blocks", x.blockId)}: ${x.remaining ? "one position maximum" : "occupied by a lock"}`))),
          ),
        ),
      );
    } else if (s.scope !== "all-positions") {
      area.append(el("p", {}, "No eligible person is available for these positions."));
    }
  } else {
    area.append(
      el("h3", {}, "Full coverage"),
      el("dl", { class: "facts" },
        el("dt", {}, "Coverage"),
        el("dd", {}, `${result.assignments.length}/${model.positions.length}`),
        el("dt", {}, "Locks retained"),
        el("dd", {}, model.positions.filter((p) => p.lockedPersonId != null).length)),
    );
  }

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
      el("strong", {}, "Assignments per person"),
      el("dl", { class: "facts loads" },
        result.loads.map((x) => [
          el("dt", {}, label("people", x.personId, "name")),
          el("dd", {}, x.count),
        ])),
      el(
        "details",
        {},
        el("summary", {}, "Balancing score"),
        el(
          "p",
          {},
          `Squared assignment sum: ${result.objective.squaredLoads}.${result.optimal === false ? " Current proposal; not proven minimum." : " Minimum after coverage and reference preservation."}`,
        ),
      ),
    ),
  );
}
// A named-block certificate identifies a set. Inspect its inputs one position
// at a time; individual eligibility does not guarantee collective coverage.
function positionReview(ids) {
  const positions = model.positions.filter((p) => ids.includes(p.id));
  const select = el("select", { id: "review-position" },
    positions.map((p) => {
      const sameName = positions.filter((other) => other.label === p.label);
      const block = label("blocks", p.blockId);
      const repeatedBlock = sameName.some((other) =>
        other.id !== p.id && label("blocks", other.blockId) === block);
      const title = sameName.length === 1 ? p.label :
        [p.label, block, ...(repeatedBlock ? [p.id] : [])].join(" · ");
      return el("option", { value: p.id }, title);
    }));
  select.value = positions.find((p) => result.unfilled.includes(p.id))?.id ?? positions[0].id;
  const list = el("div", { class: "review-people" });
  const context = el("p", { class: "review-context" });

  function inspect() {
    const position = positions.find((p) => p.id === select.value);
    context.textContent = [label("roles", position.roleId), label("blocks", position.blockId)].join(" · ");
    const qualified = model.people.filter((p) => p.roles.includes(position.roleId));
    list.replaceChildren();
    for (const person of qualified) {
      const locks = model.positions.filter((p) => p.lockedPersonId === person.id);
      const sameBlock = locks.find((p) => p.blockId === position.blockId);
      const available = person.availability.includes(position.blockId);
      const remaining = person.maxAssignments - locks.length;
      const constraints = [
        available ? "Marked available in this block" : "Marked unavailable in this block",
        sameBlock ? `Locked to ${sameBlock.label}` : `${counted(remaining, "assignment")} left after locks (limit ${person.maxAssignments})`,
      ];
      const edit = el("button", {
        "aria-label": `Edit ${person.name} for ${position.label}`,
        "data-focus-key": `review:${position.id}:${person.id}`,
        onclick: () => editPerson(person),
      }, "Edit");
      list.append(el("div", { class: "review-person" },
        el("strong", {}, person.name), edit, el("p", {}, constraints.join(". ") + ".")));
    }
    if (!qualified.length)
      list.append(el("p", {}, "No one has this role."),
        el("button", { onclick: () => showView("people") }, "Review people and roles"));
  }
  select.addEventListener("change", inspect);
  inspect();
  return el("section", { class: "position-review", "aria-labelledby": "review-heading" },
    el("h4", { id: "review-heading" }, "Review staffing"),
    el("label", { for: "review-position" }, "Position in the shortage"), select, context, list);
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
            person.availability
              .map((id) =>
                blockLabel(model.blocks.find((block) => block.id === id)),
              )
              .join(" / ") || "No availability",
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
            "data-focus-key": `person-edit:${person.id}`,
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
  $("add-times").hidden = model.format === "muster/v2";
  $("block-rule").textContent =
    model.format === "muster/v2"
      ? "A person cannot take overlapping shifts. Back-to-back shifts are allowed."
      : "Named blocks must not overlap. Add shift times to check overlaps.";
  for (const kind of ["roles", "blocks"])
    $(kind + "-list").replaceChildren(
      ...model[kind].map((item) =>
        el(
          "div",
          { class: "setup-item" },
          el(
            "span",
            {},
            item.label,
            kind === "blocks" && item.startAt
              ? el("small", { class: "block-time" }, blockTime(item))
              : null,
          ),
          el(
            "button",
            {
              "aria-label": `Edit ${kind === "roles" ? "role" : "block"} ${item.label}`,
              "data-focus-key": `${kind}-edit:${item.id}`,
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
function endpointFields(title, prefix, value = "") {
  return el(
    "fieldset",
    { class: "shift-endpoint" },
    el("legend", {}, title),
    field(
      "Date and time",
      prefix + "-local",
      value.slice(0, 16),
      "datetime-local",
      {
        step: "60",
        min: "0001-01-01T00:00",
        max: "9999-12-31T23:59",
      },
    ),
    field("UTC offset", prefix + "-offset", value.slice(16) || "Z", "text", {
      placeholder: "Z or -04:00",
      maxlength: "6",
    }),
  );
}
function endpointValue(form, prefix) {
  return (
    form.get(prefix + "-local") +
    form
      .get(prefix + "-offset")
      .trim()
      .toUpperCase()
  );
}
function shiftFields(block, prefix) {
  return [
    endpointFields("Start", prefix + "-start", block.startAt),
    endpointFields("End", prefix + "-end", block.endAt),
  ];
}
function addShiftTimes() {
  openEditor(
    "Add shift times",
    [
      el(
        "p",
        {},
        "Enter each block’s dates, times and UTC offsets. Use the next day for an overnight end. Offsets are not inferred from this device.",
      ),
      ...model.blocks.map((block) =>
        el(
          "fieldset",
          { class: "shift-block" },
          el("legend", {}, block.label),
          ...shiftFields(block, block.id),
        ),
      ),
    ],
    (form) =>
      apply((next) => {
        next.format = "muster/v2";
        for (const block of next.blocks) {
          block.startAt = endpointValue(form, block.id + "-start");
          block.endAt = endpointValue(form, block.id + "-end");
        }
      }),
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
  let selectedInterval = null;
  if (name === "block" && model.format === "muster/v2") {
    selectedInterval = el("small", {
      id: "edit-block-interval",
      class: "block-time",
    });
    const showInterval = () => {
      selectedInterval.textContent = blockTime(
        model.blocks.find((block) => block.id === input.value),
      );
    };
    input.setAttribute("aria-describedby", "edit-block-interval");
    input.addEventListener("change", showInterval);
    showInterval();
  }
  return el(
    "div",
    { class: "field" },
    el("label", { for: "edit-" + name }, title),
    input,
    selectedInterval,
  );
}
function openEditor(title, fields, onSave, onDelete = null) {
  editorGeneration++;
  editorReturn = { element: document.activeElement, key: focusKey(document.activeElement) };
  editorRevision = revision;
  $("editor-title").textContent = title;
  $("editor-fields").replaceChildren(...fields);
  $("editor-error").textContent = "";
  editorSave = onSave;
  editorDelete = onDelete;
  $("delete-item").hidden = !onDelete;
  editorSnapshot = JSON.stringify([...new FormData($("editor-form"))]);
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
        blockChoices(),
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
          if (await askCurrent(`Remove ${p.name} from this project?`))
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
      select("Time block", "block", blockChoices(), p.blockId),
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
            await askCurrent(
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
    [
      field("Label", "label", value.label, "text", { maxlength: "120" }),
      ...(kind === "blocks" && model.format === "muster/v2"
        ? [
            el(
              "p",
              {},
              "Enter the event’s UTC offsets. Use the next day for an overnight end.",
            ),
            ...shiftFields(value, "block"),
          ]
        : []),
    ],
    (form) =>
      apply((data) => {
        const edited = { ...value, label: form.get("label").trim() };
        if (kind === "blocks" && data.format === "muster/v2") {
          edited.startAt = endpointValue(form, "block-start");
          edited.endAt = endpointValue(form, "block-end");
        }
        if (item)
          data[kind][data[kind].findIndex((x) => x.id === value.id)] = edited;
        else data[kind].push(edited);
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
            !(await askCurrent(
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
function beginEditorClose() {
  editorCloseQueue.push({ watch: watchFocusActivity(), anchor: editorReturn, generation: editorGeneration });
  editorReturn = null;
}
function closeEditor() {
  beginEditorClose();
  $("editor").close();
}
$("editor").addEventListener("cancel", beginEditorClose);
$("editor").addEventListener("close", () => {
  const closed = editorCloseQueue.shift();
  if (!closed) return;
  closed.watch.dispose();
  const active = document.activeElement;
  const focusStillOwned = active === document.body || $("editor").contains(active);
  if (closed.generation === editorGeneration && !$("editor").open &&
      !closed.watch.changed() && focusStillOwned && document.hasFocus()) {
    const target = closed.anchor?.key ? focusForKey(closed.anchor.key) : closed.anchor?.element;
    if (target?.isConnected) target.focus();
    else if (closed.anchor?.key?.startsWith("review:") && !result) $("solve").focus();
  }
});

async function replaceProject(input, expectedDraft = null) {
  validateModel(input);
  if (
    await askCurrent(
      "Replace the current project? Export first if you need a durable copy. You can undo this replacement during this session.",
    )
  ) {
    if (expectedDraft !== null && $("project-json").value !== expectedDraft) { staleNotice(); return false; }
    update(input);
    message("Project loaded. Recalculate to update the proposal.");
    return true;
  }
  return false;
}
$("editor-form").onsubmit = (event) => {
  event.preventDefault();
  try {
    if (editorRevision !== revision) throw new Error("The project changed while this editor was open. Your entries are retained; close and reopen it before saving.");
    editorSave(new FormData(event.currentTarget));
    closeEditor();
    message("Inputs updated. Recalculate to update the proposal.");
  } catch (error) {
    $("editor-error").textContent = error.message;
  }
};
$("delete-item").onclick = async () => {
  try {
    if (editorRevision !== revision) throw new Error("The project changed while this editor was open. Close and reopen it before removing anything.");
    if ((await editorDelete()) !== false) closeEditor();
  } catch (error) {
    $("editor-error").textContent = error.message;
  }
};
$("close-editor").onclick = closeEditor;
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
$("add-times").onclick = addShiftTimes;
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
$("reload-saved").onclick = async () => {
  const before = revision, draftBefore = $("project-json").value;
  if (!(await askCurrent("Reload the saved project? Export your current work first; local changes and undo history will be discarded."))) return;
  try {
    const raw = await session.currentRaw();
    if (before !== revision || draftBefore !== $("project-json").value)
      throw new Error("Inputs changed during reload.");
    const next = raw === null ? example() : readStoredProject(raw);
    validateModel(next);
    stop(); revision++; saveSequence++;
    session.adopt(raw);
    model = next; result = null; history = []; jsonDirty = false;
    synthetic = raw === null; memoryOnly = false;
    saveMessage = raw === null ? "Example data" : "Restored from this browser";
    message("Saved project reloaded."); render(); calculate();
  } catch {
    message("The saved project could not be reloaded. Your current work is retained; export it before closing.", true);
  }
};
$("csv").onclick = () => {
  if (result)
    download(
      "muster-assignments.csv",
      assignmentsCsv(model, result),
      "text/csv;charset=utf-8",
    );
};
$("accept").onclick = async () => {
  const proposal = result, before = revision;
  if (!proposal || !(await ask(
    "Use this proposal as the new reference? Future repairs will measure changes from these assignments. Unfilled positions will have no reference.",
  ))) return;
  if (revision !== before || result !== proposal) {
    message("The proposal changed while confirmation was open. Recalculate and review it before accepting.", true);
    return;
  }
  const assignments = new Map(
    proposal.assignments.map((x) => [x.positionId, x.personId]),
  );
  apply((data) =>
    data.positions.forEach((x) => {
      x.previousPersonId = assignments.get(x.id) ?? null;
    }),
  );
  calculate();
};
function markJsonDraft() {
  jsonDirty = true;
  $("json-draft-status").textContent =
    "Unapplied draft. Calculate uses the saved worksheet inputs.";
  $("discard-json").hidden = false;
}
$("project-json").oninput = markJsonDraft;
$("download-draft").onclick = () =>
  download("muster-draft.txt", $("project-json").value, "text/plain;charset=utf-8");
$("restore-draft").onclick = () => $("draft-file").click();
$("draft-file").onchange = async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const sequence = ++draftLoadSequence;
  const before = revision, draftBefore = $("project-json").value;
  const ensureCurrent = () => {
    if (before !== revision || draftBefore !== $("project-json").value)
      throw new Error("The worksheet or JSON draft changed while restoring this file. Your current work is retained; choose the file again.");
  };
  try {
    if (file.size > MAX_INPUT_BYTES)
      throw new Error("Draft file is too large (maximum 1 MiB).");
    const bytes = await file.arrayBuffer();
    if (sequence !== draftLoadSequence) return;
    if (bytes.byteLength > MAX_INPUT_BYTES)
      throw new Error("Draft file is too large (maximum 1 MiB).");
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error("Draft file must contain valid UTF-8 text."); }
    ensureCurrent();
    if (text === draftBefore) { message("Draft already matches the editing text."); return; }
    if (jsonDirty && !(await askCurrent("Replace the unapplied JSON draft? Download it first if you need to keep its editing text. The worksheet will not be replaced."))) return;
    if (sequence !== draftLoadSequence) return;
    ensureCurrent();
    $("project-json").value = text;
    markJsonDraft();
    message("Draft restored for review. The worksheet is unchanged until you validate and replace it.");
  } catch (error) {
    if (sequence === draftLoadSequence) message(error.message, true);
  }
};
$("discard-json").onclick = async () => {
  const draftBefore = $("project-json").value;
  if (
    await askCurrent(
      "Discard the unapplied JSON draft and reload the current worksheet inputs?",
    )
  ) {
    if ($("project-json").value !== draftBefore) { staleNotice(); return; }
    jsonDirty = false;
    render();
  }
};
$("apply-json").onclick = async () => {
  try {
    const draft = $("project-json").value;
    if (await replaceProject(parseProject(draft), draft)) {
      if ($("project-json").value === draft) jsonDirty = false;
      render();
    }
  } catch (error) {
    message(error.message, true);
  }
};
window.addEventListener("beforeunload", (event) => {
  const editorDraft = $("editor").open &&
    JSON.stringify([...new FormData($("editor-form"))]) !== editorSnapshot;
  if (jsonDirty || memoryOnly || editorDraft) {
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
    await askCurrent(
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
  if (storedRaw !== null) {
    model = readStoredProject(storedRaw);
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
session = new PlanningSession({
  storage: () => window.localStorage,
  locks: navigator.locks,
  uuid: typeof globalThis.crypto?.randomUUID === "function" ? () => crypto.randomUUID() : null,
  expectedRaw: storedRaw,
});
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    if (!session.differs(window.localStorage.getItem(STORAGE_KEY))) return;
  } catch { /* A denied read is treated as an unsafe save state. */ }
  saveSequence++; revision++; stop(); result = null;
  memoryOnly = true;
  saveMessage = "Another tab changed the saved project. Export your work or reload the saved project.";
  message(saveMessage, true);
  render();
});
if (!recovery) {
  render();
  calculate();
}

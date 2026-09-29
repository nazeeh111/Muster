import test from "node:test";
import assert from "node:assert/strict";
import { example } from "../src/example.js";
import { validateModel } from "../src/model.js";

function timedExample() {
  const model = example();
  model.format = "muster/v2";
  const intervals = [
    ["2026-09-25T13:00-04:00", "2026-09-25T16:00-04:00"],
    ["2026-09-26T09:00-04:00", "2026-09-26T12:00-04:00"],
    ["2026-09-27T09:00-04:00", "2026-09-27T12:00-04:00"],
  ];
  model.blocks.forEach((block, i) => {
    [block.startAt, block.endAt] = intervals[i];
  });
  return model;
}

test("v1 blocks remain untimed and v2 requires times on every block", () => {
  const legacy = example();
  assert.equal(validateModel(legacy), legacy);
  legacy.blocks[0].startAt = "2026-09-25T13:00-04:00";
  assert.throws(() => validateModel(legacy), /blocks.*startAt.*unknown field/);

  const timed = timedExample();
  assert.equal(validateModel(timed), timed);
  delete timed.blocks[1].endAt;
  assert.throws(() => validateModel(timed), /blocks\[1\].*endAt/);
});

test("v2 rejects invalid intervals without changing the input", () => {
  const model = timedExample();
  model.blocks[0].endAt = "2026-09-25T12:00-04:00";
  const before = structuredClone(model);
  assert.throws(() => validateModel(model), /blocks\[0\].*endAt/);
  assert.deepEqual(model, before);
  model.blocks[0].endAt = "2026-02-29T16:00-04:00";
  assert.throws(() => validateModel(model), /blocks\[0\].*endAt/);
});

test("overlapping timed locks conflict across block IDs but adjacent locks are valid", () => {
  const model = {
    format: "muster/v2",
    title: "Overlapping locks",
    roles: [{ id: "helper", label: "Helper" }],
    blocks: [
      {
        id: "a",
        label: "A",
        startAt: "2026-09-29T09:00Z",
        endAt: "2026-09-29T10:00Z",
      },
      {
        id: "b",
        label: "B",
        startAt: "2026-09-29T09:30Z",
        endAt: "2026-09-29T10:30Z",
      },
    ],
    people: [
      {
        id: "ada",
        name: "Ada",
        roles: ["helper"],
        availability: ["a", "b"],
        maxAssignments: 2,
      },
    ],
    positions: [
      {
        id: "first",
        label: "First",
        roleId: "helper",
        blockId: "a",
        lockedPersonId: "ada",
      },
      {
        id: "second",
        label: "Second",
        roleId: "helper",
        blockId: "b",
        lockedPersonId: "ada",
      },
    ],
  };
  assert.throws(() => validateModel(model), /lock.*overlap/i);
  model.blocks[1].startAt = "2026-09-29T10:00Z";
  assert.equal(validateModel(model), model);
});

test("timed reference conflicts remain valid repair inputs", () => {
  const model = timedExample();
  model.blocks[2].startAt = model.blocks[1].startAt;
  model.blocks[2].endAt = model.blocks[1].endAt;
  model.positions.find(
    (position) => position.id === "restock",
  ).previousPersonId = "dee";
  assert.equal(validateModel(model), model);
});

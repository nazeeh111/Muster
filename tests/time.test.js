import assert from "node:assert/strict";
import test from "node:test";
import { parseTimestamp, interval, overlaps } from "../src/time.js";

test("offsets identify the same instant without the host timezone", () => {
  assert.equal(parseTimestamp("2026-09-29T09:00-04:00"), 1790686800000);
  assert.equal(parseTimestamp("2026-09-29T18:45+05:45"), 1790686800000);
  assert.equal(parseTimestamp("2026-09-29T13:00Z"), 1790686800000);
});

test("calendar validity is checked rather than normalized", () => {
  for (const value of [
    "0000-01-01T00:00Z",
    "2026-02-29T09:00Z",
    "1900-02-29T09:00Z",
    "2026-04-31T09:00Z",
    "2026-13-01T09:00Z",
    "2026-01-00T09:00Z",
    "2026-01-01T24:00Z",
    "2026-01-01T09:60Z",
  ]) {
    assert.throws(() => parseTimestamp(value), /timestamp/);
  }
  assert.equal(parseTimestamp("2000-02-29T00:00Z"), 951782400000);
  assert.equal(
    parseTimestamp("2024-02-29T12:00+23:59"),
    Date.UTC(2024, 1, 28, 12, 1),
  );
});

test("requires explicit supported syntax, including a known offset", () => {
  for (const value of [
    "2026-01-01T09:00",
    "2026-01-01",
    "2026-01-01T09:00-00:00",
    "2026-01-01T09:00+24:00",
    "2026-01-01T09:00+05:60",
    "2026-01-01T09:00:30Z",
    " 2026-01-01T09:00Z",
    null,
    0,
  ]) {
    assert.throws(() => parseTimestamp(value), /timestamp/);
  }
});

test("early years do not inherit Date.UTC’s 1900 adjustment", () => {
  assert.equal(parseTimestamp("0099-01-01T00:00Z"), -59042995200000);
});

test("overnight and offset transitions use elapsed instants", () => {
  const overnight = interval(
    "2026-09-29T23:00-04:00",
    "2026-09-30T01:00-04:00",
  );
  assert.equal(overnight.end - overnight.start, 2 * 60 * 60 * 1000);
  const repeatedHour = interval(
    "2026-11-01T01:30-04:00",
    "2026-11-01T01:30-05:00",
  );
  assert.equal(repeatedHour.end - repeatedHour.start, 60 * 60 * 1000);
  assert.throws(
    () => interval("2026-09-29T09:00Z", "2026-09-29T09:00Z"),
    /after/,
  );
  assert.throws(
    () => interval("2026-09-29T09:00Z", "2026-09-29T08:00Z"),
    /after/,
  );
});

test("adjacency is allowed and overlap is not transitive", () => {
  const a = interval("2026-09-29T09:00Z", "2026-09-29T11:00Z");
  const b = interval("2026-09-29T10:00Z", "2026-09-29T12:00Z");
  const c = interval("2026-09-29T11:00Z", "2026-09-29T13:00Z");
  assert.equal(overlaps(a, b), true);
  assert.equal(overlaps(b, c), true);
  assert.equal(overlaps(a, c), false);
});

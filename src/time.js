const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(Z|([+-])(\d{2}):(\d{2}))$/;

export function parseTimestamp(value) {
  const match = typeof value === "string" && TIMESTAMP.exec(value);
  if (!match)
    throw new Error("timestamp: use YYYY-MM-DDTHH:mm with Z or a UTC offset");
  const [, y, mo, d, h, mi, zone, sign, oh, om] = match;
  const [year, month, day, hour, minute] = [y, mo, d, h, mi].map(Number);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  )
    throw new Error("timestamp: invalid date or time");
  const offsetHours = Number(oh ?? 0),
    offsetMinutes = Number(om ?? 0);
  if (offsetHours > 23 || offsetMinutes > 59 || zone === "-00:00")
    throw new Error("timestamp: invalid offset; use Z or +00:00 for UTC");

  // Date.UTC remaps years 0–99; setUTCFullYear preserves the written year.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error("timestamp: invalid calendar date");
  const offset = (offsetHours * 60 + offsetMinutes) * (sign === "-" ? -1 : 1);
  return date.getTime() - offset * 60_000;
}

export function interval(startText, endText) {
  const start = parseTimestamp(startText),
    end = parseTimestamp(endText);
  if (end <= start) throw new Error("End must be after start.");
  return { start, end };
}

export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

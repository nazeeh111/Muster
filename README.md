# Muster

**Repair a volunteer rota without losing the commitments that still work.**

Muster is a local browser worksheet for small events. Mark a cancellation, keep settled assignments locked, and calculate a proposal that fills as many positions as possible while minimizing changes. When a group of positions cannot be covered together, the worksheet identifies that group and its maximum possible coverage.

No account, backend, runtime dependencies, or schedule uploads. Inputs stay in this browser unless you export them. The included community-pantry rota is synthetic.

## Try it locally

Serve this directory using Python 3, then open the printed local address:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# Open http://127.0.0.1:8000/
```

Use a modern browser with JavaScript modules and Web Workers. Opening `index.html` directly as a file is unsupported. You can serve the downloaded source entirely offline; no CDN, fonts, APIs, analytics or package installation are required.

The initial example has five positions and a cancellation. Two driver positions each have an eligible person, but that person can take only one assignment. The maximum is **four of five positions**, even though each driver position is individually fillable.

1. Open **People & availability**, edit **Cy**, and select **Saturday · morning** as a hypothetical availability change.
2. Save, return to **Rota**, and **Calculate repair**. All five positions fill; Bob's locked welcome-desk commitment is retained.
3. Review the proposal against the reference column. Export a project for later editing or an assignment CSV for human review. Changing a scenario does not obtain anyone's consent or contact volunteers.

Use **Project setup** to add roles and time blocks, then add people and positions. Edit a position to set its reference assignment or locked commitment. A person cannot fill two positions in the same block. Inputs that conflict with a lock are rejected; unlock or change that commitment explicitly first.

## A precise decision rule

The solver optimizes these objectives **in order**, not as interchangeable preferences:

1. Fill the most positions.
2. Among those solutions, change the fewest reference assignments. An unfilled reference position counts as changed. Filling a previously unassigned position is shown as an addition, but is not penalized as a changed commitment.
3. Among those solutions, minimize the sum of squared assignment counts across people.

For example, counts 2/0 have squared sum 4; counts 1/1 have sum 2. This balances **counts**, not hours, hardship or personal preferences. Locks are hard constraints and cannot be sacrificed for a better score. Multiple proposals can share the same optimum; tie-breaking is deterministic for the same input order.

A shortage is a collective constraint, not a suggestion to override someone's availability. The solver extracts a deficient set of positions from a residual network and independently recomputes its maximum coverage using unweighted flow. The UI shows demand and capacity for that set. It does not claim the set is the smallest possible explanation or that any suggested input edit is the smallest repair.

Read the [mechanism walkthrough](docs/mechanism.md) for the graph, tradeoffs, example and extension boundaries.

## Save, undo and review

- Valid worksheet changes are saved in browser local storage. **Export project** produces a portable JSON copy. Browser storage can be cleared or unavailable; it is not a backup or encrypted vault.
- **Undo** restores up to 30 previous input states during the current session. Proposals are invalidated whenever inputs change and recomputed after reload.
- **Use proposal as reference** explicitly accepts a new comparison baseline. It does not send or publish assignments.
- Import is limited to 1 MiB, validates before replacement, rejects duplicate JSON keys and asks before replacing the worksheet. Unknown fields are rejected so misspelled constraints cannot be silently ignored.
- The advanced JSON editor keeps unapplied drafts across calculations and model changes. Apply or explicitly discard the draft. Unapplied drafts are session-local; navigation warns before discarding them. Export project includes the validated worksheet, not an unapplied draft.
- Unreadable saved input is retained behind recovery controls. Storage failure keeps changes in memory and warns you to export. CSV cells are quoted, and formula-like names receive a leading apostrophe for spreadsheet safety.

## Model limits

Up to 32 people, 16 named time blocks, 12 roles and 64 positions. A person has role eligibility, block availability, and an integer assignment cap of 0–16. A position has one required role and occupies its entire block. Several positions may share a block; each person can take only one of them.

**Blocks must be mutually non-overlapping.** Muster has no clock/calendar interpretation, travel, minimum rest, shift lengths, ranked preferences, historical fairness, legal compliance, notifications or live multi-user collaboration. It is a review worksheet, not an employee scheduling or labor-policy system. Model all commitments that should consume capacity; omitted outside commitments are not inferred.

The browser stops a worker that exceeds eight seconds. A result covers only the declared model, not real-world availability or every possible scheduling rule. See [verification](docs/verification.md) for observed evidence and limits.

## Development

Node.js 22 or later, no install step:

```sh
npm test
```

Tests include seeded exhaustive enumeration of tiny schedules, simultaneous positions, lock conflicts, objective ordering, shortage capacity, input validation, storage failures and CSV handling. CI runs the same suite on Node 22 and 24. The browser UI is a separate manual acceptance surface.

Original MIT software. Flow optimization and scheduling are established techniques. [OR-Tools](https://developers.google.com/optimization/scheduling/employee_scheduling) and [Timefold](https://docs.timefold.ai/employee-shift-scheduling/latest/introduction) address much broader scheduling needs. Muster's focus is a small, inspectable, local repair workflow; no claim of solver novelty or demonstrated organizational adoption is made.

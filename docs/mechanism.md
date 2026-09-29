# How Muster explains an impossible rota

The community-pantry example has two driver positions in different blocks. Ada is eligible and available for both, but has a total limit of one. Cy used to cover Saturday and has cancelled that block. A per-position check says each driver position can be assigned to Ada; the joint schedule still needs one more assignment than the available capacity permits.

## The named-block graph (`muster/v1`)

Each unit of flow is an assignment. Edges connect:

```text
source → position → (person, block) → person → sink
          cap 1           cap 1       remaining total capacity
```

A position connects to a person/block only if the person has its role and availability. The middle capacity prevents a person filling simultaneous positions. The final capacity prevents exceeding the person's whole-rota limit. Valid locks are assigned first and consume both capacities. Invalid locks are input errors, not soft preferences.

`network` in [solver.js](../src/solver.js) creates this graph. `minCostMaxFlow` augments until no more positions can be filled. Prior-preserving assignment edges receive a reward larger than any possible difference in squared loads. Unit edges to the sink have successive costs `2k−1`, whose sum is a square. Together these implement the stated lexicographic objective without trading coverage for fairness.

The initial network is layered and acyclic, so initial shortest distances can be computed in node order. Later augmentations use reduced-cost Dijkstra with node potentials, including reverse edges that allow earlier choices to be rearranged. A greedy “first eligible person” algorithm cannot make these repairs reliably.

## The named-block explanation

If coverage is incomplete, residual reachability identifies a group of unfilled or competing positions. `subsetCapacity` recomputes that group's maximum assignment count with an unweighted augmenting-path algorithm, accounting for all locked occupancy and total limits. The report gives the selected demand, maximum capacity and deficit. It is a verified deficient group for this model, not a minimum-cardinality explanation.

This matters when two people have high total limits but only one relevant time block: summing their total limits alone would overstate capacity. The person/block nodes remain in the capacity check.

In the pantry example, the selected pair demands two assignments and permits only one. Editing Cy's Saturday availability in a hypothetical copy permits both drivers and full coverage. The interface never makes that change automatically; a real coordinator must confirm actual availability separately.

## Timed blocks (`muster/v2`)

Timed projects keep the same positions, role eligibility, block availability, locks and three ordered objectives. Every block has explicit-offset start and end timestamps; positions in a block inherit that interval. The validator checks real dates and positive duration. A person cannot hold two positions whose half-open intervals overlap, even when the block IDs differ. Adjacent intervals do not conflict. Availability for one block is not inferred from another.

The named-block graph alone cannot enforce arbitrary overlaps. When all timed blocks are disjoint, that graph remains valid. Otherwise, timed search uses an optimistic assignment relaxation to bound possible scores, then checks actual assigned intervals and explores conflicts until it can prove the best feasible score or reaches its search limit. A returned feasible proposal is marked unproven if that limit is reached. The original residual subset explanation does not certify interval shortages. Only a proven timed result can show a whole-rota maximum coverage and deficit. It does not name a smallest bottleneck group. The browser's outer eight-second worker limit can stop the calculation without any result.

## Tradeoffs and extension points

- A v1 named block is atomic and different v1 blocks are assumed disjoint. Convert deliberately to v2 to model overlapping clock intervals; every v2 block needs both endpoints. Travel and rest still are not modeled.
- Sum of squared loads is transparent and is minimized when the search proves the optimum. It does not measure hours, preferences or historic workload.
- Imported reference assignments may now be unavailable; that is the repair use case. Locks, by contrast, must be valid now.
- `validateModel` is shared by the app and worker. It rejects unknown fields, out-of-range sizes, invalid references and conflicting locks before computing.
- The UI stores only valid input changes. Results are not reused after edits. The worker is replaceable without giving it DOM access or network capabilities.

To add a supported constraint, first identify whether either solver can enforce it without changing the declared objective. Check small cases against exhaustive enumeration before claiming an exact result. If a rule cannot be represented and verified, state it as a model limit instead of silently approximating it.

## Existing work

- [Google OR-Tools employee scheduling](https://developers.google.com/optimization/scheduling/employee_scheduling) demonstrates general coverage and balancing.
- [Timefold manual intervention](https://docs.timefold.ai/employee-shift-scheduling/latest/manual-intervention) supports pinned assignments.
- [Timefold assignability analysis](https://docs.timefold.ai/employee-shift-scheduling/latest/user-guide/assignability-analysis) explains per-shift assignment restrictions and what-if changes. Muster does not claim those products lack collective diagnostics.

No code from these projects is incorporated into this implementation.

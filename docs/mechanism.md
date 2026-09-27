# How Muster explains an impossible rota

The community-pantry example has two driver positions in different blocks. Ada is eligible and available for both, but has a total limit of one. Cy used to cover Saturday and has cancelled that block. A per-position check says each driver position can be assigned to Ada; the joint schedule still needs one more assignment than the available capacity permits.

## The graph

Each unit of flow is an assignment. Edges connect:

```text
source → position → (person, block) → person → sink
          cap 1           cap 1       remaining total capacity
```

A position connects to a person/block only if the person has its role and availability. The middle capacity prevents a person filling simultaneous positions. The final capacity prevents exceeding the person's whole-rota limit. Valid locks are assigned first and consume both capacities. Invalid locks are input errors, not soft preferences.

`network` in [solver.js](../src/solver.js) creates this graph. `minCostMaxFlow` augments until no more positions can be filled. Prior-preserving assignment edges receive a reward larger than any possible difference in squared loads. Unit edges to the sink have successive costs `2k−1`, whose sum is a square. Together these implement the stated lexicographic objective without trading coverage for fairness.

The initial network is layered and acyclic, so initial shortest distances can be computed in node order. Later augmentations use reduced-cost Dijkstra with node potentials, including reverse edges that allow earlier choices to be rearranged. A greedy “first eligible person” algorithm cannot make these repairs reliably.

## The explanation

If coverage is incomplete, residual reachability identifies a group of unfilled or competing positions. `subsetCapacity` recomputes that group's maximum assignment count with an unweighted augmenting-path algorithm, accounting for all locked occupancy and total limits. The report gives the selected demand, maximum capacity and deficit. It is a verified deficient group for this model, not a minimum-cardinality explanation.

This matters when two people have high total limits but only one relevant time block: summing their total limits alone would overstate capacity. The person/block nodes remain in the capacity check.

In the pantry example, the selected pair demands two assignments and permits only one. Editing Cy's Saturday availability in a hypothetical copy permits both drivers and full coverage. The interface never makes that change automatically; a real coordinator must confirm actual availability separately.

## Tradeoffs and extension points

- A named block is atomic. Splitting overlapping clock intervals into arbitrary labels would break the one-at-a-time guarantee. Supporting overlap, travel or rest requires a richer model and solver; adding UI fields alone is insufficient.
- Sum of squared loads is transparent and exactly optimized, but it does not measure hours, preferences or historic workload.
- Imported reference assignments may now be unavailable; that is the repair use case. Locks, by contrast, must be valid now.
- `validateModel` is shared by the app and worker. It rejects unknown fields, out-of-range sizes, invalid references and conflicting locks before computing.
- The UI stores only valid input changes. Results are not reused after edits. The worker is replaceable without giving it DOM access or network capabilities.

To add a supported constraint, first identify whether it can be represented by capacities/costs without changing the declared objective. Add a small exhaustive-enumeration counterexample before changing the flow graph. If it cannot fit this graph, change the model contract instead of pretending an approximate heuristic has the same guarantee.

## Existing work

- [Google OR-Tools employee scheduling](https://developers.google.com/optimization/scheduling/employee_scheduling) demonstrates general coverage and balancing.
- [Timefold manual intervention](https://docs.timefold.ai/employee-shift-scheduling/latest/manual-intervention) supports pinned assignments.
- [Timefold assignability analysis](https://docs.timefold.ai/employee-shift-scheduling/latest/user-guide/assignability-analysis) explains per-shift assignment restrictions and what-if changes. Muster does not claim those products lack collective diagnostics.

No code from these projects is incorporated into this implementation.

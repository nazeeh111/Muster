# Verification

Local work on September 27, 2026, macOS arm64, Node 24.14.0:

- 11 Node tests passed. The seeded tiny-case test independently enumerates feasible assignments and compares the complete objective tuple and shortage-subset capacity.
- An independent reviewer ran 600 additional mixed-role/block cases with valid multiple locks against exhaustive enumeration, checked deterministic repeats, and found no objective/capacity discrepancy in that sample.
- A dense synthetic case with 32 people, 16 blocks and 64 positions completed locally in approximately 18 ms. A 64-position single-block shortage completed in approximately 16 ms. These are small feasibility observations, not a portable performance benchmark.
- A fresh review found advanced JSON drafts were overwritten on result rendering. The bug was reproduced in Chrome and a separate DOM harness. Draft retention, explicit discard/apply, worker-completion and model-change handling, and navigation protection were then checked. The harness used an existing local happy-dom installation; it is not part of the dependency-free project test suite.
- Chrome desktop: initial pantry example covered 4/5 and explained demand2/capacity1; adding Cy's Saturday availability yielded 5/5 with the Bob lock retained. Reload restored saved inputs and recalculated. Recalculation retained an unapplied JSON draft after the fix.

- The in-page asynchronous confirmation paths were independently checked for approval-before-mutation and cancellation preserving drafts, stored data, and nested editors.
- Chrome exported the repaired project and assignment CSV. The actual downloaded JSON retained Cy's Saturday availability and Bob's lock; CSV parsed as a header plus five assignments. Cancelling example replacement preserved the repaired model, approving replacement restored the shortage, and importing the actual downloaded repaired project restored full coverage.
- At 390×844, the staffing table stays within a horizontally scrollable region. It receives keyboard focus and ArrowRight scrolls it. The final desktop layout opens directly on the worksheet. This is not an accessibility certification. Captured console errors were from an installed browser extension, not the application origin.

- Chrome rejected an imported duplicate-key JSON file with an explicit error while retaining the repaired five-position proposal and its lock.

[GitHub CI 36339990912](https://github.com/nazeeh111/Muster/actions/runs/36339990912) passed on `98a3e052d13dfb096dec4d96fd8ada3b679cfc7b`: both Node 22 and 24 ran all 11 tests and browser-module syntax checks. The public GitHub Pages deployment of that revision was exercised in Chrome: the initial 4/5 shortage displayed Ada's remaining capacity and per-block limits; editing Cy's Saturday availability produced 5/5 and retained Bob's lock. Module and worker paths worked under `/Muster/`. Subsequent source formatting does not change the scheduling contract.

These checks do not establish universal solver correctness, accessibility compliance, real-world volunteer availability or suitability for labor-law scheduling. Only disjoint named blocks and the documented capacities are modeled. Browser storage is neither encrypted storage nor a durable backup.

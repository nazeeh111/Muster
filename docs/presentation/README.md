# A shared allowance is a collective constraint

The included synthetic pantry rota has five positions. Two need a driver: Friday collection and Saturday delivery. Ada can do either, but her **total assignment cap is one**. Cy's Saturday cancellation leaves only Ada eligible for that pair. Muster correctly fills four positions and identifies the pair's capacity as one. This is a subset witness, not a shortage caused by overlapping times: these are distinct named blocks.

In the actual browser, select **People & availability → Edit Cy → Saturday morning → Save changes**, return to Rota, then **Calculate repair**. No other input changes. All five positions fill, all references are restored, and Bob's welcome-desk lock remains fixed. This is a hypothetical availability edit, not a recommendation to override a cancellation or an assertion of consent.

| Declared objective, in priority order | Before | After |
| --- | ---: | ---: |
| Unfilled positions | 1 | 0 |
| Changed existing reference assignments | 1 | 0 |
| Sum of squared assignment counts | 4 | 5 |

The squared count increases when the previously idle person takes an assignment. Coverage comes first. Those objectives are lexicographic, not a weighted tradeoff. A separate exhaustive enumeration of all possible assignments to these five positions agrees with both objective triples and finds a unique optimum for each input. This is a bounded check, not a new performance or general scheduling study.

## Reopen without installing packages

Download and extract [worked-example.zip](worked-example.zip). It has its own included guide, inputs, outputs, exact source modules, complete browser application, figures, notices and checksums. With **Node 22 or later**, run from any directory:

```sh
node /absolute/path/to/extracted/reopen.mjs
```

The reader verifies every listed file, executes the unmodified native solver on both saved projects, compares complete results and raw CSV bytes, checks the actual browser-exported project, and exercises unknown-field and duplicate-key refusals. It needs no network or npm install. `MANIFEST.json` is an unsigned integrity inventory, not an authenticity claim.

To edit the included app, serve the extraction with Python 3:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory /absolute/path/to/extracted
# Open http://127.0.0.1:8000/app/
```

Use Project actions → Import project, choose `browser-project.json` and confirm replacement. **Calculate repair** after import; importing deliberately clears the prior proposal. Export project saves the input model. Assignment CSV is for human review, not project import. The app requires a local HTTP origin; opening app/index.html as a file is unsupported. No external fonts, APIs or package dependencies are needed.

## Inspect the delivered evidence

- [Before input](before-project.json), [native result](before-result.json), [CSV](before-assignments.csv).
- [After input](after-project.json), [native result](after-result.json), [CSV](after-assignments.csv).
- [Actual browser-exported project](browser-project.json) and [CSV](browser-assignments.csv), exactly compared with native output.
- [Actual desktop worksheet](worksheet-desktop.png) and [390px phone worksheet](worksheet-mobile.png). These show the completed repaired proposal, not a mocked interface.
- [Desktop eligibility diagram](capacity.html) and [mobile diagram](capacity-mobile.html), with [vector source](capacity.svg) and [reproducible generator](figure.py).

The diagram shows both actual eligibility links to Ada and **all five** before/after assignments. Links represent eligibility, not chosen assignments. They do not depict the solver's full flow network. Layout has no physical or timing scale. The data comes from the saved models/results; Georgia and Arial match the application's system serif/sans character and require no downloaded font assets. Exact delivered file hashes and source provenance are in [figure-manifest.json](figure-manifest.json).

## Provenance and limits

App/modules are unchanged copies of public source `aed0636566e7936c996564beeecb9c69172ea3a6`, Muster `0.2.2-dev.0`. The [historical v0.2.1 release](https://github.com/nazeeh111/Muster/releases/tag/v0.2.1) is a different delivery. The original [MIT notice](LICENSE.txt) is retained. The root repository's mechanism, timed-mode rules, verification, privacy and recovery documentation remain authoritative.

Actual browser checks covered availability edit, locked commitment, exact project/CSV exports, Undo, cancelled edit, invalid import preservation, fresh context import and reload, keyboard calculation and 390px rendering. The existing 59 Node tests passed. Timed overlap, multi-tab concurrency, every browser and assistive-technology speech were not newly exhaustively tested. Locks are model constraints. No contact, staffing consent, legal compliance, travel, rest, hour balancing or labor-policy validation follows.

Browser saves are local and can fail or be cleared. Export a project for a backup. No account, upload or notification occurs.

# Muster: a shared assignment cap

This is the complete synthetic worked example, not a new application or a staffing recommendation. Node22+ checks the native solver without installing anything:

```sh
node /absolute/path/to/extracted/reopen.mjs
```

For the actual worksheet, serve this extraction with Python3:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory /absolute/path/to/extracted
```

Open http://127.0.0.1:8000/app/. Import [browser-project.json](browser-project.json) through Project actions, confirm, then Calculate repair. Import deliberately invalidates the previous proposal. This project is the completed 5/5 case. [before-project.json](before-project.json) restores the 4/5 cancellation case. Browser data is local and can be cleared; export a project as backup. No account or network requests beyond the local static files.

[Before result](before-result.json) and [after result](after-result.json) contain complete native assignments, objectives and shortage witness. All local source modules are unmodified from public commit aed0636566e7936c996564beeecb9c69172ea3a6, version0.2.2-dev.0. Native first-use only needs a modern JavaScript browser with modules/Workers. The checker needs Node22+. Source [MIT license](LICENSE.txt), [integrity inventory](MANIFEST.json), [figure provenance](figure-manifest.json).

[Desktop diagram](capacity.html), [phone diagram](capacity-mobile.html), [actual desktop](worksheet-desktop.png), [actual phone](worksheet-mobile.png). The diagrams show eligibility, not the full flow network or a physical/timing scale. Two driver positions share Ada's total cap1. Cy becoming available on Saturday is the only input change; Bob's lock remains. No consent, scheduling policy, physical availability, general optimizer performance or all-browser certification is implied.

The checker verifies every file then compares both complete native results, exported CSVs and the actual browser-exported model, and tests duplicate-key/unknown-field refusals. `MANIFEST.json` is unsigned. It intentionally excludes itself to avoid a hash cycle; verify a trusted outer archive hash separately if provenance matters.

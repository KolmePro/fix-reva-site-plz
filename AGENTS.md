# AGENTS.md

## Project overview

This repository contains a small, dependency-free Chrome/Chromium Manifest V3 extension. It injects content scripts into RevOnline and VK Play pages to add bulk PIN-code helpers and card-opening controls.

There is no build step, package manager, test runner, background worker, or options page. The files in the repository root are the extension's distributable source.

## Repository map

- `manifest.json`: extension metadata, version, page match patterns, and content-script registration.
- `revonline-pins.js`: bulk PIN-code entry on `https://revonline.ru/pin`.
- `revonline-collection.js`: automated card opening and prize selection on `https://revonline.ru/collection`.
- `revonline-cart.js`: automatic six-item transfers on RevOnline cart URLs matching `https://revonline.ru/cart*`.
- `vkplay-pins.js`: PIN-code collection helpers on `https://market.vkplay.ru/*`.
- `logo.png`: extension artwork; currently not referenced by the manifest.

## Working conventions

- Keep the extension dependency-free unless the task explicitly requires a tooling change.
- Use plain browser JavaScript supported by current Chromium. Do not introduce module imports unless the manifest and loading strategy are deliberately updated as part of the same change.
- Preserve UTF-8 encoding and existing Russian user-facing text. PowerShell 5 may display UTF-8 text as mojibake when `Get-Content` is used without an explicit encoding; do not rewrite text merely because the terminal renders it incorrectly.
- Keep changes scoped to the content script for the affected site. Shared selectors or behavior should not be assumed across RevOnline and VK Play.
- Treat third-party DOM selectors as fragile integration points. Before changing one, inspect all related query, click, retry, and cleanup logic.
- Make injected controls idempotent: check for an existing ID or marker before adding an element or listener. Mutation observers may run many times on dynamic pages.
- Keep injected UI above host-page overlays where needed and avoid broad CSS that can affect the host page. Existing scripts intentionally use inline styles and unique IDs.
- Guard DOM lookups because target sites can render asynchronously or change their markup. Do not turn a missing optional element into an uncaught exception.
- When adding polling or timers, provide a clear success/stop path and avoid creating duplicate intervals or unbounded parallel retry chains.
- Never log PIN-code values, account data, or other user secrets in new code. Existing diagnostic logging may be made less sensitive when touched.
- Avoid drive-by reformatting. These scripts are directly shipped files, so small, reviewable diffs are preferred.

## Manifest and releases

- Keep `manifest.json` valid JSON; comments and trailing commas are not allowed.
- Add or adjust `content_scripts.matches` only when the requested behavior needs a different origin or path. Use the narrowest suitable match pattern.
- If a functional change is intended for release, bump the manifest version in the same change. Use `major.minor` or `major.minor.patch` consistently with the release request; do not bump it for documentation-only changes.
- New images or other extension resources must be declared in the manifest when Chromium or a web page needs to load them.
- Do not add permissions unless required, and document why any new permission is necessary.

## Validation

Run syntax checks for every changed JavaScript file:

```powershell
node --check revonline-pins.js
node --check revonline-collection.js
node --check revonline-cart.js
node --check vkplay-pins.js
```

Also confirm that the manifest parses:

```powershell
Get-Content -Raw -Encoding UTF8 manifest.json | ConvertFrom-Json | Out-Null
```

There are no automated behavioral tests. For behavior changes, load the repository as an unpacked extension from `chrome://extensions` with Developer mode enabled, then reload both the extension and the target page after each edit.

Use the relevant manual checks:

- RevOnline PIN page: the bulk-entry button appears once; empty input is rejected; PINs separated by spaces, commas, or newlines are processed sequentially; progress is updated and removed at completion.
- RevOnline collection page: the control appears once inside the loaded iframe; start/stop works; prize selection is honored; confirmation dialogs do not create duplicate timers.
- RevOnline cart page: the auto-transfer checkbox appears once below the transfer button; no transfer occurs below six queued items or while the button is disabled; a full queue is submitted and confirmed once; the success dialog closes using its close icon; disabling automation stops later actions.
- VK Play market: the panel appears once after dynamic rendering; existing buttons migrate into it; copying lists only visible/unused PINs; opening all PINs does not duplicate click handlers.
- On every affected page, inspect the browser console for uncaught exceptions and verify that unrelated host-page controls still work.

If the target site or authenticated test data is unavailable, report that limitation explicitly and state which static checks were completed.

## Change handoff

Summarize the user-visible behavior changed, list the validation performed, and call out any selectors or timing assumptions that could only be verified against the live sites. Do not claim browser verification when only syntax or static checks were run.

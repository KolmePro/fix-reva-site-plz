# AGENTS.md

## Project overview

This repository contains a small, dependency-free Chrome/Chromium Manifest V3 extension. It injects content scripts into RevOnline and VK Play pages to add bulk PIN-code helpers and card-opening controls.

There is no build step, package manager, test runner, background worker, or options page. The files in the repository root are the extension's distributable source.

## Repository map

- `manifest.json`: extension metadata, version, page match patterns, and content-script registration.
- `revonline-pins.js`: bulk PIN-code entry on `https://revonline.ru/pin`.
- `revonline-collection.js`: automated card opening and prize selection on `https://revonline.ru/collection`.
- `revonline-cart.js`: automatic six-item transfers on RevOnline cart URLs matching `https://revonline.ru/cart*`.
- `revonline-chests.js`: opt-in sequential API opening of identical storage chests with the user's selected reward on the same cart URLs.
- `revonline-atum.js`: bounded automatic Atum wheel spins, optional sequential API turbo mode, and aggregated reward reports on `https://revonline.ru/atum`.
- `vkplay-pins.js`: PIN-code collection helpers on `https://market.vkplay.ru/*`.
- `logo.png`: extension artwork; currently not referenced by the manifest.
- `scripts/package-extension.ps1`: creates the minimal ZIP package uploaded to Chrome Web Store.
- `scripts/publish-chrome-web-store.ps1`: validates API access, uploads a package, and submits it for automatic publishing after review.
- `.github/workflows/chrome-web-store.yml`: validates, packages, and publishes tagged releases.

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
- Keep the README changelog high-level. Add entries only when a release introduces a new user-facing feature; omit bug fixes, hints, styling adjustments, and internal development or release tooling.

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
node --check revonline-chests.js
node --check revonline-atum.js
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
- RevOnline Atum page: one auto-spin button appears below Play in the loaded iframe without overlapping the token balance or purchase controls; the dialog defaults to the current maximum and accepts only whole amounts from 1 to that balance; minus/plus controls respect the limits without submitting the form; zero/unknown balance prevents starting. Start clicks Play once per attempt, waits for the prize popup, clicks its Continue once, and waits for it to close before the next spin; the chosen attempt limit is never exceeded (even if rewards increase the balance). Stop prevents all later clicks, including Continue; a spin already submitted to the site can still finish. Verify stopping on errors, timeouts, iframe replacement, and exhausted/unknown balance; no automatic buying or retrying failed spins. Cancel/Escape in the quantity dialog must not start automation.
- Atum turbo mode: opt-in and off by default; validate the current game and balance through GET `/minigames/roulette/api/info`, then send sequential POST `/minigames/roulette/api/turn` requests with same-origin credentials and the site's CSRF header when present. At most one request may be in flight; require HTTP success, `state: "Success"`, a valid Atum balance, and a recognizable prize before proceeding. Never retry POST requests after errors, HTTP 429, malformed responses, or timeouts. Stop waits for an in-flight response to include its confirmed reward, then stops; block manual iframe interaction during turbo and reload only the same iframe afterward to sync Vue state. No extra host permissions or automatic purchases.
- Atum turbo UI: the switch must show explicit on/off text and a purple enabled state, work with mouse/Space/Enter without submitting the form, and start off each time the dialog opens. Host-page checkbox styles must not hide the control.
- Atum reward reports: update the list after each received prize in both modes, aggregate equal prizes/packs, count occurrences (not items inside each pack), and sort by ascending occurrence count with a Russian title tie-breaker. Do not show a separate confirmed-reward total; clear the previous list on a new run. Keep partial rewards after Stop/errors and explicitly flag unconfirmed final attempts only after stopping. Render server/DOM prize titles as text, never HTML. Verify both the ordinary DOM loop and turbo; use local API fixtures for automated checks without spending live tokens.
- VK Play market: the panel appears once after dynamic rendering; existing buttons migrate into it; copying lists only visible/unused PINs; opening all PINs does not duplicate click handlers.
- On every affected page, inspect the browser console for uncaught exceptions and verify that unrelated host-page controls still work.
- Storage chests: one purple bulk checkbox appears in each chest dialog, off by default; caskets remain unchanged. With bulk disabled, the native Open action remains unchanged. With bulk enabled, capture Open before the native handler, require a selected reward for choice chests, and snapshot only current same-name chest IDs. Verify each chest's type and full item ID/title/count signature by GET before opening it by POST; different contents must not be opened. Freeze the user's choice, allow only one request in flight, and stop on errors/timeouts or changed page state except for the explicit HTTP 503 retry policy below. Stop/Escape waits for an in-flight response and prevents later opens. Reflect confirmed rewards in storage without changing the transfer queue; uncertain results require refresh. Test both choice and fixed-content chests using local fixtures, without opening real inventory during tests.
- Chest HTTP 503 retries: wait 3 seconds before retrying, at most three retries per chest across its GET/POST requests. Before a POST retry, revalidate the same chest ID and full contents via GET, keeping the frozen choice. Do not delay successful openings or retry other HTTP errors, timeouts, network failures, invalid JSON, or rejected application responses. Stop/Escape/pagehide cancels the pending wait and prevents later requests. Keep an ambiguous POST result flagged until a successful opening is confirmed; stopping during the wait or failed revalidation after a POST requires refresh. Verify the retry limit, exact wait, no parallel requests, and unchanged progress for failed attempts with local fixtures.

If the target site or authenticated test data is unavailable, report that limitation explicitly and state which static checks were completed.

## Change handoff

Summarize the user-visible behavior changed, list the validation performed, and call out any selectors or timing assumptions that could only be verified against the live sites. Do not claim browser verification when only syntax or static checks were run.

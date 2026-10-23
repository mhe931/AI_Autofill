# AI Form Filler

A general-purpose automation suite for intelligent form mapping and dynamic data injection, powered by any LLM.

Developed by **[Daniel Ebrahimzadeh](https://github.com/mhe931)**.

## How It Works

1. **Configure your profile** — Paste your resume, bio, or any personal context into the User Profile section. Stored locally, persists across sessions.
2. **Extract** — Navigate to any web form and click "Extract Form HTML". The extension merges your profile + historical data + form HTML into a single LLM-ready prompt.
3. **Paste to AI** — Send the prompt to any LLM (Gemini, ChatGPT, Claude, Copilot, etc.).
4. **Execute** — Paste the LLM's JSON response back and click "Execute Injection". The extension maps keys to form fields and fills them automatically.

## Features

- **Dynamic User Profile**: Configure your own identity, skills, and context — no hardcoded data. Any user can set up the extension for their own form-filling needs.
- **Context-Aware Extraction**: Builds structured LLM prompts from the profile, optional captured history and a live-value form snapshot. Password/hidden fields and executable markup are excluded.
- **Textarea-Centric Data Flow**: The popup textarea is the central hub — Extract writes to it, Paste reads from it, Injection parses from it. Content persists across popup sessions via `chrome.storage.local`.
- **LLM Paste Engine**: Injects prompts using `execCommand('insertText')` and native property setters for compatibility with React/Angular/Vue-controlled inputs.
- **Verified JSON Injection**: Auto-strips markdown code fences and validates a flat JSON object. Exact IDs/names take precedence over exact unique labels, ARIA labels, or placeholders. Ambiguous and partial matches are not filled.
- **Angular / DSpace Controls**: Uses native input setters and input/change/blur events, real checkbox/radio clicks, and real `ds-dynamic-scrollable-dropdown` option interaction (including DSpace's mousedown selection). Supports native dates and DSpace's split `ds-date-picker` controls.
- **Field-Level Results**: Reads values back after updates and again before returning. The popup keeps the last report of verified fills, failures, skipped mappings and manually required controls. Attempted assignments do not count as fills.
- **Textarea Controls**: Clear, Copy, and Paste buttons for quick data management. Clipboard Paste replaces entire content.
- **Messaging Resilience**: Automatic content script re-injection on port disconnection, with single retry before prompting page reload.
- **Local Data Warehouse**: Tabular storage in `chrome.storage.local`. Capture form data, view as HTML table, export/import JSON backups.
- **Dark Theme**: Unified `#121212` / `#f2c100` palette across all UI surfaces.
- **Global Deployment**: `<all_urls>` content script injection for universal form targeting.

## URL Support

Extraction and injection cannot execute on internal browser pages (`chrome://`, `edge://`). Operate on `http://` or `https://` targets only.

## Repository Structure

- `manifest.json` — Extension configuration, permissions, icon mappings
- `content.js` — Dynamic prompt builder, form scraper, LLM paste handler, fill engine
- `autofill.js` — Conservative matching, native/DSpace control adapters and asynchronous value verification
- `popup.html/js` — UI with 3-step workflow (Extract, Paste, Inject) + User Profile + Data Management
- `help.html` — End-user documentation with troubleshooting

## Installation

1. Clone: `git clone https://github.com/mhe931/ai-form-filler.git`
2. Open `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load Unpacked** and select the repository folder

## Osuva submission forms

Reload the unpacked extension in `chrome://extensions/` and refresh the form page after updating.
Extract the current page's form rather than reusing identifiers from a different submission step.
Use exact field IDs/names in the JSON, exact visible text for custom dropdown options, booleans for
checkboxes, and ISO dates. A DSpace date key is the shared prefix before `_year`, `_month`, `_day`;
its value can be `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. Native date inputs require `YYYY-MM-DD`.

The engine opens custom dropdowns, waits up to 1.5 seconds for rendered options, and selects only
an exact unique option. Missing/unloaded options, unsupported custom widgets, disabled/read-only
controls, file uploads and ambiguous/repeatable fields need manual review. It does not guess a
partial option or silently write to a custom dropdown's read-only display.

**Safety:** submission/action buttons are never activated. URN fields/generation, license
acceptance and academic/legal declarations are always left for the user, even if requested in the JSON. Always review the form
yourself before proceeding. No submission is performed by the extension.

Results describe **each supplied JSON entry**, not every unmapped field on the page:
`filled` means the actual DOM value/checked state persisted through verification; `failed` means
an invalid value, missing option or failed readback; `skipped` means no unique match or a conflicting
key; `manual` means a protected or unsupported control. Partial runs return `success: false`
while retaining their verified fills. Reports persist locally without submitted values.
Empty strings, nulls and explicit unknown markers (`unknown`, `undefined`, `null`, `n/a`,
`not provided`) are skipped, never used to clear correct existing values. Clear a field manually
when needed. Boolean `false` and numeric `0` remain valid values.

Controls must remain visible and pass native validation and any exposed Angular validity/pending
state. A changed Angular control that remains pristine is not counted as committed. Radio
selection includes focus and blur so `updateOn: 'blur'` reactive forms update their model.
Submission-deferred controls require manual completion; the extension never submits to commit them.
Repeated fields need distinct exact IDs; duplicate IDs/names or labels are skipped rather than
guessed. Controls are rediscovered after each update to handle newly rendered form-array fields.
Dropdown options are scoped to their own component, even if listbox IDs are duplicated.

Captured history excludes password, hidden, payment and one-time-code inputs, and unchecked
choices. Warehouse imports require valid records and the viewer treats stored values as text.
Local storage is not encrypted; retain only information you intend to reuse. All-page content
script access remains for the extension's general-purpose workflow; the redundant `tabs`
permission has been removed.

### Regression checks

With Node.js 22.13+ (or 24+) and npm:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The tests use `tests/fixtures/osuva.html`, a synthetic representative submission form based on
public [DSpace dropdown](https://github.com/DSpace/dspace-angular/blob/main/src/app/shared/form/builder/ds-dynamic-form-ui/models/scrollable-dropdown/dynamic-scrollable-dropdown.component.html),
[date picker](https://github.com/DSpace/dspace-angular/blob/main/src/app/shared/form/builder/ds-dynamic-form-ui/models/date-picker/date-picker.component.html)
and [number picker](https://github.com/DSpace/dspace-angular/blob/main/src/app/shared/form/number-picker/number-picker.component.html)
templates. They check real DOM values and event-driven state, asynchronous/rejected updates,
exact matching, dates, options, reports and protected actions. No private submission data is used.

The separate browser suite boots **real Angular 20 reactive forms**, bundled locally using pinned
development dependencies. Playwright compares the actual `FormGroup` values with visible controls,
checks dirty/touched state and validation, and exercises asynchronous representative language,
degree and faculty dropdowns, repeatable authors, abstracts, dates, repeated fills and protected
actions. It also verifies that an `updateOn: 'submit'` value is not reported as committed.
The test server is loopback-only and is stopped by Playwright. `CHROMIUM_PATH` can select an
already installed Chromium/Edge executable instead of downloading a test browser.

**Verification boundary:** the Angular fixture models DSpace's public custom-control contract;
it does not run the complete DSpace application. Neither fixture suite proves authenticated
live-Osuva compatibility or server-side acceptance. During the post-merge audit, the public
`https://osuva.uwasa.fi/submit` endpoint presented sign-in; no authenticated submission session
was available. No login, real academic data entry, submission, URN generation or license
acceptance was performed. The deployed Osuva version and unloaded/paginated vocabulary options
remain unverified. Outside tests, verification uses DOM readback and exposed framework state,
not private Angular internals or subsequent server responses.

## Author

**Daniel (Mohammad Hossein) Ebrahimzadeh** — M.Sc. Computing Sciences (AI & Data Engineering), University of Vaasa  
[GitHub](https://github.com/mhe931) | [LinkedIn](https://www.linkedin.com/in/danielebrahimzadeh/) | [Portfolio](https://mhe931.github.io/cv/)

---
*Built for high-velocity local automation workflows.*
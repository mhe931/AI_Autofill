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
- **Context-Aware Extraction**: Builds structured LLM prompts by merging user profile + captured history + scraped form HTML.
- **Textarea-Centric Data Flow**: The popup textarea is the central hub — Extract writes to it, Paste reads from it, Injection parses from it. Content persists across popup sessions via `chrome.storage.local`.
- **LLM Paste Engine**: Injects prompts using `execCommand('insertText')` and native property setters for compatibility with React/Angular/Vue-controlled inputs.
- **Smart JSON Injection**: Auto-strips markdown code fences, validates JSON, and maps keys to form fields via multi-signal fuzzy matching (id, name, label, placeholder, container text).
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
- `popup.html/js` — UI with 3-step workflow (Extract, Paste, Inject) + User Profile + Data Management
- `help.html` — End-user documentation with troubleshooting

## Installation

1. Clone: `git clone https://github.com/mhe931/ai-form-filler.git`
2. Open `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load Unpacked** and select the repository folder

## Author

**Daniel (Mohammad Hossein) Ebrahimzadeh** — M.Sc. Computing Sciences (AI & Data Engineering), University of Vaasa  
[GitHub](https://github.com/mhe931) | [LinkedIn](https://www.linkedin.com/in/danielebrahimzadeh/) | [Portfolio](https://mhe931.github.io/cv/)

---
*Built for high-velocity local automation workflows.*
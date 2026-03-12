# AI Form Filler 🚀

An intelligent automation engine for cross-platform form mapping and dynamic data injection.

Developed by **[Daniel Ebrahimzadeh](https://github.com/mhe931)**.

## 🧠 Context-Aware Extraction (Primary Differentiator)
Unlike generic auto-fill tools, AI Form Filler generates a **complete LLM-ready prompt** that merges:
- **Applicant Profile** — Daniel Ebrahimzadeh's full professional identity (14+ years Data Engineering, M.Sc. at University of Vaasa, Digikala Data Manager, publications, tech stack)
- **Historical Context** — Previously captured form data from the Local Data Warehouse
- **Target Form HTML** — Intelligently scraped `<form>` elements or input-containing DOM containers

The combined prompt appears in the extension textarea *and* is copied to clipboard — ready to paste into any LLM with zero manual formatting.

## 🛠 Features
- **Context-Aware Extraction**: Automatically builds a structured LLM prompt combining profile + history + form HTML
- **Textarea-Centric Data Flow**: The popup textarea serves as the central hub — Extract writes to it, Paste reads from it, Injection parses from it
- **LLM Paste Engine**: Injects prompts into Gemini, ChatGPT, Claude, and other LLM interfaces using `execCommand('insertText')` for framework compatibility
- **Smart JSON Injection**: Auto-strips markdown code fences (`\`\`\`json`), validates JSON, and maps keys to form fields via multi-signal fuzzy matching (id, name, label, placeholder, container text)
- **Real-time User Feedback**: Transient status overlays on the target page and a dedicated message container in the popup
- **Cross-Platform Dark Mode**: Unified `#121212` / `#f2c100` dark theme across all UI surfaces
- **Local Data Warehouse**: Tabular storage in `chrome.storage.local` with `unlimitedStorage`. Capture form data, export/import JSON backups
- **Global Deployment**: `<all_urls>` content script injection for universal form targeting

## ⚠️ URL Support Limitation
Due to Chromium security policies, extraction and injection **cannot** execute on internal browser pages (`chrome://`, `edge://`). Operate on `http://` or `https://` targets only.

## 📁 Repository Structure
- `manifest.json` — Extension configuration, permissions, icon mappings
- `content.js` — Context-aware prompt builder, form scraper, LLM paste handler, dynamic fill engine
- `popup.html/js` — UI layer with 3-step numbered workflow (Extract → Paste → Inject)
- `help.html` — End-user documentation with troubleshooting and best practices

## 🚀 Installation
1. Clone: `git clone https://github.com/mhe931/ai-form-filler.git`
2. Open `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load Unpacked** → select the repository folder

## 📋 Use Case
Originally designed to accelerate academic form workflows (RPL applications, credit transfers) at the University of Vaasa, now generalized as a cross-platform automation suite for any form-heavy administrative process.

## 👤 Author
**Daniel (Mohammad Hossein) Ebrahimzadeh** — M.Sc. Computing Sciences (AI & Data Engineering)
[GitHub](https://github.com/mhe931) | [LinkedIn](https://www.linkedin.com/in/danielebrahimzadeh/) | [Portfolio](https://mhe931.github.io/cv/)

---
*Built for high-velocity local automation workflows.*
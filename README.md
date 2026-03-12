# AI Form Filler 🚀

A high-performance Chrome Extension designed to automate **Dynamic Form Mapping** and **Context Injection**. This tool utilizes advanced data engineering logic to dynamically map professional achievements and JSON schemas directly into complex administrative forms.

Developed by **[Daniel Ebrahimzadeh](https://github.com/mhe931)**.

## 🛠 Features
- **Global Deployment**: Configured with `<all_urls>` permissions to trigger automation across various administrative platforms.
- **Dynamic Extraction Logic**: Intelligently scrapes the active `<form>` or DOM tree and automatically formats requests directly into the clipboard with standardized LLM prompts.
- **Dynamic JSON Mapping**: Supports dynamic, LLM-generated form mapping by persisting an external JSON map in `chrome.storage.local` and using fuzzy/ID matching for universal injection [cite: 2026-03-12].
- **3-Button "Analyze-Generate-Inject" Workflow**: Seamlessly extracts form HTML, pastes it directly into LLM prompts with custom logic, and automatically parses generated JSON for injection back into the form via clipboard integration.
- **Cross-Platform Dark Mode**: A unified `#121212` / `#f2c100` global dark theme spanning the UI and documentation layers, ensuring a zero-strain premium aesthetic.
- **Data Privacy & Local Data Warehouse**: No external API calls are made natively. Includes a tabular Data Warehouse powered by `chrome.storage.local` with `unlimitedStorage`. Users can capture form nodes, map absolute local asset paths, and leverage context-aware Prompt Augmentation to pass relational history to the LLM [cite: 2026-01-24].
- **Portability**: Native full JSON Data Backup & Restore architecture.

## 📁 Repository Structure
- `manifest.json`: Extension configuration and global permissions.
- `content.js`: The core extraction and injection engine that uses label-based heuristic matching.
- `popup.html/js`: The UI layer driving the 3-button architecture.
- `help.html`: Comprehensive documentation for end-users.

## 🚀 Installation for Developers
1. Clone the repository: `git clone https://github.com/mhe931/ai-form-filler.git`
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer Mode**.
4. Click **Load Unpacked** and select the repository folder.

## 👤 Author
**Daniel (Mohammad Hossein) Ebrahimzadeh** *M.Sc. Student in Computing Sciences (AI & Data Engineering)*
[GitHub](https://github.com/mhe931) | [LinkedIn](https://www.linkedin.com/in/danielebrahimzadeh/) | [Portfolio](https://mhe931.github.io/cv/)

---
*Note: This tool is intended for high-velocity local automation workflows.*
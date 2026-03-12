# AI Form Filler 🚀

A high-performance Chrome Extension designed to automate the **Recognition of Prior Learning (RPL)** and **Credit Transfer** application process at the **University of Vaasa**. This tool utilizes a Master's-level data engineering logic to map professional and academic achievements directly into administrative forms.

## 🛠 Features
- **Global Deployment**: Configured with `<all_urls>` permissions to trigger automation across various administrative platforms.
- [cite_start]**Master's-Level Precision**: Pre-loaded with verified data including a **Data Manager** professional history (Digikala Group) and a **List of Publications** (Journal, Book, Conference)[cite: 1, 9, 11, 42].
- **Event-Driven Architecture**: Uses an asynchronous trigger mechanism via the `scripting` API to ensure high stability and zero conversational framing [cite: 2026-01-24].
- **Data Privacy**: No external API calls; all data injection is handled locally within the DOM context for maximum security.

## 📁 Repository Structure
- `manifest.json`: Extension configuration and global permissions.
- `content.js`: The core injection engine that uses label-based heuristic matching.
- `popup.html/js`: The UI layer that allows the user to trigger the "Fill" action manually.
- `help.html`: Integrated documentation for end-users.

## 🚀 Installation for Developers
1. Clone the repository: `git clone https://github.com/mhe931/ai-form-filler.git`
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer Mode**.
4. Click **Load Unpacked** and select the repository folder.

## 📑 Use Case: University of Vaasa RPL
This tool is specifically optimized to handle the **Recognition of Competence** for courses such as:
- Advanced Data Modelling
- Data Storages and Governance
- Data Visualization
- Academic Writing for Master's Students

## 👤 Author
**Daniel (Mohammad Hossein) Ebrahimzadeh** *M.Sc. Student in Computing Sciences (AI & Data Engineering)* [LinkedIn](https://www.linkedin.com/in/danielebrahimzadeh/) | [Portfolio](https://mhe931.github.io/cv/) [cite: 2026-01-24]

---
*Note: This tool is intended for administrative efficiency and requires manual verification of all populated fields before final submission.*
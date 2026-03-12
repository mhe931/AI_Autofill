// === DOM Status Overlay ===
function showStatusOverlay(message) {
    let overlay = document.getElementById('ai-form-filler-status-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ai-form-filler-status-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#121212',
            color: '#f2c100',
            border: '2px solid #f2c100',
            padding: '12px 24px',
            borderRadius: '8px',
            zIndex: '2147483647',
            fontFamily: 'sans-serif',
            fontSize: '14px',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
            opacity: '0',
            transition: 'opacity 0.3s ease-in-out',
            pointerEvents: 'none'
        });
        document.body.appendChild(overlay);
    }
    overlay.innerText = message;
    void overlay.offsetWidth;
    overlay.style.opacity = '1';
    setTimeout(() => { overlay.style.opacity = '0'; }, 2500);
}

// === Dual-path Clipboard Writer ===
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showStatusOverlay('HTML + Profile Copied!');
        return;
    } catch (primaryErr) {
        console.warn('Clipboard API failed, using execCommand fallback:', primaryErr);
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        Object.assign(ta.style, {
            position: 'fixed', top: '0', left: '0',
            width: '1px', height: '1px', opacity: '0',
            border: 'none', outline: 'none', boxShadow: 'none',
            background: 'transparent'
        });
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) {
            showStatusOverlay('HTML + Profile Copied!');
        } else {
            throw new Error('execCommand returned false');
        }
    } catch (fallbackErr) {
        console.error('Both clipboard strategies failed:', fallbackErr);
        showStatusOverlay('Permission Denied: Click the lock icon and set Clipboard to Allow.');
    }
}

// === Professional Prompt Engine ===
function generateProfessionalPrompt(history) {
    let prompt = "";

    prompt += "### SYSTEM INSTRUCTIONS\n";
    prompt += "You are a Senior Data Engineer assisting with form automation.\n";
    prompt += "Analyze the HTML form below and generate a flat JSON object.\n";
    prompt += "Keys = form field identifiers (id, name, label text, or placeholder).\n";
    prompt += "Values = the best professional answer based on the profile and context provided.\n";
    prompt += "Output ONLY valid JSON. No markdown, no explanation.\n\n";

    prompt += "### APPLICANT PROFILE\n";
    prompt += "Name: Daniel Ebrahimzadeh (Mohammad Hossein Ebrahimzadeh Esfahani)\n";
    prompt += "Current: M.Sc. Computing Sciences (AI & Data Engineering), University of Vaasa, Finland\n";
    prompt += "Experience: 14+ years across Data Engineering, ETL/ELT, Analytics, and Team Leadership\n";
    prompt += "Recent Role: Data Manager at Digikala (largest e-commerce platform in Iran)\n";
    prompt += "Core Stack: Python, PySpark, dbt, Snowflake, Airflow, SQL Server, PostgreSQL\n";
    prompt += "GitHub: https://github.com/mhe931\n";
    prompt += "LinkedIn: https://www.linkedin.com/in/danielebrahimzadeh/\n\n";

    if (history && history.length > 0) {
        prompt += "### HISTORICAL CONTEXT (Local Data Warehouse)\n";
        prompt += "Use the following exact values if the form fields match:\n";
        history.forEach(item => {
            prompt += `- "${item.label}": "${item.value}" (from: ${item.sourceUrl})\n`;
        });
        prompt += "\n";
    }

    prompt += "### TARGET FORM HTML\n";
    return prompt;
}

// === Extraction Event ===
window.addEventListener('START_EXTRACT_HTML', () => {
    chrome.storage.local.get(['localWarehouse'], async (result) => {
        const history = result.localWarehouse || [];
        const prompt = generateProfessionalPrompt(history);

        let formHtml = "";
        if (document.forms.length > 0) {
            formHtml = Array.from(document.forms).map(f => f.outerHTML).join('\n');
        } else {
            formHtml = document.body.innerHTML;
        }

        await copyToClipboard(prompt + formHtml);
    });
});

// === Dynamic Fill Event ===
window.addEventListener('START_DYNAMIC_FILL', () => {
    chrome.storage.local.get(['formMapping'], (result) => {
        if (!result.formMapping) {
            showStatusOverlay('No JSON mapping found. Paste JSON in the popup first.');
            return;
        }

        let mapData = {};
        try {
            mapData = JSON.parse(result.formMapping);
        } catch (e) {
            showStatusOverlay('Invalid JSON mapping data.');
            return;
        }

        let filledCount = 0;

        // Scrape all inputs on the page, not just inside <form> tags
        const allFields = document.querySelectorAll('input, textarea, select');
        allFields.forEach(field => {
            if (!field) return;

            const containerText = field.closest('.question-container, .form-group, .field-wrapper, div')?.innerText?.toLowerCase() || "";
            const fieldId = field.id?.toLowerCase() || "";
            const fieldName = (field.name || "").toLowerCase();
            const labelFor = field.id ? document.querySelector(`label[for="${field.id}"]`)?.innerText?.toLowerCase() || "" : "";
            const closestLabel = field.closest('label')?.innerText?.toLowerCase() || "";
            const fieldPlaceholder = field.placeholder?.toLowerCase() || "";

            for (const [key, value] of Object.entries(mapData)) {
                if (!key) continue;
                const searchKey = key.toLowerCase();

                if (
                    fieldId === searchKey ||
                    fieldName === searchKey ||
                    fieldId.includes(searchKey) ||
                    fieldName.includes(searchKey) ||
                    labelFor.includes(searchKey) ||
                    closestLabel.includes(searchKey) ||
                    fieldPlaceholder.includes(searchKey) ||
                    containerText.includes(searchKey)
                ) {
                    field.value = value;
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                    filledCount++;
                    break;
                }
            }
        });

        showStatusOverlay(`Form Filled! (${filledCount} fields matched)`);
    });
});

// === Capture Form Data Event ===
window.addEventListener('START_CAPTURE_FORM', () => {
    const records = [];
    const timestamp = new Date().toISOString();
    const sourceUrl = window.location.href;

    const allFields = document.querySelectorAll('input, textarea, select');
    allFields.forEach(field => {
        if (!field || !field.value.trim()) return;

        let potentialLabel = "";
        const labelEl = field.closest('label');
        if (labelEl) potentialLabel = labelEl.innerText.trim();
        if (!potentialLabel && field.id) {
            const l = document.querySelector(`label[for="${field.id}"]`);
            if (l) potentialLabel = l.innerText.trim();
        }
        if (!potentialLabel) potentialLabel = field.placeholder || field.name || field.id || "unknown";

        records.push({
            label: potentialLabel.substring(0, 100),
            value: field.value,
            sourceUrl: sourceUrl,
            timestamp: timestamp
        });
    });

    if (records.length === 0) {
        showStatusOverlay("No completed fields detected.");
        return;
    }

    chrome.storage.local.get(['localWarehouse'], (result) => {
        let existing = result.localWarehouse || [];
        existing = existing.concat(records);
        chrome.storage.local.set({ localWarehouse: existing }, () => {
            showStatusOverlay(`Captured ${records.length} fields!`);
        });
    });
});

// === Paste Injection Event (triggered by popup via message) ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PASTE_TO_LLM') {
        const text = request.text;
        if (!text) {
            sendResponse({ success: false, msg: 'No text to paste.' });
            return;
        }

        // Find the best target element on LLM pages
        let el = document.activeElement;
        if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT' && !el.isContentEditable)) {
            // Try known LLM selectors first
            el = document.querySelector('#prompt-textarea')              // ChatGPT
              || document.querySelector('.ql-editor')                    // Gemini
              || document.querySelector('[contenteditable="true"]')      // Generic contenteditable
              || document.querySelector('textarea')                      // Generic textarea
              || document.querySelector('[role="textbox"]');              // Accessible textbox
        }

        if (el) {
            el.focus();
            if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
                // Use insertText for maximum framework compatibility
                el.innerText = '';
                document.execCommand('insertText', false, text);
            } else {
                el.value = text;
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            sendResponse({ success: true, msg: 'Prompt Pasted!' });
        } else {
            sendResponse({ success: false, msg: 'Target input not found. Click inside the LLM chat box first.' });
        }
    }
    return true; // keep message channel open for async
});
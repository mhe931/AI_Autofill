// === DOM Status Overlay ===
function showStatusOverlay(message) {
    var overlay = document.getElementById('ai-form-filler-status-overlay');
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
    setTimeout(function() { overlay.style.opacity = '0'; }, 2500);
}

// === Context-Aware Prompt Builder ===
function buildFullContextPrompt(formHtml, history) {
    var lines = [];

    lines.push("### SYSTEM INSTRUCTIONS");
    lines.push("You are a Senior Data Engineer assisting with form automation.");
    lines.push("Analyze the HTML form below and generate a flat JSON object.");
    lines.push("Keys = form field identifiers (id, name, label text, or placeholder).");
    lines.push("Values = the best professional answer based on the profile and context.");
    lines.push("Output ONLY valid JSON. No markdown fences, no explanation.");
    lines.push("");
    lines.push("### APPLICANT PROFILE");
    lines.push("Name: Daniel Ebrahimzadeh (Mohammad Hossein Ebrahimzadeh Esfahani)");
    lines.push("Degree: M.Sc. Computing Sciences (AI & Data Engineering), University of Vaasa, Finland");
    lines.push("Experience: 14+ years - Data Engineering, ETL/ELT, Analytics, Team Leadership");
    lines.push("Recent Role: Data Manager at Digikala (largest e-commerce platform in the Middle East)");
    lines.push("Core Stack: Python, PySpark, dbt, Snowflake, Airflow, SQL Server, PostgreSQL");
    lines.push("Publications: Research on anomaly detection, Bayesian DTI analysis, generative AI architectures");
    lines.push("GitHub: https://github.com/mhe931");
    lines.push("LinkedIn: https://www.linkedin.com/in/danielebrahimzadeh/");
    lines.push("Portfolio: https://mhe931.github.io/cv/");
    lines.push("");

    if (history && history.length > 0) {
        lines.push("### HISTORICAL CONTEXT (Previously Captured Data)");
        lines.push("Use these exact values when the form fields match:");
        history.forEach(function(item) {
            lines.push('- "' + item.label + '": "' + item.value + '" (source: ' + item.sourceUrl + ')');
        });
        lines.push("");
    }

    lines.push("### TARGET FORM HTML");
    lines.push(formHtml);

    return lines.join("\n");
}

// === Message Handler ===
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {

    // --- EXTRACT: scrape form HTML and return prompt to popup ---
    if (request.action === 'EXTRACT_FORM') {
        chrome.storage.local.get(['localWarehouse'], function(result) {
            var history = result.localWarehouse || [];

            var formHtml = "";
            if (document.forms.length > 0) {
                formHtml = Array.from(document.forms).map(function(f) { return f.outerHTML; }).join('\n');
            } else {
                var inputs = document.querySelectorAll('input, textarea, select');
                if (inputs.length > 0) {
                    var containers = new Set();
                    inputs.forEach(function(inp) {
                        var wrapper = inp.closest('div, section, fieldset, main') || document.body;
                        containers.add(wrapper);
                    });
                    formHtml = Array.from(containers).map(function(c) { return c.outerHTML; }).join('\n');
                } else {
                    formHtml = document.body.innerHTML;
                }
            }

            var fullPrompt = buildFullContextPrompt(formHtml, history);
            showStatusOverlay('HTML + Profile Extracted!');
            sendResponse({ success: true, prompt: fullPrompt });
        });
        return true;
    }

    // --- PASTE: inject text into the active LLM input field ---
    if (request.action === 'PASTE_TO_LLM') {
        var text = request.text;
        if (!text) {
            sendResponse({ success: false, msg: 'No text to paste.' });
            return;
        }

        var el = document.activeElement;
        if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT' && !el.isContentEditable)) {
            el = document.querySelector('#prompt-textarea')
              || document.querySelector('.ql-editor')
              || document.querySelector('div[contenteditable="true"]')
              || document.querySelector('[contenteditable="true"]')
              || document.querySelector('textarea')
              || document.querySelector('[role="textbox"]');
        }

        if (el) {
            el.focus();
            if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
                el.innerText = '';
                document.execCommand('insertText', false, text);
            } else {
                var nativeSetter = null;
                try {
                    nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype, 'value'
                    ).set || Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                    ).set;
                } catch (e) { /* fallback below */ }

                if (nativeSetter) {
                    nativeSetter.call(el, text);
                } else {
                    el.value = text;
                }
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            showStatusOverlay('Prompt Pasted!');
            sendResponse({ success: true, msg: 'Prompt Pasted!' });
        } else {
            sendResponse({ success: false, msg: 'No input field found. Click inside the LLM chat box first.' });
        }
        return;
    }

    // --- DYNAMIC FILL ---
    if (request.action === 'FILL_FORM') {
        var mapData = {};
        try {
            mapData = JSON.parse(request.json);
        } catch (e) {
            showStatusOverlay('Invalid JSON mapping.');
            sendResponse({ success: false, msg: 'Invalid JSON.' });
            return;
        }

        var filledCount = 0;
        var allFields = document.querySelectorAll('input, textarea, select');
        allFields.forEach(function(field) {
            if (!field) return;

            var fieldId = (field.id || "").toLowerCase();
            var fieldName = (field.name || "").toLowerCase();
            var labelFor = "";
            if (field.id) {
                var lbl = document.querySelector('label[for="' + field.id + '"]');
                labelFor = lbl ? lbl.innerText.toLowerCase() : "";
            }
            var closestLabel = field.closest('label') ? field.closest('label').innerText.toLowerCase() : "";
            var fieldPlaceholder = (field.placeholder || "").toLowerCase();
            var container = field.closest('.question-container, .form-group, .field-wrapper, div');
            var containerText = container ? container.innerText.toLowerCase() : "";

            var entries = Object.entries(mapData);
            for (var i = 0; i < entries.length; i++) {
                var key = entries[i][0];
                var value = entries[i][1];
                if (!key) continue;
                var searchKey = key.toLowerCase();

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

        showStatusOverlay('Form Filled! (' + filledCount + ' fields)');
        sendResponse({ success: true, msg: 'Filled ' + filledCount + ' fields.' });
        return;
    }

    // --- CAPTURE ---
    if (request.action === 'CAPTURE_FORM') {
        var records = [];
        var timestamp = new Date().toISOString();
        var sourceUrl = window.location.href;

        document.querySelectorAll('input, textarea, select').forEach(function(field) {
            if (!field || !field.value.trim()) return;

            var potentialLabel = "";
            var labelEl = field.closest('label');
            if (labelEl) potentialLabel = labelEl.innerText.trim();
            if (!potentialLabel && field.id) {
                var l = document.querySelector('label[for="' + field.id + '"]');
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
            sendResponse({ success: false, msg: 'No fields.' });
            return;
        }

        chrome.storage.local.get(['localWarehouse'], function(result) {
            var existing = result.localWarehouse || [];
            existing = existing.concat(records);
            chrome.storage.local.set({ localWarehouse: existing }, function() {
                showStatusOverlay('Captured ' + records.length + ' fields!');
                sendResponse({ success: true, msg: 'Captured ' + records.length + ' fields.' });
            });
        });
        return true;
    }
});
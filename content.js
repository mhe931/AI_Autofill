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
    setTimeout(function () { overlay.style.opacity = '0'; }, 2500);
}

// === Context-Aware Prompt Builder (Dynamic Profile) ===
// Accepts userProfile as a plain text string from chrome.storage.local
function buildFullContextPrompt(formHtml, userProfile, history) {
    var lines = [];

    // System Role
    lines.push("### SYSTEM INSTRUCTIONS");
    lines.push("You are a Senior Data Engineer and Career Advisor assisting with form automation.");
    lines.push("Analyze the HTML form below and generate a flat JSON object.");
    lines.push("Keys = exact form field IDs or names; use an exact unique label only if neither exists.");
    lines.push("Values = the best professional answer derived from the applicant profile below.");
    lines.push("Omit fields you cannot determine. Never invent URNs or accept licenses, agreements, or submit actions.");
    lines.push("Use exact visible option text for DSpace dropdowns, true/false for checkboxes, and ISO dates (YYYY-MM-DD, or YYYY / YYYY-MM for DSpace date pickers).");
    lines.push("Output ONLY valid JSON. No markdown fences, no code blocks, no explanation.");
    lines.push("");

    // User Profile - Dynamic
    lines.push("### USER PROFILE");
    if (userProfile && userProfile.trim()) {
        lines.push(userProfile.trim());
    } else {
        lines.push("Use historical context when available. Omit unknown values rather than inventing information.");
    }
    lines.push("");

    // Historical context from data warehouse
    if (history && history.length > 0) {
        lines.push("### HISTORICAL CONTEXT (Previously Captured Form Data)");
        lines.push("Use these exact values when the form fields match:");
        history.forEach(function (item) {
            lines.push('- "' + item.label + '": "' + item.value + '" (source: ' + item.sourceUrl + ')');
        });
        lines.push("");
    }

    // Form HTML
    lines.push("### TARGET FORM HTML");
    lines.push(formHtml);

    return lines.join("\n");
}

function getFormHtml() {
    if (document.forms.length > 0) {
        return Array.from(document.forms).map(function (form) { return form.outerHTML; }).join('\n');
    }
    var inputs = document.querySelectorAll('input, textarea, select, ds-dynamic-scrollable-dropdown, ds-date-picker');
    if (inputs.length > 0) {
        var containers = new Set();
        inputs.forEach(function (input) {
            containers.add(input.closest('ds-dynamic-scrollable-dropdown, ds-date-picker') ||
                input.closest('.form-group, div, section, fieldset, main') || document.body);
        });
        return Array.from(containers).map(function (container) { return container.outerHTML; }).join('\n');
    }
    return document.body.innerHTML;
}

function buildFormOnlyPrompt(formHtml) {
    return [
        'Use the form HTML below to generate a flat JSON object with one key per field.',
        'Use exact IDs or names as keys, and only fall back to exact unique labels or placeholders.',
        'Supply a suitable value for each field. For select fields, use an option value or visible option text.',
        'For checkboxes, use true or false. For radio fields, use the selected option value.',
        'For DSpace dropdowns, use exact visible option text. Use ISO dates (YYYY-MM-DD; DSpace date pickers also accept YYYY or YYYY-MM).',
        'Omit unknown values, URNs, licenses, agreements and action controls. Never generate an identifier or submit the form.',
        'Return only a valid JSON object. No markdown fences or explanation.',
        '',
        '### FORM HTML',
        formHtml
    ].join('\n');
}

// === Message Handler ===
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

    if (request.action === 'EXTRACT_FORM_ONLY') {
        if (!document.querySelector('input, textarea, select')) {
            sendResponse({ success: false, msg: 'No form fields found on this page.' });
            return;
        }
        sendResponse({ success: true, prompt: buildFormOnlyPrompt(getFormHtml()) });
        return;
    }

    // --- EXTRACT: scrape form HTML and return prompt to popup ---
    if (request.action === 'EXTRACT_FORM') {
        var userProfile = request.userProfile || '';
        var includeHistory = request.includeHistory;

        chrome.storage.local.get(['localWarehouse'], function (result) {
            var history = includeHistory ? (result.localWarehouse || []) : [];

            var fullPrompt = buildFullContextPrompt(getFormHtml(), userProfile, history);
            showStatusOverlay('HTML + Profile Extracted!');
            sendResponse({ success: true, prompt: fullPrompt });
        });
        return true;
    }

    // --- Verified, asynchronous fill (including DSpace controls) ---
    if (request.action === 'FILL_FORM') {
        var mapData = {};
        try {
            mapData = JSON.parse(request.json);
        } catch (e) {
            showStatusOverlay('Invalid JSON mapping.');
            sendResponse({ success: false, msg: 'Invalid JSON.' });
            return;
        }

        window.AIFormFiller.fill(mapData).then(function (result) {
            showStatusOverlay(result.msg);
            sendResponse(result);
        }).catch(function (error) {
            console.error('AI Form Filler: Fill failed', error);
            sendResponse({ success: false, msg: 'Fill failed: ' + error.message });
        });
        return true;
    }

    // --- CAPTURE ---
    if (request.action === 'CAPTURE_FORM') {
        var records = [];
        var timestamp = new Date().toISOString();
        var sourceUrl = window.location.href;

        document.querySelectorAll('input, textarea, select').forEach(function (field) {
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

        chrome.storage.local.get(['localWarehouse'], function (result) {
            var existing = result.localWarehouse || [];
            existing = existing.concat(records);
            chrome.storage.local.set({ localWarehouse: existing }, function () {
                showStatusOverlay('Captured ' + records.length + ' fields!');
                sendResponse({ success: true, msg: 'Captured ' + records.length + ' fields.' });
            });
        });
        return true;
    }
});
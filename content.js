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
    lines.push("Keys = form field identifiers (id, name, label text, or placeholder).");
    lines.push("Values = the best professional answer derived from the applicant profile below.");
    lines.push("For fields you cannot determine, provide a reasonable professional default based on the information you have from me.");
    lines.push("Output ONLY valid JSON. No markdown fences, no code blocks, no explanation.");
    lines.push("");

    // User Profile - Dynamic
    lines.push("### USER PROFILE");
    if (userProfile && userProfile.trim()) {
        lines.push(userProfile.trim());
    } else {
        lines.push("use the historical context to fill the form as best as possible and make up the rest based on the context provided based on the information you have from me");
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

// === Message Handler ===
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

    // --- EXTRACT: scrape form HTML and return prompt to popup ---
    if (request.action === 'EXTRACT_FORM') {
        var userProfile = request.userProfile || '';
        var includeHistory = request.includeHistory;

        chrome.storage.local.get(['localWarehouse'], function (result) {
            var history = includeHistory ? (result.localWarehouse || []) : [];

            var formHtml = "";
            if (document.forms.length > 0) {
                formHtml = Array.from(document.forms).map(function (f) { return f.outerHTML; }).join('\n');
            } else {
                var inputs = document.querySelectorAll('input, textarea, select');
                if (inputs.length > 0) {
                    var containers = new Set();
                    inputs.forEach(function (inp) {
                        var wrapper = inp.closest('div, section, fieldset, main') || document.body;
                        containers.add(wrapper);
                    });
                    formHtml = Array.from(containers).map(function (c) { return c.outerHTML; }).join('\n');
                } else {
                    formHtml = document.body.innerHTML;
                }
            }

            var fullPrompt = buildFullContextPrompt(formHtml, userProfile, history);
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

    // --- DYNAMIC FILL (with dropdown support + priority matching) ---
    if (request.action === 'FILL_FORM') {
        var mapData = {};
        try {
            mapData = JSON.parse(request.json);
        } catch (e) {
            showStatusOverlay('Invalid JSON mapping.');
            sendResponse({ success: false, msg: 'Invalid JSON.' });
            return;
        }

        var inputCount = 0;
        var dropdownCount = 0;
        var allFields = document.querySelectorAll('input, textarea, select');

        // Dispatch full event sequence for framework compatibility
        function dispatchFieldEvents(field) {
            field.dispatchEvent(new Event('focus', { bubbles: true }));
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            field.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        // Select dropdown option by matching value or display text
        function setSelectValue(selectEl, targetValue) {
            var tv = String(targetValue).trim().toLowerCase();
            var options = selectEl.options;
            // Pass 1: exact match on option value
            for (var i = 0; i < options.length; i++) {
                if (options[i].value.trim().toLowerCase() === tv) {
                    selectEl.selectedIndex = i;
                    return true;
                }
            }
            // Pass 2: exact match on option display text
            for (var i = 0; i < options.length; i++) {
                if (options[i].text.trim().toLowerCase() === tv) {
                    selectEl.selectedIndex = i;
                    return true;
                }
            }
            // Pass 3: partial match on display text (contains)
            for (var i = 0; i < options.length; i++) {
                if (options[i].text.trim().toLowerCase().includes(tv) ||
                    tv.includes(options[i].text.trim().toLowerCase())) {
                    selectEl.selectedIndex = i;
                    return true;
                }
            }
            return false;
        }

        // Priority-weighted field matching
        function findMatchingValue(field) {
            var fieldId = (field.id || "").toLowerCase().trim();
            var fieldName = (field.name || "").toLowerCase().trim();
            var labelFor = "";
            try {
                if (field.id) {
                    // Safe attribute selector querying to avoid DOM exceptions with weird IDs
                    var safeId = field.id.replace(/"/g, '\\"');
                    var lbl = document.querySelector('label[for="' + safeId + '"]');
                    labelFor = lbl ? (lbl.innerText || lbl.textContent || "").toLowerCase().trim() : "";
                }
            } catch (e) { /* ignore safe query errors */ }
            
            var closestLabelNode = field.closest('label');
            var closestLabel = closestLabelNode ? (closestLabelNode.innerText || closestLabelNode.textContent || "").toLowerCase().trim() : "";
            var fieldPlaceholder = (field.placeholder || "").toLowerCase().trim();
            var ariaLabel = (field.getAttribute('aria-label') || "").toLowerCase().trim();
            
            var container = field.closest('.question-container, .form-group, .field-wrapper, div');
            var containerText = container ? (container.innerText || container.textContent || "").toLowerCase().trim() : "";

            var entries = Object.entries(mapData);

            // Priority 1: Exact ID or Name match
            for (var i = 0; i < entries.length; i++) {
                var searchKey = entries[i][0].toLowerCase().trim();
                if (!searchKey) continue;
                if (fieldId === searchKey || fieldName === searchKey) {
                    return entries[i][1];
                }
            }

            // Priority 2: Exact label-for or aria-label match
            for (var i = 0; i < entries.length; i++) {
                var searchKey = entries[i][0].toLowerCase().trim();
                if (!searchKey) continue;
                if (labelFor === searchKey || ariaLabel === searchKey) {
                    return entries[i][1];
                }
            }

            // Priority 3: Partial ID or Name contains
            for (var i = 0; i < entries.length; i++) {
                var searchKey = entries[i][0].toLowerCase().trim();
                if (!searchKey) continue;
                if ((fieldId && fieldId.includes(searchKey)) ||
                    (fieldName && fieldName.includes(searchKey))) {
                    return entries[i][1];
                }
            }

            // Priority 4: Label text, placeholder, closest label, container text
            for (var i = 0; i < entries.length; i++) {
                var searchKey = entries[i][0].toLowerCase().trim();
                if (!searchKey) continue;
                if ((labelFor && labelFor.includes(searchKey)) ||
                    (closestLabel && closestLabel.includes(searchKey)) ||
                    (fieldPlaceholder && fieldPlaceholder.includes(searchKey)) ||
                    (ariaLabel && ariaLabel.includes(searchKey)) ||
                    (containerText && containerText.includes(searchKey))) {
                    return entries[i][1];
                }
            }

            return undefined;
        }

        allFields.forEach(function (field) {
            try {
                if (!field) return;

                // File inputs cannot be programmatically filled with text values.
                if (field.tagName === 'INPUT' && field.type && field.type.toLowerCase() === 'file') {
                    return;
                }

                var matchedValue = findMatchingValue(field);
                if (matchedValue === undefined || matchedValue === null) return;

                var valueStr = String(matchedValue);

                if (field.tagName === 'SELECT') {
                    if (setSelectValue(field, valueStr)) {
                        dispatchFieldEvents(field);
                        dropdownCount++;
                    }
                } else if (field.tagName === 'INPUT' && (field.type === 'checkbox' || field.type === 'radio')) {
                    var boolVal = valueStr.toLowerCase();
                    var shouldCheck = (boolVal === 'true' || boolVal === 'yes' || boolVal === '1' || boolVal === 'on');
                    if (field.type === 'radio') {
                        shouldCheck = (field.value.toLowerCase() === valueStr.toLowerCase());
                    }
                    field.checked = shouldCheck;
                    dispatchFieldEvents(field);
                    inputCount++;
                } else {
                    // Standard input/textarea
                    var nativeSetter = null;
                    try {
                        if (field.tagName === 'TEXTAREA') {
                            nativeSetter = Object.getOwnPropertyDescriptor(
                                window.HTMLTextAreaElement.prototype, 'value'
                            ).set;
                        } else {
                            nativeSetter = Object.getOwnPropertyDescriptor(
                                window.HTMLInputElement.prototype, 'value'
                            ).set;
                        }
                    } catch (e) { /* fallback */ }

                    if (nativeSetter) {
                        nativeSetter.call(field, valueStr);
                    } else {
                        field.value = valueStr;
                    }
                    dispatchFieldEvents(field);
                    inputCount++;
                }
            } catch (fieldError) {
                // If a specific field violently errors (e.g. security rejection), log but keep looping!
                console.warn('AI Form Filler: Failed to mapped field', field, fieldError);
            }
        });

        var totalFilled = inputCount + dropdownCount;
        var summary = totalFilled + ' fields (' + inputCount + ' inputs, ' + dropdownCount + ' dropdowns)';
        showStatusOverlay('Form Filled! ' + summary);
        sendResponse({ success: true, msg: 'Filled ' + summary, inputs: inputCount, dropdowns: dropdownCount });
        return;
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
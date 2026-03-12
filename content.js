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
    
    void overlay.offsetWidth; // Force reflow
    overlay.style.opacity = '1';
    
    setTimeout(() => {
        overlay.style.opacity = '0';
    }, 2000);
}

window.addEventListener('START_EXTRACT_HTML', () => {
    chrome.storage.local.get(['localWarehouse'], (result) => {
        const history = result.localWarehouse || [];
        
        let basePrompt = "As a Senior Data Engineer, analyze the provided HTML form. Using the user's resume [cite: 16] and publication list[cite: 2], generate a JSON object where keys are form element identifiers (IDs, names, or associated labels) and values are the most accurate professional responses. Ensure justifications for RPL align with university learning outcomes [cite: 2026-03-12].\n\n";
        
        if (history && history.length > 0) {
            basePrompt += "### HISTORICAL CONTEXT (Local Data Warehouse):\n";
            basePrompt += "Use the following exact values and asset file paths if the form fields relate to professional experience or academic writing [cite: 42, 63].\n";
            history.forEach(item => {
               basePrompt += `- Field: "${item.label}" | Value/Path: "${item.value}" | Source: ${item.sourceUrl}\n`; 
            });
            basePrompt += "\n";
        }

        let formsHtml = "";
        if (document.forms.length > 0) {
            formsHtml = Array.from(document.forms).map(f => f.outerHTML).join('\n');
        } else {
            formsHtml = document.body.innerHTML;
        }

        navigator.clipboard.writeText(basePrompt + formsHtml).then(() => {
            showStatusOverlay('HTML Copied!');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showStatusOverlay('Extraction Failed');
        });
    });
});

window.addEventListener('START_DYNAMIC_FILL', () => {
    chrome.storage.local.get(['formMapping'], (result) => {
        if (!result.formMapping) {
            console.error('No mapping data found in storage. Please save JSON in the extension popup.');
            return;
        }

        let mapData = {};
        try {
            mapData = JSON.parse(result.formMapping);
        } catch (e) {
            console.error('Invalid JSON mapping data.', e);
            return; 
        }

        Array.from(document.forms).forEach(form => {
            const fields = form.querySelectorAll('input, textarea, select');
            fields.forEach(field => {
                if (!field) return; 

                const containerText = field.closest('.question-container')?.innerText?.toLowerCase() || "";
                const fieldId = field.id?.toLowerCase() || "";
                const fieldName = (field.name || "").toLowerCase();
                const fieldLabel = field.closest('label')?.innerText?.toLowerCase() || "";
                const fieldPlaceholder = field.placeholder?.toLowerCase() || "";

                for (const [key, value] of Object.entries(mapData)) {
                    if (!key) continue;
                    const searchKey = key.toLowerCase();
                    
                    if (
                        containerText.includes(searchKey) || 
                        fieldId.includes(searchKey) || 
                        fieldName.includes(searchKey) ||
                        fieldLabel.includes(searchKey) ||
                        fieldPlaceholder.includes(searchKey)
                    ) {
                        field.value = value;
                        field.dispatchEvent(new Event('input', { bubbles: true }));
                        field.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            });
        });
        showStatusOverlay('Form Filled!');
    });
});

window.addEventListener('START_CAPTURE_FORM', () => {
    const records = [];
    const timestamp = new Date().toISOString();
    const sourceUrl = window.location.href;

    Array.from(document.forms).forEach(form => {
        const fields = form.querySelectorAll('input, textarea, select');
        fields.forEach(field => {
            if (!field || !field.value.trim()) return; 

            const labelEl = field.closest('label');
            let potentialLabel = "";
            if (labelEl) potentialLabel = labelEl.innerText.trim();
            if (!potentialLabel && field.id) {
                const l = document.querySelector(`label[for="${field.id}"]`);
                if (l) potentialLabel = l.innerText.trim();
            }
            if (!potentialLabel) potentialLabel = field.placeholder || field.name || field.id;
            
            records.push({
                label: potentialLabel.substring(0, 100), 
                value: field.value,
                sourceUrl: sourceUrl,
                timestamp: timestamp
            });
        });
    });

    if (records.length === 0) {
        showStatusOverlay("No completed fields detected to capture.");
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
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
            alert('Form HTML and augmented context instructions copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
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
            return; // Maintain explicit error handling
        }

        Array.from(document.forms).forEach(form => {
            const fields = form.querySelectorAll('input, textarea, select');
            fields.forEach(field => {
                if (!field) return; // Explicit error handling for null DOM elements

                const containerText = field.closest('.question-container')?.innerText?.toLowerCase() || "";
                const fieldId = field.id?.toLowerCase() || "";
                const fieldName = (field.name || "").toLowerCase();
                const fieldLabel = field.closest('label')?.innerText?.toLowerCase() || "";
                const fieldPlaceholder = field.placeholder?.toLowerCase() || "";

                for (const [key, value] of Object.entries(mapData)) {
                    if (!key) continue;
                    const searchKey = key.toLowerCase();
                    
                    // Fuzzy-matching logic [cite: 85, 95]
                    if (
                        containerText.includes(searchKey) || 
                        fieldId.includes(searchKey) || 
                        fieldName.includes(searchKey) ||
                        fieldLabel.includes(searchKey) ||
                        fieldPlaceholder.includes(searchKey)
                    ) {
                        field.value = value;
                        // Trigger necessary events [cite: 2026-01-24 zero framing]
                        field.dispatchEvent(new Event('input', { bubbles: true }));
                        field.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            });
        });
    });
});
// Capture event to scrape currently filled forms into the discrete tabular database
window.addEventListener('START_CAPTURE_FORM', () => {
    const records = [];
    const timestamp = new Date().toISOString();
    const sourceUrl = window.location.href;

    Array.from(document.forms).forEach(form => {
        const fields = form.querySelectorAll('input, textarea, select');
        fields.forEach(field => {
            if (!field || !field.value.trim()) return; // skip empty or null

            // Field Label logic extraction
            const labelEl = field.closest('label');
            let potentialLabel = "";
            if (labelEl) potentialLabel = labelEl.innerText.trim();
            if (!potentialLabel && field.id) {
                const l = document.querySelector(`label[for="${field.id}"]`);
                if (l) potentialLabel = l.innerText.trim();
            }
            if (!potentialLabel) potentialLabel = field.placeholder || field.name || field.id;
            
            // Note: Users can manually type asset paths like "file:///C:/Users/danie/Documents/EBRZ%20Academic%20resume%201.02.pdf" into fields before capture to map local assets.
            
            records.push({
                label: potentialLabel.substring(0, 100), // restrict length
                value: field.value,
                sourceUrl: sourceUrl,
                timestamp: timestamp
            });
        });
    });

    if (records.length === 0) {
        alert("No completed fields detected to capture.");
        return;
    }

    chrome.storage.local.get(['localWarehouse'], (result) => {
        let existing = result.localWarehouse || [];
        existing = existing.concat(records);
        
        chrome.storage.local.set({ localWarehouse: existing }, () => {
            alert(`Captured ${records.length} fields to Local Data Warehouse!`);
        });
    });
});
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
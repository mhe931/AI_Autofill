document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['formMapping'], (result) => {
        if (result.formMapping) {
            document.getElementById('jsonInput').value = result.formMapping;
        }
    });
});

document.getElementById('extractBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        // Fetch local context before prompt generation
        chrome.storage.local.get(['localWarehouse'], (result) => {
            const history = result.localWarehouse || [];
            
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id},
                args: [history],
                func: (history) => {
                    let basePrompt = "As a Senior Data Engineer, analyze the provided HTML form. Using the user's resume [cite: 16] and publication list[cite: 2], generate a JSON object where keys are form element identifiers (IDs, names, or associated labels) and values are the most accurate professional responses. Ensure justifications for RPL align with university learning outcomes [cite: 2026-03-12].\n\n";
                    
                    if (history && history.length > 0) {
                        basePrompt += "### HISTORICAL CONTEXT (Local Data Warehouse):\n";
                        basePrompt += "Use the following exact values and asset file paths if the form fields relate to professional experience or academic writing [cite: 42, 63].\n";
                        history.forEach(item => {
                           basePrompt += `- Field: "${item.label}" | Value/Path: "${item.value}" | Source: ${item.sourceUrl}\n`; 
                        });
                        basePrompt += "\n";
                    }

                    const formsHtml = Array.from(document.forms).map(f => f.outerHTML).join('\n') || document.body.innerHTML;
                    navigator.clipboard.writeText(basePrompt + formsHtml).then(() => {
                        alert('Form HTML and augmented context instructions copied to clipboard!');
                    }).catch(err => {
                        console.error('Failed to copy text: ', err);
                    });
                }
            });
        });
    });
});

// Data Management Event Listeners
document.getElementById('captureBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: () => { window.dispatchEvent(new CustomEvent('START_CAPTURE_FORM')); }
        });
    });
});

document.getElementById('viewBtn').addEventListener('click', () => {
    chrome.storage.local.get(['localWarehouse'], (result) => {
        const data = result.localWarehouse || [];
        // Create a simple table view in a new tab (simulated by opening a data URL or just alerting for MVP, but let's do a basic console log/alert or open window)
        const html = `<html><head><title>Data Table</title><style>table, th, td { border: 1px solid black; border-collapse: collapse; padding: 5px; } th {background:#eee;}</style></head><body><h2>Local Data Warehouse</h2><table><tr><th>Timestamp</th><th>Label</th><th>Value/Path</th><th>URL</th></tr>` + data.reverse().map(d => `<tr><td>${d.timestamp}</td><td>${d.label}</td><td>${d.value}</td><td>${d.sourceUrl}</td></tr>`).join('') + `</table></body></html>`;
        
        chrome.tabs.create({ url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
    });
});

document.getElementById('exportBtn').addEventListener('click', () => {
    chrome.storage.local.get(['localWarehouse'], (result) => {
        const data = result.localWarehouse || [];
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `form_backup_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
    });
});

document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (Array.isArray(data)) {
                 chrome.storage.local.get(['localWarehouse'], (result) => {
                    let existing = result.localWarehouse || [];
                    // Merge and deduplicate logic could be added here; for now, exact overwrite/append
                    chrome.storage.local.set({ localWarehouse: data }, () => {
                        alert(`Successfully imported ${data.length} records!`);
                    });
                 });
            } else { alert("Invalid backup structure."); }
        } catch(err) { alert("Failed to parse JSON file."); }
    };
    reader.readAsText(file);
});

document.getElementById('pasteBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: () => {
                navigator.clipboard.readText().then(text => {
                    const el = document.activeElement;
                    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) {
                        if (el.isContentEditable) {
                            el.innerText = text;
                        } else {
                            el.value = text;
                        }
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        alert('Please focus an input field/textarea in the LLM chat first.');
                    }
                }).catch(err => {
                    console.error('Failed to read clipboard contents: ', err);
                });
            }
        });
    });
});

document.getElementById('injectBtn').addEventListener('click', async () => {
    let jsonStr = document.getElementById('jsonInput').value;
    
    if (!jsonStr) {
        try {
            jsonStr = await navigator.clipboard.readText();
        } catch (e) {
            console.error('Failed to read clipboard', e);
        }
    }
    
    try {
        JSON.parse(jsonStr); // Validate JSON format
        chrome.storage.local.set({ formMapping: jsonStr }, () => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.scripting.executeScript({
                    target: {tabId: tabs[0].id},
                    func: () => { window.dispatchEvent(new CustomEvent('START_DYNAMIC_FILL')); }
                });
            });
        });
    } catch (e) {
        alert('Invalid JSON! Please check format or clipboard content.');
    }
});
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['formMapping'], (result) => {
        if (result.formMapping) {
            document.getElementById('jsonInput').value = result.formMapping;
        }
    });
});

function setStatus(msg) {
    const el = document.getElementById('status-message');
    if (el) {
        el.innerText = msg;
        el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0'; }, 2000);
    }
}

document.getElementById('extractBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: () => { window.dispatchEvent(new CustomEvent('START_EXTRACT_HTML')); }
        }, () => {
            setStatus('Extraction Triggered!');
        });
    });
});

// Data Management Event Listeners
document.getElementById('captureBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: () => { window.dispatchEvent(new CustomEvent('START_CAPTURE_FORM')); }
        }, () => {
            setStatus('Capture Executed!');
        });
    });
});

document.getElementById('viewBtn').addEventListener('click', () => {
    chrome.storage.local.get(['localWarehouse'], (result) => {
        const data = result.localWarehouse || [];
        const html = `<html><head><title>Data Table</title><style>
            body { font-family: sans-serif; background: #121212; color: #ffffff; padding: 20px;}
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #333; padding: 8px; text-align: left;}
            th { background-color: #1e1e1e; color: #f2c100;}
        </style></head><body><h2>Local Data Warehouse</h2><table><tr><th>Timestamp</th><th>Label</th><th>Value/Path</th><th>URL</th></tr>` + data.reverse().map(d => `<tr><td>${d.timestamp}</td><td>${d.label}</td><td>${d.value}</td><td>${d.sourceUrl}</td></tr>`).join('') + `</table></body></html>`;
        
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
                    chrome.storage.local.set({ localWarehouse: existing.concat(data) }, () => {
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
            func: async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    let el = document.activeElement;
                    if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT' && !el.isContentEditable)) {
                        el = document.querySelector('#prompt-textarea') || document.querySelector('textarea, [contenteditable="true"]');
                    }
                    if (el) {
                        el.focus();
                        if (el.isContentEditable) {
                            el.innerText = text;
                        } else {
                            el.value = text;
                        }
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        return { success: true, msg: 'Prompt Pasted!' };
                    } else {
                        return { success: false, msg: 'Target input not found.' };
                    }
                } catch(err) {
                    console.error('Failed to read clipboard contents: ', err);
                    return { success: false, msg: 'Clipboard access failed.' };
                }
            }
        }, (results) => {
            if (results && results[0] && results[0].result) {
                setStatus(results[0].result.msg);
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
        JSON.parse(jsonStr); 
        chrome.storage.local.set({ formMapping: jsonStr }, () => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                chrome.scripting.executeScript({
                    target: {tabId: tabs[0].id},
                    func: () => { window.dispatchEvent(new CustomEvent('START_DYNAMIC_FILL')); }
                }, () => {
                    setStatus('Injection Triggered!');
                });
            });
        });
    } catch (e) {
        setStatus('Invalid JSON!');
    }
});
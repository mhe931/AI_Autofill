// === Permission Check Engine ===
function checkClipboardPermission() {
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'clipboard-write' }).then(status => {
        const box = document.getElementById('msg-container');
        if (!box) return;
        if (status.state === 'granted') {
            box.style.display = 'none';
        } else {
            box.innerText = '⚠️ Clipboard not yet granted. Click the lock icon in target page URL bar → set Clipboard to Allow.';
            box.style.display = 'block';
        }
        status.onchange = () => checkClipboardPermission();
    }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['formMapping'], (result) => {
        if (result.formMapping) {
            document.getElementById('jsonInput').value = result.formMapping;
        }
    });
    checkClipboardPermission();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkClipboardPermission();
});

// === Status Message Helper ===
function setStatus(msg) {
    const el = document.getElementById('msg-container');
    if (el) {
        el.innerText = msg;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
}

// === URL Validators ===
function isSupportedUrl(url) {
    return url && (url.startsWith('http://') || url.startsWith('https://'));
}

function isLLMPage(url) {
    if (!url) return false;
    const llmDomains = [
        'gemini.google.com',
        'chatgpt.com',
        'chat.openai.com',
        'claude.ai',
        'copilot.microsoft.com',
        'poe.com',
        'bard.google.com',
        'perplexity.ai'
    ];
    return llmDomains.some(domain => url.includes(domain));
}

// === 1. Extract Form HTML ===
document.getElementById('extractBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!isSupportedUrl(tabs[0].url)) {
            setStatus('Cannot run on internal browser pages. Navigate to an http/https page.');
            return;
        }
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: () => { window.dispatchEvent(new CustomEvent('START_EXTRACT_HTML')); }
        }, () => {
            if (chrome.runtime.lastError) {
                setStatus('Extraction failed: ' + chrome.runtime.lastError.message);
            } else {
                setStatus('HTML + Profile Copied!');
            }
        });
    });
});

// === 2. Paste to LLM ===
document.getElementById('pasteBtn').addEventListener('click', async () => {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        const tab = tabs[0];
        if (!isSupportedUrl(tab.url)) {
            setStatus('Cannot paste on internal browser pages.');
            return;
        }

        if (!isLLMPage(tab.url)) {
            setStatus('⚠️ This does not appear to be a known LLM page. Trying anyway...');
        }

        // Read clipboard text to send via message
        let clipText = '';
        try {
            clipText = await navigator.clipboard.readText();
        } catch (e) {
            setStatus('Clipboard read failed. Copy the prompt manually.');
            return;
        }

        if (!clipText) {
            setStatus('Clipboard is empty. Run "Extract Form HTML" first.');
            return;
        }

        // Send via chrome.tabs.sendMessage to the content script
        chrome.tabs.sendMessage(tab.id, { action: 'PASTE_TO_LLM', text: clipText }, (response) => {
            if (chrome.runtime.lastError) {
                // Content script might not be loaded on this page, inject it
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (textToInject) => {
                        let el = document.activeElement;
                        if (!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT' && !el.isContentEditable)) {
                            el = document.querySelector('#prompt-textarea')
                              || document.querySelector('.ql-editor')
                              || document.querySelector('[contenteditable="true"]')
                              || document.querySelector('textarea')
                              || document.querySelector('[role="textbox"]');
                        }
                        if (el) {
                            el.focus();
                            if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
                                el.innerText = '';
                                document.execCommand('insertText', false, textToInject);
                            } else {
                                el.value = textToInject;
                            }
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            return { success: true, msg: 'Prompt Pasted!' };
                        } else {
                            return { success: false, msg: 'No input field found. Click inside the chat box first.' };
                        }
                    },
                    args: [clipText]
                }, (results) => {
                    if (results && results[0] && results[0].result) {
                        setStatus(results[0].result.msg);
                    } else {
                        setStatus('Paste injection executed.');
                    }
                });
            } else if (response) {
                setStatus(response.msg);
            }
        });
    });
});

// === 3. Execute Injection ===
document.getElementById('injectBtn').addEventListener('click', async () => {
    let jsonStr = document.getElementById('jsonInput').value.trim();

    if (!jsonStr) {
        try {
            jsonStr = await navigator.clipboard.readText();
        } catch (e) {
            setStatus('No JSON in textarea and clipboard read failed.');
            return;
        }
    }

    // Strip markdown code fences if LLM wrapped the response
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        setStatus('Invalid JSON! Check the format or paste the LLM response again.');
        return;
    }

    // Re-serialize clean JSON
    const cleanJson = JSON.stringify(parsed);
    document.getElementById('jsonInput').value = cleanJson;

    chrome.storage.local.set({ formMapping: cleanJson }, () => {
        setStatus('JSON Loaded for Injection');
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!isSupportedUrl(tabs[0].url)) {
                setStatus('Cannot inject on internal browser pages.');
                return;
            }
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id},
                func: () => { window.dispatchEvent(new CustomEvent('START_DYNAMIC_FILL')); }
            }, () => {
                if (chrome.runtime.lastError) {
                    setStatus('Injection failed: ' + chrome.runtime.lastError.message);
                } else {
                    setStatus('Injection Triggered!');
                }
            });
        });
    });
});

// === Data Management ===
document.getElementById('captureBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!isSupportedUrl(tabs[0].url)) {
            setStatus('Cannot capture on internal browser pages.');
            return;
        }
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: () => { window.dispatchEvent(new CustomEvent('START_CAPTURE_FORM')); }
        }, () => {
            if (chrome.runtime.lastError) {
                setStatus('Capture failed: ' + chrome.runtime.lastError.message);
            } else {
                setStatus('Capture Executed!');
            }
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
                        setStatus(`Imported ${data.length} records!`);
                    });
                });
            } else { setStatus("Invalid backup structure."); }
        } catch(err) { setStatus("Failed to parse JSON file."); }
    };
    reader.readAsText(file);
});
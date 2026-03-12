// === Permission Check ===
function checkClipboardPermission() {
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: 'clipboard-write' }).then(function(status) {
        var box = document.getElementById('msg-container');
        if (!box) return;
        if (status.state === 'granted') {
            box.style.display = 'none';
        } else {
            box.innerText = 'Clipboard not granted. On your target page: Lock icon > Site Settings > Clipboard > Allow.';
            box.style.display = 'block';
        }
        status.onchange = function() { checkClipboardPermission(); };
    }).catch(function() {});
}

document.addEventListener('DOMContentLoaded', function() {
    checkClipboardPermission();
});

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') checkClipboardPermission();
});

// === Helpers ===
function setStatus(msg) {
    var el = document.getElementById('msg-container');
    if (el) {
        el.innerText = msg;
        el.style.display = 'block';
        setTimeout(function() { el.style.display = 'none'; }, 3500);
    }
}

function isSupportedUrl(url) {
    return url && (url.startsWith('http://') || url.startsWith('https://'));
}

function isLLMPage(url) {
    if (!url) return false;
    var domains = ['gemini.google.com','chatgpt.com','chat.openai.com','claude.ai',
                   'copilot.microsoft.com','poe.com','perplexity.ai'];
    return domains.some(function(d) { return url.includes(d); });
}

function getTextarea() {
    return document.getElementById('jsonInput');
}

// Helper: try sendMessage, handle disconnection with programmatic re-injection
function safeSendMessage(tabId, message, callback) {
    chrome.tabs.sendMessage(tabId, message, function(response) {
        if (chrome.runtime.lastError) {
            var errMsg = chrome.runtime.lastError.message || '';
            // Content script not loaded or orphaned - re-inject and retry once
            if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                }, function() {
                    if (chrome.runtime.lastError) {
                        callback(null, 'Reload the target page to reconnect the extension.');
                        return;
                    }
                    // Retry after re-injection
                    setTimeout(function() {
                        chrome.tabs.sendMessage(tabId, message, function(retryResponse) {
                            if (chrome.runtime.lastError) {
                                callback(null, 'Reload the target page to reconnect the extension.');
                            } else {
                                callback(retryResponse, null);
                            }
                        });
                    }, 200);
                });
            } else {
                callback(null, errMsg);
            }
        } else {
            callback(response, null);
        }
    });
}

// ========================================================
// 1. EXTRACT FORM HTML
// ========================================================
document.getElementById('extractBtn').addEventListener('click', function() {
    var textarea = getTextarea();

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var tab = tabs[0];
        if (!isSupportedUrl(tab.url)) {
            setStatus('Navigate to an http/https page first.');
            return;
        }

        textarea.value = '';
        setStatus('Extracting...');

        safeSendMessage(tab.id, { action: 'EXTRACT_FORM' }, function(response, error) {
            if (error) {
                setStatus(error);
                return;
            }
            if (response && response.success && response.prompt) {
                textarea.value = response.prompt;

                navigator.clipboard.writeText(response.prompt).then(function() {
                    setStatus('Prompt + Form HTML copied! Paste into any LLM.');
                }).catch(function() {
                    setStatus('Prompt loaded in textarea. Clipboard write failed - copy manually.');
                });
            } else {
                setStatus('Extraction returned no data.');
            }
        });
    });
});

// ========================================================
// 2. PASTE TO LLM
// ========================================================
document.getElementById('pasteBtn').addEventListener('click', function() {
    var textarea = getTextarea();
    var text = textarea.value.trim();

    if (!text) {
        setStatus('Textarea is empty. Run "Extract Form HTML" first.');
        return;
    }

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var tab = tabs[0];
        if (!isSupportedUrl(tab.url)) {
            setStatus('Navigate to an LLM page (http/https) first.');
            return;
        }

        if (!isLLMPage(tab.url)) {
            // Not blocking, just informational
        }

        safeSendMessage(tab.id, { action: 'PASTE_TO_LLM', text: text }, function(response, error) {
            if (error) {
                // Fallback: inject directly
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: function(payload) {
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
                                document.execCommand('insertText', false, payload);
                            } else {
                                el.value = payload;
                            }
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            return { success: true, msg: 'Prompt Pasted!' };
                        }
                        return { success: false, msg: 'No input found. Click inside the chat box first.' };
                    },
                    args: [text]
                }, function(results) {
                    if (results && results[0] && results[0].result) {
                        setStatus(results[0].result.msg);
                    } else {
                        setStatus('Paste attempted.');
                    }
                });
            } else if (response) {
                setStatus(response.msg);
            }
        });
    });
});

// ========================================================
// 3. EXECUTE INJECTION
// ========================================================
document.getElementById('injectBtn').addEventListener('click', function() {
    var textarea = getTextarea();
    var jsonStr = textarea.value.trim();

    if (!jsonStr) {
        setStatus('Paste the LLM JSON response into the textarea first.');
        return;
    }

    // Strip markdown code fences
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    var parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        setStatus('Invalid JSON. Check format or re-paste the LLM output.');
        return;
    }

    var cleanJson = JSON.stringify(parsed);
    textarea.value = cleanJson;

    chrome.storage.local.set({ formMapping: cleanJson }, function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            var tab = tabs[0];
            if (!isSupportedUrl(tab.url)) {
                setStatus('Navigate to the target form page first.');
                return;
            }

            safeSendMessage(tab.id, { action: 'FILL_FORM', json: cleanJson }, function(response, error) {
                if (error) {
                    setStatus(error);
                } else if (response) {
                    setStatus(response.msg);
                }
            });
        });
    });
});

// ========================================================
// DATA MANAGEMENT
// ========================================================
document.getElementById('captureBtn').addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var tab = tabs[0];
        if (!isSupportedUrl(tab.url)) {
            setStatus('Cannot capture on internal browser pages.');
            return;
        }
        safeSendMessage(tab.id, { action: 'CAPTURE_FORM' }, function(response, error) {
            if (error) {
                setStatus(error);
            } else if (response) {
                setStatus(response.msg);
            }
        });
    });
});

document.getElementById('viewBtn').addEventListener('click', function() {
    chrome.storage.local.get(['localWarehouse'], function(result) {
        var data = result.localWarehouse || [];
        var html = '<html><head><meta charset="UTF-8"><title>Data Table</title><style>' +
            'body { font-family: sans-serif; background: #121212; color: #ffffff; padding: 20px;}' +
            'table { width: 100%; border-collapse: collapse; }' +
            'th, td { border: 1px solid #333; padding: 8px; text-align: left;}' +
            'th { background-color: #1e1e1e; color: #f2c100;}' +
            '</style></head><body><h2>Local Data Warehouse</h2><table><tr><th>Timestamp</th><th>Label</th><th>Value/Path</th><th>URL</th></tr>';
        data.reverse().forEach(function(d) {
            html += '<tr><td>' + d.timestamp + '</td><td>' + d.label + '</td><td>' + d.value + '</td><td>' + d.sourceUrl + '</td></tr>';
        });
        html += '</table></body></html>';
        chrome.tabs.create({ url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
    });
});

document.getElementById('exportBtn').addEventListener('click', function() {
    chrome.storage.local.get(['localWarehouse'], function(result) {
        var data = result.localWarehouse || [];
        var blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "form_backup_" + new Date().toISOString().slice(0,10) + ".json";
        link.click();
    });
});

document.getElementById('importBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
        try {
            var data = JSON.parse(evt.target.result);
            if (Array.isArray(data)) {
                chrome.storage.local.get(['localWarehouse'], function(result) {
                    var existing = result.localWarehouse || [];
                    chrome.storage.local.set({ localWarehouse: existing.concat(data) }, function() {
                        setStatus('Imported ' + data.length + ' records!');
                    });
                });
            } else { setStatus("Invalid backup structure."); }
        } catch(err) { setStatus("Failed to parse JSON file."); }
    };
    reader.readAsText(file);
});
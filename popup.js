document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['formMapping'], (result) => {
        if (result.formMapping) {
            document.getElementById('jsonInput').value = result.formMapping;
        }
    });
});

document.getElementById('extractBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            func: () => {
                const prompt = "As a Senior Data Engineer, analyze the provided HTML form. Using the user's resume [cite: 16] and publication list[cite: 2], generate a JSON object where keys are form element identifiers (IDs, names, or associated labels) and values are the most accurate professional responses. Ensure justifications for RPL align with university learning outcomes [cite: 2026-03-12].\n\n";
                const formsHtml = Array.from(document.forms).map(f => f.outerHTML).join('\n') || document.body.innerHTML;
                navigator.clipboard.writeText(prompt + formsHtml).then(() => {
                    alert('Form HTML and instructions copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            }
        });
    });
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
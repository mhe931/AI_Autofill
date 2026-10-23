const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const popupHtml = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const popupScript = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const contentScript = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function popup(t, { warehouse = [], activeTab = { id: 1, url: 'https://example.test/form' } } = {}) {
    const dom = new JSDOM(popupHtml, { runScripts: 'outside-only', url: 'https://extension.test/popup.html' });
    t.after(() => dom.window.close());
    const { window } = dom;
    const storage = { localWarehouse: warehouse };
    const openedTabs = [];
    window.chrome = {
        runtime: { lastError: null },
        storage: {
            local: {
                get(keys, callback) {
                    const result = {};
                    keys.forEach(key => {
                        if (Object.hasOwn(storage, key)) result[key] = storage[key];
                    });
                    callback(result);
                },
                set(values, callback) {
                    Object.assign(storage, values);
                    if (callback) callback();
                },
                remove(key, callback) {
                    delete storage[key];
                    if (callback) callback();
                }
            }
        },
        tabs: {
            query(_query, callback) { callback(activeTab ? [activeTab] : []); },
            create(tab) { openedTabs.push(tab); },
            sendMessage() {}
        },
        scripting: { executeScript() {} }
    };
    window.confirm = () => true;
    window.eval(popupScript);
    return { window, storage, openedTabs };
}

test('warehouse viewer renders captured values as text, not executable markup', t => {
    const payload = '</td><script>window.warehousePayloadRan = true</script><td>';
    const p = popup(t, {
        warehouse: [{
            timestamp: '2026-01-01T00:00:00.000Z',
            label: '<img src=x onerror=alert(1)>',
            value: payload,
            sourceUrl: 'https://example.test/?q=<script>'
        }]
    });
    p.window.document.getElementById('viewBtn').click();

    assert.equal(p.openedTabs.length, 1);
    const dataUrl = p.openedTabs[0].url;
    const html = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const rendered = new JSDOM(html, { runScripts: 'dangerously' });
    t.after(() => rendered.window.close());
    assert.equal(rendered.window.document.querySelector('script'), null);
    assert.equal(rendered.window.document.querySelector('img'), null);
    assert.equal(rendered.window.document.querySelector('td:nth-child(3)').textContent, payload);
});

test('warehouse import rejects malformed array entries instead of storing unusable data', async t => {
    const p = popup(t, { warehouse: [] });
    const input = p.window.document.getElementById('fileInput');
    const file = new p.window.File(['[null]'], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new p.window.Event('change'));
    await new Promise(resolve => p.window.setTimeout(resolve, 25));

    assert.deepEqual(p.storage.localWarehouse, []);
    assert.match(p.window.document.getElementById('msg-container').innerText, /Invalid backup structure/);
});

test('capture excludes password, hidden, and section-prefixed sensitive autocomplete tokens', async t => {
    const dom = new JSDOM(
        '<form><input id="visible" value="keep"><input type="password" value="secret">' +
        '<input type="hidden" name="csrf" value="token">' +
        '<input type="text" autocomplete="section-login current-password" value="current secret">' +
        '<input type="text" autocomplete="section-login new-password" value="new secret">' +
        '<input type="text" autocomplete="section-payment cc-number" value="4111111111111111">' +
        '<input type="text" autocomplete="section-login one-time-code" value="123456"></form>',
        { runScripts: 'outside-only', url: 'https://example.test/form' }
    );
    t.after(() => dom.window.close());
    const { window } = dom;
    const storage = {};
    const listeners = [];
    window.chrome = {
        runtime: { onMessage: { addListener(listener) { listeners.push(listener); } } },
        storage: {
            local: {
                get(_keys, callback) { callback({ localWarehouse: storage.localWarehouse || [] }); },
                set(values, callback) {
                    Object.assign(storage, values);
                    if (callback) callback();
                }
            }
        }
    };
    window.eval(contentScript);

    const response = await new Promise(resolve => {
        listeners[0]({ action: 'CAPTURE_FORM' }, {}, resolve);
    });
    assert.equal(response.success, true);
    assert.deepEqual(storage.localWarehouse.map(record => record.value), ['keep']);
});

test('popup actions handle an empty active-tab result without throwing', t => {
    const p = popup(t, { activeTab: null });
    assert.doesNotThrow(() => p.window.document.getElementById('captureBtn').click());
    assert.match(p.window.document.getElementById('msg-container').innerText, /Cannot capture/);

    assert.doesNotThrow(() => p.window.document.getElementById('extractBtn').click());
    assert.match(p.window.document.getElementById('msg-container').innerText, /Navigate to an http\/https page/);

    p.window.document.getElementById('jsonInput').value = '{"title":"Example"}';
    assert.doesNotThrow(() => p.window.document.getElementById('injectBtn').click());
    assert.match(p.window.document.getElementById('msg-container').innerText, /Navigate to the target form page/);
});

test('manifest avoids the redundant tabs permission while retaining all-page form support', () => {
    assert.equal(manifest.permissions.includes('tabs'), false);
    assert.ok(manifest.content_scripts.some(script => script.matches.includes('<all_urls>')));
});

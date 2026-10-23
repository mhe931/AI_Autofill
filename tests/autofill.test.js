const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'osuva.html'), 'utf8');

function page(t, html = fixture) {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://osuva.uwasa.fi/submit' });
    t.after(() => dom.window.close());
    const { window } = dom;
    const document = window.document;
    let listener;
    window.chrome = {
        runtime: { onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } },
        storage: { local: { get(keys, cb) { cb({}); }, set(data, cb) { if (cb) cb(); } } }
    };
    // Model the public DOM event contract: no Angular internals or framework globals.
    const state = {};
    document.addEventListener('input', e => { state[e.target.id] = e.target.value; });
    document.addEventListener('change', e => {
        const id = e.target.id;
        state[id] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (id === 'dc.date.issued_year') document.querySelector('input[id="dc.date.issued_month"]').disabled = !e.target.value;
        if (id === 'dc.date.issued_month') document.querySelector('input[id="dc.date.issued_day"]').disabled = !e.target.value;
    });
    const host = document.querySelector('ds-dynamic-scrollable-dropdown');
    if (host) {
        const input = host.querySelector('input');
        input.addEventListener('click', () => {
            host.querySelector('.dropdown-menu').hidden = false;
            host.querySelector('[role=combobox]').setAttribute('aria-expanded', 'true');
        });
        host.querySelectorAll('[role=option]').forEach(option => {
            option.addEventListener('mousedown', () => {
                state.language = option.dataset.value;
                input.value = option.textContent;
                host.querySelector('.dropdown-menu').hidden = true;
                host.querySelector('[role=combobox]').setAttribute('aria-expanded', 'false');
            });
        });
    }
    if (fs.existsSync(path.join(root, 'autofill.js'))) window.eval(fs.readFileSync(path.join(root, 'autofill.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(root, 'content.js'), 'utf8'));
    return {
        document, window, state,
        fill: data => new Promise(resolve => listener({ action: 'FILL_FORM', json: JSON.stringify(data) }, {}, resolve)),
        message: action => new Promise(resolve => listener({ action }, {}, resolve))
    };
}

test('Osuva fills actual DOM and event-driven values, including real dropdown selection and split date', async t => {
    const p = page(t);
    let submits = 0;
    p.document.querySelector('form').addEventListener('submit', e => { e.preventDefault(); submits++; });
    const result = await p.fill({
        'dc.title': 'A thesis', 'dc.description.abstract': 'First line\nSecond line',
        'dc.language.iso': 'English', 'dc.date.issued': '2026-02-28', reviewed: true, embargo: '2027-01-02'
    });
    assert.equal(result.report.failed.length, 0, JSON.stringify(result.report.failed));
    assert.equal(p.document.getElementById('dc.title').value, 'A thesis');
    assert.equal(p.document.getElementById('dc.title.alternative').value, '');
    assert.equal(p.state['dc.title'], 'A thesis');
    assert.equal(p.document.getElementById('dc.description.abstract').value, 'First line\nSecond line');
    assert.equal(p.state.language, 'en');
    assert.equal(p.document.getElementById('dc.language.iso').value, 'English');
    assert.equal(p.document.querySelector('input[id="dc.date.issued_year"]').value, '2026');
    assert.equal(p.document.querySelector('input[id="dc.date.issued_month"]').value, '2');
    assert.equal(p.state['dc.date.issued_day'], '28');
    assert.equal(p.state.reviewed, true);
    assert.equal(p.document.getElementById('embargo').value, '2027-01-02');
    assert.equal(result.report.filled.length, 6);
    assert.equal(result.success, true);
    assert.equal(submits, 0);
});

test('never reports rejected or sanitized assignments as filled', async t => {
    const p = page(t);
    p.document.getElementById('dc.title').addEventListener('input', e => {
        p.window.setTimeout(() => { e.target.value = ''; }, 10);
    });
    const result = await p.fill({ 'dc.title': 'Rejected', embargo: '2026-02-30', reviewed: 'maybe' });
    assert.equal(p.document.getElementById('dc.title').value, '');
    assert.equal(p.document.getElementById('embargo').value, '');
    assert.equal(result.report.filled.length, 0);
    assert.equal(result.report.failed.length, 3);
    assert.equal(result.success, false);
});

test('matches exact identifiers globally before labels and refuses partial or ambiguous matches', async t => {
    const p = page(t, '<input id="Title"><label for="other">Title</label><input id="other">' +
        '<input name="duplicate"><input name="duplicate"><input id="long-key"><input placeholder="Label">');
    const result = await p.fill({ Title: 'Exact', duplicate: 'No', long: 'No', Label: 'Fallback' });
    assert.equal(p.document.getElementById('Title').value, 'Exact');
    assert.equal(p.document.getElementById('other').value, '');
    assert.equal(p.document.querySelector('[name=duplicate]').value, '');
    assert.equal(p.document.getElementById('long-key').value, '');
    assert.equal(p.document.querySelector('[placeholder]').value, 'Fallback');
    assert.equal(result.report.filled.length, 2);
    assert.equal(result.report.skipped.length, 2);
});

test('URNs, licenses, files and action controls always require manual work', async t => {
    const p = page(t);
    let clicks = 0;
    p.document.querySelectorAll('button').forEach(b => b.addEventListener('click', e => { e.preventDefault(); clicks++; }));
    const result = await p.fill({ 'dc.identifier.urn': 'urn:nbn:test', license: true, upload: 'file.pdf', 'generate-urn': true, submit: true });
    assert.equal(p.document.getElementById('dc.identifier.urn').value, '');
    assert.equal(p.document.getElementById('license').checked, false);
    assert.equal(clicks, 0);
    assert.equal(result.report.manual.length, 5);
    assert.equal(result.report.filled.length, 0);
});

test('native selects and radio groups preserve exact option behavior', async t => {
    const p = page(t, '<select id="country"><option value="">Choose</option><option value="fi">Finland</option></select>' +
        '<input type="radio" name="access" value="open"><input type="radio" name="access" value="closed">' +
        '<input type="checkbox" id="notify" checked>');
    const result = await p.fill({ country: 'Finland', access: 'closed', notify: false });
    assert.equal(p.document.getElementById('country').value, 'fi');
    assert.equal(p.document.querySelector('[value=closed]').checked, true);
    assert.equal(p.document.getElementById('notify').checked, false);
    assert.equal(result.report.filled.length, 3);
});

test('invalid top-level mappings are rejected without mutating the form', async t => {
    const p = page(t);
    for (const data of [null, [], 'text', 42]) {
        const result = await p.fill(data);
        assert.equal(result.success, false);
    }
    assert.equal(p.document.getElementById('dc.title').value, '');
});

test('extraction still returns profile and form-only prompts', async t => {
    const p = page(t);
    const formOnly = await p.message('EXTRACT_FORM_ONLY');
    assert.equal(formOnly.success, true);
    assert.match(formOnly.prompt, /ds-dynamic-scrollable-dropdown/);
    assert.match(formOnly.prompt, /dc.title/);
    const full = await p.message('EXTRACT_FORM');
    assert.equal(full.success, true);
    assert.match(full.prompt, /USER PROFILE/);
});

test('missing and ambiguous dropdown options never fall back to partial selection', async t => {
    const p = page(t);
    const host = p.document.querySelector('ds-dynamic-scrollable-dropdown');
    const duplicate = host.querySelector('[data-value=en]').cloneNode(true);
    host.querySelector('[role=listbox]').appendChild(duplicate);
    const result = await p.fill({ 'dc.language.iso': 'English' });
    assert.equal(p.state.language, undefined);
    assert.equal(p.document.getElementById('dc.language.iso').value, '');
    assert.equal(result.report.failed.length, 1);
    const partial = await p.fill({ 'dc.language.iso': 'Engl' });
    assert.equal(partial.report.filled.length, 0);
    assert.equal(p.state.language, undefined);
});

test('a real option click without a committed display change is a failure', async t => {
    const p = page(t);
    const option = p.document.querySelector('[data-value=en]');
    option.replaceWith(option.cloneNode(true));
    const result = await p.fill({ 'dc.language.iso': 'English' });
    assert.equal(p.document.getElementById('dc.language.iso').value, '');
    assert.equal(result.report.failed.length, 1);
    assert.equal(result.report.filled.length, 0);
});

test('waits for asynchronous dropdown rendering before clicking an exact option', async t => {
    const p = page(t);
    const input = p.document.getElementById('dc.language.iso');
    const list = p.document.getElementById('language-list');
    const options = Array.from(list.children);
    list.replaceChildren();
    input.addEventListener('click', () => {
        p.window.setTimeout(() => list.append(...options), 30);
    });
    const result = await p.fill({ 'dc.language.iso': 'English' });
    assert.equal(p.state.language, 'en');
    assert.equal(result.report.filled.length, 1);
});

test('split dates support reduced precision and clear stale dependent values', async t => {
    const p = page(t);
    await p.fill({ 'dc.date.issued': '2024-02-29' });
    const result = await p.fill({ 'dc.date.issued': '2026' });
    assert.equal(p.document.querySelector('input[id="dc.date.issued_year"]').value, '2026');
    assert.equal(p.document.querySelector('input[id="dc.date.issued_month"]').value, '');
    assert.equal(p.document.querySelector('input[id="dc.date.issued_day"]').value, '');
    assert.equal(result.report.filled.length, 1);
    const invalid = await p.fill({ 'dc.date.issued': '2026-02-29' });
    assert.equal(invalid.report.failed.length, 1);
    assert.equal(p.document.querySelector('input[id="dc.date.issued_year"]').value, '2026');
});

test('read-only, disabled and hidden controls are manual, not filled', async t => {
    const p = page(t, '<input id="readonly" readonly><fieldset disabled><input id="disabled"></fieldset>' +
        '<input id="hidden" type="hidden"><input id="bad" type="number">');
    const result = await p.fill({ readonly: 'No', disabled: 'No', hidden: 'No', bad: 'not a number' });
    assert.equal(result.report.manual.length, 3);
    assert.equal(result.report.failed.length, 1);
    assert.equal(result.report.filled.length, 0);
    assert.equal(p.document.getElementById('bad').value, '');
});

test('a later reactive update invalidates an earlier apparent success', async t => {
    const p = page(t);
    p.document.getElementById('reviewed').addEventListener('change', () => {
        p.document.getElementById('dc.title').value = 'Server replacement';
    });
    const result = await p.fill({ 'dc.title': 'Initial', reviewed: true });
    assert.equal(p.document.getElementById('dc.title').value, 'Server replacement');
    assert.equal(result.report.filled.length, 1);
    assert.equal(result.report.failed[0].key, 'dc.title');
});

test('hidden dropdown menus cannot produce a successful selection', async t => {
    const p = page(t);
    p.document.querySelector('.dropdown-menu').style.display = 'none';
    const result = await p.fill({ 'dc.language.iso': 'English' });
    assert.equal(p.state.language, undefined);
    assert.equal(result.report.filled.length, 0);
    assert.equal(result.report.failed.length, 1);
});

test('numeric zero is an exact option value, not an empty option', async t => {
    const p = page(t, '<select id="quantity"><option value="">Choose</option><option value="0">Zero</option></select>');
    const result = await p.fill({ quantity: 0 });
    assert.equal(p.document.getElementById('quantity').value, '0');
    assert.equal(result.report.filled.length, 1);
});

test('identifier assignments win over label keys regardless of JSON order', async t => {
    const p = page(t, '<label for="title-id">Title</label><input id="title-id">');
    const result = await p.fill({ Title: 'Fallback', 'title-id': 'Exact' });
    assert.equal(p.document.getElementById('title-id').value, 'Exact');
    assert.equal(result.report.filled.length, 1);
    assert.equal(result.report.skipped[0].key, 'Title');
});

test('license sections remain protected even when the checkbox label only says I agree', async t => {
    const p = page(t, '<ds-submission-section-license><label for="agree">I agree</label><input id="agree" type="checkbox"></ds-submission-section-license>');
    const result = await p.fill({ agree: true });
    assert.equal(p.document.getElementById('agree').checked, false);
    assert.equal(result.report.manual.length, 1);
});

test('acceptance checkboxes stay manual when the label refers to terms rather than a license', async t => {
    const p = page(t, '<label for="terms">I agree to the terms and conditions</label><input id="terms" type="checkbox">');
    const result = await p.fill({ terms: true });
    assert.equal(p.document.getElementById('terms').checked, false);
    assert.equal(result.report.manual.length, 1);
});

test('unrelated unnamed radios with the same label are ambiguous, not a radio group', async t => {
    const p = page(t, '<label><input type="radio" value="a">Choice</label><label><input type="radio" value="b">Choice</label>');
    const result = await p.fill({ Choice: 'a' });
    assert.equal(p.document.querySelector('input').checked, false);
    assert.equal(result.report.skipped.length, 1);
});

test('popup displays and persists the real field report using text, not HTML', async t => {
    const target = page(t);
    const popup = new JSDOM(fs.readFileSync(path.join(root, 'popup.html'), 'utf8'), { runScripts: 'outside-only' });
    t.after(() => popup.window.close());
    const stored = {};
    let complete;
    const done = new Promise(resolve => { complete = resolve; });
    popup.window.chrome = {
        runtime: {},
        storage: { local: {
            get(keys, cb) { cb(stored); },
            set(values, cb) { Object.assign(stored, values); if (cb) cb(); }
        } },
        tabs: {
            query(filter, cb) { cb([{ id: 1, url: 'https://osuva.uwasa.fi/submit' }]); },
            sendMessage(id, message, cb) { target.fill(JSON.parse(message.json)).then(result => { cb(result); complete(); }); }
        }
    };
    popup.window.eval(fs.readFileSync(path.join(root, 'popup.js'), 'utf8'));
    popup.window.document.getElementById('jsonInput').value = '{"dc.title":"Popup thesis","<img src=x onerror=alert(1)>":"unmatched","license":true}';
    popup.window.document.getElementById('injectBtn').click();
    await done;
    assert.equal(target.document.getElementById('dc.title').value, 'Popup thesis');
    const box = popup.window.document.getElementById('fill-report');
    assert.equal(box.hidden, false);
    assert.match(box.textContent, /filled: 1/);
    assert.match(box.textContent, /skipped: 1/);
    assert.match(box.textContent, /Manually required: 1/);
    assert.equal(box.querySelector('img'), null);
    assert.equal(stored.lastFillReport.filled[0].key, 'dc.title');
});

test('empty and unknown mapping values preserve partially completed academic fields', async t => {
    const p = page(t, '<input id="title" value="Correct title"><textarea id="abstract">Correct abstract</textarea>' +
        '<input id="author" value="Correct author"><input id="zero"><input id="flag" type="checkbox" checked>');
    const result = await p.fill({ title: '  ', abstract: null, author: 'unknown', zero: 0, flag: false });
    assert.equal(p.document.getElementById('title').value, 'Correct title');
    assert.equal(p.document.getElementById('abstract').value, 'Correct abstract');
    assert.equal(p.document.getElementById('author').value, 'Correct author');
    assert.equal(p.document.getElementById('zero').value, '0');
    assert.equal(p.document.getElementById('flag').checked, false);
    assert.equal(result.report.skipped.length, 3);
    assert.equal(result.report.filled.length, 2);
});

test('native and Angular validation errors cannot count as successful fills', async t => {
    const p = page(t, '<input id="email" type="email"><input id="year" type="number" min="2000" max="2100">' +
        '<input id="angular"><input id="pending">');
    p.document.getElementById('angular').addEventListener('input', e => e.target.classList.add('ng-invalid'));
    p.document.getElementById('pending').addEventListener('input', e => e.target.classList.add('ng-pending'));
    const result = await p.fill({ email: 'not-an-email', year: 3000, angular: 'Rejected', pending: 'Unconfirmed' });
    assert.equal(result.report.filled.length, 0);
    assert.equal(result.report.failed.length, 4);
});

test('each radio candidate is protected and hidden options cannot be selected indirectly', async t => {
    const p = page(t, '<input type="radio" name="choice" value="safe">' +
        '<label><input type="radio" name="choice" value="license">Accept license</label>' +
        '<input type="radio" name="access" value="visible"><input type="radio" name="access" value="hidden" hidden>');
    const result = await p.fill({ choice: 'license', access: 'hidden' });
    assert.equal(p.document.querySelector('[value=license]').checked, false);
    assert.equal(p.document.querySelector('[value=hidden]').checked, false);
    assert.equal(result.report.manual.length, 2);
});

test('dynamic form-array fields are resolved again after earlier updates replace or add controls', async t => {
    const p = page(t, '<input id="trigger"><input id="author_0"><input id="same"><input id="same">' +
        '<label for="abstract_en">Abstract</label><textarea id="abstract_en"></textarea>' +
        '<label for="abstract_fi">Abstract</label><textarea id="abstract_fi"></textarea>');
    p.document.getElementById('trigger').addEventListener('change', () => {
        p.document.getElementById('author_0').outerHTML = '<input id="author_0"><input id="author_1">';
    });
    const result = await p.fill({ trigger: 'Add', author_0: 'First', author_1: 'Second', same: 'No', Abstract: 'No' });
    assert.equal(p.document.getElementById('author_0').value, 'First');
    assert.equal(p.document.getElementById('author_1').value, 'Second');
    assert.equal(p.document.querySelector('[id=same]').value, '');
    assert.equal(p.document.getElementById('abstract_en').value, '');
    assert.equal(result.report.filled.length, 3);
    assert.equal(result.report.skipped.length, 2);
});

test('readonly DSpace date components remain manual', async t => {
    const p = page(t);
    p.document.querySelector('input[id="dc.date.issued_year"]').readOnly = true;
    const result = await p.fill({ 'dc.date.issued': '2026-10-23' });
    assert.equal(p.document.querySelector('input[id="dc.date.issued_year"]').value, '');
    assert.equal(result.report.manual.length, 1);
});

test('extraction reflects current values without exporting credentials or hidden payloads', async t => {
    const p = page(t, '<form><label for="title">Title</label><input id="title" value="Old title">' +
        '<textarea id="abstract">Old abstract</textarea><input id="review" type="checkbox" checked>' +
        '<select id="degree"><option value="msc">MSc</option><option value="phd">PhD</option></select>' +
        '<input id="password" type="password" value="never-export-this"><input type="hidden" value="secret-token">' +
        '<script>const internalToken = "never-export-script";</script></form><input id="outside" value="Outside">');
    p.document.getElementById('title').value = 'Current title';
    p.document.getElementById('abstract').value = 'Current abstract';
    p.document.getElementById('review').checked = false;
    p.document.getElementById('degree').value = 'phd';
    const response = await p.message('EXTRACT_FORM_ONLY');
    const html = response.prompt.split('### FORM HTML\n')[1];
    const extracted = new JSDOM(html).window.document;
    assert.equal(extracted.getElementById('title').value, 'Current title');
    assert.equal(extracted.getElementById('abstract').value, 'Current abstract');
    assert.equal(extracted.getElementById('review').checked, false);
    assert.equal(extracted.getElementById('degree').value, 'phd');
    assert.equal(extracted.getElementById('outside').value, 'Outside');
    assert.doesNotMatch(response.prompt, /never-export|secret-token/);
});

test('a repeated dropdown cannot select options from another dropdown with a duplicate listbox ID', async t => {
    const p = page(t, '<ds-dynamic-scrollable-dropdown><div role="combobox"><input id="first" readonly aria-controls="options" value="English"></div>' +
        '<div class="dropdown-menu" id="options" role="listbox"><button type="button" role="option">English</button></div></ds-dynamic-scrollable-dropdown>' +
        '<ds-dynamic-scrollable-dropdown><div role="combobox"><input id="second" readonly aria-controls="options" value="English"></div>' +
        '<div class="dropdown-menu" id="options" role="listbox"><button type="button" role="option">Finnish</button></div></ds-dynamic-scrollable-dropdown>');
    // No option handler commits the requested value in the second host.
    let wrongClicks = 0;
    p.document.querySelector('button').addEventListener('mousedown', () => { wrongClicks++; });
    const result = await p.fill({ second: 'English' });
    assert.equal(wrongClicks, 0);
    assert.equal(result.report.filled.length, 0);
    assert.equal(result.report.failed.length, 1);
});

test('academic originality and legal declarations require manual approval', async t => {
    const p = page(t, '<label for="original">I certify this thesis is my original work</label><input id="original" type="checkbox">' +
        '<label for="declaration">Legal declaration</label><select id="declaration"><option value="no">No</option><option value="yes">Yes</option></select>');
    const result = await p.fill({ original: true, declaration: 'yes' });
    assert.equal(p.document.getElementById('original').checked, false);
    assert.equal(p.document.getElementById('declaration').value, 'no');
    assert.equal(result.report.manual.length, 2);
});

test('a date part which stays readonly is not written after enabling its dependency', async t => {
    const p = page(t);
    const month = p.document.querySelector('input[id="dc.date.issued_month"]');
    month.readOnly = true;
    const result = await p.fill({ 'dc.date.issued': '2026-10-23' });
    assert.equal(month.value, '');
    assert.equal(result.report.filled.length, 0);
    assert.equal(result.report.failed.length, 1);
});

test('visible password-toggle and section-prefixed payment credentials are not extracted', async t => {
    const p = page(t, '<form><input type="text" autocomplete="section-login current-password" value="credential-sentinel">' +
        '<input type="text" autocomplete="NEW-PASSWORD" value="new-credential-sentinel">' +
        '<input autocomplete="section-payment cc-number" value="card-sentinel">' +
        '<input autocomplete="section-login one-time-code" value="code-sentinel"><input id="title" value="Public thesis"></form>');
    const response = await p.message('EXTRACT_FORM_ONLY');
    assert.doesNotMatch(response.prompt, /credential-sentinel|card-sentinel|code-sentinel/);
    assert.match(response.prompt, /Public thesis/);
});

test('extraction retains already rendered dropdown choices without opening the form control', async t => {
    const p = page(t);
    const response = await p.message('EXTRACT_FORM_ONLY');
    assert.match(response.prompt, /English \(other\)/);
    assert.equal(p.document.querySelector('.dropdown-menu').hidden, true);
    assert.equal(p.state.language, undefined);
});

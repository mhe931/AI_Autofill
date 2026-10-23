// Shared by the manifest and popup's content-script reconnection path.
(function () {
    'use strict';
    const normalize = value => String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase();
    const labelText = value => normalize(value).replace(/\s*[*:]\s*$/, '');
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

    function visible(field) {
        for (let node = field; node && node.nodeType === 1; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (node.hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true' ||
                style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
    }

    function labels(field) {
        const values = Array.from(field.labels || [], label => label.textContent);
        values.push(field.getAttribute('aria-label'), field.getAttribute('placeholder'));
        (field.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).forEach(id => {
            const label = document.getElementById(id);
            if (label) values.push(label.textContent);
        });
        return values.filter(Boolean);
    }

    function collectFields() {
        const fields = Array.from(document.querySelectorAll('input, textarea, select, button, [role="combobox"]'))
            .filter(field => !field.matches('[role="combobox"]') || !field.querySelector('input'))
            .filter(field => !field.closest('ds-dynamic-scrollable-dropdown') || field.matches('input'))
            .map(field => ({
                field,
                host: field.closest('ds-dynamic-scrollable-dropdown'),
                ids: [field.id, field.getAttribute('name')].filter(Boolean),
                labels: labels(field),
                parts: [field]
            }));
        document.querySelectorAll('ds-date-picker').forEach(host => {
            const year = host.querySelector('input[id$="_year"]');
            const month = host.querySelector('input[id$="_month"]');
            const day = host.querySelector('input[id$="_day"]');
            if (!year || !month || !day) return;
            const legend = host.querySelector('legend');
            fields.push({
                field: year, date: true, host,
                ids: [year.id.slice(0, -5), host.id].filter(Boolean),
                labels: legend ? [legend.textContent] : [],
                parts: [year, month, day]
            });
        });
        fields.forEach(item => {
            if (item.host && !item.date) {
                item.ids.push(item.host.id, item.host.getAttribute('name'));
                item.labels.push(...labels(item.host));
            }
        });
        return fields;
    }

    function manualReason(item, key) {
        const field = item.field;
        const identity = [key, ...item.ids, ...item.labels, field.getAttribute('formcontrolname')].join(' ');
        let licenseSection = false;
        for (let node = field; node; node = node.parentElement) {
            if (/licen[cs]e|lisens/i.test(node.localName + ' ' + node.id)) licenseSection = true;
        }
        if (/(?:^|[^a-z])urn(?:$|[^a-z])|licen[cs]e|lisens|k\u00e4ytt\u00f6eh|hyv\u00e4ks/i.test(identity) ||
            licenseSection) {
            return 'URN and license decisions must be completed manually.';
        }
        if (field.matches('input[type="checkbox"], input[type="radio"]') &&
            /(?:^|[^a-z])(?:terms|agreements?|consent|agree|accept)(?:$|[^a-z])/i.test(identity)) {
            return 'Agreement and consent decisions must be completed manually.';
        }
        if (field.matches('button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"], input[type="image"]')) {
            return 'Actions and submission controls are never activated.';
        }
        if (field.type === 'file') return 'Choose the file manually.';
        if (field.matches(':disabled') || field.getAttribute('aria-disabled') === 'true') return 'Control is disabled.';
        if (!item.host && field.readOnly) return 'Control is read-only.';
        if (field.type === 'hidden' || !visible(field)) return 'Control is hidden.';
        if (field.matches('[role="combobox"]') && !item.host) return 'Unsupported custom control; select manually.';
        if (field.tagName === 'SELECT' && field.multiple) return 'Multiple selection requires manual review.';
        return '';
    }

    function nativeSet(field, value) {
        const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype :
            field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        field.focus();
        setter.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.blur();
    }

    function parseDate(value, full) {
        const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
        if (!match || (full && !match[3])) throw new Error('Use an ISO date: YYYY-MM-DD (DSpace also accepts YYYY or YYYY-MM).');
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        if (!year || (match[2] && (month < 1 || month > 12)) ||
            (match[3] && (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()))) {
            throw new Error('Invalid calendar date.');
        }
        return [match[1], match[2] ? String(month) : '', match[3] ? String(day) : ''];
    }

    function uniqueOption(options, value) {
        const target = normalize(value);
        let matches = options.filter(option => normalize(option.getAttribute('value') || option.getAttribute('data-value')) === target);
        if (!matches.length) matches = options.filter(option => normalize(option.textContent) === target);
        if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous option; use an exact unique value.' : 'Exact option not found.');
        const option = matches[0];
        if (option.matches(':disabled, [aria-disabled="true"], .disabled') || option.closest('optgroup[disabled]')) {
            throw new Error('Requested option is disabled.');
        }
        return option;
    }

    async function dropdown(item, value) {
        const input = item.field;
        const trigger = item.host.querySelector('input') ||
            item.host.querySelector('[role="combobox"], .scrollable-dropdown-toggle');
        if (!trigger) throw new Error('Dropdown trigger not found.');
        trigger.click();
        let options = [];
        const deadline = Date.now() + 1500;
        do {
            const listId = input.getAttribute('aria-controls');
            const list = (listId && document.getElementById(listId)) || item.host;
            options = Array.from(list.querySelectorAll('[role="option"], button.dropdown-item')).filter(visible);
            if (options.some(option => normalize(option.textContent) === normalize(value) ||
                normalize(option.getAttribute('value') || option.getAttribute('data-value')) === normalize(value))) break;
            await pause(50);
        } while (Date.now() < deadline);
        const option = uniqueOption(options, value);
        if (!option.matches('button[type="button"], [role="option"]:not(button)')) {
            throw new Error('Unsafe option control; choose manually.');
        }
        const expected = normalize(option.textContent);
        // DSpace commits options on mousedown (before blur), not click.
        option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
        if (option.isConnected && visible(option)) option.click();
        return () => input.isConnected && normalize(input.value) === expected;
    }

    async function update(item, value, group) {
        const field = item.field;
        if (value === null || !['string', 'number', 'boolean'].includes(typeof value)) {
            throw new Error('Expected a non-null string, number or boolean.');
        }
        if (item.host && !item.date) return dropdown(item, value);
        if (item.date) {
            const values = parseDate(String(value), false);
            // Clear dependents while still enabled, then populate in dependency order.
            for (const part of item.parts.slice(1).reverse()) {
                if (part.value && !part.matches(':disabled')) nativeSet(part, '');
            }
            for (let i = 0; i < item.parts.length; i++) {
                const part = item.parts[i];
                if (!values[i]) continue;
                if (part.matches(':disabled')) throw new Error('Date component did not enable the next input.');
                nativeSet(part, values[i]);
                await pause(25);
            }
            return () => item.parts.every((part, i) => part.isConnected && part.value === values[i]);
        }
        if (field.type === 'checkbox' || field.type === 'radio') {
            let expected;
            if (field.type === 'radio') {
                const options = group.map(candidate => candidate.field);
                const matches = options.filter(option => option.value === String(value));
                if (matches.length !== 1) throw new Error('Exact unique radio option not found.');
                const selected = matches[0];
                if (selected.matches(':disabled')) throw new Error('Radio option is disabled.');
                selected.click();
                return () => selected.isConnected && selected.checked && options.every(option => option === selected || !option.checked);
            }
            if (typeof value === 'boolean') expected = value;
            else if (/^(true|yes|1|on)$/i.test(String(value))) expected = true;
            else if (/^(false|no|0|off)$/i.test(String(value))) expected = false;
            else throw new Error('Checkbox value must be true or false.');
            field.focus();
            if (field.checked !== expected) field.click();
            field.blur();
            return () => field.isConnected && field.checked === expected && !field.indeterminate;
        }
        let expected = String(value);
        if (field.tagName === 'SELECT') expected = uniqueOption(Array.from(field.options), value).value;
        if (field.type === 'date') parseDate(expected, true);
        nativeSet(field, expected);
        return () => field.isConnected && field.value === expected;
    }

    async function fill(mapping) {
        if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
            return { success: false, msg: 'Mapping must be a flat JSON object.' };
        }
        const report = { filled: [], failed: [], skipped: [], manual: [] };
        const fields = collectFields();
        const plans = Object.entries(mapping).map(([key, value]) => {
            const exact = fields.filter(item => item.ids.includes(key));
            const candidates = exact.length ? exact : fields.filter(item => item.labels.some(label => labelText(label) === labelText(key)));
            return { key, value, candidates, exact: exact.length > 0 };
        });
        const used = new Set();
        const verified = [];
        for (const plan of plans.sort((a, b) => Number(b.exact) - Number(a.exact))) {
            const { key, value, candidates } = plan;
            const item = candidates[0];
            const radioGroup = item && item.field.type === 'radio' && item.field.name && candidates.every(candidate =>
                candidate.field.type === 'radio' && candidate.field.name === item.field.name && candidate.field.form === item.field.form);
            if (!item || (candidates.length !== 1 && !radioGroup)) {
                report.skipped.push({ key, reason: item ? 'Ambiguous field; use an exact unique identifier.' : 'No exact identifier or label match.' });
                continue;
            }
            if (candidates.some(candidate => candidate.parts.some(part => used.has(part)))) {
                report.skipped.push({ key, reason: 'Field already mapped by another key.' });
                continue;
            }
            const reason = manualReason(item, key);
            if (reason) {
                report.manual.push({ key, reason });
                continue;
            }
            candidates.forEach(candidate => candidate.parts.forEach(part => used.add(part)));
            try {
                const check = await update(item, value, candidates);
                await pause(75);
                if (!check()) throw new Error('Value did not persist after the control update.');
                verified.push({ key, check });
            } catch (error) {
                report.failed.push({ key, reason: error.message });
            }
        }
        // Later reactive updates can invalidate a field which initially read back correctly.
        await pause(75);
        verified.forEach(({ key, check }) => {
            if (check()) report.filled.push({ key, reason: 'Value verified after update.' });
            else report.failed.push({ key, reason: 'Value changed or control was replaced before final verification.' });
        });
        const msg = report.filled.length + ' filled (verified), ' + report.failed.length + ' failed, ' +
            report.skipped.length + ' skipped, ' + report.manual.length + ' manually required.';
        return { success: report.filled.length > 0 && !report.failed.length && !report.skipped.length && !report.manual.length, msg, report };
    }

    let filling = false;
    window.AIFormFiller = {
        async fill(mapping) {
            if (filling) return { success: false, msg: 'A fill is already running. Wait for its report.' };
            filling = true;
            try { return await fill(mapping); }
            finally { filling = false; }
        }
    };
}());

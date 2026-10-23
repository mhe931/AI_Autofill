const { test, expect } = require('@playwright/test');
test('real Angular reactive state, validation and repeated DSpace interactions', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.auditReady);
    await page.evaluate(() => window.auditReady);
    const mapping = {
        title: 'Verified thesis', abstract: 'Verified abstract', language: 'English',
        degree: 'Master of Science', faculty: 'School of Technology and Innovations',
        date: '2026-10-23', reviewed: true, access: 'open', author_0: 'First Author', author_1: 'Second Author'
    };
    const result = await page.evaluate(data => window.AIFormFiller.fill(data), mapping);
    expect(result.report.failed).toEqual([]);
    expect(result.report.filled).toHaveLength(10);
    const state = await page.evaluate(() => ({
        values: window.audit.form.getRawValue(),
        title: { dirty: window.audit.form.controls.title.dirty, touched: window.audit.form.controls.title.touched },
        access: { dirty: window.audit.form.controls.access.dirty, touched: window.audit.form.controls.access.touched },
        submitCount: window.audit.submitCount, urnCount: window.audit.urnCount
    }));
    expect(state.values).toEqual({
        title: 'Verified thesis', abstract: 'Verified abstract', language: 'English',
        degree: 'Master of Science', faculty: 'School of Technology and Innovations',
        reviewed: true, access: 'open', date: '2026-10-23', rejected: '', deferred: 'Existing deferred value',
        authors: ['First Author', 'Second Author'], license: false
    });
    expect(state.title).toEqual({ dirty: true, touched: true });
    expect(state.access).toEqual({ dirty: true, touched: true });
    expect(state.submitCount).toBe(0);
    expect(state.urnCount).toBe(0);
    for (const item of result.report.filled) {
        if (item.key === 'date') {
            await expect(page.locator('#date_year')).toHaveValue('2026');
            await expect(page.locator('#date_month')).toHaveValue('10');
            await expect(page.locator('#date_day')).toHaveValue('23');
        } else if (item.key === 'access') {
            await expect(page.locator('[name=access][value=open]')).toBeChecked();
        } else if (item.key === 'reviewed') {
            await expect(page.locator('#reviewed')).toBeChecked();
        } else {
            await expect(page.locator('[id="' + item.key + '"]')).toHaveValue(mapping[item.key]);
        }
    }
    const repeat = await page.evaluate(data => window.AIFormFiller.fill(data), mapping);
    expect(repeat.report.filled).toHaveLength(10);
    const rejected = await page.evaluate(() => window.AIFormFiller.fill({
        title: '', abstract: 'unknown', rejected: 'not approved', deferred: 'Not committed', license: true, 'generate-urn': true, submit: true
    }));
    expect(rejected.report.filled).toHaveLength(0);
    expect(rejected.report.skipped).toHaveLength(2);
    expect(rejected.report.failed).toHaveLength(2);
    expect(rejected.report.manual).toHaveLength(3);
    expect(await page.evaluate(() => ({
        title: window.audit.form.controls.title.value, abstract: window.audit.form.controls.abstract.value,
        deferred: window.audit.form.controls.deferred.value,
        license: window.audit.form.controls.license.value, submissions: window.audit.submitCount, urns: window.audit.urnCount
    }))).toEqual({ title: 'Verified thesis', abstract: 'Verified abstract', deferred: 'Existing deferred value', license: false, submissions: 0, urns: 0 });
});

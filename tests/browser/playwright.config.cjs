const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: __dirname,
    testMatch: '*.spec.cjs',
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:18765',
        launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined }
    },
    webServer: {
        command: 'node server.cjs',
        url: 'http://127.0.0.1:18765',
        reuseExistingServer: !process.env.CI
    }
});

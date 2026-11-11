import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: true,
    workers: 2,
    timeout: 30000,
    expect: { timeout: 10000 },
    reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
    use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined } } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: { executablePath: process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE || undefined } } },
    ],
    webServer: {
        command: 'node tests/server.mjs',
        url: 'http://127.0.0.1:4173/demo/',
        reuseExistingServer: !process.env.CI,
    },
});

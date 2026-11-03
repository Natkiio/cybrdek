import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.pw.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	use: {
		baseURL: 'http://127.0.0.1:4178',
		viewport: { width: 390, height: 844 },
		serviceWorkers: 'allow',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
			? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined
	},
	webServer: {
		command: 'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',
		url: 'http://127.0.0.1:4178/rules',
		reuseExistingServer: false
	}
});

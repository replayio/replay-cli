import { defineConfig, devices, replayReporter } from '@replayio/playwright-ct';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env file
config();

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.{ts,tsx}',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: [
    replayReporter({
      apiKey: 'rwk_suq5mfH7akPgpUsJ41oJhxdgy9Y6UtvjOmbZhxzTNrI',
      // upload: true,
    }),
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  /* Global test configuration */
  use: {
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshots for all component tests */
    screenshot: 'on',
    
    /* Record videos on failure */
    video: 'retain-on-failure',
    
    /* Timeout for each action */
    actionTimeout: 10000,
  },

  /* Configure projects for major browsers with Replay */
  projects: [
    {
      name: 'replay-chromium',
      use: { ...devices['Replay Chromium'] },
    },
  ],
  
  /* Global setup for test utilities */
  globalSetup: path.resolve('./src/test-utils/global-setup.ts'),
});
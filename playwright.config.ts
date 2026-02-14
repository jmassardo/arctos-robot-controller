import { defineConfig, devices } from '@playwright/test';

/**
 * Comprehensive E2E Test Configuration for Arctos Robot Controller
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e-tests',
  
  /* Global test timeout */
  timeout: 30000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
  
  /* Run tests in files in parallel */
  fullyParallel: process.env.E2E_PARALLEL !== 'false',
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e/results.json' }],
    ['junit', { outputFile: 'test-results/e2e/junit.xml' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  /* Global test configuration */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    
    /* Global timeout for all actions */
    actionTimeout: 15000,
    
    /* Collect trace when retrying the failed test */
    trace: 'retain-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Browser viewport */
    viewport: { width: 1280, height: 720 },
    
    /* Ignore HTTPS errors */
    ignoreHTTPSErrors: true,
    
    /* Bypass CSP */
    bypassCSP: process.env.NODE_ENV === 'test',
  },

  /* Configure projects for comprehensive testing */
  projects: [
    /* Desktop Browsers */
    {
      name: 'desktop-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // Additional Chrome-specific settings
        launchOptions: {
          args: [
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--no-sandbox'
          ]
        }
      },
    },
    {
      name: 'desktop-firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefox-specific settings
        launchOptions: {
          firefoxUserPrefs: {
            'security.tls.insecure_fallback_hosts': 'localhost',
            'network.stricttransportsecurity.preloadlist': false
          }
        }
      },
    },
    {
      name: 'desktop-safari',
      use: { 
        ...devices['Desktop Safari'],
      },
    },

    /* Mobile Testing */
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        isMobile: true,
      },
      testMatch: '**/cross-platform-mobile-workflows.spec.ts'
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        isMobile: true,
      },
      testMatch: '**/cross-platform-mobile-workflows.spec.ts'
    },
    {
      name: 'tablet-chrome',
      use: { 
        ...devices['iPad Pro'],
        isMobile: true,
      },
      testMatch: '**/cross-platform-mobile-workflows.spec.ts'
    },

    /* High-resolution displays */
    {
      name: 'desktop-chrome-4k',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 3840, height: 2160 },
      },
      testMatch: '**/cross-platform-mobile-workflows.spec.ts'
    },

    /* Security-focused testing */
    {
      name: 'security-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // Strict security settings
        launchOptions: {
          args: [
            '--strict-transport-security',
            '--enable-strict-mixed-content-checking'
          ]
        }
      },
      testMatch: '**/security-authorization.spec.ts'
    }
  ],

  /* Global setup and teardown */
  globalSetup: require.resolve('./e2e-tests/global-setup.js'),
  globalTeardown: require.resolve('./e2e-tests/global-teardown.js'),

  /* Output directories */
  outputDir: 'test-results/e2e/artifacts',

  /* Web server configuration - conditional based on environment */
  webServer: process.env.E2E_SKIP_SERVER_START ? undefined : [
    {
      command: 'npm start',
      port: 3001, // Backend server
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        PORT: '3001'
      }
    },
    {
      command: 'npm start',
      port: 3000, // Frontend server  
      cwd: './client',
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        REACT_APP_API_URL: 'http://localhost:3001'
      }
    }
  ],
});
/**
 * Global Setup for E2E Tests
 * Prepares the test environment before running any tests
 */

const { chromium } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

async function globalSetup() {
  console.log('🚀 Setting up E2E test environment...');

  try {
    // Ensure test results directories exist
    await ensureDirectory('./test-results/e2e');
    await ensureDirectory('./test-results/e2e/artifacts');
    await ensureDirectory('./playwright-report');

    // Create test configuration
    const testConfig = {
      baseURL: process.env.BASE_URL || 'http://localhost:3000',
      apiURL: process.env.API_URL || 'http://localhost:3001',
      testStartTime: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'test',
      ci: !!process.env.CI,
    };

    await fs.writeFile('./test-results/e2e/test-config.json', JSON.stringify(testConfig, null, 2));

    // Wait for servers to be ready if they're being started
    if (!process.env.E2E_SKIP_SERVER_START) {
      console.log('⏳ Waiting for servers to be ready...');
      await waitForServers();
    }

    // Create test users if needed
    await createTestUsers();

    // Warm up browsers
    if (process.env.E2E_WARMUP_BROWSERS) {
      await warmupBrowsers();
    }

    console.log('✅ E2E test environment setup complete');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  }
}

async function ensureDirectory(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function waitForServers() {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const apiURL = process.env.API_URL || 'http://localhost:3001';

  const maxAttempts = 30;
  const delay = 2000;

  // Wait for backend API
  console.log('⏳ Waiting for backend server...');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${apiURL}/health`);
      if (response.ok) {
        console.log('✅ Backend server is ready');
        break;
      }
    } catch (error) {
      if (i === maxAttempts - 1) {
        throw new Error('Backend server failed to start within timeout');
      }
      await sleep(delay);
    }
  }

  // Wait for frontend
  console.log('⏳ Waiting for frontend server...');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) {
        console.log('✅ Frontend server is ready');
        break;
      }
    } catch (error) {
      if (i === maxAttempts - 1) {
        throw new Error('Frontend server failed to start within timeout');
      }
      await sleep(delay);
    }
  }

  // Additional warm-up delay
  await sleep(3000);
}

async function createTestUsers() {
  console.log('👥 Creating test users...');

  const testUsers = [
    {
      username: 'e2e-admin',
      password: 'AdminPass123!',
      email: 'admin@e2e-test.com',
      role: 'admin',
    },
    {
      username: 'e2e-operator',
      password: 'OperatorPass123!',
      email: 'operator@e2e-test.com',
      role: 'operator',
    },
    {
      username: 'e2e-viewer',
      password: 'ViewerPass123!',
      email: 'viewer@e2e-test.com',
      role: 'viewer',
    },
  ];

  const apiURL = process.env.API_URL || 'http://localhost:3001';

  for (const user of testUsers) {
    try {
      const response = await fetch(`${apiURL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      if (response.ok) {
        console.log(`✅ Test user created: ${user.username}`);
      } else if (response.status === 409) {
        console.log(`ℹ️  Test user already exists: ${user.username}`);
      } else {
        console.warn(`⚠️  Failed to create test user ${user.username}: ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to create test user ${user.username}:`, error.message);
    }
  }
}

async function warmupBrowsers() {
  console.log('🌡️ Warming up browsers...');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Visit main page to warm up
    await page.goto(process.env.BASE_URL || 'http://localhost:3000');
    await page.waitForLoadState('networkidle');

    console.log('✅ Browser warm-up complete');
  } catch (error) {
    console.warn('⚠️  Browser warm-up failed:', error.message);
  } finally {
    await browser.close();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = globalSetup;

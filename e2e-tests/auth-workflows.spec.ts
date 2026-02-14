import { test, expect, Page } from '@playwright/test';

// Test configuration
const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const apiURL = process.env.API_URL || 'http://localhost:3001';

// Test user data
const testUsers = {
  admin: {
    username: 'e2e-admin',
    password: 'AdminPass123!',
    email: 'admin@e2e-test.com',
    role: 'admin'
  },
  operator: {
    username: 'e2e-operator',
    password: 'OperatorPass123!',
    email: 'operator@e2e-test.com',
    role: 'operator'
  },
  viewer: {
    username: 'e2e-viewer',
    password: 'ViewerPass123!',
    email: 'viewer@e2e-test.com',
    role: 'viewer'
  }
};

// Test utilities
async function clearAuthData(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function navigateToLogin(page: Page) {
  await page.goto(baseURL);
  // App should redirect to login if not authenticated
  await expect(page).toHaveURL(/.*login.*/);
}

async function registerUser(page: Page, userData: typeof testUsers.admin) {
  await page.goto(baseURL);
  await page.click('[data-testid="show-register-button"]');
  
  await page.fill('[data-testid="username-input"]', userData.username);
  await page.fill('[data-testid="email-input"]', userData.email);
  await page.fill('[data-testid="password-input"]', userData.password);
  await page.fill('[data-testid="confirm-password-input"]', userData.password);
  
  await page.click('[data-testid="register-button"]');
  
  // Wait for successful registration
  await expect(page.locator('[data-testid="connection-status"]')).toBeVisible({ timeout: 10000 });
}

async function loginUser(page: Page, userData: typeof testUsers.admin) {
  await navigateToLogin(page);
  
  await page.fill('[data-testid="username-input"]', userData.username);
  await page.fill('[data-testid="password-input"]', userData.password);
  
  await page.click('[data-testid="login-button"]');
  
  // Wait for successful login and connection
  await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 15000 });
  
  // Verify user info is displayed
  await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
  await expect(page.locator('[data-testid="username-display"]')).toContainText(userData.username);
}

test.describe('Authentication Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthData(page);
  });

  test.describe('User Registration', () => {
    test('should register a new admin user successfully', async ({ page }) => {
      await page.goto(baseURL);
      await page.click('[data-testid="show-register-button"]');
      
      // Fill registration form
      await page.fill('[data-testid="username-input"]', testUsers.admin.username);
      await page.fill('[data-testid="email-input"]', testUsers.admin.email);
      await page.fill('[data-testid="password-input"]', testUsers.admin.password);
      await page.fill('[data-testid="confirm-password-input"]', testUsers.admin.password);
      
      // Submit registration
      await page.click('[data-testid="register-button"]');
      
      // Should be redirected to main app after successful registration
      await expect(page.locator('[data-testid="connection-status"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
      await expect(page.locator('[data-testid="username-display"]')).toContainText(testUsers.admin.username);
      
      // Admin should see all tabs including admin-only ones
      await expect(page.locator('[data-testid="tab-users"]')).toBeVisible();
      await expect(page.locator('[data-testid="tab-audit"]')).toBeVisible();
    });

    test('should register a new operator user successfully', async ({ page }) => {
      await registerUser(page, testUsers.operator);
      
      // Operator should see operational tabs but not admin-only tabs
      await expect(page.locator('[data-testid="tab-manual"]')).toBeVisible();
      await expect(page.locator('[data-testid="tab-gcode"]')).toBeVisible();
      await expect(page.locator('[data-testid="tab-replay"]')).toBeVisible();
      await expect(page.locator('[data-testid="tab-config"]')).toBeVisible();
      
      // Should not see admin-only tabs
      await expect(page.locator('[data-testid="tab-users"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="tab-audit"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="tab-advanced-config"]')).not.toBeVisible();
    });

    test('should validate registration form inputs', async ({ page }) => {
      await page.goto(baseURL);
      await page.click('[data-testid="show-register-button"]');
      
      // Test empty form submission
      await page.click('[data-testid="register-button"]');
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/required/i);
      
      // Test password mismatch
      await page.fill('[data-testid="username-input"]', 'testuser');
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'Password123!');
      await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
      
      await page.click('[data-testid="register-button"]');
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/passwords.*match/i);
      
      // Test weak password
      await page.fill('[data-testid="password-input"]', '123');
      await page.fill('[data-testid="confirm-password-input"]', '123');
      
      await page.click('[data-testid="register-button"]');
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/password.*strong/i);
    });
  });

  test.describe('User Login', () => {
    test('should login admin user and display correct permissions', async ({ page }) => {
      // First register the user
      await registerUser(page, testUsers.admin);
      await page.click('[data-testid="logout-button"]');
      
      // Clear session and login again
      await clearAuthData(page);
      await loginUser(page, testUsers.admin);
      
      // Verify admin role badge
      await expect(page.locator('[data-testid="user-role-badge"]')).toContainText('ADMIN');
      
      // Admin should have access to all tabs
      const adminTabs = ['manual', 'gcode', 'replay', 'config', 'advanced-config', 'monitoring', 'documentation', 'profile', 'users', 'audit'];
      for (const tab of adminTabs) {
        await expect(page.locator(`[data-testid="tab-${tab}"]`)).toBeVisible();
      }
    });

    test('should login operator user with restricted permissions', async ({ page }) => {
      await registerUser(page, testUsers.operator);
      await page.click('[data-testid="logout-button"]');
      
      await clearAuthData(page);
      await loginUser(page, testUsers.operator);
      
      // Verify operator role badge
      await expect(page.locator('[data-testid="user-role-badge"]')).toContainText('OPERATOR');
      
      // Operator should have limited tabs
      const operatorTabs = ['manual', 'gcode', 'replay', 'config', 'monitoring', 'documentation', 'profile'];
      for (const tab of operatorTabs) {
        await expect(page.locator(`[data-testid="tab-${tab}"]`)).toBeVisible();
      }
      
      // Should not see admin-only tabs
      await expect(page.locator('[data-testid="tab-users"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="tab-audit"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="tab-advanced-config"]')).not.toBeVisible();
    });

    test('should handle invalid login credentials', async ({ page }) => {
      await navigateToLogin(page);
      
      await page.fill('[data-testid="username-input"]', 'nonexistentuser');
      await page.fill('[data-testid="password-input"]', 'wrongpassword');
      
      await page.click('[data-testid="login-button"]');
      
      // Should show error message
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/invalid.*credentials/i);
      
      // Should remain on login page
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    });

    test('should handle empty login form', async ({ page }) => {
      await navigateToLogin(page);
      
      await page.click('[data-testid="login-button"]');
      
      // Should show validation error
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/required/i);
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session across page refresh', async ({ page }) => {
      await registerUser(page, testUsers.admin);
      
      // Verify logged in
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
      
      // Refresh page
      await page.reload();
      
      // Should still be logged in
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
      await expect(page.locator('[data-testid="username-display"]')).toContainText(testUsers.admin.username);
    });

    test('should logout user and clear session', async ({ page }) => {
      await registerUser(page, testUsers.admin);
      
      // Click logout button
      await page.click('[data-testid="logout-button"]');
      
      // Should be redirected to login
      await expect(page).toHaveURL(/.*login.*/);
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
      
      // Try to access main app directly
      await page.goto(baseURL);
      
      // Should be redirected back to login
      await expect(page).toHaveURL(/.*login.*/);
    });

    test('should handle session expiration', async ({ page }) => {
      await registerUser(page, testUsers.admin);
      
      // Simulate session expiration by clearing auth token
      await page.evaluate(() => {
        localStorage.removeItem('auth_token');
      });
      
      // Try to make an authenticated request
      await page.click('[data-testid="tab-config"]');
      
      // Should be redirected to login due to expired session
      await expect(page).toHaveURL(/.*login.*/);
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/session.*expired/i);
    });
  });

  test.describe('Multi-User Authentication', () => {
    test('should support concurrent user sessions', async ({ browser }) => {
      // Create two browser contexts to simulate different users
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      try {
        // Register and login admin user in first browser
        await registerUser(page1, testUsers.admin);
        await expect(page1.locator('[data-testid="username-display"]')).toContainText(testUsers.admin.username);
        
        // Register and login operator user in second browser
        await registerUser(page2, testUsers.operator);
        await expect(page2.locator('[data-testid="username-display"]')).toContainText(testUsers.operator.username);
        
        // Both users should be connected simultaneously
        await expect(page1.locator('[data-testid="connection-status"]')).toContainText('Connected');
        await expect(page2.locator('[data-testid="connection-status"]')).toContainText('Connected');
        
        // Verify different permissions for each user
        await expect(page1.locator('[data-testid="tab-users"]')).toBeVisible(); // Admin only
        await expect(page2.locator('[data-testid="tab-users"]')).not.toBeVisible(); // Not operator
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe('Authentication Error Recovery', () => {
    test('should handle network errors during login', async ({ page }) => {
      // Simulate network failure by going offline
      await page.context().setOffline(true);
      
      await navigateToLogin(page);
      await page.fill('[data-testid="username-input"]', testUsers.admin.username);
      await page.fill('[data-testid="password-input"]', testUsers.admin.password);
      
      await page.click('[data-testid="login-button"]');
      
      // Should show network error
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/network.*error/i);
      
      // Restore network and retry
      await page.context().setOffline(false);
      await page.click('[data-testid="login-button"]');
      
      // Should eventually succeed (assuming user exists)
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 15000 });
    });

    test('should handle server unavailable during authentication', async ({ page }) => {
      // This test would require mocking the server or having a test environment
      // that can simulate server downtime
      await navigateToLogin(page);
      
      // Fill in valid credentials
      await page.fill('[data-testid="username-input"]', testUsers.admin.username);
      await page.fill('[data-testid="password-input"]', testUsers.admin.password);
      
      // Mock server error response
      await page.route('**/api/auth/login', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' })
        });
      });
      
      await page.click('[data-testid="login-button"]');
      
      // Should show server error message
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/server.*error/i);
      
      // Should remain on login page
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    });
  });
});
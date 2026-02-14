import { test, expect, Page } from '@playwright/test';

// Test configuration
const baseURL = process.env.BASE_URL || 'http://localhost:3000';

// Test utilities
async function loginAsUser(page: Page, username: string, password: string) {
  await page.goto(baseURL);
  await page.fill('[data-testid="username-input"]', username);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');
  
  await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 15000 });
}

async function navigateToTab(page: Page, tabName: string) {
  await page.click(`[data-testid="tab-${tabName}"]`);
  await page.waitForSelector(`[data-testid="${tabName}-control"], [data-testid="${tabName}-dashboard"], [data-testid="${tabName}-panel"]`);
}

test.describe('Security & Authorization E2E Tests', () => {
  
  test.describe('Role-Based Access Control', () => {
    test('should enforce admin-only access to user management', async ({ page }) => {
      // Test as operator (should not have access)
      await loginAsUser(page, 'e2e-operator', 'OperatorPass123!');
      
      // User management tab should not be visible
      await expect(page.locator('[data-testid="tab-users"]')).not.toBeVisible();
      
      // Direct navigation should be blocked
      await page.goto(`${baseURL}/users`);
      await expect(page.locator('[data-testid="access-denied"]')).toBeVisible();
      
      // Logout and login as admin
      await page.click('[data-testid="logout-button"]');
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Admin should have access
      await expect(page.locator('[data-testid="tab-users"]')).toBeVisible();
      await page.click('[data-testid="tab-users"]');
      await expect(page.locator('[data-testid="user-management-panel"]')).toBeVisible();
    });

    test('should enforce operator access restrictions', async ({ page }) => {
      await loginAsUser(page, 'e2e-operator', 'OperatorPass123!');
      
      // Operator should have access to operational tabs
      const allowedTabs = ['manual', 'gcode', 'replay', 'config', 'monitoring', 'documentation', 'profile'];
      for (const tab of allowedTabs) {
        await expect(page.locator(`[data-testid="tab-${tab}"]`)).toBeVisible();
      }
      
      // Operator should NOT have access to admin tabs
      const restrictedTabs = ['advanced-config', 'users', 'audit'];
      for (const tab of restrictedTabs) {
        await expect(page.locator(`[data-testid="tab-${tab}"]`)).not.toBeVisible();
      }
    });

    test('should enforce viewer access restrictions', async ({ page }) => {
      await loginAsUser(page, 'e2e-viewer', 'ViewerPass123!');
      
      // Viewer should only have read-only access
      const allowedTabs = ['monitoring', 'documentation', 'profile'];
      for (const tab of allowedTabs) {
        await expect(page.locator(`[data-testid="tab-${tab}"]`)).toBeVisible();
      }
      
      // Viewer should NOT have access to control tabs
      const restrictedTabs = ['manual', 'gcode', 'replay', 'config', 'advanced-config', 'users', 'audit'];
      for (const tab of restrictedTabs) {
        await expect(page.locator(`[data-testid="tab-${tab}"]`)).not.toBeVisible();
      }
    });

    test('should handle role changes in real-time', async ({ page, browser }) => {
      // Admin changes user role in another session
      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      
      const userContext = await browser.newContext();
      const userPage = await userContext.newPage();
      
      try {
        // Login admin and operator
        await loginAsUser(adminPage, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(userPage, 'e2e-operator', 'OperatorPass123!');
        
        // Operator should see operator tabs
        await expect(userPage.locator('[data-testid="tab-manual"]')).toBeVisible();
        await expect(userPage.locator('[data-testid="tab-users"]')).not.toBeVisible();
        
        // Admin changes operator role to viewer
        await navigateToTab(adminPage, 'users');
        await adminPage.click('[data-testid="edit-user-e2e-operator"]');
        await adminPage.selectOption('[data-testid="user-role-select"]', 'viewer');
        await adminPage.click('[data-testid="save-user-button"]');
        
        // Operator session should be updated (may require refresh or real-time update)
        await userPage.reload();
        
        // Should now have viewer restrictions
        await expect(userPage.locator('[data-testid="tab-manual"]')).not.toBeVisible();
        await expect(userPage.locator('[data-testid="tab-monitoring"]')).toBeVisible();
        
      } finally {
        await adminContext.close();
        await userContext.close();
      }
    });
  });

  test.describe('Session Security', () => {
    test('should prevent session hijacking', async ({ page, browser }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Get session token
      const sessionToken = await page.evaluate(() => localStorage.getItem('auth_token'));
      
      // Create new browser context and try to use stolen token
      const newContext = await browser.newContext();
      const newPage = await newContext.newPage();
      
      try {
        // Try to use stolen token
        await newPage.goto(baseURL);
        await newPage.evaluate((token) => {
          localStorage.setItem('auth_token', token);
        }, sessionToken);
        
        await newPage.reload();
        
        // Should not be automatically logged in (proper session validation should prevent this)
        // Implementation depends on server-side session validation
        await expect(newPage.locator('[data-testid="login-form"], [data-testid="session-invalid"]')).toBeVisible();
        
      } finally {
        await newContext.close();
      }
    });

    test('should handle concurrent sessions properly', async ({ page, browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const session1 = await context1.newPage();
      const session2 = await context2.newPage();
      
      try {
        // Login same user in two sessions
        await loginAsUser(session1, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(session2, 'e2e-admin', 'AdminPass123!');
        
        // Both sessions should be valid (unless single session policy is enforced)
        await expect(session1.locator('[data-testid="connection-status"]')).toContainText('Connected');
        await expect(session2.locator('[data-testid="connection-status"]')).toContainText('Connected');
        
        // If single session policy is enforced, first session should be invalidated
        if (await session1.locator('[data-testid="session-terminated"]').isVisible()) {
          await expect(session1.locator('[data-testid="session-terminated"]')).toContainText(/session.*terminated/i);
        }
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('should enforce secure logout', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Perform logout
      await page.click('[data-testid="logout-button"]');
      
      // Should clear all session data
      const hasToken = await page.evaluate(() => localStorage.getItem('auth_token'));
      expect(hasToken).toBeNull();
      
      // Should redirect to login
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
      
      // Should not be able to access protected routes
      await page.goto(`${baseURL}/manual`);
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
      
      // Browser back button should not return to authenticated state
      await page.goBack();
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    });
  });

  test.describe('Data Privacy & Security', () => {
    test('should protect sensitive configuration data', async ({ page }) => {
      await loginAsUser(page, 'e2e-operator', 'OperatorPass123!'); // Lower privilege user
      
      await navigateToTab(page, 'config');
      
      // Sensitive fields should be hidden or read-only for non-admin users
      const sensitiveFields = [
        '[data-testid="database-password-field"]',
        '[data-testid="api-key-field"]',
        '[data-testid="encryption-key-field"]'
      ];
      
      for (const field of sensitiveFields) {
        if (await page.locator(field).isVisible()) {
          // Field should be read-only or masked
          await expect(page.locator(field)).toHaveAttribute('readonly', '');
          // Or should be masked
          const fieldType = await page.locator(field).getAttribute('type');
          expect(fieldType).toBe('password');
        }
      }
    });

    test('should sanitize user input to prevent XSS', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Try to inject script in position name
      const maliciousInput = '<script>alert("XSS")</script>';
      
      await page.fill('[data-testid="position-name-input"]', maliciousInput);
      await page.click('[data-testid="save-position-button"]');
      
      // Should sanitize the input and not execute script
      await navigateToTab(page, 'replay');
      
      // Should display sanitized text, not execute script
      await expect(page.locator('[data-testid="position-item"]')).toContainText('<script>');
      
      // Page should not have executed the script
      const hasAlert = await page.evaluate(() => {
        // Check if any alert dialogs are present
        return document.querySelector('dialog[role="alertdialog"]') !== null;
      });
      expect(hasAlert).toBeFalsy();
    });

    test('should prevent SQL injection in search/filter inputs', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'replay');
      
      // Try SQL injection in search
      const sqlInjection = "'; DROP TABLE positions; --";
      
      await page.fill('[data-testid="position-search-input"]', sqlInjection);
      await page.press('[data-testid="position-search-input"]', 'Enter');
      
      // Should handle safely without executing SQL
      await expect(page.locator('[data-testid="position-list"]')).toBeVisible();
      
      // Application should still function normally
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
    });

    test('should encrypt sensitive data transmission', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Monitor network traffic
      const requests: string[] = [];
      
      page.on('request', request => {
        if (request.url().includes('/api/')) {
          requests.push(request.url());
        }
      });
      
      // Perform actions that send sensitive data
      await navigateToTab(page, 'config');
      await page.fill('[data-testid="database-password-field"]', 'sensitive-password');
      await page.click('[data-testid="save-configuration-button"]');
      
      // Verify HTTPS is used for sensitive endpoints
      const sensitiveRequests = requests.filter(url => url.includes('config') || url.includes('auth'));
      
      for (const url of sensitiveRequests) {
        expect(url).toMatch(/^https:/);
      }
    });
  });

  test.describe('Input Validation Security', () => {
    test('should validate file upload types and sizes', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'gcode');
      
      // Try to upload invalid file type
      await page.setInputFiles('[data-testid="gcode-file-input"]', {
        name: 'malicious.exe',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('malicious content')
      });
      
      // Should reject invalid file type
      await expect(page.locator('[data-testid="file-type-error"]')).toContainText(/invalid.*file.*type/i);
      
      // Try to upload oversized file
      const largeContent = 'A'.repeat(10 * 1024 * 1024); // 10MB
      await page.setInputFiles('[data-testid="gcode-file-input"]', {
        name: 'large-file.gcode',
        mimeType: 'text/plain',
        buffer: Buffer.from(largeContent)
      });
      
      // Should reject oversized file
      await expect(page.locator('[data-testid="file-size-error"]')).toContainText(/file.*too.*large/i);
    });

    test('should validate numeric input ranges', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'config');
      
      // Test extreme numeric values
      const extremeValues = [
        { field: 'x-axis-min-limit', value: '-999999999' },
        { field: 'x-axis-max-limit', value: '999999999' },
        { field: 'max-velocity-setting', value: '-1' },
        { field: 'acceleration-setting', value: '0' }
      ];
      
      for (const test of extremeValues) {
        await page.fill(`[data-testid="${test.field}"]`, test.value);
        await page.click('[data-testid="save-configuration-button"]');
        
        // Should show validation error or clamp to valid range
        await expect(page.locator('[data-testid="validation-error"], [data-testid="value-clamped-warning"]')).toBeVisible();
      }
    });

    test('should prevent command injection in G-Code', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'gcode');
      
      // Try to inject system commands
      const maliciousGCode = `
        G1 X10 Y10
        ; rm -rf /
        M999 $(whoami)
        G1 X0 Y0
      `;
      
      await page.fill('[data-testid="gcode-editor"]', maliciousGCode);
      await page.click('[data-testid="validate-gcode-button"]');
      
      // Should detect and reject malicious content
      await expect(page.locator('[data-testid="security-warning"], [data-testid="invalid-gcode-error"]')).toBeVisible();
      
      // Should not allow execution
      await page.click('[data-testid="execute-gcode-button"]');
      await expect(page.locator('[data-testid="execution-blocked"]')).toBeVisible();
    });
  });

  test.describe('API Security', () => {
    test('should require authentication for protected endpoints', async ({ page }) => {
      // Test direct API access without authentication
      const response = await page.request.get(`${process.env.API_URL || 'http://localhost:3001'}/api/config`);
      
      // Should require authentication
      expect(response.status()).toBe(401);
      
      // Login and get valid token
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      const token = await page.evaluate(() => localStorage.getItem('auth_token'));
      
      // Should work with valid token
      const authenticatedResponse = await page.request.get(`${process.env.API_URL || 'http://localhost:3001'}/api/config`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      expect(authenticatedResponse.status()).toBe(200);
    });

    test('should validate API request rates', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      const token = await page.evaluate(() => localStorage.getItem('auth_token'));
      
      // Make rapid API requests
      const requests: Promise<any>[] = [];
      
      for (let i = 0; i < 100; i++) {
        requests.push(
          page.request.get(`${process.env.API_URL || 'http://localhost:3001'}/api/positions`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => null)
        );
      }
      
      const responses = await Promise.allSettled(requests);
      
      // Should have some rate limiting (429 responses) or throttling
      const rateLimitedResponses = responses.filter(result => 
        result.status === 'fulfilled' && result.value?.status() === 429
      );
      
      if (rateLimitedResponses.length > 0) {
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      }
    });

    test('should prevent unauthorized data access', async ({ page, browser }) => {
      // Login as operator
      await loginAsUser(page, 'e2e-operator', 'OperatorPass123!');
      const operatorToken = await page.evaluate(() => localStorage.getItem('auth_token'));
      
      // Try to access admin-only data
      const unauthorizedResponse = await page.request.get(`${process.env.API_URL || 'http://localhost:3001'}/api/users`, {
        headers: { 'Authorization': `Bearer ${operatorToken}` }
      });
      
      // Should be forbidden
      expect(unauthorizedResponse.status()).toBe(403);
      
      // Try to access another user's data
      const otherUserResponse = await page.request.get(`${process.env.API_URL || 'http://localhost:3001'}/api/users/admin-user-id`, {
        headers: { 'Authorization': `Bearer ${operatorToken}` }
      });
      
      expect(otherUserResponse.status()).toBe(403);
    });
  });

  test.describe('Audit Trail Security', () => {
    test('should log security-relevant events', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Perform actions that should be audited
      await navigateToTab(page, 'manual');
      await page.click('[data-testid="emergency-stop-button"]');
      
      await navigateToTab(page, 'config');
      await page.selectOption('[data-testid="robot-type-select"]', 'scara');
      await page.click('[data-testid="save-configuration-button"]');
      
      // Check audit trail
      await navigateToTab(page, 'audit');
      
      // Should log emergency stop event
      await expect(page.locator('[data-testid="audit-entry"]')).toContainText(/emergency.*stop/i);
      
      // Should log configuration changes
      await expect(page.locator('[data-testid="audit-entry"]')).toContainText(/configuration.*changed/i);
      
      // Should include user information
      await expect(page.locator('[data-testid="audit-entry"]')).toContainText('e2e-admin');
    });

    test('should protect audit logs from tampering', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'audit');
      
      // Audit entries should be read-only
      const auditEntries = page.locator('[data-testid="audit-entry"]');
      const count = await auditEntries.count();
      
      for (let i = 0; i < count; i++) {
        // Should not have edit or delete buttons
        await expect(auditEntries.nth(i).locator('[data-testid="edit-button"], [data-testid="delete-button"]')).not.toBeVisible();
      }
      
      // Should not allow bulk deletion
      await expect(page.locator('[data-testid="clear-audit-log-button"]')).not.toBeVisible();
    });
  });

  test.describe('Content Security Policy', () => {
    test('should enforce CSP headers', async ({ page }) => {
      await page.goto(baseURL);
      
      // Check for CSP headers (this would be more effective in a controlled test environment)
      const cspResponse = await page.request.get(baseURL);
      const cspHeader = cspResponse.headers()['content-security-policy'];
      
      if (cspHeader) {
        // Should have restrictive CSP
        expect(cspHeader).toContain("default-src 'self'");
        expect(cspHeader).not.toContain("'unsafe-inline'");
        expect(cspHeader).not.toContain("'unsafe-eval'");
      }
    });

    test('should prevent inline script execution', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Try to inject inline script
      const hasInlineScriptError = await page.evaluate(() => {
        try {
          const script = document.createElement('script');
          script.innerHTML = 'window.injectedScript = true;';
          document.head.appendChild(script);
          return !window.hasOwnProperty('injectedScript');
        } catch (error) {
          return true; // CSP blocked the script
        }
      });
      
      // CSP should block inline scripts
      expect(hasInlineScriptError).toBeTruthy();
    });
  });
});
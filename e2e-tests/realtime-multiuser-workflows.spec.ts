import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';

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

async function waitForSocketUpdate(page: Page, selector: string, timeout: number = 5000) {
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.textContent !== null,
    selector,
    { timeout }
  );
}

test.describe('Real-time Communication & Multi-User Workflows', () => {
  test.describe('Real-time Socket.IO Communication', () => {
    test('should synchronize robot position updates across multiple clients', async ({ browser }) => {
      // Create two browser contexts to simulate different users
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const admin1 = await context1.newPage();
      const admin2 = await context2.newPage();
      
      try {
        // Login both users
        await loginAsUser(admin1, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(admin2, 'e2e-admin', 'AdminPass123!');
        
        // Navigate both to manual control
        await navigateToTab(admin1, 'manual');
        await navigateToTab(admin2, 'manual');
        
        // Get initial X axis values
        const xAxis1 = admin1.locator('[data-testid="x-axis-value"]');
        const xAxis2 = admin2.locator('[data-testid="x-axis-value"]');
        
        const initialValue1 = await xAxis1.textContent();
        const initialValue2 = await xAxis2.textContent();
        
        // Values should be synchronized initially
        expect(initialValue1).toBe(initialValue2);
        
        // Move axis in first client
        await admin1.click('[data-testid="x-axis-plus-button"]');
        
        // Wait for real-time update in second client
        await expect(xAxis2).not.toContainText(initialValue2 || '', { timeout: 3000 });
        
        // Both clients should now show the same updated value
        const updatedValue1 = await xAxis1.textContent();
        const updatedValue2 = await xAxis2.textContent();
        
        expect(updatedValue1).toBe(updatedValue2);
        
        // Test gripper synchronization
        await admin1.click('[data-testid="gripper-50-button"]');
        
        // Should update in real-time on second client
        await expect(admin2.locator('[data-testid="gripper-value"]')).toContainText('50', { timeout: 3000 });
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('should synchronize position saves across clients', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const admin1 = await context1.newPage();
      const admin2 = await context2.newPage();
      
      try {
        await loginAsUser(admin1, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(admin2, 'e2e-admin', 'AdminPass123!');
        
        // Admin1 saves a position
        await navigateToTab(admin1, 'manual');
        await admin1.fill('[data-testid="position-name-input"]', 'Real-time Sync Position');
        await admin1.click('[data-testid="save-position-button"]');
        
        await expect(admin1.locator('[data-testid="success-message"]')).toContainText(/position.*saved/i);
        
        // Admin2 should see the new position in real-time
        await navigateToTab(admin2, 'replay');
        
        // Position should appear without page refresh
        await expect(admin2.locator('[data-testid="position-item"]')).toContainText('Real-time Sync Position', { timeout: 5000 });
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('should synchronize configuration changes across clients', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const admin1 = await context1.newPage();
      const admin2 = await context2.newPage();
      
      try {
        await loginAsUser(admin1, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(admin2, 'e2e-admin', 'AdminPass123!');
        
        // Navigate to config on both clients
        await navigateToTab(admin1, 'config');
        await navigateToTab(admin2, 'config');
        
        // Change configuration in first client
        await admin1.selectOption('[data-testid="robot-type-select"]', 'scara');
        await admin1.click('[data-testid="save-configuration-button"]');
        
        await expect(admin1.locator('[data-testid="success-message"]')).toContainText(/configuration.*saved/i);
        
        // Second client should reflect the change automatically
        await expect(admin2.locator('[data-testid="robot-type-select"]')).toHaveValue('scara', { timeout: 5000 });
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('should handle socket disconnection and reconnection', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Verify connected status
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
      
      // Simulate network disconnection by going offline
      await page.context().setOffline(true);
      
      // Should show disconnected status
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Disconnected', { timeout: 10000 });
      
      // Reconnect
      await page.context().setOffline(false);
      
      // Should automatically reconnect
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 15000 });
      
      // Functionality should be restored
      await navigateToTab(page, 'manual');
      await page.click('[data-testid="x-axis-plus-button"]');
      
      // Should work normally after reconnection
      await expect(page.locator('[data-testid="x-axis-value"]')).toBeVisible();
    });

    test('should maintain real-time sync during G-Code execution', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const executor = await context1.newPage();
      const observer = await context2.newPage();
      
      try {
        await loginAsUser(executor, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(observer, 'e2e-admin', 'AdminPass123!');
        
        // Executor starts G-Code execution
        await navigateToTab(executor, 'gcode');
        await executor.click('[data-testid="load-sample-button"]');
        await executor.click('[data-testid="execute-gcode-button"]');
        
        // Observer should see execution status in real-time
        await navigateToTab(observer, 'gcode');
        
        // Execution status should be synchronized
        await expect(observer.locator('[data-testid="execution-status"]')).toContainText(/executing/i, { timeout: 5000 });
        
        // Progress should be synchronized
        await expect(observer.locator('[data-testid="execution-progress"]')).toBeVisible({ timeout: 5000 });
        
        // Both should show completion
        await expect(executor.locator('[data-testid="execution-status"]')).toContainText(/completed/i, { timeout: 30000 });
        await expect(observer.locator('[data-testid="execution-status"]')).toContainText(/completed/i, { timeout: 5000 });
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe('Multi-User Collaboration Workflows', () => {
    test('should support concurrent manual control by multiple operators', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const operator1 = await context1.newPage();
      const operator2 = await context2.newPage();
      
      try {
        // Login as different operators
        await loginAsUser(operator1, 'e2e-operator1', 'OperatorPass123!');
        await loginAsUser(operator2, 'e2e-operator2', 'OperatorPass123!');
        
        // Both navigate to manual control
        await navigateToTab(operator1, 'manual');
        await navigateToTab(operator2, 'manual');
        
        // Operator1 moves X axis
        await operator1.click('[data-testid="x-axis-plus-button"]');
        
        // Operator2 should see the change immediately
        await waitForSocketUpdate(operator2, '[data-testid="x-axis-value"]');
        
        // Operator2 moves Y axis
        await operator2.click('[data-testid="y-axis-plus-button"]');
        
        // Operator1 should see the change immediately
        await waitForSocketUpdate(operator1, '[data-testid="y-axis-value"]');
        
        // Both operators should see the same final state
        const x1 = await operator1.locator('[data-testid="x-axis-value"]').textContent();
        const x2 = await operator2.locator('[data-testid="x-axis-value"]').textContent();
        const y1 = await operator1.locator('[data-testid="y-axis-value"]').textContent();
        const y2 = await operator2.locator('[data-testid="y-axis-value"]').textContent();
        
        expect(x1).toBe(x2);
        expect(y1).toBe(y2);
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('should prevent concurrent G-Code execution conflicts', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const operator1 = await context1.newPage();
      const operator2 = await context2.newPage();
      
      try {
        await loginAsUser(operator1, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(operator2, 'e2e-admin', 'AdminPass123!');
        
        await navigateToTab(operator1, 'gcode');
        await navigateToTab(operator2, 'gcode');
        
        // Operator1 starts G-Code execution
        await operator1.click('[data-testid="load-sample-button"]');
        await operator1.click('[data-testid="execute-gcode-button"]');
        
        await expect(operator1.locator('[data-testid="execution-status"]')).toContainText(/executing/i);
        
        // Operator2 should see that execution is in progress and cannot start another
        await expect(operator2.locator('[data-testid="execute-gcode-button"]')).toBeDisabled({ timeout: 5000 });
        await expect(operator2.locator('[data-testid="execution-status"]')).toContainText(/executing/i);
        
        // Wait for completion
        await expect(operator1.locator('[data-testid="execution-status"]')).toContainText(/completed/i, { timeout: 30000 });
        
        // Now operator2 should be able to execute
        await expect(operator2.locator('[data-testid="execute-gcode-button"]')).toBeEnabled({ timeout: 5000 });
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('should show user activity indicators', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const user1 = await context1.newPage();
      const user2 = await context2.newPage();
      
      try {
        await loginAsUser(user1, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(user2, 'e2e-operator', 'OperatorPass123!');
        
        // User1 should see indication of other connected users
        await expect(user1.locator('[data-testid="connected-users-indicator"]')).toContainText('2', { timeout: 10000 });
        
        // User2 should also see the count
        await expect(user2.locator('[data-testid="connected-users-indicator"]')).toContainText('2', { timeout: 5000 });
        
        // When user2 disconnects, user1 should see updated count
        await context2.close();
        
        await expect(user1.locator('[data-testid="connected-users-indicator"]')).toContainText('1', { timeout: 10000 });
        
      } finally {
        await context1.close();
      }
    });

    test('should handle role-based permission conflicts in real-time', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const admin = await context1.newPage();
      const operator = await context2.newPage();
      
      try {
        await loginAsUser(admin, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(operator, 'e2e-operator', 'OperatorPass123!');
        
        // Admin changes a setting that affects operator permissions
        await navigateToTab(admin, 'advanced-config');
        
        // Simulate a configuration change that affects operator access
        await admin.check('[data-testid="restrict-manual-control"]');
        await admin.click('[data-testid="save-advanced-config-button"]');
        
        // Operator should immediately lose access to manual control
        await navigateToTab(operator, 'manual');
        await expect(operator.locator('[data-testid="access-restricted-message"]')).toBeVisible({ timeout: 5000 });
        
        // Admin restores access
        await admin.uncheck('[data-testid="restrict-manual-control"]');
        await admin.click('[data-testid="save-advanced-config-button"]');
        
        // Operator should regain access immediately
        await expect(operator.locator('[data-testid="manual-control-panel"]')).toBeVisible({ timeout: 5000 });
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe('Real-time Error Handling', () => {
    test('should broadcast emergency stop across all clients', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const operator1 = await context1.newPage();
      const operator2 = await context2.newPage();
      
      try {
        await loginAsUser(operator1, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(operator2, 'e2e-admin', 'AdminPass123!');
        
        await navigateToTab(operator1, 'manual');
        await navigateToTab(operator2, 'manual');
        
        // Operator1 triggers emergency stop
        await operator1.click('[data-testid="emergency-stop-button"]');
        
        // Emergency state should be broadcast to all clients
        await expect(operator1.locator('[data-testid="emergency-status"]')).toContainText(/emergency.*stop/i);
        await expect(operator2.locator('[data-testid="emergency-status"]')).toContainText(/emergency.*stop/i, { timeout: 3000 });
        
        // All controls should be disabled on both clients
        await expect(operator1.locator('[data-testid="x-axis-plus-button"]')).toBeDisabled();
        await expect(operator2.locator('[data-testid="x-axis-plus-button"]')).toBeDisabled({ timeout: 3000 });
        
        // Reset emergency stop from operator2
        await operator2.click('[data-testid="emergency-reset-button"]');
        
        // Both clients should return to normal operation
        await expect(operator1.locator('[data-testid="emergency-status"]')).not.toContainText(/emergency.*stop/i, { timeout: 3000 });
        await expect(operator2.locator('[data-testid="emergency-status"]')).not.toContainText(/emergency.*stop/i);
        
        await expect(operator1.locator('[data-testid="x-axis-plus-button"]')).toBeEnabled({ timeout: 3000 });
        await expect(operator2.locator('[data-testid="x-axis-plus-button"]')).toBeEnabled();
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('should handle connection timeouts gracefully', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Simulate slow network conditions
      await page.context().setOffline(true);
      await page.waitForTimeout(1000);
      await page.context().setOffline(false);
      
      // Should show reconnecting status
      await expect(page.locator('[data-testid="connection-status"]')).toContainText(/reconnecting|connecting/i, { timeout: 5000 });
      
      // Should eventually reconnect
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 15000 });
      
      // Functionality should be restored
      await navigateToTab(page, 'manual');
      const xAxis = page.locator('[data-testid="x-axis-value"]');
      const initialValue = await xAxis.textContent();
      
      await page.click('[data-testid="x-axis-plus-button"]');
      await expect(xAxis).not.toContainText(initialValue || '');
    });

    test('should synchronize error messages across clients', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const user1 = await context1.newPage();
      const user2 = await context2.newPage();
      
      try {
        await loginAsUser(user1, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(user2, 'e2e-admin', 'AdminPass123!');
        
        await navigateToTab(user1, 'gcode');
        await navigateToTab(user2, 'gcode');
        
        // User1 executes invalid G-Code (simulate system error)
        await user1.fill('[data-testid="gcode-editor"]', 'G999 X999999 Y999999'); // Invalid G-Code
        await user1.click('[data-testid="execute-gcode-button"]');
        
        // Error should be visible on both clients
        await expect(user1.locator('[data-testid="execution-error"]')).toBeVisible({ timeout: 10000 });
        await expect(user2.locator('[data-testid="execution-error"]')).toBeVisible({ timeout: 5000 });
        
        // Error message content should be synchronized
        const error1 = await user1.locator('[data-testid="execution-error"]').textContent();
        const error2 = await user2.locator('[data-testid="execution-error"]').textContent();
        
        expect(error1).toBe(error2);
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });

  test.describe('Performance Under Multi-User Load', () => {
    test('should maintain responsiveness with multiple concurrent users', async ({ browser }) => {
      const contexts = [];
      const pages = [];
      
      try {
        // Create 5 concurrent user sessions
        for (let i = 0; i < 5; i++) {
          const context = await browser.newContext();
          const page = await context.newPage();
          
          contexts.push(context);
          pages.push(page);
          
          // Login each user
          await loginAsUser(page, `e2e-user-${i}`, 'TestPass123!');
          await navigateToTab(page, 'manual');
        }
        
        // All users perform simultaneous actions
        const startTime = Date.now();
        
        const promises = pages.map(async (page, index) => {
          // Each user performs multiple axis movements
          for (let j = 0; j < 5; j++) {
            await page.click('[data-testid="x-axis-plus-button"]');
            await page.click('[data-testid="y-axis-plus-button"]');
            await page.waitForTimeout(100);
          }
        });
        
        await Promise.all(promises);
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Operations should complete within reasonable time (adjust threshold as needed)
        expect(duration).toBeLessThan(30000); // 30 seconds max
        
        // All users should still be connected
        for (const page of pages) {
          await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
        }
        
      } finally {
        // Clean up all contexts
        for (const context of contexts) {
          await context.close();
        }
      }
    });

    test('should handle high-frequency updates without blocking UI', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const producer = await context1.newPage();
      const consumer = await context2.newPage();
      
      try {
        await loginAsUser(producer, 'e2e-admin', 'AdminPass123!');
        await loginAsUser(consumer, 'e2e-operator', 'OperatorPass123!');
        
        await navigateToTab(producer, 'manual');
        await navigateToTab(consumer, 'manual');
        
        // Producer generates rapid updates
        const startTime = Date.now();
        
        for (let i = 0; i < 50; i++) {
          await producer.click('[data-testid="x-axis-plus-button"]');
          await producer.waitForTimeout(50); // Rapid updates
        }
        
        const endTime = Date.now();
        
        // Consumer should still be responsive
        await expect(consumer.locator('[data-testid="connection-status"]')).toContainText('Connected');
        
        // UI should still be interactive
        await consumer.click('[data-testid="y-axis-plus-button"]');
        await expect(consumer.locator('[data-testid="y-axis-value"]')).toBeVisible();
        
        // Updates should not take too long
        expect(endTime - startTime).toBeLessThan(10000); // 10 seconds max
        
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });
});
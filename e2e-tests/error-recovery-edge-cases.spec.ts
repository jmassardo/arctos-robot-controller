import { test, expect, Page, BrowserContext } from '@playwright/test';

// Test configuration
const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const apiURL = process.env.API_URL || 'http://localhost:3001';

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

async function simulateServerError(page: Page, endpoint: string, statusCode: number = 500, errorMessage: string = 'Internal Server Error') {
  await page.route(`**${endpoint}`, route => {
    route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify({ error: errorMessage })
    });
  });
}

async function simulateNetworkLatency(page: Page, delayMs: number) {
  await page.route('**/*', async (route) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

test.describe('Error Recovery & Edge Case Workflows', () => {
  
  test.describe('Network Error Recovery', () => {
    test('should handle complete network disconnection gracefully', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Verify normal operation
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
      
      // Move axis to establish baseline
      const xAxis = page.locator('[data-testid="x-axis-value"]');
      await page.click('[data-testid="x-axis-plus-button"]');
      
      // Simulate network disconnection
      await page.context().setOffline(true);
      
      // Should detect disconnection
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Disconnected', { timeout: 10000 });
      
      // UI should show offline state
      await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
      
      // Controls should be disabled or show warning
      await expect(page.locator('[data-testid="connection-warning"]')).toBeVisible();
      
      // Try to perform action while offline
      await page.click('[data-testid="x-axis-plus-button"]');
      await expect(page.locator('[data-testid="offline-action-warning"]')).toBeVisible();
      
      // Reconnect network
      await page.context().setOffline(false);
      
      // Should automatically reconnect
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 15000 });
      
      // Functionality should be restored
      const reconnectedValue = await xAxis.textContent();
      await page.click('[data-testid="x-axis-plus-button"]');
      await expect(xAxis).not.toContainText(reconnectedValue || '');
      
      // Offline indicator should disappear
      await expect(page.locator('[data-testid="offline-indicator"]')).not.toBeVisible();
    });

    test('should handle intermittent connectivity issues', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Simulate intermittent disconnections
      for (let i = 0; i < 3; i++) {
        await page.context().setOffline(true);
        await page.waitForTimeout(2000);
        
        await expect(page.locator('[data-testid="connection-status"]')).toContainText(/Disconnected|Reconnecting/, { timeout: 5000 });
        
        await page.context().setOffline(false);
        await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 10000 });
      }
      
      // Should handle reconnections gracefully
      const xAxis = page.locator('[data-testid="x-axis-value"]');
      const initialValue = await xAxis.textContent();
      
      await page.click('[data-testid="x-axis-plus-button"]');
      await expect(xAxis).not.toContainText(initialValue || '');
    });

    test('should handle slow network conditions', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Simulate slow network (3G speed)
      await simulateNetworkLatency(page, 2000);
      
      await navigateToTab(page, 'gcode');
      
      // Should show loading indicators for slow operations
      await page.click('[data-testid="load-sample-button"]');
      await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
      
      // Should eventually complete despite slow network
      await expect(page.locator('[data-testid="gcode-editor"]')).not.toBeEmpty({ timeout: 10000 });
      await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
    });

    test('should handle timeout scenarios', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'gcode');
      
      // Mock API endpoint to timeout
      await page.route('**/api/gcode/execute', async (route) => {
        // Don't respond to simulate timeout
        await new Promise(() => {}); // Never resolves
      });
      
      await page.click('[data-testid="load-sample-button"]');
      await page.click('[data-testid="execute-gcode-button"]');
      
      // Should show timeout error after reasonable wait
      await expect(page.locator('[data-testid="timeout-error"]')).toBeVisible({ timeout: 30000 });
      
      // Should allow user to retry
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
    });
  });

  test.describe('Server Error Recovery', () => {
    test('should handle 500 Internal Server Error', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Mock server error for position save
      await simulateServerError(page, '/api/positions', 500, 'Internal Server Error');
      
      await navigateToTab(page, 'manual');
      await page.fill('[data-testid="position-name-input"]', 'Test Error Position');
      await page.click('[data-testid="save-position-button"]');
      
      // Should show error message
      await expect(page.locator('[data-testid="server-error-message"]')).toContainText(/server error|internal error/i);
      
      // Should provide retry option
      await expect(page.locator('[data-testid="retry-save-button"]')).toBeVisible();
      
      // Clear mock to test retry
      await page.unroute('**/api/positions');
      
      // Retry should work
      await page.click('[data-testid="retry-save-button"]');
      await expect(page.locator('[data-testid="success-message"]')).toContainText(/position.*saved/i);
    });

    test('should handle 404 Not Found errors', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Mock 404 error for config endpoint
      await simulateServerError(page, '/api/config', 404, 'Configuration not found');
      
      await navigateToTab(page, 'config');
      
      // Should show appropriate error for missing resource
      await expect(page.locator('[data-testid="not-found-error"]')).toContainText(/not found|configuration.*missing/i);
      
      // Should offer to create default configuration
      await expect(page.locator('[data-testid="create-default-config-button"]')).toBeVisible();
    });

    test('should handle 403 Forbidden errors', async ({ page }) => {
      await loginAsUser(page, 'e2e-operator', 'OperatorPass123!'); // Lower privilege user
      
      // Mock 403 error for admin-only endpoint
      await simulateServerError(page, '/api/users', 403, 'Access denied');
      
      // Try to access admin functionality
      await page.goto(`${baseURL}/users`);
      
      // Should show access denied message
      await expect(page.locator('[data-testid="access-denied-error"]')).toContainText(/access.*denied|permission.*denied/i);
      
      // Should provide option to request access or switch user
      await expect(page.locator('[data-testid="request-access-button"], [data-testid="switch-user-button"]')).toBeVisible();
    });

    test('should handle authentication token expiration', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Simulate token expiration by mocking 401 response
      await simulateServerError(page, '/api/**', 401, 'Token expired');
      
      // Try to perform authenticated action
      await navigateToTab(page, 'manual');
      await page.fill('[data-testid="position-name-input"]', 'Token Expired Test');
      await page.click('[data-testid="save-position-button"]');
      
      // Should redirect to login or show re-authentication modal
      await expect(page.locator('[data-testid="reauth-modal"], [data-testid="login-form"]')).toBeVisible({ timeout: 5000 });
      
      // If modal, should allow re-authentication without losing work
      if (await page.locator('[data-testid="reauth-modal"]').isVisible()) {
        await page.fill('[data-testid="reauth-password"]', 'AdminPass123!');
        await page.click('[data-testid="reauth-button"]');
        
        // Should return to previous state
        await expect(page.locator('[data-testid="position-name-input"]')).toHaveValue('Token Expired Test');
      }
    });
  });

  test.describe('Data Corruption Recovery', () => {
    test('should handle corrupted position data', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Mock corrupted data response
      await page.route('**/api/positions', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, name: 'Valid Position', axes: { x: 10, y: 20 } },
            { id: 2, name: null, axes: 'invalid_data' }, // Corrupted
            { id: 3, name: 'Another Position', axes: { x: 30, y: 40 } }
          ])
        });
      });
      
      await navigateToTab(page, 'replay');
      
      // Should handle corrupted data gracefully
      await expect(page.locator('[data-testid="data-error-warning"]')).toBeVisible();
      
      // Valid positions should still be displayed
      await expect(page.locator('[data-testid="position-item"]')).toContainText('Valid Position');
      await expect(page.locator('[data-testid="position-item"]')).toContainText('Another Position');
      
      // Should offer data repair options
      await expect(page.locator('[data-testid="repair-data-button"]')).toBeVisible();
    });

    test('should handle corrupted configuration data', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Mock corrupted config response
      await page.route('**/api/config', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'invalid_json_data'
        });
      });
      
      await navigateToTab(page, 'config');
      
      // Should detect corrupted configuration
      await expect(page.locator('[data-testid="config-corruption-error"]')).toBeVisible();
      
      // Should offer to reset to defaults
      await expect(page.locator('[data-testid="reset-config-button"]')).toBeVisible();
      
      await page.click('[data-testid="reset-config-button"]');
      await page.click('[data-testid="confirm-reset-button"]');
      
      // Should restore default configuration
      await expect(page.locator('[data-testid="configuration-panel"]')).toBeVisible();
    });
  });

  test.describe('Memory and Resource Constraints', () => {
    test('should handle memory limitations during large G-Code files', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'gcode');
      
      // Generate large G-Code content (simulate very large file)
      const largeGCode = 'G1 X0 Y0\n'.repeat(10000); // 10,000 lines
      
      await page.fill('[data-testid="gcode-editor"]', largeGCode);
      
      // Should handle large content gracefully
      await expect(page.locator('[data-testid="memory-warning"], [data-testid="large-file-warning"]')).toBeVisible({ timeout: 5000 });
      
      // Should offer options like chunked processing
      await expect(page.locator('[data-testid="chunked-processing-option"]')).toBeVisible();
      
      // Try to execute large file
      await page.click('[data-testid="execute-gcode-button"]');
      
      // Should process in chunks or show progress
      await expect(page.locator('[data-testid="chunked-progress"], [data-testid="processing-chunks"]')).toBeVisible({ timeout: 10000 });
    });

    test('should handle browser storage limitations', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Fill up localStorage by saving many positions
      await navigateToTab(page, 'manual');
      
      for (let i = 0; i < 100; i++) {
        await page.fill('[data-testid="position-name-input"]', `Storage Test Position ${i}`);
        await page.click('[data-testid="save-position-button"]');
        
        // Check if storage quota exceeded
        if (await page.locator('[data-testid="storage-quota-warning"]').isVisible()) {
          break;
        }
      }
      
      // Should warn about storage limitations
      await expect(page.locator('[data-testid="storage-quota-warning"]')).toBeVisible();
      
      // Should offer cleanup options
      await expect(page.locator('[data-testid="cleanup-storage-button"]')).toBeVisible();
      
      await page.click('[data-testid="cleanup-storage-button"]');
      
      // Should provide storage management interface
      await expect(page.locator('[data-testid="storage-management-modal"]')).toBeVisible();
    });
  });

  test.describe('Hardware Simulation Errors', () => {
    test('should handle robot hardware disconnection', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Simulate hardware disconnection
      await page.route('**/api/robot/status', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ 
            connected: false, 
            error: 'Hardware communication lost',
            lastSeen: Date.now() - 10000
          })
        });
      });
      
      // Trigger status check
      await page.click('[data-testid="refresh-status-button"]');
      
      // Should show hardware disconnection warning
      await expect(page.locator('[data-testid="hardware-disconnected-warning"]')).toBeVisible();
      
      // Controls should be disabled or show simulation mode
      await expect(page.locator('[data-testid="simulation-mode-indicator"]')).toBeVisible();
      
      // Should offer reconnection options
      await expect(page.locator('[data-testid="reconnect-hardware-button"]')).toBeVisible();
    });

    test('should handle robot limit switch triggers', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Mock limit switch trigger
      await page.route('**/api/robot/move', route => {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ 
            error: 'Limit switch triggered',
            axis: 'X',
            position: 200,
            limit: 'max'
          })
        });
      });
      
      // Try to move beyond limit
      await page.click('[data-testid="x-axis-plus-button"]');
      
      // Should show limit switch error
      await expect(page.locator('[data-testid="limit-switch-error"]')).toContainText(/limit switch.*triggered/i);
      
      // Should show emergency stop option
      await expect(page.locator('[data-testid="emergency-stop-button"]')).toBeVisible();
      
      // Should prevent further movement in that direction
      await expect(page.locator('[data-testid="x-axis-plus-button"]')).toBeDisabled();
    });

    test('should handle motor overcurrent protection', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Mock overcurrent protection trigger
      await page.route('**/api/robot/move', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ 
            error: 'Motor overcurrent protection activated',
            motor: 'X-axis',
            current: 3.5,
            limit: 3.0
          })
        });
      });
      
      await page.click('[data-testid="x-axis-plus-button"]');
      
      // Should show overcurrent error
      await expect(page.locator('[data-testid="overcurrent-error"]')).toContainText(/overcurrent.*protection/i);
      
      // Should automatically trigger safety stop
      await expect(page.locator('[data-testid="safety-stop-indicator"]')).toBeVisible();
      
      // Should require manual reset
      await expect(page.locator('[data-testid="manual-reset-required"]')).toBeVisible();
    });
  });

  test.describe('Edge Case User Interactions', () => {
    test('should handle rapid button clicking', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      const xAxis = page.locator('[data-testid="x-axis-value"]');
      const initialValue = await xAxis.textContent();
      
      // Rapidly click axis button
      for (let i = 0; i < 20; i++) {
        await page.click('[data-testid="x-axis-plus-button"]');
        await page.waitForTimeout(50); // 20 clicks per second
      }
      
      // Should handle rapid clicks without crashing
      await expect(page.locator('[data-testid="manual-control-panel"]')).toBeVisible();
      
      // Should update value (may be throttled)
      await expect(xAxis).not.toContainText(initialValue || '');
      
      // Should not show multiple error messages
      const errorCount = await page.locator('[data-testid="error-message"]').count();
      expect(errorCount).toBeLessThanOrEqual(1);
    });

    test('should handle simultaneous operations', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Try to perform multiple operations simultaneously
      const operations = [
        page.click('[data-testid="x-axis-plus-button"]'),
        page.click('[data-testid="y-axis-plus-button"]'),
        page.click('[data-testid="gripper-50-button"]'),
        page.fill('[data-testid="position-name-input"]', 'Simultaneous Test'),
        page.click('[data-testid="save-position-button"]')
      ];
      
      await Promise.all(operations);
      
      // Should handle concurrent operations gracefully
      await expect(page.locator('[data-testid="manual-control-panel"]')).toBeVisible();
      
      // At least some operations should succeed
      await expect(page.locator('[data-testid="success-message"], [data-testid="position-name-input"]')).toBeVisible();
    });

    test('should handle invalid input values', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'config');
      
      // Test various invalid inputs
      const invalidInputs = [
        { field: 'x-axis-min-limit', value: 'not-a-number' },
        { field: 'x-axis-max-limit', value: 'Infinity' },
        { field: 'axis-count-select', value: '-5' },
        { field: 'max-velocity-setting', value: '999999999' }
      ];
      
      for (const input of invalidInputs) {
        await page.fill(`[data-testid="${input.field}"]`, input.value);
        await page.press(`[data-testid="${input.field}"]`, 'Tab'); // Trigger validation
        
        // Should show validation error
        await expect(page.locator('[data-testid="validation-error"], [data-testid="input-error"]')).toBeVisible();
      }
      
      // Try to save invalid configuration
      await page.click('[data-testid="save-configuration-button"]');
      
      // Should prevent saving and show summary of errors
      await expect(page.locator('[data-testid="validation-summary"]')).toBeVisible();
    });

    test('should handle extremely long input strings', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Create extremely long position name
      const longString = 'A'.repeat(10000);
      
      await page.fill('[data-testid="position-name-input"]', longString);
      
      // Should handle long input gracefully (truncate, warn, or validate)
      await expect(page.locator('[data-testid="input-length-warning"], [data-testid="truncation-notice"]')).toBeVisible({ timeout: 3000 });
      
      await page.click('[data-testid="save-position-button"]');
      
      // Should not crash and should handle the long string appropriately
      await expect(page.locator('[data-testid="manual-control-panel"]')).toBeVisible();
    });
  });

  test.describe('Recovery from Application Crashes', () => {
    test('should recover from JavaScript errors', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Listen for console errors
      const errors: string[] = [];
      page.on('pageerror', error => {
        errors.push(error.message);
      });
      
      // Inject a JavaScript error
      await page.evaluate(() => {
        // @ts-ignore
        window.causeError = () => {
          throw new Error('Intentional test error');
        };
      });
      
      // Trigger the error
      await page.evaluate(() => {
        // @ts-ignore
        window.causeError();
      });
      
      // Should show error boundary or recovery UI
      await expect(page.locator('[data-testid="error-boundary"], [data-testid="application-error"]')).toBeVisible({ timeout: 5000 });
      
      // Should offer recovery options
      await expect(page.locator('[data-testid="reload-button"], [data-testid="report-error-button"]')).toBeVisible();
      
      // Test recovery
      await page.click('[data-testid="reload-button"]');
      
      // Should return to normal operation
      await expect(page.locator('[data-testid="manual-control-panel"], [data-testid="connection-status"]')).toBeVisible();
    });

    test('should handle browser tab crashes', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Save some state before crash
      await navigateToTab(page, 'manual');
      await page.click('[data-testid="x-axis-plus-button"]');
      await page.fill('[data-testid="position-name-input"]', 'Pre-crash position');
      
      // Simulate browser tab crash by reloading
      await page.reload();
      
      // Should attempt to restore session
      await expect(page.locator('[data-testid="session-recovery"], [data-testid="login-form"]')).toBeVisible({ timeout: 10000 });
      
      // If login required, should maintain unsaved work notification
      if (await page.locator('[data-testid="login-form"]').isVisible()) {
        await page.fill('[data-testid="username-input"]', 'e2e-admin');
        await page.fill('[data-testid="password-input"]', 'AdminPass123!');
        await page.click('[data-testid="login-button"]');
        
        // Should offer to restore unsaved work
        await expect(page.locator('[data-testid="restore-work-notification"]')).toBeVisible();
      }
    });
  });

  test.describe('Stress Testing Edge Cases', () => {
    test('should handle maximum concurrent operations', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await navigateToTab(page, 'manual');
      
      // Perform maximum number of operations
      const maxOperations: Promise<void>[] = [];
      
      // Queue up many operations
      for (let i = 0; i < 50; i++) {
        maxOperations.push(
          page.click('[data-testid="x-axis-plus-button"]').catch(() => {})
        );
        maxOperations.push(
          page.click('[data-testid="y-axis-plus-button"]').catch(() => {})
        );
      }
      
      // Execute all operations
      await Promise.allSettled(maxOperations);
      
      // Application should still be responsive
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 10000 });
      
      // Should still accept new operations
      const xAxis = page.locator('[data-testid="x-axis-value"]');
      const valueBeforeFinalTest = await xAxis.textContent();
      
      await page.click('[data-testid="x-axis-plus-button"]');
      await expect(xAxis).not.toContainText(valueBeforeFinalTest || '');
    });

    test('should handle resource exhaustion gracefully', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Create many WebSocket connections by opening many tabs
      const contexts: BrowserContext[] = [];
      
      try {
        for (let i = 0; i < 10; i++) {
          const context = await page.context().browser()?.newContext();
          if (context) {
            contexts.push(context);
            const newPage = await context.newPage();
            await loginAsUser(newPage, 'e2e-admin', 'AdminPass123!');
          }
        }
        
        // Original page should still work
        await navigateToTab(page, 'manual');
        await expect(page.locator('[data-testid="manual-control-panel"]')).toBeVisible();
        
        // Should handle resource constraints
        if (await page.locator('[data-testid="resource-warning"]').isVisible()) {
          await expect(page.locator('[data-testid="resource-warning"]')).toContainText(/resource.*limit/i);
        }
        
      } finally {
        // Cleanup
        for (const context of contexts) {
          await context.close();
        }
      }
    });
  });
});
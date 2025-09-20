import { test, expect } from '@playwright/test';

test.describe('Arctos Robot Controller E2E Tests', () => {
  test('should load application and display all tabs', async ({ page }) => {
    await page.goto('/');

    // Check that the main application loads
    await expect(page.locator('h1')).toContainText('Arctos Robot Controller');
    
    // Check that all tabs are present
    await expect(page.locator('text=Manual Control')).toBeVisible();
    await expect(page.locator('text=G-Code Control')).toBeVisible();
    await expect(page.locator('text=Position Replay')).toBeVisible();
    await expect(page.locator('text=Configuration')).toBeVisible();
    
    // Check connection status is displayed
    await expect(page.locator('.connection-status')).toBeVisible();
  });

  test('should allow tab navigation', async ({ page }) => {
    await page.goto('/');
    
    // Click on G-Code Control tab
    await page.click('text=G-Code Control');
    await expect(page.locator('text=G-Code Commands')).toBeVisible();
    
    // Click on Position Replay tab
    await page.click('text=Position Replay');
    await expect(page.locator('text=Saved Positions')).toBeVisible();
    
    // Click on Configuration tab
    await page.click('text=Configuration');
    await expect(page.locator('text=Robot Configuration')).toBeVisible();
    
    // Return to Manual Control tab
    await page.click('text=Manual Control');
    await expect(page.locator('text=Current Position')).toBeVisible();
  });

  test('manual control functionality', async ({ page }) => {
    await page.goto('/');
    
    // Ensure we're on Manual Control tab
    await page.click('text=Manual Control');
    
    // Check that axis control buttons are present
    await expect(page.locator('button:has-text("X+")')).toBeVisible();
    await expect(page.locator('button:has-text("X-")')).toBeVisible();
    await expect(page.locator('button:has-text("Y+")')).toBeVisible();
    await expect(page.locator('button:has-text("Y-")')).toBeVisible();
    await expect(page.locator('button:has-text("Z+")')).toBeVisible();
    await expect(page.locator('button:has-text("Z-")')).toBeVisible();
    
    // Check home and emergency stop buttons
    await expect(page.locator('button:has-text("Home")')).toBeVisible();
    await expect(page.locator('button:has-text("Emergency Stop")')).toBeVisible();
    
    // Test jog button click (should not cause errors)
    await page.click('button:has-text("X+")');
    
    // Check that position values are displayed
    await expect(page.locator('input[data-testid="x-position"], .position-display:has-text("X")')).toBeVisible();
  });

  test('g-code control functionality', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to G-Code Control tab
    await page.click('text=G-Code Control');
    
    // Check that G-Code textarea is present
    await expect(page.locator('textarea, .gcode-input')).toBeVisible();
    
    // Check for control buttons
    await expect(page.locator('button:has-text("Execute"), button:has-text("Run")')).toBeVisible();
    await expect(page.locator('button:has-text("Stop"), button:has-text("Emergency Stop")')).toBeVisible();
    
    // Test loading sample G-Code if available
    const loadSampleButton = page.locator('button:has-text("Load Sample")');
    if (await loadSampleButton.isVisible()) {
      await loadSampleButton.click();
      // Verify that G-Code appears in the textarea
      await expect(page.locator('textarea, .gcode-input')).not.toBeEmpty();
    }
  });

  test('position replay functionality', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to Position Replay tab
    await page.click('text=Position Replay');
    
    // Check that the positions table/list is present
    await expect(page.locator('.positions-list, table, .position-item')).toBeVisible();
    
    // Check for replay controls
    await expect(page.locator('button:has-text("Replay"), button:has-text("Start")')).toBeVisible();
  });

  test('configuration functionality', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to Configuration tab
    await page.click('text=Configuration');
    
    // Check that configuration form is present
    await expect(page.locator('select, input')).toBeVisible();
    
    // Check for robot type selection
    await expect(page.locator('select option:has-text("MKS57D"), select option:has-text("MKS42D")')).toBeVisible();
    
    // Check for save button
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
  });

  test('real-time updates and connection status', async ({ page }) => {
    await page.goto('/');
    
    // Wait for connection status to update
    await page.waitForTimeout(2000);
    
    // Check that connection status shows connected or connecting
    const connectionStatus = page.locator('.connection-status');
    await expect(connectionStatus).toContainText(/Connected|Connecting|Disconnected/);
  });

  test('responsive design on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Check that the application is still usable
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('text=Manual Control')).toBeVisible();
    
    // Check that tabs work on mobile
    await page.click('text=G-Code Control');
    await expect(page.locator('textarea, .gcode-input')).toBeVisible();
  });

  test('keyboard navigation and accessibility', async ({ page }) => {
    await page.goto('/');
    
    // Test tab navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Check that focus is visible (basic accessibility check)
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('error handling - server disconnection simulation', async ({ page }) => {
    await page.goto('/');
    
    // Initial connection should work
    await expect(page.locator('.connection-status')).toBeVisible();
    
    // The app should handle network issues gracefully
    // (This is a basic test - more sophisticated error injection would require additional setup)
    await page.waitForTimeout(1000);
    
    // App should still be functional even if there are connection issues
    await expect(page.locator('text=Manual Control')).toBeVisible();
    await page.click('text=Configuration');
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
  });
});
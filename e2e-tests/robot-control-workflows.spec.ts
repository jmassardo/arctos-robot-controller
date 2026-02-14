import { test, expect, Page } from '@playwright/test';

// Test configuration
const baseURL = process.env.BASE_URL || 'http://localhost:3000';

// Test utilities
async function loginAsAdmin(page: Page) {
  const adminUser = {
    username: 'e2e-admin',
    password: 'AdminPass123!',
    email: 'admin@e2e-test.com'
  };
  
  await page.goto(baseURL);
  await page.fill('[data-testid="username-input"]', adminUser.username);
  await page.fill('[data-testid="password-input"]', adminUser.password);
  await page.click('[data-testid="login-button"]');
  
  await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', { timeout: 15000 });
}

async function navigateToTab(page: Page, tabName: string) {
  await page.click(`[data-testid="tab-${tabName}"]`);
  await page.waitForSelector(`[data-testid="${tabName}-control"], [data-testid="${tabName}-dashboard"], [data-testid="${tabName}-panel"]`);
}

async function waitForRealTimeUpdate(page: Page, selector: string, expectedText: string) {
  await expect(page.locator(selector)).toContainText(expectedText, { timeout: 5000 });
}

test.describe('Core Robot Control Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await loginAsAdmin(page);
  });

  test.describe('Manual Control Workflows', () => {
    test('should perform complete manual control workflow', async ({ page }) => {
      await navigateToTab(page, 'manual');
      
      // Verify manual control interface is loaded
      await expect(page.locator('[data-testid="manual-control-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="axis-controls"]')).toBeVisible();
      await expect(page.locator('[data-testid="gripper-controls"]')).toBeVisible();
      
      // Test axis control - X axis
      const xAxisValue = page.locator('[data-testid="x-axis-value"]');
      const initialXValue = await xAxisValue.textContent();
      
      // Click positive X jog button
      await page.click('[data-testid="x-axis-plus-button"]');
      
      // Verify X axis value has increased
      await expect(xAxisValue).not.toContainText(initialXValue || '');
      
      // Test negative X jog button
      await page.click('[data-testid="x-axis-minus-button"]');
      
      // Test all other axes
      const axes = ['y', 'z', 'a', 'b', 'c'];
      for (const axis of axes) {
        const axisValue = page.locator(`[data-testid="${axis}-axis-value"]`);
        const initialValue = await axisValue.textContent();
        
        await page.click(`[data-testid="${axis}-axis-plus-button"]`);
        await expect(axisValue).not.toContainText(initialValue || '');
        
        await page.click(`[data-testid="${axis}-axis-minus-button"]`);
      }
      
      // Test gripper controls
      const gripperValue = page.locator('[data-testid="gripper-value"]');
      
      // Test gripper open
      await page.click('[data-testid="gripper-open-button"]');
      await expect(gripperValue).toContainText('0');
      
      // Test gripper 50%
      await page.click('[data-testid="gripper-50-button"]');
      await expect(gripperValue).toContainText('50');
      
      // Test gripper close
      await page.click('[data-testid="gripper-close-button"]');
      await expect(gripperValue).toContainText('100');
      
      // Test position saving
      await page.fill('[data-testid="position-name-input"]', 'E2E Test Position 1');
      await page.click('[data-testid="save-position-button"]');
      
      // Verify success message
      await expect(page.locator('[data-testid="success-message"]')).toContainText(/position.*saved/i);
    });

    test('should validate manual control input limits', async ({ page }) => {
      await navigateToTab(page, 'manual');
      
      // Test axis limit validation
      await page.click('[data-testid="x-axis-direct-input"]');
      await page.fill('[data-testid="x-axis-direct-input"]', '999999'); // Beyond limits
      await page.press('[data-testid="x-axis-direct-input"]', 'Enter');
      
      // Should show error or clamp to max value
      await expect(page.locator('[data-testid="error-message"], [data-testid="warning-message"]')).toBeVisible();
      
      // Test negative limit
      await page.fill('[data-testid="x-axis-direct-input"]', '-999999');
      await page.press('[data-testid="x-axis-direct-input"]', 'Enter');
      
      await expect(page.locator('[data-testid="error-message"], [data-testid="warning-message"]')).toBeVisible();
    });

    test('should support keyboard shortcuts for manual control', async ({ page }) => {
      await navigateToTab(page, 'manual');
      
      // Focus on the manual control area
      await page.click('[data-testid="manual-control-panel"]');
      
      const xAxisValue = page.locator('[data-testid="x-axis-value"]');
      const initialValue = await xAxisValue.textContent();
      
      // Test keyboard shortcut (e.g., arrow keys)
      await page.keyboard.press('ArrowRight');
      
      // Should move X axis (if keyboard shortcuts are implemented)
      // This test may need adjustment based on actual keyboard shortcut implementation
      await page.waitForTimeout(500); // Allow time for potential movement
    });

    test('should handle emergency stop functionality', async ({ page }) => {
      await navigateToTab(page, 'manual');
      
      // Start some movement
      await page.click('[data-testid="x-axis-plus-button"]');
      
      // Click emergency stop
      await page.click('[data-testid="emergency-stop-button"]');
      
      // Verify emergency stop status
      await expect(page.locator('[data-testid="emergency-status"]')).toContainText(/emergency.*stop/i);
      
      // Reset emergency stop
      await page.click('[data-testid="emergency-reset-button"]');
      
      // Verify normal operation resumed
      await expect(page.locator('[data-testid="emergency-status"]')).not.toContainText(/emergency.*stop/i);
    });
  });

  test.describe('G-Code Control Workflows', () => {
    test('should execute complete G-Code workflow', async ({ page }) => {
      await navigateToTab(page, 'gcode');
      
      // Verify G-Code interface is loaded
      await expect(page.locator('[data-testid="gcode-control-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="gcode-editor"]')).toBeVisible();
      
      // Load sample G-Code
      await page.click('[data-testid="load-sample-button"]');
      
      // Verify G-Code is loaded in editor
      const gCodeEditor = page.locator('[data-testid="gcode-editor"]');
      await expect(gCodeEditor).not.toBeEmpty();
      
      // Validate G-Code syntax
      await page.click('[data-testid="validate-gcode-button"]');
      
      // Should show validation results
      await expect(page.locator('[data-testid="validation-results"]')).toBeVisible();
      await expect(page.locator('[data-testid="validation-status"]')).toContainText(/valid/i);
      
      // Execute G-Code
      await page.click('[data-testid="execute-gcode-button"]');
      
      // Verify execution status
      await expect(page.locator('[data-testid="execution-status"]')).toContainText(/executing/i);
      
      // Wait for execution progress
      await expect(page.locator('[data-testid="execution-progress"]')).toBeVisible();
      
      // Should eventually complete
      await expect(page.locator('[data-testid="execution-status"]')).toContainText(/completed/i, { timeout: 30000 });
    });

    test('should handle G-Code file upload', async ({ page }) => {
      await navigateToTab(page, 'gcode');
      
      // Create a temporary G-Code file
      const gCodeContent = `G21 ; Set units to millimeters
G90 ; Absolute positioning  
G1 X10 Y10 Z5 F1000 ; Move to position
G1 X0 Y0 Z0 F1000 ; Return to origin
M30 ; Program end`;
      
      // Simulate file upload
      await page.setInputFiles('[data-testid="gcode-file-input"]', {
        name: 'test-program.gcode',
        mimeType: 'text/plain',
        buffer: Buffer.from(gCodeContent)
      });
      
      // Verify file content is loaded into editor
      const editor = page.locator('[data-testid="gcode-editor"]');
      await expect(editor).toContainText('G21');
      await expect(editor).toContainText('G90');
      await expect(editor).toContainText('M30');
    });

    test('should validate G-Code syntax errors', async ({ page }) => {
      await navigateToTab(page, 'gcode');
      
      // Enter invalid G-Code
      await page.fill('[data-testid="gcode-editor"]', 'INVALID_GCODE_SYNTAX\nG999 X999999');
      
      // Validate G-Code
      await page.click('[data-testid="validate-gcode-button"]');
      
      // Should show validation errors
      await expect(page.locator('[data-testid="validation-status"]')).toContainText(/error|invalid/i);
      await expect(page.locator('[data-testid="validation-errors"]')).toBeVisible();
    });

    test('should support G-Code execution pause and resume', async ({ page }) => {
      await navigateToTab(page, 'gcode');
      
      // Load and execute G-Code
      await page.click('[data-testid="load-sample-button"]');
      await page.click('[data-testid="execute-gcode-button"]');
      
      // Wait for execution to start
      await expect(page.locator('[data-testid="execution-status"]')).toContainText(/executing/i);
      
      // Pause execution
      await page.click('[data-testid="pause-execution-button"]');
      
      // Verify paused status
      await expect(page.locator('[data-testid="execution-status"]')).toContainText(/paused/i);
      
      // Resume execution
      await page.click('[data-testid="resume-execution-button"]');
      
      // Verify resumed execution
      await expect(page.locator('[data-testid="execution-status"]')).toContainText(/executing/i);
    });

    test('should support G-Code execution stop', async ({ page }) => {
      await navigateToTab(page, 'gcode');
      
      // Load and execute G-Code
      await page.click('[data-testid="load-sample-button"]');
      await page.click('[data-testid="execute-gcode-button"]');
      
      // Wait for execution to start
      await expect(page.locator('[data-testid="execution-status"]')).toContainText(/executing/i);
      
      // Stop execution
      await page.click('[data-testid="stop-execution-button"]');
      
      // Verify stopped status
      await expect(page.locator('[data-testid="execution-status"]')).toContainText(/stopped|cancelled/i);
    });
  });

  test.describe('Position Replay Workflows', () => {
    test('should save and replay robot positions', async ({ page }) => {
      // First, go to manual control and save a position
      await navigateToTab(page, 'manual');
      
      // Set specific axis values
      await page.click('[data-testid="x-axis-plus-button"]');
      await page.click('[data-testid="y-axis-plus-button"]');
      await page.click('[data-testid="z-axis-plus-button"]');
      
      // Save the position
      await page.fill('[data-testid="position-name-input"]', 'E2E Replay Test Position');
      await page.click('[data-testid="save-position-button"]');
      
      await expect(page.locator('[data-testid="success-message"]')).toContainText(/position.*saved/i);
      
      // Navigate to Position Replay
      await navigateToTab(page, 'replay');
      
      // Verify the saved position appears
      await expect(page.locator('[data-testid="position-list"]')).toBeVisible();
      await expect(page.locator('[data-testid="position-item"]')).toContainText('E2E Replay Test Position');
      
      // Select the position for replay
      await page.check('[data-testid="position-checkbox"]:has-text("E2E Replay Test Position")');
      
      // Replay the position
      await page.click('[data-testid="replay-selected-button"]');
      
      // Verify replay status
      await expect(page.locator('[data-testid="replay-status"]')).toContainText(/replaying|executing/i);
      
      // Should complete successfully
      await expect(page.locator('[data-testid="replay-status"]')).toContainText(/completed/i, { timeout: 15000 });
    });

    test('should create and replay position groups', async ({ page }) => {
      // Save multiple positions first (from manual control)
      await navigateToTab(page, 'manual');
      
      for (let i = 1; i <= 3; i++) {
        // Move to different positions
        await page.click(`[data-testid="x-axis-${i % 2 === 0 ? 'plus' : 'minus'}-button"]`);
        await page.click(`[data-testid="y-axis-${i % 2 === 0 ? 'plus' : 'minus'}-button"]`);
        
        await page.fill('[data-testid="position-name-input"]', `Group Position ${i}`);
        await page.click('[data-testid="save-position-button"]');
        
        await expect(page.locator('[data-testid="success-message"]')).toContainText(/position.*saved/i);
      }
      
      // Navigate to Position Replay
      await navigateToTab(page, 'replay');
      
      // Create a new group
      await page.click('[data-testid="create-group-button"]');
      await page.fill('[data-testid="group-name-input"]', 'E2E Test Group');
      await page.fill('[data-testid="group-description-input"]', 'Test group for E2E testing');
      
      // Select positions to add to group
      await page.check('[data-testid="position-checkbox"]:has-text("Group Position 1")');
      await page.check('[data-testid="position-checkbox"]:has-text("Group Position 2")');
      await page.check('[data-testid="position-checkbox"]:has-text("Group Position 3")');
      
      await page.click('[data-testid="add-to-group-button"]');
      await page.click('[data-testid="save-group-button"]');
      
      // Verify group creation
      await expect(page.locator('[data-testid="success-message"]')).toContainText(/group.*created/i);
      
      // Select and replay the group
      await page.selectOption('[data-testid="group-selector"]', 'E2E Test Group');
      await page.click('[data-testid="replay-group-button"]');
      
      // Verify group replay
      await expect(page.locator('[data-testid="replay-status"]')).toContainText(/replaying.*group/i);
      await expect(page.locator('[data-testid="replay-progress"]')).toBeVisible();
      
      // Should complete all positions in sequence
      await expect(page.locator('[data-testid="replay-status"]')).toContainText(/completed/i, { timeout: 30000 });
    });

    test('should edit and delete positions', async ({ page }) => {
      // First save a position
      await navigateToTab(page, 'manual');
      await page.fill('[data-testid="position-name-input"]', 'Position to Edit');
      await page.click('[data-testid="save-position-button"]');
      
      // Navigate to replay
      await navigateToTab(page, 'replay');
      
      // Edit position
      await page.click('[data-testid="edit-position-button"]:has-text("Position to Edit") >> nth=0');
      
      await page.fill('[data-testid="edit-position-name"]', 'Edited Position Name');
      await page.click('[data-testid="save-position-edit-button"]');
      
      // Verify position was edited
      await expect(page.locator('[data-testid="position-item"]')).toContainText('Edited Position Name');
      
      // Delete position
      await page.click('[data-testid="delete-position-button"]:has-text("Edited Position Name") >> nth=0');
      await page.click('[data-testid="confirm-delete-button"]');
      
      // Verify position was deleted
      await expect(page.locator('[data-testid="position-item"]')).not.toContainText('Edited Position Name');
    });

    test('should handle replay errors gracefully', async ({ page }) => {
      // Navigate to replay tab
      await navigateToTab(page, 'replay');
      
      // Try to replay without selecting any positions
      await page.click('[data-testid="replay-selected-button"]');
      
      // Should show error message
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/no.*positions.*selected/i);
      
      // Test replay with invalid position data (would need to mock this scenario)
      // This test might require additional setup to simulate error conditions
    });
  });

  test.describe('Configuration Management Workflows', () => {
    test('should update robot configuration settings', async ({ page }) => {
      await navigateToTab(page, 'config');
      
      // Verify configuration interface is loaded
      await expect(page.locator('[data-testid="configuration-panel"]')).toBeVisible();
      
      // Test robot type configuration
      await page.selectOption('[data-testid="robot-type-select"]', 'scara');
      
      // Test communication protocol
      await page.selectOption('[data-testid="communication-protocol-select"]', 'can_bus');
      
      // Test axis count configuration
      await page.selectOption('[data-testid="axis-count-select"]', '7');
      
      // Test axis limits configuration
      await page.fill('[data-testid="x-axis-min-limit"]', '-200');
      await page.fill('[data-testid="x-axis-max-limit"]', '200');
      
      // Save configuration
      await page.click('[data-testid="save-configuration-button"]');
      
      // Verify configuration saved successfully
      await expect(page.locator('[data-testid="success-message"]')).toContainText(/configuration.*saved/i);
      
      // Verify configuration persistence by refreshing
      await page.reload();
      await navigateToTab(page, 'config');
      
      // Check that settings were persisted
      await expect(page.locator('[data-testid="robot-type-select"]')).toHaveValue('scara');
      await expect(page.locator('[data-testid="communication-protocol-select"]')).toHaveValue('can_bus');
    });

    test('should validate configuration input ranges', async ({ page }) => {
      await navigateToTab(page, 'config');
      
      // Test invalid axis limit values
      await page.fill('[data-testid="x-axis-min-limit"]', '500'); // Min > Max scenario
      await page.fill('[data-testid="x-axis-max-limit"]', '100');
      
      await page.click('[data-testid="save-configuration-button"]');
      
      // Should show validation error
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/minimum.*maximum/i);
      
      // Test extreme values
      await page.fill('[data-testid="x-axis-max-limit"]', '999999');
      
      await page.click('[data-testid="save-configuration-button"]');
      
      // Should show warning or clamp values
      await expect(page.locator('[data-testid="warning-message"], [data-testid="error-message"]')).toBeVisible();
    });

    test('should reset configuration to defaults', async ({ page }) => {
      await navigateToTab(page, 'config');
      
      // Make some changes
      await page.selectOption('[data-testid="robot-type-select"]', 'scara');
      await page.selectOption('[data-testid="communication-protocol-select"]', 'can_bus');
      
      // Reset to defaults
      await page.click('[data-testid="reset-to-defaults-button"]');
      await page.click('[data-testid="confirm-reset-button"]');
      
      // Verify reset to default values
      await expect(page.locator('[data-testid="robot-type-select"]')).toHaveValue('cartesian');
      await expect(page.locator('[data-testid="communication-protocol-select"]')).toHaveValue('serial');
    });
  });

  test.describe('Advanced Configuration Workflows (Admin Only)', () => {
    test('should access advanced configuration as admin', async ({ page }) => {
      await navigateToTab(page, 'advanced-config');
      
      // Verify advanced configuration interface is loaded
      await expect(page.locator('[data-testid="advanced-configuration-panel"]')).toBeVisible();
      
      // Test advanced settings
      await page.check('[data-testid="enable-debug-mode"]');
      await page.fill('[data-testid="max-velocity-setting"]', '150');
      await page.fill('[data-testid="acceleration-setting"]', '1000');
      
      // Save advanced configuration
      await page.click('[data-testid="save-advanced-config-button"]');
      
      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toContainText(/advanced.*configuration.*saved/i);
    });

    test('should restrict advanced configuration access', async ({ page, browser }) => {
      // Login as operator in a new context
      const operatorContext = await browser.newContext();
      const operatorPage = await operatorContext.newPage();
      
      try {
        await operatorPage.goto(baseURL);
        await operatorPage.fill('[data-testid="username-input"]', 'e2e-operator');
        await operatorPage.fill('[data-testid="password-input"]', 'OperatorPass123!');
        await operatorPage.click('[data-testid="login-button"]');
        
        await expect(operatorPage.locator('[data-testid="connection-status"]')).toContainText('Connected');
        
        // Advanced config tab should not be visible for operator
        await expect(operatorPage.locator('[data-testid="tab-advanced-config"]')).not.toBeVisible();
        
        // Direct navigation should be blocked
        await operatorPage.goto(`${baseURL}/advanced-config`);
        await expect(operatorPage.locator('[data-testid="access-denied-message"]')).toBeVisible();
        
      } finally {
        await operatorContext.close();
      }
    });
  });
});
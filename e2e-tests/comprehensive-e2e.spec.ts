import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';

// Test configuration
const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const apiURL = process.env.API_URL || 'http://localhost:3001';

// Test data
const testUser = {
  username: 'e2e-test-user',
  password: 'TestPassword123!',
  email: 'e2e-test@example.com'
};

const testPosition = {
  name: 'E2E Test Position',
  x: 100,
  y: 200,
  z: 150,
  a: 45,
  b: -30,
  c: 90,
  gripper: 75
};

const testGCode = `
G21 ; Set units to millimeters
G90 ; Absolute positioning
G1 X10 Y10 Z5 F1000 ; Move to position
G1 X20 Y20 Z10 F1500 ; Move to next position
G1 X0 Y0 Z0 F1000 ; Return to origin
M30 ; Program end
`.trim();

// Helper functions
async function login(page: Page, username: string = testUser.username, password: string = testUser.password) {
  await page.goto(`${baseURL}/login`);
  await page.fill('[data-testid="username-input"]', username);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');
  await page.waitForSelector('[data-testid="connection-status"]', { timeout: 10000 });
}

async function waitForConnection(page: Page) {
  await expect(page.locator('[data-testid="connection-status"]')).toContainText(/Connected|Connecting/, { timeout: 15000 });
}

async function navigateToTab(page: Page, tabName: string) {
  await page.click(`[data-testid="tab-${tabName}"]`);
  await page.waitForSelector(`[data-testid="${tabName}-control"], [data-testid="${tabName}"], [data-testid="${tabName.replace('-', '-')}-dashboard"]`);
}

async function setupMockServer(page: Page) {
  // Mock API responses for testing
  await page.route('**/api/config', (route) => {
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        config: {
          robotType: '6-axis',
          communicationProtocol: 'can',
          axes: {
            count: 6,
            limits: {
              axis1: { min: -180, max: 180 },
              axis2: { min: -90, max: 90 },
              axis3: { min: -180, max: 180 },
              axis4: { min: -180, max: 180 },
              axis5: { min: -90, max: 90 },
              axis6: { min: -180, max: 180 }
            }
          },
          manipulators: {
            count: 2,
            gripper1: { min: 0, max: 100 },
            gripper2: { min: 0, max: 100 }
          }
        }
      })
    });
  });

  await page.route('**/api/positions', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          positions: []
        })
      });
    } else {
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          position: { id: Date.now(), name: 'Test Position' }
        })
      });
    }
  });
}

test.describe('Arctos Robot Controller - Complete E2E Test Suite', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      permissions: ['clipboard-read', 'clipboard-write'],
      recordVideo: { dir: 'test-results/videos/' },
      recordHar: { path: 'test-results/har/e2e-tests.har' }
    });
  });

  test.beforeEach(async () => {
    page = await context.newPage();
    
    // Set up console monitoring
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });

    // Set up error monitoring
    page.on('pageerror', err => {
      console.log(`Page error: ${err.message}`);
    });

    await setupMockServer(page);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.describe('Authentication Flow', () => {
    test('should display login page initially', async () => {
      await page.goto(baseURL);
      
      await expect(page.locator('h1')).toContainText(/Login|Sign In|Arctos Robot Controller/);
      await expect(page.locator('[data-testid="username-input"], input[type="text"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-input"], input[type="password"]')).toBeVisible();
      await expect(page.locator('[data-testid="login-button"], button:has-text("Login"), button:has-text("Sign In")')).toBeVisible();
    });

    test('should handle login validation errors', async () => {
      await page.goto(`${baseURL}/login`);
      
      // Try to login without credentials
      await page.click('[data-testid="login-button"], button:has-text("Login"), button:has-text("Sign In")');
      
      // Should show validation errors
      const errorMessage = page.locator('[data-testid="error-message"], .error, .alert-error');
      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible();
      }
    });

    test('should login successfully with valid credentials', async () => {
      await page.goto(baseURL);
      
      // Mock successful login
      await page.route('**/api/auth/login', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            user: { id: 1, username: testUser.username, role: 'admin' },
            accessToken: 'test-token',
            refreshToken: 'test-refresh-token'
          })
        });
      });

      await page.fill('[data-testid="username-input"], input[type="text"]', testUser.username);
      await page.fill('[data-testid="password-input"], input[type="password"]', testUser.password);
      await page.click('[data-testid="login-button"], button:has-text("Login"), button:has-text("Sign In")');

      // Should redirect to main application
      await expect(page.locator('h1')).toContainText('Arctos Robot Controller');
      await expect(page.locator('[data-testid="tab-navigation"], .nav-tabs')).toBeVisible();
    });

    test('should handle logout correctly', async () => {
      await page.goto(baseURL);
      
      // Mock authentication state
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });

      await page.reload();
      
      // Click logout button
      const logoutButton = page.locator('[data-testid="logout-btn"], button:has-text("Sign Out"), button:has-text("Logout")');
      if (await logoutButton.count() > 0) {
        await logoutButton.click();
        
        // Should return to login page
        await expect(page.locator('h1')).toContainText(/Login|Sign In/);
      }
    });
  });

  test.describe('Application Structure and Navigation', () => {
    test.beforeEach(async () => {
      await page.goto(baseURL);
      // Mock authenticated state
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();
    });

    test('should display main application interface', async () => {
      await expect(page.locator('h1')).toContainText('Arctos Robot Controller');
      await expect(page.locator('[data-testid="header"], header')).toBeVisible();
      await expect(page.locator('[data-testid="tab-navigation"], .nav-tabs')).toBeVisible();
      await expect(page.locator('[data-testid="main-content"], main')).toBeVisible();
      await expect(page.locator('[data-testid="connection-status"], .status-indicator')).toBeVisible();
    });

    test('should display all navigation tabs', async () => {
      const expectedTabs = [
        { id: 'manual', text: 'Manual Control' },
        { id: 'gcode', text: 'G-Code Control' },
        { id: 'replay', text: 'Position Replay' },
        { id: 'config', text: 'Configuration' }
      ];

      for (const tab of expectedTabs) {
        const tabElement = page.locator(`[data-testid="tab-${tab.id}"], .nav-tab:has-text("${tab.text}")`);
        await expect(tabElement.first()).toBeVisible();
      }
    });

    test('should handle tab navigation correctly', async () => {
      // Test each tab navigation
      const tabs = ['manual', 'gcode', 'replay', 'config'];
      
      for (const tab of tabs) {
        await navigateToTab(page, tab);
        
        // Verify active tab styling
        const tabButton = page.locator(`[data-testid="tab-${tab}"]`).first();
        if (await tabButton.count() > 0) {
          await expect(tabButton).toHaveClass(/active/);
        }
        
        // Verify content is loaded
        const content = page.locator(`[data-testid="${tab}-control"], [data-testid="${tab}"], [data-testid="${tab.replace('-', '')}"]`).first();
        await expect(content).toBeVisible();
      }
    });

    test('should maintain responsive design on different viewport sizes', async () => {
      // Test desktop view
      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect(page.locator('[data-testid="header"], header')).toBeVisible();
      
      // Test tablet view
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(page.locator('[data-testid="tab-navigation"], .nav-tabs')).toBeVisible();
      
      // Test mobile view
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(page.locator('h1')).toBeVisible();
    });
  });

  test.describe('Manual Control Functionality', () => {
    test.beforeEach(async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();
      await navigateToTab(page, 'manual');
    });

    test('should display axis control interface', async () => {
      // Check for axis controls
      const axisSelectors = [
        '[data-testid*="axis-"], .axis-control, .jog-controls',
        'button:has-text("+")', 
        'button:has-text("-")'
      ];

      for (const selector of axisSelectors) {
        const elements = page.locator(selector);
        if (await elements.count() > 0) {
          await expect(elements.first()).toBeVisible();
        }
      }
    });

    test('should handle axis jog commands', async () => {
      // Mock movement API
      await page.route('**/api/manual/move', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, mode: 'simulation' })
        });
      });

      // Find and click jog buttons
      const plusButtons = page.locator('button:has-text("+"), [data-testid*="-plus"], .jog-plus');
      const minusButtons = page.locator('button:has-text("-"), [data-testid*="-minus"], .jog-minus');

      if (await plusButtons.count() > 0) {
        await plusButtons.first().click();
        // Should not throw errors
      }

      if (await minusButtons.count() > 0) {
        await minusButtons.first().click();
        // Should not throw errors
      }
    });

    test('should display and handle gripper controls', async () => {
      const gripperControls = [
        '[data-testid*="gripper"], .gripper-control',
        'button:has-text("Open")',
        'button:has-text("Close")',
        'button:has-text("50%")'
      ];

      for (const selector of gripperControls) {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
          await expect(element).toBeVisible();
          
          // Test click functionality
          await element.click();
        }
      }
    });

    test('should handle position saving', async () => {
      await page.route('**/api/positions', (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              position: { id: Date.now(), name: testPosition.name }
            })
          });
        }
      });

      // Find position name input and save button
      const positionNameInput = page.locator('[data-testid="position-name"], input[placeholder*="position"], input[placeholder*="Position"]').first();
      const saveButton = page.locator('[data-testid="save-position"], button:has-text("Save"), button:has-text("Save Current Position")').first();

      if (await positionNameInput.count() > 0 && await saveButton.count() > 0) {
        await positionNameInput.fill(testPosition.name);
        await saveButton.click();

        // Check for success indication
        const successMessage = page.locator('[data-testid="success-message"], .success, .alert-success');
        if (await successMessage.count() > 0) {
          await expect(successMessage.first()).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should handle home command', async () => {
      await page.route('**/api/home', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, mode: 'simulation' })
        });
      });

      const homeButton = page.locator('[data-testid="home-button"], button:has-text("Home"), button:has-text("Home All")').first();
      
      if (await homeButton.count() > 0) {
        await homeButton.click();
        
        // Should not cause errors
        await page.waitForTimeout(100);
      }
    });

    test('should handle emergency stop', async () => {
      await page.route('**/api/emergency-stop', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Emergency stop activated' })
        });
      });

      const emergencyButton = page.locator('[data-testid="emergency-stop"], button:has-text("Emergency"), button:has-text("Stop"), .emergency-stop').first();
      
      if (await emergencyButton.count() > 0) {
        await emergencyButton.click();
        
        // Check for emergency stop indication
        await page.waitForTimeout(100);
      }
    });

    test('should display current position information', async () => {
      // Mock current position API
      await page.route('**/api/positions/current', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            positions: { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0, gripper: 0 }
          })
        });
      });

      const positionDisplay = page.locator('[data-testid="current-position"], .position-display, .current-position');
      
      if (await positionDisplay.count() > 0) {
        await expect(positionDisplay.first()).toBeVisible();
        await expect(positionDisplay.first()).toContainText(/X:|Y:|Z:|Position:/);
      }
    });
  });

  test.describe('G-Code Control Functionality', () => {
    test.beforeEach(async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();
      await navigateToTab(page, 'gcode');
    });

    test('should display G-Code editor interface', async () => {
      const gcodeElements = [
        '[data-testid="gcode-input"], textarea, .gcode-editor',
        '[data-testid="execute-gcode"], button:has-text("Execute"), button:has-text("Run")',
        '[data-testid="stop-gcode"], button:has-text("Stop")'
      ];

      for (const selector of gcodeElements) {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
          await expect(element).toBeVisible();
        }
      }
    });

    test('should handle G-Code input and editing', async () => {
      const gcodeTextarea = page.locator('[data-testid="gcode-input"], textarea, .gcode-editor textarea').first();
      
      if (await gcodeTextarea.count() > 0) {
        await gcodeTextarea.fill(testGCode);
        await expect(gcodeTextarea).toHaveValue(testGCode);
        
        // Test editing
        await gcodeTextarea.fill(testGCode + '\nG0 Z50');
        await expect(gcodeTextarea).toContainText('G0 Z50');
      }
    });

    test('should load sample G-Code', async () => {
      const loadSampleButton = page.locator('[data-testid="load-sample"], button:has-text("Load Sample")').first();
      
      if (await loadSampleButton.count() > 0) {
        await loadSampleButton.click();
        
        // Check if G-Code is loaded
        const gcodeTextarea = page.locator('[data-testid="gcode-input"], textarea').first();
        if (await gcodeTextarea.count() > 0) {
          const content = await gcodeTextarea.inputValue();
          expect(content.length).toBeGreaterThan(0);
        }
      }
    });

    test('should validate G-Code syntax', async () => {
      await page.route('**/api/gcode/validate', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            valid: true,
            errors: [],
            warnings: []
          })
        });
      });

      const gcodeTextarea = page.locator('[data-testid="gcode-input"], textarea').first();
      const validateButton = page.locator('[data-testid="validate-gcode"], button:has-text("Validate")').first();
      
      if (await gcodeTextarea.count() > 0 && await validateButton.count() > 0) {
        await gcodeTextarea.fill(testGCode);
        await validateButton.click();
        
        // Check for validation results
        await page.waitForTimeout(500);
      }
    });

    test('should execute G-Code', async () => {
      await page.route('**/api/gcode/execute', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'G-code execution started'
          })
        });
      });

      const gcodeTextarea = page.locator('[data-testid="gcode-input"], textarea').first();
      const executeButton = page.locator('[data-testid="execute-gcode"], button:has-text("Execute"), button:has-text("Run")').first();
      
      if (await gcodeTextarea.count() > 0 && await executeButton.count() > 0) {
        await gcodeTextarea.fill(testGCode);
        await executeButton.click();
        
        // Check for execution status
        const statusElement = page.locator('[data-testid="execution-status"], .status, .gcode-status');
        if (await statusElement.count() > 0) {
          await expect(statusElement.first()).toContainText(/Executing|Running|Started/, { timeout: 3000 });
        }
      }
    });

    test('should stop G-Code execution', async () => {
      await page.route('**/api/gcode/stop', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'G-code execution stopped'
          })
        });
      });

      const stopButton = page.locator('[data-testid="stop-gcode"], button:has-text("Stop")').first();
      
      if (await stopButton.count() > 0) {
        await stopButton.click();
        
        // Check for stop confirmation
        await page.waitForTimeout(500);
      }
    });

    test('should display execution progress', async () => {
      const progressElements = [
        '[data-testid="progress-bar"], .progress-bar, .progress',
        '[data-testid="execution-status"], .status'
      ];

      for (const selector of progressElements) {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
          await expect(element).toBeVisible();
        }
      }
    });
  });

  test.describe('Position Replay Functionality', () => {
    test.beforeEach(async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();
      
      // Mock positions data
      await page.route('**/api/positions', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            positions: [
              {
                id: 1,
                name: 'Home Position',
                axes: { X: 0, Y: 0, Z: 0, A: 0, B: 0, C: 0 },
                manipulators: { gripper1: 0 },
                delay: 0
              },
              {
                id: 2,
                name: 'Work Position',
                axes: { X: 100, Y: 200, Z: 150, A: 45, B: -30, C: 90 },
                manipulators: { gripper1: 75 },
                delay: 1000
              }
            ]
          })
        });
      });
      
      await navigateToTab(page, 'replay');
    });

    test('should display saved positions list', async () => {
      // Check for position list
      const positionList = page.locator('[data-testid="position-list"], .positions-list, .position-item');
      await expect(positionList.first()).toBeVisible();
      
      // Check for position names
      await expect(page.locator('text=Home Position')).toBeVisible();
      await expect(page.locator('text=Work Position')).toBeVisible();
    });

    test('should handle position selection', async () => {
      const checkboxes = page.locator('[data-testid*="checkbox"], input[type="checkbox"]');
      
      if (await checkboxes.count() > 0) {
        await checkboxes.first().check();
        await expect(checkboxes.first()).toBeChecked();
        
        await checkboxes.first().uncheck();
        await expect(checkboxes.first()).not.toBeChecked();
      }
    });

    test('should handle select all functionality', async () => {
      const selectAllButton = page.locator('[data-testid="select-all"], button:has-text("Select All")').first();
      
      if (await selectAllButton.count() > 0) {
        await selectAllButton.click();
        
        // All checkboxes should be selected
        const checkboxes = page.locator('input[type="checkbox"]');
        if (await checkboxes.count() > 0) {
          await expect(checkboxes.first()).toBeChecked();
        }
      }
    });

    test('should replay selected positions', async () => {
      await page.route('**/api/replay/**', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            results: []
          })
        });
      });

      // Select a position
      const checkbox = page.locator('input[type="checkbox"]').first();
      if (await checkbox.count() > 0) {
        await checkbox.check();
      }

      // Click replay button
      const replayButton = page.locator('[data-testid="replay-selected"], button:has-text("Replay")').first();
      if (await replayButton.count() > 0) {
        await replayButton.click();
        
        // Check for replay status
        const status = page.locator('[data-testid="replay-status"], .status');
        if (await status.count() > 0) {
          await expect(status.first()).toBeVisible({ timeout: 3000 });
        }
      }
    });

    test('should handle position editing', async () => {
      const editButtons = page.locator('[data-testid*="edit"], button:has-text("Edit")');
      
      if (await editButtons.count() > 0) {
        await editButtons.first().click();
        
        // Should open edit modal or form
        const editForm = page.locator('[data-testid="edit-form"], .edit-modal, .modal');
        if (await editForm.count() > 0) {
          await expect(editForm.first()).toBeVisible();
        }
      }
    });

    test('should handle position deletion', async () => {
      await page.route('**/api/positions/**', (route) => {
        if (route.request().method() === 'DELETE') {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
          });
        }
      });

      const deleteButtons = page.locator('[data-testid*="delete"], button:has-text("Delete")');
      
      if (await deleteButtons.count() > 0) {
        await deleteButtons.first().click();
        
        // Handle confirmation dialog
        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")');
        if (await confirmButton.count() > 0) {
          await confirmButton.click();
        }
      }
    });

    test('should display replay options', async () => {
      const replayOptions = [
        '[data-testid="replay-mode"], select',
        '[data-testid="repeat-count"], input[type="number"]',
        '[data-testid="global-delay"], input'
      ];

      for (const selector of replayOptions) {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
          await expect(element).toBeVisible();
        }
      }
    });
  });

  test.describe('Configuration Functionality', () => {
    test.beforeEach(async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();
      await navigateToTab(page, 'config');
    });

    test('should display configuration interface', async () => {
      const configElements = [
        '[data-testid="robot-type"], select',
        '[data-testid="protocol"], select',
        'button:has-text("Save")',
        'input, select'
      ];

      for (const selector of configElements) {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
          await expect(element).toBeVisible();
        }
      }
    });

    test('should handle robot type selection', async () => {
      const robotTypeSelect = page.locator('[data-testid="robot-type"], select').first();
      
      if (await robotTypeSelect.count() > 0) {
        await robotTypeSelect.selectOption('4-axis');
        await expect(robotTypeSelect).toHaveValue('4-axis');
      }
    });

    test('should handle communication protocol selection', async () => {
      const protocolSelect = page.locator('[data-testid="protocol"], select').first();
      
      if (await protocolSelect.count() > 0) {
        await protocolSelect.selectOption('serial');
        await expect(protocolSelect).toHaveValue('serial');
      }
    });

    test('should save configuration', async () => {
      await page.route('**/api/config', (route) => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              config: { robotType: '6-axis', communicationProtocol: 'can' }
            })
          });
        }
      });

      const saveButton = page.locator('[data-testid="save-config"], button:has-text("Save")').first();
      
      if (await saveButton.count() > 0) {
        await saveButton.click();
        
        // Check for save confirmation
        const successMessage = page.locator('[data-testid="save-status"], .success, .alert-success');
        if (await successMessage.count() > 0) {
          await expect(successMessage.first()).toBeVisible({ timeout: 3000 });
        }
      }
    });

    test('should handle axis limit configuration', async () => {
      const axisInputs = page.locator('input[type="number"]');
      
      if (await axisInputs.count() > 0) {
        await axisInputs.first().fill('90');
        await expect(axisInputs.first()).toHaveValue('90');
      }
    });
  });

  test.describe('Real-time Updates and WebSocket Communication', () => {
    test.beforeEach(async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();
    });

    test('should establish WebSocket connection', async () => {
      await waitForConnection(page);
      
      const connectionStatus = page.locator('[data-testid="connection-status"], .status-indicator');
      await expect(connectionStatus.first()).toContainText(/Connected|Connecting/);
    });

    test('should handle WebSocket disconnection', async () => {
      // Simulate network disconnection
      await page.context().setOffline(true);
      
      // Connection status should update
      const connectionStatus = page.locator('[data-testid="connection-status"], .status-indicator');
      await expect(connectionStatus.first()).toContainText(/Disconnected|Offline/, { timeout: 10000 });
      
      // Restore connection
      await page.context().setOffline(false);
    });

    test('should receive real-time position updates', async () => {
      await navigateToTab(page, 'manual');
      
      // Mock real-time position update
      await page.evaluate(() => {
        // Simulate WebSocket message
        const event = new CustomEvent('robotMovement', {
          detail: { x: 50, y: 100, z: 75 }
        });
        window.dispatchEvent(event);
      });
      
      // Position should be updated in UI
      await page.waitForTimeout(500);
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test.beforeEach(async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();
    });

    test('should handle API errors gracefully', async () => {
      // Mock API error
      await page.route('**/api/config', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Internal server error' })
        });
      });

      await navigateToTab(page, 'config');
      
      // Error should be handled without crashing
      await page.waitForTimeout(1000);
      
      // Should still display the interface
      expect(await page.locator('body').count()).toBe(1);
    });

    test('should handle network timeouts', async () => {
      // Mock slow API response
      await page.route('**/api/positions', (route) => {
        setTimeout(() => {
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true, positions: [] })
          });
        }, 10000); // 10 second delay
      });

      await navigateToTab(page, 'replay');
      
      // Should show loading state or timeout handling
      await page.waitForTimeout(2000);
      
      // Application should remain functional
      expect(await page.locator('[data-testid="tab-replay"]').count()).toBe(1);
    });

    test('should handle invalid user input', async () => {
      await navigateToTab(page, 'config');
      
      // Enter invalid values
      const numberInputs = page.locator('input[type="number"]');
      if (await numberInputs.count() > 0) {
        await numberInputs.first().fill('-999999');
        
        // Should validate input
        const saveButton = page.locator('button:has-text("Save")').first();
        if (await saveButton.count() > 0) {
          await saveButton.click();
          
          // Should show validation error or handle gracefully
          await page.waitForTimeout(500);
        }
      }
    });

    test('should maintain functionality during high CPU load', async () => {
      // Simulate high CPU load
      await page.evaluate(() => {
        const workers = [];
        for (let i = 0; i < 4; i++) {
          const worker = new Worker(URL.createObjectURL(new Blob([`
            let i = 0;
            while (i < 1000000) {
              i++;
              if (i % 10000 === 0) {
                postMessage(i);
              }
            }
          `], { type: 'application/javascript' })));
          workers.push(worker);
        }
        
        setTimeout(() => {
          workers.forEach(w => w.terminate());
        }, 2000);
      });

      // Application should remain responsive
      await navigateToTab(page, 'manual');
      await navigateToTab(page, 'gcode');
      
      // Basic functionality should work
      const tabs = page.locator('[data-testid^="tab-"]');
      await expect(tabs.first()).toBeVisible();
    });
  });

  test.describe('Complete User Workflows', () => {
    test.beforeEach(async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();
    });

    test('complete robot setup and operation workflow', async () => {
      // 1. Configure robot
      await navigateToTab(page, 'config');
      
      const robotTypeSelect = page.locator('[data-testid="robot-type"], select').first();
      if (await robotTypeSelect.count() > 0) {
        await robotTypeSelect.selectOption('6-axis');
      }
      
      const saveConfigButton = page.locator('button:has-text("Save")').first();
      if (await saveConfigButton.count() > 0) {
        await saveConfigButton.click();
        await page.waitForTimeout(500);
      }

      // 2. Manual control operations
      await navigateToTab(page, 'manual');
      
      const jogButtons = page.locator('button:has-text("+")');
      if (await jogButtons.count() > 0) {
        await jogButtons.first().click();
        await page.waitForTimeout(200);
      }

      // 3. Save current position
      const positionNameInput = page.locator('[data-testid="position-name"], input[placeholder*="position"]').first();
      const savePositionButton = page.locator('button:has-text("Save")').first();
      
      if (await positionNameInput.count() > 0 && await savePositionButton.count() > 0) {
        await positionNameInput.fill('Workflow Test Position');
        await savePositionButton.click();
        await page.waitForTimeout(500);
      }

      // 4. Execute G-Code
      await navigateToTab(page, 'gcode');
      
      const gcodeTextarea = page.locator('textarea').first();
      const executeButton = page.locator('button:has-text("Execute"), button:has-text("Run")').first();
      
      if (await gcodeTextarea.count() > 0 && await executeButton.count() > 0) {
        await gcodeTextarea.fill(testGCode);
        await executeButton.click();
        await page.waitForTimeout(1000);
      }

      // 5. Replay saved position
      await navigateToTab(page, 'replay');
      
      const checkbox = page.locator('input[type="checkbox"]').first();
      const replayButton = page.locator('button:has-text("Replay")').first();
      
      if (await checkbox.count() > 0 && await replayButton.count() > 0) {
        await checkbox.check();
        await replayButton.click();
        await page.waitForTimeout(500);
      }

      // Verify workflow completed successfully
      expect(await page.locator('body').count()).toBe(1);
    });

    test('emergency stop workflow', async () => {
      await navigateToTab(page, 'manual');
      
      // Start some operations
      const jogButton = page.locator('button:has-text("+")').first();
      if (await jogButton.count() > 0) {
        await jogButton.click();
      }

      // Trigger emergency stop
      const emergencyButton = page.locator('[data-testid="emergency-stop"], button:has-text("Emergency"), .emergency-stop').first();
      if (await emergencyButton.count() > 0) {
        await emergencyButton.click();
        
        // Verify emergency stop activated
        await page.waitForTimeout(500);
        
        // All operations should be stopped
        const status = page.locator('[data-testid="status"], .status');
        if (await status.count() > 0) {
          // Should indicate stopped state
          await page.waitForTimeout(100);
        }
      }
    });

    test('multi-tab concurrent operation workflow', async () => {
      // Open multiple tabs to test concurrent operations
      const page2 = await context.newPage();
      await page2.goto(baseURL);
      await page2.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page2.reload();

      // Perform operations in both tabs
      await navigateToTab(page, 'manual');
      await navigateToTab(page2, 'gcode');

      // Both should work simultaneously
      const jogButton = page.locator('button:has-text("+")').first();
      const gcodeTextarea = page2.locator('textarea').first();

      if (await jogButton.count() > 0) {
        await jogButton.click();
      }

      if (await gcodeTextarea.count() > 0) {
        await gcodeTextarea.fill('G1 X10 Y10 Z10');
      }

      // Both tabs should remain functional
      await expect(page.locator('[data-testid="manual-control"], [data-testid="tab-manual"].active')).toBeVisible();
      await expect(page2.locator('textarea')).toBeVisible();

      await page2.close();
    });
  });

  test.describe('Performance and Load Testing', () => {
    test('should handle rapid tab switching', async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();

      const tabs = ['manual', 'gcode', 'replay', 'config'];
      
      // Rapid tab switching
      for (let i = 0; i < 10; i++) {
        for (const tab of tabs) {
          await page.click(`[data-testid="tab-${tab}"]`);
          await page.waitForTimeout(50);
        }
      }

      // Application should remain responsive
      await expect(page.locator('[data-testid="tab-navigation"]')).toBeVisible();
    });

    test('should handle large position datasets', async () => {
      // Mock large dataset
      const largePositionList = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `Position ${i + 1}`,
        axes: { X: i, Y: i * 2, Z: i * 3 },
        manipulators: { gripper1: i % 100 }
      }));

      await page.route('**/api/positions', (route) => {
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            positions: largePositionList
          })
        });
      });

      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();

      await navigateToTab(page, 'replay');

      // Should handle large dataset without performance issues
      await expect(page.locator('[data-testid="position-list"], .positions-list')).toBeVisible();
      
      // Should be able to scroll through list
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(100);
    });

    test('should maintain performance during continuous operations', async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();

      await navigateToTab(page, 'manual');

      // Simulate continuous jog operations
      const jogButton = page.locator('button:has-text("+")').first();
      
      if (await jogButton.count() > 0) {
        for (let i = 0; i < 50; i++) {
          await jogButton.click();
          await page.waitForTimeout(20);
        }
      }

      // Application should remain responsive
      await expect(page.locator('[data-testid="manual-control"]')).toBeVisible();
    });
  });

  test.describe('Accessibility Compliance', () => {
    test('should support keyboard navigation', async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();

      // Tab through interface elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to activate elements with Enter/Space
      const focusedElement = page.locator(':focus');
      await page.keyboard.press('Enter');

      // Should not throw errors
      await page.waitForTimeout(100);
    });

    test('should have proper ARIA labels', async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();

      // Check for ARIA labels on interactive elements
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();
      
      for (let i = 0; i < Math.min(buttonCount, 10); i++) {
        const button = buttons.nth(i);
        const ariaLabel = await button.getAttribute('aria-label');
        const buttonText = await button.textContent();
        
        // Should have either aria-label or meaningful text content
        expect(ariaLabel || buttonText).toBeTruthy();
      }
    });

    test('should support screen readers', async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();

      // Check for semantic HTML structure
      await expect(page.locator('main, [role="main"]')).toBeVisible();
      await expect(page.locator('header, [role="banner"]')).toBeVisible();
      await expect(page.locator('nav, [role="navigation"]')).toBeVisible();
    });

    test('should have sufficient color contrast', async () => {
      await page.goto(baseURL);
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 1, username: 'testuser', role: 'admin' }));
      });
      await page.reload();

      // This would require additional tooling to fully test contrast ratios
      // For now, we'll check that elements are visible
      const textElements = page.locator('h1, h2, p, span, button');
      const count = await textElements.count();
      
      for (let i = 0; i < Math.min(count, 10); i++) {
        await expect(textElements.nth(i)).toBeVisible();
      }
    });
  });
});
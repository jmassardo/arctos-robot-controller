import { test, expect, Page, devices } from '@playwright/test';

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

async function waitForMobileLayout(page: Page) {
  await expect(page.locator('[data-testid="mobile-layout"]')).toBeVisible({ timeout: 5000 });
}

async function testTouchInteraction(page: Page, selector: string) {
  const element = page.locator(selector);
  await element.tap();
  return element;
}

// Desktop browser configurations
const desktopBrowsers = [
  { name: 'chromium', device: devices['Desktop Chrome'] },
  { name: 'firefox', device: devices['Desktop Firefox'] },
  { name: 'webkit', device: devices['Desktop Safari'] }
];

// Mobile device configurations  
const mobileDevices = [
  { name: 'mobile-chrome', device: devices['Pixel 5'] },
  { name: 'mobile-safari', device: devices['iPhone 12'] },
  { name: 'tablet-chrome', device: devices['iPad Pro'] }
];

test.describe('Cross-Platform & Mobile Workflows', () => {
  
  // Test across different desktop browsers
  for (const browser of desktopBrowsers) {
    test.describe(`Desktop Browser: ${browser.name}`, () => {
      test.use({ ...browser.device });
      
      test('should work correctly on desktop browser', async ({ page }) => {
        await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
        
        // Verify desktop layout is used
        await expect(page.locator('[data-testid="desktop-layout"]')).toBeVisible();
        await expect(page.locator('[data-testid="nav-tabs"]')).toBeVisible();
        
        // Test core functionality
        await page.click('[data-testid="tab-manual"]');
        await expect(page.locator('[data-testid="manual-control-panel"]')).toBeVisible();
        
        // Test axis control
        const xAxis = page.locator('[data-testid="x-axis-value"]');
        const initialValue = await xAxis.textContent();
        
        await page.click('[data-testid="x-axis-plus-button"]');
        await expect(xAxis).not.toContainText(initialValue || '');
        
        // Test G-Code functionality
        await page.click('[data-testid="tab-gcode"]');
        await page.click('[data-testid="load-sample-button"]');
        await expect(page.locator('[data-testid="gcode-editor"]')).not.toBeEmpty();
      });
      
      test('should handle browser-specific features', async ({ page }) => {
        await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
        
        // Test file upload (browser-specific behavior)
        await page.click('[data-testid="tab-gcode"]');
        
        // Test context menus (right-click)
        await page.click('[data-testid="gcode-editor"]', { button: 'right' });
        
        // Test keyboard shortcuts
        await page.keyboard.press('Control+A'); // Select all
        await page.keyboard.press('Control+C'); // Copy
        await page.keyboard.press('Control+V'); // Paste
        
        // Should handle browser-specific clipboard API differences
        await expect(page.locator('[data-testid="gcode-editor"]')).toBeVisible();
      });
    });
  }
  
  // Test mobile responsive design
  for (const device of mobileDevices) {
    test.describe(`Mobile Device: ${device.name}`, () => {
      test.use({ ...device.device });
      
      test('should display mobile-optimized interface', async ({ page }) => {
        await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
        
        // Verify mobile layout is detected and used
        await waitForMobileLayout(page);
        await expect(page.locator('[data-testid="mobile-navigation"]')).toBeVisible();
        await expect(page.locator('[data-testid="mobile-header"]')).toBeVisible();
        
        // Desktop nav tabs should be hidden
        await expect(page.locator('[data-testid="nav-tabs"]')).not.toBeVisible();
        
        // Mobile navigation should be present
        await expect(page.locator('[data-testid="mobile-bottom-nav"]')).toBeVisible();
      });
      
      test('should support touch controls for manual operation', async ({ page }) => {
        await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
        await waitForMobileLayout(page);
        
        // Navigate to manual control using mobile navigation
        await testTouchInteraction(page, '[data-testid="mobile-nav-manual"]');
        
        // Verify mobile manual control interface
        await expect(page.locator('[data-testid="mobile-manual-control"]')).toBeVisible();
        await expect(page.locator('[data-testid="touch-axis-controls"]')).toBeVisible();
        
        // Test touch axis controls
        const xAxis = page.locator('[data-testid="x-axis-value"]');
        const initialValue = await xAxis.textContent();
        
        await testTouchInteraction(page, '[data-testid="touch-x-plus"]');
        await expect(xAxis).not.toContainText(initialValue || '');
        
        // Test swipe gestures for axis control
        const axisControl = page.locator('[data-testid="x-axis-touch-control"]');
        
        // Simulate swipe right (increase)
        await axisControl.dragTo(page.locator('[data-testid="x-axis-touch-control"]'), {
          sourcePosition: { x: 50, y: 50 },
          targetPosition: { x: 150, y: 50 }
        });
        
        await page.waitForTimeout(500);
        const swipeValue = await xAxis.textContent();
        expect(swipeValue).not.toBe(initialValue);
      });
      
      test('should handle touch gestures for gripper control', async ({ page }) => {
        await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
        await waitForMobileLayout(page);
        
        await testTouchInteraction(page, '[data-testid="mobile-nav-manual"]');
        
        // Test touch gripper controls
        await expect(page.locator('[data-testid="touch-gripper-control"]')).toBeVisible();
        
        const gripperValue = page.locator('[data-testid="gripper-value"]');
        
        // Test tap controls
        await testTouchInteraction(page, '[data-testid="touch-gripper-open"]');
        await expect(gripperValue).toContainText('0');
        
        await testTouchInteraction(page, '[data-testid="touch-gripper-close"]');
        await expect(gripperValue).toContainText('100');
        
        // Test slider control
        const gripperSlider = page.locator('[data-testid="gripper-touch-slider"]');
        await gripperSlider.dragTo(gripperSlider, {
          sourcePosition: { x: 0, y: 0 },
          targetPosition: { x: 50, y: 0 }
        });
        
        // Should be approximately 50%
        const sliderValue = await gripperValue.textContent();
        const numValue = parseInt(sliderValue || '0');
        expect(numValue).toBeGreaterThan(40);
        expect(numValue).toBeLessThan(60);
      });
      
      test('should support mobile navigation between tabs', async ({ page }) => {
        await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
        await waitForMobileLayout(page);
        
        // Test bottom navigation
        const navItems = ['manual', 'gcode', 'replay', 'config'];
        
        for (const navItem of navItems) {
          await testTouchInteraction(page, `[data-testid="mobile-nav-${navItem}"]`);
          await expect(page.locator(`[data-testid="${navItem}-mobile-view"]`)).toBeVisible({ timeout: 3000 });
        }
        
        // Test hamburger menu for additional options
        await testTouchInteraction(page, '[data-testid="mobile-menu-button"]');
        await expect(page.locator('[data-testid="mobile-menu-drawer"]')).toBeVisible();
        
        // Test menu item selection
        await testTouchInteraction(page, '[data-testid="mobile-menu-monitoring"]');
        await expect(page.locator('[data-testid="monitoring-mobile-view"]')).toBeVisible();
      });
      
      test('should handle mobile G-Code interface', async ({ page }) => {
        await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
        await waitForMobileLayout(page);
        
        await testTouchInteraction(page, '[data-testid="mobile-nav-gcode"]');
        
        // Verify mobile G-Code interface
        await expect(page.locator('[data-testid="mobile-gcode-editor"]')).toBeVisible();
        
        // Test mobile file upload
        await testTouchInteraction(page, '[data-testid="mobile-upload-button"]');
        await expect(page.locator('[data-testid="file-input-modal"]')).toBeVisible();
        
        // Test mobile G-Code execution
        await testTouchInteraction(page, '[data-testid="mobile-load-sample"]');
        await expect(page.locator('[data-testid="mobile-gcode-editor"]')).not.toBeEmpty();
        
        await testTouchInteraction(page, '[data-testid="mobile-execute-button"]');
        await expect(page.locator('[data-testid="mobile-execution-status"]')).toContainText(/executing/i);
      });
      
      test('should adapt position replay for mobile', async ({ page }) => {
        await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
        await waitForMobileLayout(page);
        
        // First save a position from mobile manual control
        await testTouchInteraction(page, '[data-testid="mobile-nav-manual"]');
        await testTouchInteraction(page, '[data-testid="touch-x-plus"]');
        
        await page.fill('[data-testid="mobile-position-name"]', 'Mobile Test Position');
        await testTouchInteraction(page, '[data-testid="mobile-save-position"]');
        
        // Navigate to replay
        await testTouchInteraction(page, '[data-testid="mobile-nav-replay"]');
        
        // Verify mobile replay interface
        await expect(page.locator('[data-testid="mobile-position-list"]')).toBeVisible();
        await expect(page.locator('[data-testid="position-card"]')).toContainText('Mobile Test Position');
        
        // Test mobile position selection and replay
        await testTouchInteraction(page, '[data-testid="mobile-position-select"]:has-text("Mobile Test Position")');
        await testTouchInteraction(page, '[data-testid="mobile-replay-button"]');
        
        await expect(page.locator('[data-testid="mobile-replay-status"]')).toContainText(/replaying/i);
      });
    });
  }
  
  test.describe('Responsive Design Breakpoints', () => {
    test('should adapt to different screen sizes', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Test large desktop (1920x1080)
      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect(page.locator('[data-testid="desktop-layout"]')).toBeVisible();
      await expect(page.locator('[data-testid="wide-screen-layout"]')).toBeVisible();
      
      // Test standard desktop (1366x768)
      await page.setViewportSize({ width: 1366, height: 768 });
      await expect(page.locator('[data-testid="desktop-layout"]')).toBeVisible();
      
      // Test tablet landscape (1024x768)
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(page.locator('[data-testid="tablet-layout"]')).toBeVisible();
      
      // Test tablet portrait (768x1024)
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(page.locator('[data-testid="tablet-portrait-layout"]')).toBeVisible();
      
      // Test mobile (375x667)
      await page.setViewportSize({ width: 375, height: 667 });
      await waitForMobileLayout(page);
      await expect(page.locator('[data-testid="mobile-navigation"]')).toBeVisible();
    });
    
    test('should maintain functionality across breakpoints', async ({ page }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      const viewports = [
        { width: 1920, height: 1080 }, // Large desktop
        { width: 1366, height: 768 },  // Standard desktop  
        { width: 1024, height: 768 },  // Tablet landscape
        { width: 768, height: 1024 },  // Tablet portrait
        { width: 375, height: 667 }    // Mobile
      ];
      
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        
        // Test manual control functionality at each breakpoint
        if (viewport.width >= 768) {
          // Desktop/tablet navigation
          await page.click('[data-testid="tab-manual"]');
        } else {
          // Mobile navigation
          await testTouchInteraction(page, '[data-testid="mobile-nav-manual"]');
        }
        
        // Core functionality should work regardless of screen size
        const xAxis = page.locator('[data-testid="x-axis-value"]');
        const initialValue = await xAxis.textContent();
        
        // Use appropriate control for screen size
        if (viewport.width >= 768) {
          await page.click('[data-testid="x-axis-plus-button"]');
        } else {
          await testTouchInteraction(page, '[data-testid="touch-x-plus"]');
        }
        
        await expect(xAxis).not.toContainText(initialValue || '');
      }
    });
  });
  
  test.describe('Platform-Specific Features', () => {
    test('should handle touch vs mouse interactions', async ({ page, isMobile }) => {
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      if (isMobile) {
        await waitForMobileLayout(page);
        await testTouchInteraction(page, '[data-testid="mobile-nav-manual"]');
        
        // Test touch-specific gestures
        await expect(page.locator('[data-testid="touch-controls"]')).toBeVisible();
        
        // Test long press for context menu
        await page.locator('[data-testid="position-item"]').tap({ timeout: 2000 });
        await expect(page.locator('[data-testid="touch-context-menu"]')).toBeVisible();
        
        // Test pinch-to-zoom on 3D view (if available)
        const viewport3D = page.locator('[data-testid="3d-viewport"]');
        if (await viewport3D.isVisible()) {
          // Simulate pinch gesture
          await viewport3D.touchstart([
            { x: 100, y: 100 },
            { x: 200, y: 200 }
          ]);
          
          await viewport3D.touchmove([
            { x: 110, y: 110 },
            { x: 190, y: 190 }
          ]);
          
          await viewport3D.touchend();
        }
        
      } else {
        // Desktop mouse interactions
        await page.click('[data-testid="tab-manual"]');
        
        // Test right-click context menu
        await page.click('[data-testid="position-item"]', { button: 'right' });
        await expect(page.locator('[data-testid="context-menu"]')).toBeVisible();
        
        // Test hover effects
        await page.hover('[data-testid="x-axis-plus-button"]');
        await expect(page.locator('[data-testid="axis-tooltip"]')).toBeVisible();
        
        // Test mouse wheel for value adjustment
        await page.wheel(0, -100); // Scroll up
      }
    });
    
    test('should support keyboard navigation', async ({ page, isMobile }) => {
      if (isMobile) {
        // Skip keyboard tests on mobile
        test.skip();
      }
      
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      
      // Test tab navigation
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter'); // Should activate focused element
      
      // Test arrow key navigation in tabs
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('[data-testid="tab-gcode"]')).toHaveClass(/active/);
      
      // Test keyboard shortcuts
      await page.keyboard.press('Control+Shift+M'); // Manual control shortcut
      await expect(page.locator('[data-testid="manual-control-panel"]')).toBeVisible();
      
      // Test accessibility features
      await page.keyboard.press('Control+Shift+A'); // Toggle accessibility mode
      await expect(page.locator('[data-testid="accessibility-indicators"]')).toBeVisible();
    });
    
    test('should handle device orientation changes', async ({ page, isMobile }) => {
      if (!isMobile) {
        test.skip();
      }
      
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await waitForMobileLayout(page);
      
      // Start in portrait mode
      await page.setViewportSize({ width: 375, height: 667 });
      await expect(page.locator('[data-testid="portrait-layout"]')).toBeVisible();
      
      // Rotate to landscape
      await page.setViewportSize({ width: 667, height: 375 });
      await expect(page.locator('[data-testid="landscape-layout"]')).toBeVisible();
      
      // Interface should adapt to landscape
      await expect(page.locator('[data-testid="landscape-controls"]')).toBeVisible();
      
      // Functionality should remain intact
      await testTouchInteraction(page, '[data-testid="mobile-nav-manual"]');
      
      const xAxis = page.locator('[data-testid="x-axis-value"]');
      const initialValue = await xAxis.textContent();
      
      await testTouchInteraction(page, '[data-testid="touch-x-plus"]');
      await expect(xAxis).not.toContainText(initialValue || '');
    });
  });
  
  test.describe('Performance Across Platforms', () => {
    test('should maintain performance on mobile devices', async ({ page, isMobile }) => {
      if (!isMobile) {
        test.skip();
      }
      
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await waitForMobileLayout(page);
      
      // Test initial load performance
      const startTime = Date.now();
      await testTouchInteraction(page, '[data-testid="mobile-nav-manual"]');
      await expect(page.locator('[data-testid="mobile-manual-control"]')).toBeVisible();
      const loadTime = Date.now() - startTime;
      
      expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
      
      // Test interaction responsiveness
      const interactionStart = Date.now();
      await testTouchInteraction(page, '[data-testid="touch-x-plus"]');
      await expect(page.locator('[data-testid="x-axis-value"]')).toBeVisible();
      const interactionTime = Date.now() - interactionStart;
      
      expect(interactionTime).toBeLessThan(500); // Should respond within 500ms
    });
    
    test('should handle memory constraints on mobile', async ({ page, isMobile }) => {
      if (!isMobile) {
        test.skip();
      }
      
      await loginAsUser(page, 'e2e-admin', 'AdminPass123!');
      await waitForMobileLayout(page);
      
      // Navigate through multiple tabs rapidly
      const tabs = ['manual', 'gcode', 'replay', 'config'];
      
      for (let i = 0; i < 10; i++) {
        for (const tab of tabs) {
          await testTouchInteraction(page, `[data-testid="mobile-nav-${tab}"]`);
          await page.waitForTimeout(100);
        }
      }
      
      // Should still be responsive after multiple navigations
      await testTouchInteraction(page, '[data-testid="mobile-nav-manual"]');
      await expect(page.locator('[data-testid="mobile-manual-control"]')).toBeVisible();
      
      // Connection should still be stable
      await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
    });
  });
});
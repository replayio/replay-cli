import { test, expect } from '@replayio/playwright-ct';
import Header from './Header';

// Helper function to take screenshots with automatic component bounds
async function takeComponentScreenshot(component: any, page: any, filename: string, padding = 20) {
  const bounds = await component.boundingBox();
  if (bounds) {
    await page.screenshot({
      path: filename,
      clip: {
        x: Math.max(0, bounds.x - padding),
        y: Math.max(0, bounds.y - padding),
        width: bounds.width + (padding * 2),
        height: bounds.height + (padding * 2)
      }
    });
  }
}

test.describe('Header Component with Video Recording', () => {
  test('renders header with logo and navigation', async ({ mount, page }) => {
    const component = await mount(
      <div style={{ height: '100vh', width: '100vw' }}>
        <Header />
      </div>
    );
    
    // Check that main elements are visible
    await expect(component.getByTestId('header-logo')).toBeVisible();
    await expect(component.getByTestId('header-nav')).toBeVisible();
    await expect(component.getByTestId('main-content')).toBeVisible();
    
    // Take initial screenshot of the header area
    const headerElement = component.locator('header').first();
    await takeComponentScreenshot(headerElement, page, 'test-results/header-initial.png');
    
    // Check logo text content
    await expect(component.getByTestId('header-logo')).toContainText('The');
    await expect(component.getByTestId('header-logo')).toContainText('Daily Bugle');
    
    // Check navigation links
    await expect(component.getByTestId('header-nav')).toContainText('News');
    await expect(component.getByTestId('header-nav')).toContainText('Sports');
    await expect(component.getByTestId('header-nav')).toContainText('Culture');
  });

  test('header scroll animation behavior', async ({ mount, page }) => {
    const component = await mount(
      <div style={{ height: '100vh', width: '100vw' }}>
        <Header />
      </div>
    );
    
    // Take screenshot before scrolling
    const headerElement = component.locator('header').first();
    await takeComponentScreenshot(headerElement, page, 'test-results/header-before-scroll.png');
    
    // Note: We could get initial header height and nav opacity here if needed for assertions
    
    // Scroll down to trigger header transformation
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(300); // Wait for scroll animation
    
    // Take screenshot during scroll transition
    await takeComponentScreenshot(headerElement, page, 'test-results/header-mid-scroll.png');
    
    // Scroll more to fully trigger the effect
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300); // Wait for scroll animation
    
    // Take screenshot after significant scroll
    await takeComponentScreenshot(headerElement, page, 'test-results/header-after-scroll.png');
    
    // Verify elements are still visible after scrolling
    await expect(component.getByTestId('header-logo')).toBeVisible();
    await expect(component.getByTestId('header-nav')).toBeVisible();
  });

  test('logo scaling during scroll', async ({ mount, page }) => {
    const component = await mount(
      <div style={{ height: '100vh', width: '100vw' }}>
        <Header />
      </div>
    );
    
    const logoElement = component.getByTestId('header-logo');
    
    // Scroll to trigger scaling
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(500); // Wait for animation
    
    // Take screenshot showing scaled logo
    await takeComponentScreenshot(logoElement, page, 'test-results/header-logo-scaled.png');
    
    // Logo should still be visible and potentially scaled
    await expect(logoElement).toBeVisible();
    
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500); // Wait for animation
    
    // Take screenshot of logo back at original scale
    await takeComponentScreenshot(logoElement, page, 'test-results/header-logo-original.png');
  });

  test('navigation fade effect during scroll', async ({ mount, page }) => {
    const component = await mount(
      <div style={{ height: '100vh', width: '100vw' }}>
        <Header />
      </div>
    );
    
    const navElement = component.getByTestId('header-nav');
    
    // Navigation should be visible initially
    await expect(navElement).toBeVisible();
    
    // Take screenshot of visible navigation
    await takeComponentScreenshot(navElement, page, 'test-results/header-nav-visible.png');
    
    // Scroll down to fade out navigation
    await page.evaluate(() => window.scrollTo(0, 450));
    await page.waitForTimeout(500); // Wait for fade animation
    
    // Take screenshot during fade
    await takeComponentScreenshot(navElement, page, 'test-results/header-nav-faded.png');
    
    // Scroll back up to restore navigation
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500); // Wait for fade in animation
    
    // Take screenshot of restored navigation
    await takeComponentScreenshot(navElement, page, 'test-results/header-nav-restored.png');
    
    // Navigation should be visible again
    await expect(navElement).toBeVisible();
  });

  test('header responsive layout', async ({ mount, page }) => {
    const component = await mount(
      <div style={{ height: '100vh', width: '100vw' }}>
        <Header />
      </div>
    );
    
    // Test at different viewport sizes
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);
    
    // Take screenshot at desktop size
    await takeComponentScreenshot(component.locator('header').first(), page, 'test-results/header-desktop.png');
    
    // Switch to tablet size
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    
    // Take screenshot at tablet size
    await takeComponentScreenshot(component.locator('header').first(), page, 'test-results/header-tablet.png');
    
    // Switch to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(200);
    
    // Take screenshot at mobile size
    await takeComponentScreenshot(component.locator('header').first(), page, 'test-results/header-mobile.png');
    
    // Verify elements are still accessible at mobile size
    await expect(component.getByTestId('header-logo')).toBeVisible();
    await expect(component.getByTestId('header-nav')).toBeVisible();
  });

  test('main content scrolling with long content', async ({ mount, page }) => {
    const component = await mount(
      <div style={{ height: '100vh', width: '100vw' }}>
        <Header />
      </div>
    );
    
    const mainContent = component.getByTestId('main-content');
    
    // Verify main content is visible
    await expect(mainContent).toBeVisible();
    
    // Take screenshot of main content area
    await takeComponentScreenshot(mainContent, page, 'test-results/header-main-content.png');
    
    // Scroll through the main content
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(300);
    
    // Take screenshot during content scroll
    await takeComponentScreenshot(component.locator('header').first(), page, 'test-results/header-during-content-scroll.png');
    
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    
    // Take screenshot at bottom of content
    await takeComponentScreenshot(component.locator('header').first(), page, 'test-results/header-at-bottom.png');
    
    // Header should still be visible and transformed
    await expect(component.getByTestId('header-logo')).toBeVisible();
  });

  test('header visual regression test', async ({ mount, page }) => {
    const component = await mount(
      <div style={{ height: '100vh', width: '100vw' }}>
        <Header />
      </div>
    );
    
    // Full visual regression test - screenshot header
    await expect(component.locator('header').first()).toHaveScreenshot('header-visual-regression.png');
    
    // Scroll and take another regression screenshot
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(500);
    
    await expect(component.locator('header').first()).toHaveScreenshot('header-scrolled-regression.png');
  });
});
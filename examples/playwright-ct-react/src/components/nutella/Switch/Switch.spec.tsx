import { test, expect, takeComponentScreenshot } from "@replayio/playwright-ct";
import { Switch } from "./Switch";

// Helper function to wait for animations
async function waitForAnimations(page: any, duration = 300) {
  await page.waitForTimeout(duration);
}

test.describe("Switch Component", () => {
  test("renders basic switch with label", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 w-fit bg-white rounded-lg">
        <Switch defaultChecked={false}>Enable notifications</Switch>
      </div>
    );

    // Check that main elements are visible
    await expect(component.getByTestId("switch-root")).toBeVisible();
    await expect(component.getByTestId("switch-thumb")).toBeVisible();
    await expect(component.getByTestId("switch-label")).toBeVisible();

    // Check label text
    await expect(component.getByTestId("switch-label")).toHaveText("Enable notifications");

    // Verify initial unchecked state
    await expect(component.getByTestId("switch-root")).not.toBeChecked();
  });

  test("renders switch with description", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 w-fit bg-white rounded-lg">
        <Switch
          label="Email notifications"
          description="Receive email updates about your account"
          defaultChecked={false}
        />
      </div>
    );

    await expect(component.getByTestId("switch-label")).toHaveText("Email notifications");
    await expect(component.getByTestId("switch-description")).toHaveText(
      "Receive email updates about your account"
    );
  });

  test("switch toggle interaction with screenshots", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit bg-white rounded-lg">
        <Switch defaultChecked={false}>Toggle Switch</Switch>
      </div>
    );

    const switchRoot = component.getByTestId("switch-root");

    // Initially unchecked
    await expect(switchRoot).not.toBeChecked();

    // Take screenshot before toggle
    await takeComponentScreenshot(component, page, "test-results/switch-before-toggle.png");

    // Click to toggle on
    await switchRoot.click();
    await waitForAnimations(page);

    // Take screenshot after toggling on
    await takeComponentScreenshot(component, page, "test-results/switch-toggled-on.png");

    // Should be checked now
    await expect(switchRoot).toBeChecked();

    // Click to toggle off
    await switchRoot.click();
    await waitForAnimations(page);

    // Take screenshot after toggling off
    await takeComponentScreenshot(component, page, "test-results/switch-toggled-off.png");

    // Should be unchecked again
    await expect(switchRoot).not.toBeChecked();
  });

  test("size variants work correctly", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 space-y-4 bg-white rounded-lg">
        <Switch size="sm" defaultChecked={false}>
          Small switch
        </Switch>
        <Switch size="md" defaultChecked={false}>
          Medium switch
        </Switch>
        <Switch size="lg" defaultChecked={false}>
          Large switch
        </Switch>
      </div>
    );

    const switches = await component.getByTestId("switch-root").all();

    // All switches should be functional
    for (const switchElement of switches) {
      await expect(switchElement).toBeVisible();
      await expect(switchElement).not.toBeChecked();

      // Test toggling
      await switchElement.click();
      await expect(switchElement).toBeChecked();
    }
  });

  test("disabled states work correctly", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 space-y-4 bg-white rounded-lg">
        <Switch disabled={true} defaultChecked={false}>
          Disabled Unchecked
        </Switch>
        <Switch disabled={true} defaultChecked={true}>
          Disabled Checked
        </Switch>
      </div>
    );

    const switches = await component.getByTestId("switch-root").all();

    // Both switches should be disabled
    await expect(switches[0]).toBeDisabled();
    await expect(switches[1]).toBeDisabled();

    // First should be unchecked, second should be checked
    await expect(switches[0]).not.toBeChecked();
    await expect(switches[1]).toBeChecked();

    // Try to click disabled switches (should not change state)
    await switches[0].click({ force: true });
    await switches[1].click({ force: true });
    await waitForAnimations(page, 200);

    // States should remain the same
    await expect(switches[0]).not.toBeChecked();
    await expect(switches[1]).toBeChecked();
  });

  test("keyboard navigation works", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit bg-white rounded-lg">
        <Switch defaultChecked={false}>Keyboard Switch</Switch>
      </div>
    );

    const switchRoot = component.getByTestId("switch-root");

    // Focus the switch
    await switchRoot.focus();

    // Toggle with space key
    await page.keyboard.press("Space");
    await waitForAnimations(page);

    await expect(switchRoot).toBeChecked();

    // Toggle again with Enter key
    await page.keyboard.press("Enter");
    await waitForAnimations(page);

    await expect(switchRoot).not.toBeChecked();
  });

  test("multiple switches work independently", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 space-y-4 bg-white rounded-lg">
        <Switch defaultChecked={false}>Email notifications</Switch>
        <Switch defaultChecked={true}>Push notifications</Switch>
        <Switch defaultChecked={false}>SMS notifications</Switch>
      </div>
    );

    const switches = await component.getByTestId("switch-root").all();
    const labels = await component.getByTestId("switch-label").all();

    // Check initial states
    await expect(switches[0]).not.toBeChecked();
    await expect(switches[1]).toBeChecked();
    await expect(switches[2]).not.toBeChecked();

    // Check labels
    await expect(labels[0]).toHaveText("Email notifications");
    await expect(labels[1]).toHaveText("Push notifications");
    await expect(labels[2]).toHaveText("SMS notifications");

    // Toggle first and third switches
    await switches[0].click();
    await switches[2].click();
    await waitForAnimations(page);

    // Check new states
    await expect(switches[0]).toBeChecked();
    await expect(switches[1]).toBeChecked(); // Should remain checked
    await expect(switches[2]).toBeChecked();
  });

  test("switch with description disabled state", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 w-fit bg-white rounded-lg">
        <Switch
          label="Disabled with description"
          description="This switch is disabled and cannot be toggled"
          disabled={true}
          defaultChecked={false}
        />
      </div>
    );

    // Check that description is present and properly styled
    await expect(component.getByTestId("switch-description")).toBeVisible();
    await expect(component.getByTestId("switch-description")).toHaveText(
      "This switch is disabled and cannot be toggled"
    );

    // Check disabled state
    await expect(component.getByTestId("switch-root")).toBeDisabled();
  });

  test("switch without label or children", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 w-fit bg-white rounded-lg">
        <Switch defaultChecked={false} />
      </div>
    );

    // Should render switch without label
    await expect(component.getByTestId("switch-root")).toBeVisible();
    await expect(component.getByTestId("switch-thumb")).toBeVisible();

    // Label should not be present
    await expect(component.getByTestId("switch-label")).not.toBeVisible();
  });

  test("visual regression test - unchecked state", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 w-fit bg-white rounded-lg">
        <Switch defaultChecked={false}>Visual Test</Switch>
      </div>
    );

    await expect(component).toHaveScreenshot("switch-unchecked-regression.png");
  });

  test("visual regression test - checked state", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 w-fit bg-white rounded-lg">
        <Switch defaultChecked={true}>Visual Test</Switch>
      </div>
    );

    await expect(component).toHaveScreenshot("switch-checked-regression.png");
  });

  test("visual regression test - size variants", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 space-y-6 bg-white rounded-lg">
        <Switch size="sm" defaultChecked={false}>
          Small
        </Switch>
        <Switch size="md" defaultChecked={true}>
          Medium
        </Switch>
        <Switch size="lg" defaultChecked={false}>
          Large
        </Switch>
      </div>
    );

    await expect(component).toHaveScreenshot("switch-sizes-regression.png");
  });

  test("visual regression test - with description", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 bg-white rounded-lg max-w-sm">
        <Switch
          label="Notifications"
          description="Receive important updates and alerts"
          defaultChecked={true}
        />
      </div>
    );

    await expect(component).toHaveScreenshot("switch-description-regression.png");
  });
});

import { test, expect } from "@replayio/playwright-ct";
import { Checklist } from "./Checklist";

// Helper function to take screenshots with automatic component bounds
async function takeComponentScreenshot(component: any, page: any, filename: string, padding = 20) {
  const bounds = await component.boundingBox();
  if (bounds) {
    await page.screenshot({
      path: filename,
      clip: {
        x: Math.max(0, bounds.x - padding),
        y: Math.max(0, bounds.y - padding),
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      },
    });
  }
}

const defaultItems = [
  { id: "1", text: "Review code", checked: false },
  { id: "2", text: "Write tests", checked: true },
  { id: "3", text: "Update documentation", checked: false },
  { id: "4", text: "Deploy to staging", checked: false },
];

const allCheckedItems = [
  { id: "1", text: "Task One", checked: true },
  { id: "2", text: "Task Two", checked: true },
  { id: "3", text: "Task Three", checked: true },
];

const emptyItems: any[] = [];

test.describe("Checklist Component with Video Recording", () => {
  test("renders checklist with default items", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit">
        <Checklist initialItems={defaultItems} title="Development Tasks" />
      </div>
    );

    // Check basic rendering
    await expect(component.getByTestId("checklist-container")).toBeVisible();
    await expect(component.getByTestId("checklist-title")).toHaveText("Development Tasks");

    // Take initial screenshot
    await takeComponentScreenshot(component, page, "test-results/checklist-initial.png");

    // Check that all items are rendered
    await expect(component.getByTestId("checklist-item-1")).toBeVisible();
    await expect(component.getByTestId("checklist-item-2")).toBeVisible();
    await expect(component.getByTestId("checklist-item-3")).toBeVisible();
    await expect(component.getByTestId("checklist-item-4")).toBeVisible();

    // Check initial states
    await expect(component.getByTestId("checkbox-1")).not.toBeChecked();
    await expect(component.getByTestId("checkbox-2")).toBeChecked();
    await expect(component.getByTestId("checkbox-3")).not.toBeChecked();
    await expect(component.getByTestId("checkbox-4")).not.toBeChecked();
  });

  test("checkbox interaction and state changes", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit">
        <Checklist initialItems={defaultItems} />
      </div>
    );

    // Click on unchecked item
    await component.getByTestId("checkbox-1").click();
    await page.waitForTimeout(100);

    // Take screenshot after first check
    await takeComponentScreenshot(component, page, "test-results/checklist-first-check.png");

    await expect(component.getByTestId("checkbox-1")).toBeChecked();

    // Click on checked item to uncheck
    await component.getByTestId("checkbox-2").click();
    await page.waitForTimeout(100);

    // Take screenshot after uncheck
    await takeComponentScreenshot(component, page, "test-results/checklist-uncheck.png");

    await expect(component.getByTestId("checkbox-2")).not.toBeChecked();

    // Check multiple items rapidly
    await component.getByTestId("checkbox-3").click();
    await component.getByTestId("checkbox-4").click();
    await page.waitForTimeout(200);

    // Take screenshot of multiple checked items
    await takeComponentScreenshot(component, page, "test-results/checklist-multiple-checked.png");

    await expect(component.getByTestId("checkbox-3")).toBeChecked();
    await expect(component.getByTestId("checkbox-4")).toBeChecked();
  });

  test("completion animation when all items checked", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit">
        <Checklist initialItems={defaultItems} title="Animation Test" />
      </div>
    );

    // Check all currently unchecked items to trigger completion animation
    await component.getByTestId("checkbox-1").click();
    await component.getByTestId("checkbox-3").click();
    await component.getByTestId("checkbox-4").click();

    // Wait for completion animation to trigger and complete
    await page.waitForTimeout(800);

    // Take screenshot during/after animation
    await takeComponentScreenshot(
      component,
      page,
      "test-results/checklist-completion-animation.png"
    );

    // Verify all items are checked
    await expect(component.getByTestId("checkbox-1")).toBeChecked();
    await expect(component.getByTestId("checkbox-2")).toBeChecked();
    await expect(component.getByTestId("checkbox-3")).toBeChecked();
    await expect(component.getByTestId("checkbox-4")).toBeChecked();
  });

  test("visual states of checked vs unchecked items", async ({ mount, page }) => {
    const mixedItems = [
      { id: "1", text: "Checked item", checked: true },
      { id: "2", text: "Unchecked item", checked: false },
    ];

    const component = await mount(
      <div className="p-8 w-fit">
        <Checklist initialItems={mixedItems} title="Visual States" />
      </div>
    );

    // Take screenshot showing different visual states
    await takeComponentScreenshot(component, page, "test-results/checklist-visual-states.png");

    // Check that checked item has line-through class
    await expect(component.getByTestId("checklist-item-1")).toHaveClass(/line-through/);

    // Check that unchecked item doesn't have line-through class
    await expect(component.getByTestId("checklist-item-2")).not.toHaveClass(/line-through/);
  });

  test("empty checklist handling", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit">
        <Checklist initialItems={emptyItems} title="Empty List" />
      </div>
    );

    // Take screenshot of empty checklist
    await takeComponentScreenshot(component, page, "test-results/checklist-empty.png");

    // Check that container and title are still visible
    await expect(component.getByTestId("checklist-container")).toBeVisible();
    await expect(component.getByTestId("checklist-title")).toHaveText("Empty List");
  });

  test("all items pre-checked scenario", async ({ mount, page }) => {
    const component = await mount(
      <div className="p-8 w-fit">
        <Checklist initialItems={allCheckedItems} title="Completed Tasks" />
      </div>
    );

    // Take screenshot of all completed items
    await takeComponentScreenshot(component, page, "test-results/checklist-all-completed.png");

    // Verify all items are checked and have line-through styling
    await expect(component.getByTestId("checkbox-1")).toBeChecked();
    await expect(component.getByTestId("checkbox-2")).toBeChecked();
    await expect(component.getByTestId("checkbox-3")).toBeChecked();

    await expect(component.getByTestId("checklist-item-1")).toHaveClass(/line-through/);
    await expect(component.getByTestId("checklist-item-2")).toHaveClass(/line-through/);
    await expect(component.getByTestId("checklist-item-3")).toHaveClass(/line-through/);
  });

  test("checklist visual regression test", async ({ mount }) => {
    const component = await mount(
      <div className="p-8 w-fit">
        <Checklist initialItems={defaultItems} title="Regression Test" />
      </div>
    );

    // Full visual regression test - screenshot entire component
    await expect(component).toHaveScreenshot("checklist-visual-regression.png");

    // Check some items and take another regression screenshot
    await component.getByTestId("checkbox-1").click();
    await component.getByTestId("checkbox-3").click();

    await expect(component).toHaveScreenshot("checklist-partial-complete-regression.png");
  });
});

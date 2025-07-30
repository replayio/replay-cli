import { test, expect } from "@replayio/playwright-ct";
import { FileTree } from "./FileTree";

// Test data
const sampleNodes = [
  {
    name: "Home",
    nodes: [
      {
        name: "Movies",
        nodes: [
          {
            name: "Action",
            nodes: [
              {
                name: "2000s",
                nodes: [{ name: "Gladiator.mp4" }, { name: "The-Dark-Knight.mp4" }],
              },
              { name: "2010s", nodes: [] },
            ],
          },
          {
            name: "Comedy",
            nodes: [{ name: "2000s", nodes: [{ name: "Superbad.mp4" }] }],
          },
        ],
      },
      {
        name: "Music",
        nodes: [
          { name: "Rock", nodes: [] },
          { name: "Classical", nodes: [] },
        ],
      },
      { name: "Pictures", nodes: [] },
      { name: "passwords.txt" },
    ],
  },
];

const singleFolderData = {
  name: "Documents",
  nodes: [{ name: "resume.pdf" }, { name: "cover-letter.docx" }],
};

test.describe("FileTree Component Screenshots", () => {
  test("renders file tree with default data", async ({ mount, page }) => {
    const component = await mount(
      <ul>
        {sampleNodes.map(node => (
          <FileTree node={node} key={node.name} />
        ))}
      </ul>
    );

    // Take a screenshot of the initial state using component bounds
    await page.screenshot({ path: "test-results/filetree-initial.png" });

    await expect(component.getByTestId("file-tree-item-Home")).toBeVisible();
    await expect(component.getByText("Home")).toBeVisible();
  });

  test("expands and collapses folders with screenshots", async ({ mount, page }) => {
    const component = await mount(
      <ul>
        {sampleNodes.map(node => (
          <FileTree node={node} key={node.name} />
        ))}
      </ul>
    );

    // Screenshot: Initial collapsed state using actual component bounds
    const collapsedBounds = await component.boundingBox();
    if (collapsedBounds) {
      await page.screenshot({
        path: "test-results/filetree-collapsed.png",
        clip: {
          x: Math.max(0, collapsedBounds.x - 20),
          y: Math.max(0, collapsedBounds.y - 20),
          width: collapsedBounds.width + 40,
          height: collapsedBounds.height + 40,
        },
      });
    }

    // Initially, children should not be visible
    await expect(component.getByTestId("children-Home")).not.toBeVisible();

    // Click to expand
    await component.getByTestId("toggle-Home").click();

    // Screenshot: After expanding using actual component bounds
    const expandedBounds = await component.boundingBox();
    if (expandedBounds) {
      await page.screenshot({
        path: "test-results/filetree-expanded.png",
        clip: {
          x: Math.max(0, expandedBounds.x - 20),
          y: Math.max(0, expandedBounds.y - 20),
          width: expandedBounds.width + 40,
          height: expandedBounds.height + 40,
        },
      });
    }

    // Wait for animation and check children are visible
    await expect(component.getByTestId("children-Home")).toBeVisible();
    await expect(component.getByText("Movies")).toBeVisible();
    await expect(component.getByText("Music")).toBeVisible();

    // Click to collapse
    await component.getByTestId("toggle-Home").click();

    // Screenshot: After collapsing using actual component bounds
    const recollapsedBounds = await component.boundingBox();
    if (recollapsedBounds) {
      await page.screenshot({
        path: "test-results/filetree-recollapsed.png",
        clip: {
          x: Math.max(0, recollapsedBounds.x - 20),
          y: Math.max(0, recollapsedBounds.y - 20),
          width: recollapsedBounds.width + 40,
          height: recollapsedBounds.height + 40,
        },
      });
    }

    // Children should be hidden again
    await expect(component.getByTestId("children-Home")).not.toBeVisible();
  });

  test("renders nested folder structure with step-by-step screenshots", async ({ mount, page }) => {
    const component = await mount(
      <ul>
        {sampleNodes.map(node => (
          <FileTree node={node} key={node.name} />
        ))}
      </ul>
    );

    // Step 1: Expand Home folder
    await component.getByTestId("toggle-Home").click();
    const step1Bounds = await component.boundingBox();
    if (step1Bounds) {
      await page.screenshot({
        path: "test-results/filetree-step1-home-expanded.png",
        clip: {
          x: Math.max(0, step1Bounds.x - 20),
          y: Math.max(0, step1Bounds.y - 20),
          width: step1Bounds.width + 40,
          height: step1Bounds.height + 40,
        },
      });
    }
    await expect(component.getByText("Movies")).toBeVisible();

    // Step 2: Expand Movies folder
    await component.getByTestId("toggle-Movies").click();
    const step2Bounds = await component.boundingBox();
    if (step2Bounds) {
      await page.screenshot({
        path: "test-results/filetree-step2-movies-expanded.png",
        clip: {
          x: Math.max(0, step2Bounds.x - 20),
          y: Math.max(0, step2Bounds.y - 20),
          width: step2Bounds.width + 40,
          height: step2Bounds.height + 40,
        },
      });
    }
    await expect(component.getByText("Action")).toBeVisible();
    await expect(component.getByText("Comedy")).toBeVisible();

    // Step 3: Expand Action folder
    await component.getByTestId("toggle-Action").click();
    const step3Bounds = await component.boundingBox();
    if (step3Bounds) {
      await page.screenshot({
        path: "test-results/filetree-step3-action-expanded.png",
        clip: {
          x: Math.max(0, step3Bounds.x - 20),
          y: Math.max(0, step3Bounds.y - 20),
          width: step3Bounds.width + 40,
          height: step3Bounds.height + 40,
        },
      });
    }
    await expect(component.getByText("2000s")).toBeVisible();
    await expect(component.getByText("2010s")).toBeVisible();
  });

  test("single folder variant comparison", async ({ mount, page }) => {
    const component = await mount(
      <ul>
        <FileTree node={singleFolderData} />
      </ul>
    );

    // Screenshot of single folder variant using actual bounds
    const singleFolderBounds = await component.boundingBox();
    if (singleFolderBounds) {
      await page.screenshot({
        path: "test-results/filetree-single-folder.png",
        clip: {
          x: Math.max(0, singleFolderBounds.x - 20),
          y: Math.max(0, singleFolderBounds.y - 20),
          width: singleFolderBounds.width + 40,
          height: singleFolderBounds.height + 40,
        },
      });
    }

    await expect(component.getByTestId("file-tree-item-Documents")).toBeVisible();
    await expect(component.getByText("Documents")).toBeVisible();

    // Expand to see files
    await component.getByTestId("toggle-Documents").click();

    // Screenshot after expansion using actual bounds
    const expandedSingleBounds = await component.boundingBox();
    if (expandedSingleBounds) {
      await page.screenshot({
        path: "test-results/filetree-single-folder-expanded.png",
        clip: {
          x: Math.max(0, expandedSingleBounds.x - 20),
          y: Math.max(0, expandedSingleBounds.y - 20),
          width: expandedSingleBounds.width + 40,
          height: expandedSingleBounds.height + 40,
        },
      });
    }

    await expect(component.getByText("resume.pdf")).toBeVisible();
    await expect(component.getByText("cover-letter.docx")).toBeVisible();
  });

  test("component visual regression test", async ({ mount }) => {
    const component = await mount(
      <ul>
        {sampleNodes.map(node => (
          <FileTree node={node} key={node.name} />
        ))}
      </ul>
    );

    // Full visual regression test - screenshot entire component
    await expect(component).toHaveScreenshot("filetree-visual-regression.png");

    // Expand and take another regression screenshot
    await component.getByTestId("toggle-Home").click();
    await component.getByTestId("toggle-Movies").click();

    await expect(component).toHaveScreenshot("filetree-expanded-visual-regression.png");
  });
});

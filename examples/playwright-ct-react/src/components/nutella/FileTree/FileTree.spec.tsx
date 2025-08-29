import { test, expect, takeComponentScreenshot } from "@replayio/playwright-ct";
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
    await takeComponentScreenshot(component, page, "test-results/filetree-initial.png");

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
    await takeComponentScreenshot(component, page, "test-results/filetree-collapsed.png");

    // Initially, children should not be visible
    await expect(component.getByTestId("children-Home")).not.toBeVisible();

    // Click to expand
    await component.getByTestId("toggle-Home").click();

    // Screenshot: After expanding using actual component bounds
    await takeComponentScreenshot(component, page, "test-results/filetree-expanded.png");

    // Wait for animation and check children are visible
    await expect(component.getByTestId("children-Home")).toBeVisible();
    await expect(component.getByText("Movies")).toBeVisible();
    await expect(component.getByText("Music")).toBeVisible();

    // Click to collapse
    await component.getByTestId("toggle-Home").click();

    // Screenshot: After collapsing using actual component bounds
    await takeComponentScreenshot(component, page, "test-results/filetree-recollapsed.png");

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
    await takeComponentScreenshot(component, page, "test-results/filetree-step1-home-expanded.png");
    await expect(component.getByText("Movies")).toBeVisible();

    // Step 2: Expand Movies folder
    await component.getByTestId("toggle-Movies").click();
    await takeComponentScreenshot(component, page, "test-results/filetree-step2-movies-expanded.png");
    await expect(component.getByText("Action")).toBeVisible();
    await expect(component.getByText("Comedy")).toBeVisible();

    // Step 3: Expand Action folder
    await component.getByTestId("toggle-Action").click();
    await takeComponentScreenshot(component, page, "test-results/filetree-step3-action-expanded.png");
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
    await takeComponentScreenshot(component, page, "test-results/filetree-single-folder.png");

    await expect(component.getByTestId("file-tree-item-Documents")).toBeVisible();
    await expect(component.getByText("Documents")).toBeVisible();

    // Expand to see files
    await component.getByTestId("toggle-Documents").click();

    // Screenshot after expansion using actual bounds
    await takeComponentScreenshot(component, page, "test-results/filetree-single-folder-expanded.png");

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

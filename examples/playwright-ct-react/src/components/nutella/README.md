## Portable stories for Playwright Component Tests

This folder contains example UI components and tests designed to be portable between Storybook and Playwright Component Testing (CT). The goal is to author components once, document them with Storybook, and reuse the same stories in Playwright CT for fast, realistic tests.

Reference: [Portable stories for Playwright CT](https://storybook.js.org/blog/portable-stories-for-playwright-ct/)

### Folder conventions

- Each component lives in its own subfolder with:
  - Component implementation (`index.tsx` or named file)
  - Storybook CSF stories (`*.stories.tsx`)
  - Portable stories wrapper (`*.stories.portable.ts`)
  - Playwright CT spec (`*.spec.tsx`)
- Export components from `nutella/index.ts` so they can be consumed in stories/tests.
- Prefer co-locating small assets (icons, images) next to the component.

### Styling with Tailwind CSS

- Use Tailwind utility classes directly in JSX. Prefer semantic groupings and small composable wrappers over deeply nested custom CSS.
- In CT, Tailwind is globally loaded via `playwright/index.ts` which imports `../src/index.css`. No extra setup is needed in specs.
- Use container wrappers in tests for predictable bounds, e.g. `className="p-8 w-fit"`, so screenshots are stable.
- For stateful styles (hover, focus, open) prefer data attributes and Radix/shadcn patterns (see below) rather than brittle class toggling.

### Accessibility and React Aria patterns

- Make components accessible by default:
  - Provide roles, labels, and `aria-*` attributes where applicable.
  - Ensure focus states are visible and keyboard navigation works.
  - Expose stable, meaningful labels so tests can use `getByRole`, `getByLabel`, `getByPlaceholder`, etc.
- If using React Aria or Radix primitives, wire up props returned from hooks to the correct DOM elements and preserve the recommended DOM structure.
- Use `data-testid` only when an accessible query is not feasible. Keep test IDs stable and descriptive (e.g. `data-testid="switch-root"`).

### shadcn/Radix UI patterns

- Favor shadcn patterns when composing primitives:
  - Use Radix primitives for behavior and state machines; style with Tailwind.
  - Expose component state with `data-*` attributes (e.g. `data-state="open"`) and style via Tailwind selectors `data-[state=open]:...`.
  - Use `asChild` to forward semantics to host elements when needed.
  - Keep variants in a single place using `class-variance-authority` (CVA) and merge with `cn` utilities.
- Keep public API minimal and prop names consistent (`size`, `variant`, `disabled`, `onChange`, etc.).

### Storybook CSF stories

- Write standard CSF stories per component:
  - Export a `meta` with `title`, `component`, and optional `parameters`, `decorators`.
  - Export named stories via objects describing `args`.

```tsx
// Tabs.stories.tsx (example)
import type { Meta, StoryObj } from "@storybook/react-vite";
import Tabs from "./Tabs";

const meta: Meta<typeof Tabs> = {
  title: "Tabs",
  component: Tabs,
  parameters: { layout: "centered" },
  decorators: [Story => <div className="p-8"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  args: { tabs: [
    { id: "world", label: "World" },
    { id: "ny", label: "N.Y." },
  ] },
};
```

### Portable stories for Playwright CT

- Create a sibling `*.stories.portable.ts` that re-exports portable components:

```ts
// Tabs.stories.portable.ts
import { composeStories } from "@storybook/react";
import * as stories from "./Tabs.stories";
export default composeStories(stories);
```

- If you use global Storybook decorators/parameters (from `.storybook/preview`), import them in Playwright CT setup and call `setProjectAnnotations`:

```ts
// examples/playwright-ct-react/playwright/index.ts
import "../src/index.css";
// Optional: bring Storybook preview globals into CT
// import { setProjectAnnotations } from "@storybook/react";
// import preview from "../.storybook/preview";
// setProjectAnnotations(preview);
```

### Writing Playwright CT specs

- Use the Replay-enhanced CT helpers from `@replayio/playwright-ct`:
  - `test`, `expect` are re-exported from Playwright CT.
  - `takeComponentScreenshot(component, page, path, padding?)` crops to the component bounds for stable visuals.

```tsx
// Tabs.spec.tsx (example)
import { test, expect, takeComponentScreenshot } from "@replayio/playwright-ct";
import Tabs from "./Tabs";

test("switches tabs and captures screenshots", async ({ mount, page }) => {
  const component = await mount(<div className="p-8 w-fit"><Tabs tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} /></div>);

  await expect(component.getByTestId("tabs-container")).toBeVisible();
  await takeComponentScreenshot(component, page, "test-results/tabs-initial.png");

  await component.getByTestId("tab-b").click();
  await page.waitForTimeout(300);
  await takeComponentScreenshot(component, page, "test-results/tabs-b-active.png");
});
```

Tips:
- Prefer accessible selectors (`getByRole`, `getByLabel`) over `data-testid` when possible.
- Wrap stories/components with small padding containers in specs to ensure consistent cropping.
- For visual regression of whole components use `await expect(component).toHaveScreenshot("name.png")`.

### Component authoring checklist

- Types: export well-typed props; avoid `any` in public APIs.
- Accessibility: roles/labels wired; keyboard and focus states verified.
- Styling: Tailwind classes only; use data attributes for state.
- Testing hooks: add stable `data-testid` where needed, keep names consistent with DOM.
- Stories: cover key variants; keep args minimal and realistic.
- Portable stories: add `*.stories.portable.ts` per component to enable CT reuse.

### Useful links

- Storybook portable stories doc: [Importing stories in Playwright CT](https://storybook.js.org/docs/8.1/api/portable-stories-playwright#importing-stories-in-playwright-ct)
- Playwright Component Testing: [Docs](https://playwright.dev/docs/test-components)
- shadcn/ui: [Docs](https://ui.shadcn.com/)
- Radix UI: [Docs](https://www.radix-ui.com/docs/primitives)
- React Aria: [Docs](https://react-spectrum.adobe.com/react-aria/)



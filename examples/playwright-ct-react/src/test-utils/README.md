# Enhanced Playwright Component Testing Utilities

This directory contains enhanced utilities for Playwright Component Testing that make it easier to test React components with screenshots, animations, and visual regression testing.

## Available Utilities

### 1. Screenshot Helpers (`screenshot-helpers.ts`)

#### `takeComponentScreenshot(component, page, filename, padding?)`
Takes a screenshot of a component with automatic bounds detection and padding.

```typescript
import { takeComponentScreenshot } from '../../test-utils/screenshot-helpers';

test('component screenshot', async ({ mount, page }) => {
  const component = await mount(<MyComponent />);
  await takeComponentScreenshot(component, page, 'my-component.png', 20);
});
```

#### `waitForAnimations(page, duration?)`
Waits for animations to complete (default: 300ms).

```typescript
import { waitForAnimations } from '../../test-utils/screenshot-helpers';

test('animated component', async ({ mount, page }) => {
  const component = await mount(<AnimatedComponent />);
  await component.click();
  await waitForAnimations(page); // Wait for animation
});
```

#### `testComponentStates(component, page, states)`
Test multiple component states with automatic screenshots.

```typescript
import { testComponentStates } from '../../test-utils/screenshot-helpers';

test('component states', async ({ mount, page }) => {
  const component = await mount(<Switch defaultChecked={false} />);
  const switchRoot = component.getByTestId('switch-root');
  
  await testComponentStates(component, page, [
    { name: 'initial' },
    { 
      name: 'toggled', 
      action: async () => await switchRoot.click(),
      waitTime: 300
    }
  ]);
});
```

### 2. Enhanced Fixtures (`fixtures.ts`)

#### Using Enhanced Fixtures
Import the enhanced test and expect from fixtures instead of the base playwright-ct:

```typescript
import { test, expect } from '../../test-utils/fixtures';

test('with enhanced fixtures', async ({ 
  mount, 
  page, 
  takeComponentScreenshot, 
  waitForAnimations 
}) => {
  const component = await mount(<MyComponent />);
  
  // Use utilities directly as fixtures
  await takeComponentScreenshot(component, page, 'test.png');
  await waitForAnimations(page);
});
```

#### Enhanced Mount
The `enhancedMount` fixture adds screenshot methods directly to mounted components:

```typescript
test('enhanced mount', async ({ enhancedMount }) => {
  const component = await enhancedMount(<MyComponent />);
  
  // Built-in screenshot methods
  await component.takeScreenshot('before.png');
  
  await component.click();
  
  await component.takeScreenshot('after.png');
  await component.takeVisualSnapshot('visual-regression.png');
});
```

## Usage Patterns

### 1. Import Individual Functions
```typescript
import { test, expect } from '@replayio/playwright-ct';
import { takeComponentScreenshot, waitForAnimations } from '../../test-utils/screenshot-helpers';

test('my test', async ({ mount, page }) => {
  const component = await mount(<MyComponent />);
  await takeComponentScreenshot(component, page, 'test.png');
});
```

### 2. Use Enhanced Fixtures
```typescript
import { test, expect } from '../../test-utils/fixtures';

test('my test', async ({ mount, page, takeComponentScreenshot }) => {
  const component = await mount(<MyComponent />);
  await takeComponentScreenshot(component, page, 'test.png');
});
```

### 3. Use Enhanced Mount
```typescript
import { test, expect } from '../../test-utils/fixtures';

test('my test', async ({ enhancedMount }) => {
  const component = await enhancedMount(<MyComponent />);
  await component.takeScreenshot('test.png');
});
```

## Configuration

The utilities are automatically set up through:

1. **Global Setup**: `global-setup.ts` ensures test directories exist and logs available utilities
2. **Playwright Config**: `playwright-ct.config.ts` includes the global setup
3. **TypeScript**: Proper types are provided for all utilities

## File Structure

```
src/test-utils/
├── README.md                 # This documentation
├── screenshot-helpers.ts     # Core screenshot and animation utilities
├── fixtures.ts              # Enhanced Playwright fixtures
└── global-setup.ts          # Global test setup
```

## Best Practices

1. **Use Enhanced Mount** for simple component screenshot needs
2. **Use Individual Functions** when you need more control
3. **Use Enhanced Fixtures** when you want utilities available as test parameters
4. **Consistent Naming** for screenshot files to enable easy comparison
5. **Wait for Animations** before taking screenshots for consistent results

## Migration from Inline Helpers

If you have existing tests with inline `takeComponentScreenshot` functions:

### Before:
```typescript
// Helper function in each test file
async function takeComponentScreenshot(component, page, filename, padding = 20) {
  // implementation...
}

test('my test', async ({ mount, page }) => {
  const component = await mount(<MyComponent />);
  await takeComponentScreenshot(component, page, 'test.png');
});
```

### After:
```typescript
import { test, expect } from '../../test-utils/fixtures';

test('my test', async ({ mount, page, takeComponentScreenshot }) => {
  const component = await mount(<MyComponent />);
  await takeComponentScreenshot(component, page, 'test.png');
});
```

Or with enhanced mount:
```typescript
import { test, expect } from '../../test-utils/fixtures';

test('my test', async ({ enhancedMount }) => {
  const component = await enhancedMount(<MyComponent />);
  await component.takeScreenshot('test.png');
});
``` 
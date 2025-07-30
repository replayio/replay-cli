# ReplayIO Playwright Component Testing Integration

This package provides a specialized integration for using [Replay](https://replay.io) with [Playwright Component Testing](https://playwright.dev/docs/test-components).

## Why This Package Exists

Standard Playwright tests navigate between pages, creating natural recording boundaries. However, Playwright Component Testing (CT) works differently:

- **Regular tests**: Navigate between pages → each navigation creates a new recording segment  
- **CT tests**: Stay on a single page → mount/unmount components dynamically

This package provides enhanced fixtures and reporting specifically designed for CT's component lifecycle model.

## Installation

```bash
npm install --save-dev @replayio/playwright-ct
```

## Setup

### 1. Install Replay Browser

```bash
npx replayio install
```

### 2. Configure Your CT Tests

```typescript
// playwright-ct.config.ts
import { defineConfig, replayReporter } from '@replayio/playwright-ct';

export default defineConfig({
  testDir: './src',
  
  // Add Replay reporter
  reporter: [
    replayReporter({
      apiKey: process.env.REPLAY_API_KEY,
      upload: true,
    }),
    ['html'],
  ],
  
  use: {
    // CT specific options
    ctPort: 3100,
    ctViteConfig: {
      // Your vite config here
    },
  },
  
  // Standard Playwright config
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
});
```

### 3. Update Your Tests

```typescript
// Button.spec.tsx
import { test, expect } from '@replayio/playwright-ct';
import { Button } from './Button';

test('should work', async ({ mount }) => {
  // This mount is now tracked by Replay
  const component = await mount(<Button title="Submit" />);
  
  // All interactions are recorded
  await expect(component).toContainText('Submit');
  await component.click();
  
  // Component updates are tracked
  await component.update(<Button title="Updated" />);
  await expect(component).toContainText('Updated');
  
  // Unmount is tracked
  await component.unmount();
});
```

## Features

### Component Lifecycle Tracking

Every component operation is automatically tracked:

- **Mount**: When a component is rendered
- **Unmount**: When a component is removed  
- **Update**: When component props change
- **Interactions**: All user interactions with components

### Enhanced Debugging

- Component-level granularity in recordings
- Stack traces filtered to show relevant user code
- Proper error attribution for mount/unmount operations
- Metadata about component names and timing

### CI/CD Integration

The package works seamlessly in CI/CD environments:

```yaml
# GitHub Actions example
- name: Run CT tests with Replay
  env:
    REPLAY_API_KEY: ${{ secrets.REPLAY_API_KEY }}
  run: |
    npx replayio install
    npm run test:ct
```

## Configuration Options

The `replayReporter` accepts these options:

```typescript
replayReporter({
  // Required: Your Replay API key
  apiKey: process.env.REPLAY_API_KEY,
  
  // Whether to upload recordings (default: false)
  upload: true,
  
  // Whether to capture test file source (default: true)
  captureTestFile: true,
  
  // Filter which tests to record
  filter: (test) => test.title.includes('record'),
})
```

## How It Works

### 1. Enhanced Mount Fixture

The package wraps Playwright CT's `mount` fixture to track component lifecycle:

```typescript
// Automatically tracks mount, unmount, and update operations
const component = await mount(<MyComponent />);
await component.update(<MyComponent updated={true} />);
await component.unmount();
```

### 2. Step Tracking

All component operations become test steps in the Replay recording:
- Each operation has proper timing and metadata
- Stack traces point to your test code, not framework internals
- Errors are properly attributed to the failing operation

### 3. Browser Annotations

The package injects Replay's annotation system to create markers in the recording timeline, making it easy to understand what happened when.

## Troubleshooting

### No Recordings Appear

1. **Verify Replay browser is being used**:
   ```bash
   # Should show path to Replay Chromium
   npx replayio which-browser
   ```

2. **Check configuration**:
   ```typescript
   // Make sure you're using the CT-specific imports
   import { test, expect, defineConfig } from '@replayio/playwright-ct';
   ```

### Component Operations Not Tracked

1. **Verify fixture is loaded**:
   ```typescript
   test('debug', async ({ mount }) => {
     console.log('Mount type:', typeof mount);
     // Should show enhanced function, not original
   });
   ```

2. **Check for errors in browser console** during test execution

### Performance Issues

1. **Disable unnecessary recording features**:
   ```typescript
   use: {
     video: 'off',  // Replay handles recording
     trace: 'off',  // Not needed with Replay
   }
   ```

2. **Reduce parallel workers** if memory constrained:
   ```typescript
   workers: process.env.CI ? 1 : 2,
   ```

## Learn More

- [Replay Documentation](https://docs.replay.io)
- [Playwright Component Testing](https://playwright.dev/docs/test-components)
- [Example Projects](https://github.com/replayio/replay-cli/tree/main/examples)

## Support

For issues and questions:
- [GitHub Issues](https://github.com/replayio/replay-cli/issues)
- [Discord Community](https://discord.gg/n2dTK6kcRX)
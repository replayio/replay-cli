# Playwright Component Testing with Replay Example

This example demonstrates how to use `@replayio/playwright-ct` for component testing with Replay recording capabilities.

## Features

- **React Component Testing** with Playwright CT
- **Replay Integration** for debugging failed tests
- **File Tree Component** with expand/collapse interactions
- **Visual Regression Testing** with screenshots
- **Framer Motion Animations** testing

## Setup

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Install Replay browser:

   ```bash
   npx replayio install
   ```

3. Set up environment variables (optional):
   ```bash
   cp .env.example .env
   # Edit .env and add your REPLAY_API_KEY
   ```

## Running Tests

```bash
# Run component tests
yarn test:component

# Run with headed browser
yarn test:component:headed

# Run in debug mode
yarn test:component:debug

# Run with UI mode
yarn test:component:ui

# Update screenshots
yarn test:screenshot
```

## Test Structure

- `src/components/nutella/FileTree/FileTree.spec.tsx` - Main component test file
- Tests cover:
  - Component rendering
  - Expand/collapse interactions
  - Nested folder navigation
  - Visual regression testing
  - Screenshot comparison

## Configuration

The `playwright-ct.config.ts` file shows how to:

- Import from `@replayio/playwright-ct`
- Configure Replay browser
- Set up Replay reporter
- Handle environment-based configuration

## Key Differences from Regular Playwright

1. **Import from CT package**: `import { test, expect } from '@replayio/playwright-ct'`
2. **Enhanced mount fixture**: Automatically tracks component lifecycle
3. **CT-specific reporter**: Handles component operations properly
4. **Component-level recording**: Timeline shows mount/unmount/update operations

## Component Testing Benefits

- **Isolated Testing**: Test components without full page setup
- **Faster Execution**: No navigation overhead
- **Better Debugging**: Component-level Replay recordings
- **Visual Testing**: Screenshot and visual regression capabilities

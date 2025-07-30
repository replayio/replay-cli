/**
 * Global setup file for Playwright Component Testing with enhanced utilities
 * 
 * This file demonstrates how to set up global test utilities that are available
 * across all component tests in the project.
 */

import { FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function globalSetup(_config: FullConfig) {
  console.log('🔧 Setting up enhanced Playwright CT utilities...');
  
  // Ensure test-results directory exists
  const testResultsDir = path.join(process.cwd(), 'test-results');
  if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
    console.log('📁 Created test-results directory');
  }
  
  // Log available test utilities
  console.log('✅ Enhanced test utilities available:');
  console.log('   - takeComponentScreenshot: Capture component screenshots with auto-bounds');
  console.log('   - waitForAnimations: Wait for component animations to complete');
  console.log('   - testComponentStates: Test multiple component states with screenshots');
  console.log('   - enhancedMount: Mount with built-in screenshot methods');
  console.log('');
  console.log('📖 Usage examples:');
  console.log('   import { test, expect } from "../../test-utils/fixtures";');
  console.log('   // or import individual functions:');
  console.log('   import { takeComponentScreenshot } from "../../test-utils/screenshot-helpers";');
  console.log('');
}

export default globalSetup; 
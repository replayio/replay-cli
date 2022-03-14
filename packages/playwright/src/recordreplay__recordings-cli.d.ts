declare module '@recordreplay/recordings-cli' {
  /**
   * Supported replay browsers
   */
  export type BrowserName = "chromium" | "firefox";

  /**
   * Returns the path to playwright for the current platform
   * @param browserName BrowserName
   */
  export function getPlaywrightBrowserPath(browserName: BrowserName): string | null;

  /**
   * Returns the path to puppeteer for the current platform
   * @param browserName BrowserName
   */
  export function getPuppeteerBrowserPath(browserName: BrowserName): string | null;

  /**
   * Installs the Replay-enabled playwright browsers for the current platform is
   * not already installed
   * @param browserName BrowserName | "all"
   */
  export function ensurePlaywrightBrowsersInstalled(browserName: BrowserName | "all"): Promise<void>;

  /**
   * Installs the Replay-enabled puppeteer browsers for the current platform is
   * not already installed
   * @param browserName BrowserName | "all"
   */
  export function ensurePuppeteerBrowsersInstalled(browserName: BrowserName | "all"): Promise<void>;
}
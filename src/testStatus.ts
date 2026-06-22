/**
 * logTestStatus — prints a coloured one-liner per test as it completes.
 *
 * Designed to be called from a Playwright `afterEach` hook (or equivalent)
 * so you see real-time pass/fail lines during a run instead of waiting for
 * the reporter summary.
 *
 * Output format:
 *   [ENV:DEVICE:BROWSER] - Test(LINE): Test title: PASSED ✅  0.42m
 *   [ENV:DEVICE:BROWSER] - Test(LINE): Test title: FAILED ❌  1.03m [attempt 2/3]
 *
 * Usage in your fixture / afterEach:
 * ─────────────────────────────────────────────────────────────────────────────
 * import { logTestStatus, getEnvLabel } from 'playwright-final-summary-reporter/test-status';
 *
 * test.afterEach(async ({ page, browserName }, testInfo) => {
 *   const baseURL = testInfo.project.use.baseURL ?? '';
 *   const envLabel = getEnvLabel(baseURL);   // or pass your own string
 *   logTestStatus(envLabel, testInfo, browserName);
 * });
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Customising environment labels:
 *   The built-in getEnvLabel() is a simple helper — pass any string you like
 *   instead if your URL→label mapping is different.
 */

import type { TestInfo } from '@playwright/test';

// ─── Environment label helper ─────────────────────────────────────────────────

/**
 * Derives a short environment label from a base URL.
 * Override with your own logic if your URL structure differs.
 *
 * Examples:
 *   https://staging.myapp.com/en-gb/  →  "STAGING-GB"
 *   https://myapp.com/en-us/          →  "PROD-US"
 *   http://localhost:3000/             →  "LOCAL"
 */
export function getEnvLabel(baseUrl: string): string {
  if (!baseUrl) return 'UNKNOWN';

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return 'UNKNOWN';
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathSegment = parsed.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';

  // Locale suffix (e.g. "en-gb" → "GB", "de-de" → "DE")
  const localeSuffix = pathSegment.includes('-')
    ? pathSegment.split('-')[1]?.toUpperCase() ?? ''
    : pathSegment.toUpperCase();
  const suffix = localeSuffix ? `-${localeSuffix}` : '';

  if (hostname === 'localhost' || hostname === '127.0.0.1') return `LOCAL${suffix}`;
  if (hostname.includes('staging') || hostname.includes('stage')) return `STAGING${suffix}`;
  if (hostname.includes('dev')) return `DEV${suffix}`;
  if (hostname.includes('preview') || hostname.includes('vercel.app')) return `PREVIEW${suffix}`;

  return `PROD${suffix}`;
}

// ─── Live per-test status line ────────────────────────────────────────────────

/**
 * Prints a coloured status line for a single test result.
 *
 * @param envLabel  Short label shown in the header (e.g. "PROD-UK", "STAGING-US").
 *                  Use getEnvLabel(baseURL) or pass your own string.
 * @param testInfo  Playwright TestInfo object from the afterEach hook.
 * @param browserName  Browser name from the Playwright fixture (e.g. "chromium").
 */
export function logTestStatus(
  envLabel: string,
  testInfo: TestInfo,
  browserName: string,
): void {
  const device = testInfo.project.use.isMobile ? 'Mobile' : 'Desktop';

  const RESET = '\x1b[0m';
  const c = {
    header:      (s: string) => `\x1b[1;96m${s}${RESET}`,   // bold bright cyan
    name:        (s: string) => `\x1b[1;32m${s}${RESET}`,   // bold dark green  — passed
    nameFail:    (s: string) => `\x1b[38;5;130m${s}${RESET}`, // burnt orange    — failed/timedOut
    nameNeutral: (s: string) => `\x1b[90m${s}${RESET}`,     // dark grey        — skipped/interrupted
    green:       (s: string) => `\x1b[1;92m${s}${RESET}`,   // bold bright green  — PASSED
    red:         (s: string) => `\x1b[1;91m${s}${RESET}`,   // bold bright red    — FAILED
    yellow:      (s: string) => `\x1b[1;93m${s}${RESET}`,   // bold bright yellow — SKIPPED
    magenta:     (s: string) => `\x1b[1;95m${s}${RESET}`,   // bold bright magenta — TIMED OUT
    blue:        (s: string) => `\x1b[1;94m${s}${RESET}`,   // bold bright blue   — INTERRUPTED
    gray:        (s: string) => `\x1b[90m${s}${RESET}`,     // dark grey          — duration / retry
  };

  const totalRetries = testInfo.project.retries ?? 0;
  const attempt = testInfo.retry ?? 0;
  const retryLabel = totalRetries > 0 ? c.gray(` [attempt ${attempt + 1}/${totalRetries + 1}]`) : '';

  const header = c.header(`[${envLabel}:${device}:${browserName}]`);
  const duration = c.gray(`${(testInfo.duration / 60000).toFixed(2)}m`);

  const nameByStatus: Record<string, string> = {
    passed:      c.name(`Test(${testInfo.line}): ${testInfo.title}`),
    failed:      c.nameFail(`Test(${testInfo.line}): ${testInfo.title}`),
    timedOut:    c.nameFail(`Test(${testInfo.line}): ${testInfo.title}`),
    skipped:     c.nameNeutral(`Test(${testInfo.line}): ${testInfo.title}`),
    interrupted: c.nameNeutral(`Test(${testInfo.line}): ${testInfo.title}`),
  };
  const testLabel = (testInfo.status ? nameByStatus[testInfo.status] : undefined) ?? c.name(`Test(${testInfo.line}): ${testInfo.title}`);

  const statusLine: Record<string, string> = {
    passed:      `${header} - ${testLabel}: ${c.green('PASSED ✅')} ${duration}${retryLabel}`,
    failed:      `${header} - ${testLabel}: ${c.red('FAILED ❌')} ${duration}${retryLabel}`,
    skipped:     `${header} - ${testLabel}: ${c.yellow('SKIPPED ⚠️')} ${duration}${retryLabel}`,
    timedOut:    `${header} - ${testLabel}: ${c.magenta('TIMED OUT ⏰')} ${duration}${retryLabel}`,
    interrupted: `${header} - ${testLabel}: ${c.blue('INTERRUPTED ⛔')} ${duration}${retryLabel}`,
  };

  const line = (testInfo.status ? statusLine[testInfo.status] : undefined) ?? `${header} - ${testLabel}: UNKNOWN ${duration}`;
  process.stdout.write(line + '\n');
}

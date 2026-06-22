# playwright-final-summary-reporter

A Playwright reporter that replaces the default output with a rich, grouped terminal summary — plus an HTML report and optional Slack notification.

Built for teams running tests across multiple projects, locales, and environments.

![Terminal summary screenshot showing test run stats in a bordered table with Platform → Project → Section grouping](https://raw.githubusercontent.com/sherifopel/playwright-final-summary-reporter/main/docs/terminal-preview.png)

---

## Features

- **Bordered stats table** — Total, Passed, Failed, Skipped, Interrupted, Pass Rate with colour coding
- **Grouped output** — results bucketed by Platform (Desktop/Mobile) → Project → Section (via `@tags`)
- **Error details block** — first error message per failing test, printed at the end
- **Flaky test detection** — tests that failed then passed are tracked separately
- **HTML summary** — `playwright-summary.html` written next to your Playwright report (in CI automatically, locally via env var)
- **Slack notification** — posts a pre-formatted ASCII table to a channel on run end (opt-in)
- **Configurable sections** — bring your own `@tag → section label` mappings or use the built-in defaults
- **Zero prod dependencies** — only `@playwright/test` as a peer dep

---

## Installation

```bash
# npm
npm install --save-dev playwright-final-summary-reporter

# yarn
yarn add --dev playwright-final-summary-reporter

# pnpm
pnpm add --save-dev playwright-final-summary-reporter
```

**Requirements:**
- Node.js >= 18
- `@playwright/test` >= 1.40.0 (peer dependency — you install this yourself)

---

## Setup

Add the reporter to your `playwright.config.ts`:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['playwright-final-summary-reporter'],
    // Keep the built-in html reporter alongside it if you want the full report:
    ['html', { open: 'never' }],
  ],
});
```

That's it. Run `npx playwright test` and you'll see the summary at the end of every run.

---

## Options

All options are optional.

```ts
export default defineConfig({
  reporter: [
    ['playwright-final-summary-reporter', {
      // Custom section definitions — maps @tags to human-readable labels.
      // Defaults to built-in DEFAULT_SECTIONS if omitted.
      sections: [
        { key: 'auth',     label: 'Authentication',    matchers: ['@auth', '@login', '@logout'] },
        { key: 'checkout', label: 'Checkout',           matchers: ['@checkout'] },
        { key: 'cart',     label: 'Cart',               matchers: ['@cart'] },
        { key: 'pdp',      label: 'Product Pages',      matchers: ['@pdp'] },
      ],

      // Output filename for the HTML summary (default: "playwright-summary.html")
      summaryFileName: 'my-summary.html',

      // Slack channel ID to post to (default: SLACK_CHANNEL_ID env var)
      slackChannel: 'C1234567890',
    }],
  ],
});
```

### Option reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sections` | `SectionDef[]` | `DEFAULT_SECTIONS` | Custom tag→section mappings |
| `summaryFileName` | `string` | `"playwright-summary.html"` | HTML output filename |
| `slackChannel` | `string` | `SLACK_CHANNEL_ID` env var | Slack channel ID |

---

## Tagging your tests

Tests are bucketed into sections based on their `@tags`. Use Playwright's native tag syntax:

```ts
test('adds item to cart', { tag: ['@cart', '@desktop'] }, async ({ page }) => {
  // ...
});

test.describe('Checkout flow', { tag: ['@checkout'] }, () => {
  test('completes order', async ({ page }) => { /* ... */ });
});
```

If a test has no matching tag, it falls into the **Other** bucket.

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack bot token (required for Slack notifications) |
| `SLACK_NOTIFY=1` | Enable Slack posting (or use `SLACK_ALWAYS=1`) |
| `SLACK_CHANNEL_ID` | Primary Slack channel ID |
| `SLACK_EXTRA_CHANNEL` | Additional Slack channel to also post to |
| `PLAYWRIGHT_SUMMARY_PUBLISH=1` | Force HTML summary output locally (always on in CI) |
| `NP_REPORT_TITLE` | Override the run title shown in the summary header |
| `DEBUG_TAGS=1` | Print detected tags per test (useful for debugging section mapping) |
| `LOG_LEVEL=silent` | Suppress `info` and `ok` log lines |

---

## Slack setup

1. Create a [Slack bot](https://api.slack.com/apps) with the `chat:write` scope.
2. Install it to your workspace and invite it to your channel.
3. Set `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` (or pass `slackChannel` in options).
4. Set `SLACK_NOTIFY=1` in your CI environment.

The Slack message is a pre-formatted ASCII table showing total/passed/failed/skipped stats, run title, duration, and per-project locale breakdown.

---

## Default sections

The built-in `DEFAULT_SECTIONS` covers common e-commerce and web app areas:

| Tag(s) | Section label |
|--------|---------------|
| `@account`, `@registration` | Account & Auth |
| `@axe`, `@accessibility` | Accessibility |
| `@analytics` | Analytics |
| `@cart` | Cart |
| `@checkout` | Checkout |
| `@cms` | CMS Pages |
| `@footer` | Footer |
| `@header` | Header |
| `@homepage` | Home Page |
| `@identity`, `@login`, `@logout` | Identity |
| `@navigation` | Navigation |
| `@order-confirmation` | Order Confirmation |
| `@payment` | Payment |
| `@pdp` | Product Detail Page |
| `@plp`, `@wishlist` | Product Listing Page |
| `@routing` | Routing |
| `@search` | Search |
| `@visual` | Visual Regression |

---

## Live per-test status lines

In addition to the end-of-run summary, you can print a coloured one-liner **as each test completes** using `logTestStatus`. This gives you real-time visibility during long runs.

```
[PROD-UK:Desktop:chromium] - Test(42): adds item to cart: PASSED ✅  0.38m
[STAGING-US:Mobile:webkit] - Test(87): checkout flow: FAILED ❌  1.12m [attempt 2/3]
[DEV-DE:Desktop:chromium]  - Test(15): loyalty enrolment: SKIPPED ⚠️  0.00m
```

### Setup

Add to your fixture or `afterEach` hook:

```ts
import { logTestStatus, getEnvLabel } from 'playwright-final-summary-reporter';

test.afterEach(async ({ browserName }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL ?? '';
  logTestStatus(getEnvLabel(baseURL), testInfo, browserName);
});
```

### `getEnvLabel(baseURL)`

Derives a short label from the base URL automatically:

| URL | Label |
|-----|-------|
| `https://myapp.com/en-gb/` | `PROD-GB` |
| `https://staging.myapp.com/en-us/` | `STAGING-US` |
| `https://dev.myapp.com/de-de/` | `DEV-DE` |
| `http://localhost:3000/` | `LOCAL` |
| Vercel preview URL | `PREVIEW-XX` |

Pass any custom string instead if your URL structure is different:

```ts
logTestStatus('MY-ENV', testInfo, browserName);
```

### Colour scheme

| Status | Colour |
|--------|--------|
| PASSED ✅ | Bold bright green |
| FAILED ❌ | Bold bright red |
| SKIPPED ⚠️ | Bold bright yellow |
| TIMED OUT ⏰ | Bold bright magenta |
| INTERRUPTED ⛔ | Bold bright blue |

All colours use 16-colour ANSI codes — reliable in GitHub Actions, GitLab CI, and local terminals alike.

---



When `PLAYWRIGHT_SUMMARY_PUBLISH=1` is set (or in any CI environment), the reporter writes `playwright-summary.html` alongside your standard Playwright HTML report. It shows passed/failed/skipped tests grouped by Platform → Project → Section with clickable breadcrumbs.

---

## TypeScript types

```ts
import type { SectionDef, ReporterOptions } from 'playwright-final-summary-reporter';
import { DEFAULT_SECTIONS } from 'playwright-final-summary-reporter';

const mySections: SectionDef[] = [
  ...DEFAULT_SECTIONS,
  { key: 'loyalty', label: 'Loyalty Programme', matchers: ['@loyalty', '@rewards'] },
];
```

---

## License

MIT © [Sherif Opeloyeru](https://github.com/sherifopel)

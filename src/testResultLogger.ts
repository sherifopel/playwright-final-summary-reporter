export type TestLog = {
  feature: string;
  title: string;
  tags: string[];
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
};

const statusEmoji = {
  passed: '✅',
  failed: '❌',
  skipped: '⏭️',
  timedOut: '⏱️',
  interrupted: '🚫',
};

const statusColour = {
  passed: '\x1b[32m',   // Green
  failed: '\x1b[31m',   // Red
  skipped: '\x1b[38;5;226m', // Yellow
  timedOut: '\x1b[35m', // Magenta
  interrupted: '\x1b[36m', // Cyan
};

const reset = '\x1b[0m';

/**
 * Prints grouped test results to the console.
 * Results are grouped by feature and rendered with coloured status indicators.
 *
 * @example
 * // In your afterEach or onEnd hook:
 * logGroupedTestResults(testLogs);
 */
export function logGroupedTestResults(results: TestLog[]): void {
  const grouped: Record<string, TestLog[]> = {};

  for (const result of results) {
    (grouped[result.feature] ??= []).push(result);
  }

  for (const [feature, tests] of Object.entries(grouped)) {
    if (feature) {
      console.log(`\n  ${feature}`);
    }
    for (const test of tests) {
      const emoji = statusEmoji[test.status] ?? '❓';
      const colour = statusColour[test.status] ?? '\x1b[37m';
      const duration = `${(test.duration / 60000).toFixed(2)}m`;

      console.log(`  ${colour}${emoji} ${test.title} - ${duration}${reset}`);
    }
  }
}

/**
 * Extracts a feature/ticket identifier from a test title.
 * Expects the format "TICKET-123: Test title here".
 *
 * @example
 * extractFeatureFromTitle('NBP-825: Enrol User at Checkout') // → 'NBP-825'
 * extractFeatureFromTitle('CAT-42: Add to cart')             // → 'CAT-42'
 * extractFeatureFromTitle('No ticket here')                  // → ''
 */
export function extractFeatureFromTitle(title: string): string {
  const match = title.match(/^([A-Z]+-\d+):/);
  return match?.[1] ?? '';
}

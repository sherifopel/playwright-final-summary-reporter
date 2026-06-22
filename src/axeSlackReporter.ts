import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'] as const;
type Impact = (typeof IMPACTS)[number];

interface AxeRow {
  label: string;
  formFactor: string;
  violations: Record<Impact, number>;
  auditedUrl: string;
}

export interface AxeSlackReporterOptions {
  /**
   * Slack channel ID to post the axe audit summary to.
   * Falls back to the SLACK_AXE_CHANNEL env var, then SLACK_CHANNEL_ID.
   * If none are set the Slack post is skipped.
   */
  slackChannel?: string;
}

function dot(impact: Impact, count: number): string {
  if (count === 0) return '🟢';
  if (impact === 'critical') return '🔴';
  if (impact === 'serious') return '🟠';
  if (impact === 'moderate') return '🟡';
  return '⚪';
}

/**
 * Playwright reporter that collects axe violation annotations and:
 *   1. Prints a clean consolidated violation table + status to the terminal at the end
 *   2. Posts ONE consolidated Slack message when SLACK_BOT_TOKEN is set
 *
 * Expects tests to attach annotations in this shape:
 *   { type: 'Page', description: 'Home' }
 *   { type: 'Audited URL', description: 'https://...' }
 *   { type: 'Violations: critical', description: '2' }
 *   { type: 'Violations: serious',  description: '0' }
 *   { type: 'Violations: moderate', description: '1' }
 *   { type: 'Violations: minor',    description: '0' }
 *
 * Self-silences if no axe tests ran in the current suite.
 *
 * @example
 * // playwright.config.ts
 * reporter: [
 *   ['playwright-final-summary-reporter/axe', { slackChannel: 'C1234567890' }],
 * ]
 */
class AxeSlackReporter implements Reporter {
  private rows: AxeRow[] = [];
  private options: AxeSlackReporterOptions;

  constructor(options: AxeSlackReporterOptions = {}) {
    this.options = options;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (!result.annotations.some((a) => a.type === 'Violations: critical')) return;

    const label = result.annotations.find((a) => a.type === 'Page')?.description ?? test.title;
    const auditedUrl = result.annotations.find((a) => a.type === 'Audited URL')?.description ?? '';
    const projectName = test.parent.project()?.name ?? '';
    const formFactor = projectName.toLowerCase().includes('mobile') ? 'mobile' : 'desktop';

    const violations = {} as Record<Impact, number>;
    for (const impact of IMPACTS) {
      const ann = result.annotations.find((a) => a.type === `Violations: ${impact}`);
      violations[impact] = ann?.description ? parseInt(ann.description, 10) : 0;
    }

    this.rows.push({ label, formFactor, violations, auditedUrl });
  }

  async onEnd() {
    if (this.rows.length === 0) return;

    const env = process.env.CI_ENVIRONMENT ?? 'Local';
    const COL = { page: 25, form: 9, count: 11 };
    const pad = (s: string, n: number) => s.padEnd(n);

    const header =
      pad('Page', COL.page) +
      pad('Form', COL.form) +
      IMPACTS.map((i) => pad(i.toUpperCase(), COL.count)).join('');
    const divider = '─'.repeat(header.length);

    const dataRows = this.rows.map((r) => {
      const pageCol = pad(
        r.label.length > COL.page ? r.label.slice(0, COL.page - 1) + '…' : r.label,
        COL.page,
      );
      const formCol = pad(r.formFactor, COL.form);
      const countCols = IMPACTS.map((impact) => {
        const count = r.violations[impact];
        return pad(`${dot(impact, count)} ${count}`, COL.count);
      }).join('');
      return pageCol + formCol + countCols;
    });

    const allPass = this.rows.every((r) => r.violations['critical'] === 0);

    // ── Terminal summary ────────────────────────────────────────────────────
    console.log('');
    console.log(`\x1b[1m\x1b[36m♿ Axe Audit — ${env}\x1b[0m`);
    console.log('');
    console.log(header);
    console.log(divider);
    for (const row of dataRows) console.log(row);
    console.log('');

    const statusLine = allPass
      ? '\x1b[32m✅ No critical accessibility violations\x1b[0m'
      : '\x1b[31m🔴 Critical accessibility violations found\x1b[0m';
    console.log(statusLine);
    console.log('');

    // ── Slack post ──────────────────────────────────────────────────────────
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return;

    const channel =
      this.options.slackChannel ??
      process.env.SLACK_AXE_CHANNEL ??
      process.env.SLACK_CHANNEL_ID;

    if (!channel) {
      console.warn('[AxeSlackReporter] No Slack channel configured — skipping post.');
      return;
    }

    const table = ['```', header, divider, ...dataRows, '```'].join('\n');
    const slackStatus = allPass
      ? '✅ No critical accessibility violations'
      : '🔴 Critical accessibility violations found';

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `♿ Axe Audit — ${env}`, emoji: true },
      },
      { type: 'section', text: { type: 'mrkdwn', text: table } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: slackStatus }] },
    ];

    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel, text: `♿ Axe Audit — ${env}`, blocks }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        console.log(`[AxeSlackReporter] ✅ Posted axe table (${this.rows.length} rows)`);
      } else {
        console.error('[AxeSlackReporter] Slack post error:', json.error);
      }
    } catch (e) {
      console.error('[AxeSlackReporter] Slack post failed:', e);
    }
  }
}

export default AxeSlackReporter;

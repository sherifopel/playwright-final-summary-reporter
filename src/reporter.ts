import { execSync } from 'node:child_process';
import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import type { ReporterOptions, CaseAggregate, SummaryRow } from './types';
import { DEFAULT_SECTIONS, OTHER_SECTION } from './sections';
import type { SectionDef } from './types';
import {
  groupByPlatformProject,
  bucketBySection,
  extractLocaleFromProject,
  summarizeBusinessEnvironments,
  toTitleCase,
} from './utils';
import { Log } from './logger';
import { buildHtmlSummary, writeHtmlSummary } from './htmlBuilder';

// ─── Platform detection ───────────────────────────────────────────────────────

function detectPlatformForTest(test: TestCase): boolean {
  const project = test.parent?.project() as
    | { use?: { isMobile?: boolean; viewport?: { width?: number } }; name?: string }
    | undefined;
  const use = project?.use ?? {};
  const projName = project?.name ?? '';

  if (use.isMobile === true) return true;
  if (typeof use.viewport?.width === 'number' && use.viewport.width <= 812) return true;

  const titlePath = test.titlePath().join(' ').toLowerCase();
  if (/\bmobile|iphone|android|pixel|galaxy\b/i.test(titlePath)) return true;
  if (test.annotations.some((a) => /mobile/i.test(a.type) || /mobile/i.test(a.description ?? ''))) return true;
  if (/@mobile\b/i.test(test.title) || /@mobile\b/i.test(titlePath)) return true;

  const file = (test.location?.file ?? '').toLowerCase();
  if (/(\/|\\)mobile(\/|\\)/.test(file) || /-mobile\./.test(file)) return true;

  if (/\bmobile|iphone|android|pixel|galaxy\b/i.test(projName)) return true;

  return false;
}

// ─── Branch / title helpers ───────────────────────────────────────────────────

function getBranchInfo(): { ticketId: string; description: string } {
  if (process.env.NP_REPORT_TITLE) {
    return { ticketId: '', description: process.env.NP_REPORT_TITLE };
  }

  const branch =
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    (() => {
      try {
        return execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe', 'pipe', 'pipe'] })
          .toString()
          .trim();
      } catch {
        return '';
      }
    })();

  const ticketMatch = branch.match(/([A-Z]+-\d+)/);
  const ticketId = ticketMatch?.[1] ?? '';
  const descPart = branch
    .replace(/^[A-Z]+-\d+[_-]?/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  return { ticketId, description: descPart };
}

// ─── Terminal rendering ───────────────────────────────────────────────────────

function renderPlatformProjectSections<
  T extends {
    title: string;
    titlePath: string[];
    projectName: string;
    tags?: string[];
    isMobileViewport?: boolean;
    duration?: number;
  },
>(
  rows: T[],
  sectionDefs: SectionDef[],
  opts: {
    lineColor: string;
    itemColor: string;
    formatItem: (r: T, idx: number, paddedName: string) => string;
  },
) {
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const DIM = '\x1b[2m';
  const GREY = '\x1b[90m';
  const SECTION_COLOR = '\x1b[96m';
  const termWidth = Math.min(Math.max(process.stdout.columns || 90, 72), 120);
  const platformBuckets = groupByPlatformProject(rows);

  (['Desktop', 'Mobile'] as const).forEach((platform) => {
    const projects = platformBuckets[platform];
    const projectNames = Object.keys(projects);
    if (projectNames.length === 0) return;

    const platformIcon = platform === 'Desktop' ? '🖥️ ' : '📱';

    for (const project of projectNames) {
      const projectRows = projects[project] ?? [];
      const totalCount = projectRows.length;
      const header = `  ${platformIcon}  ${platform}  ·  ${project}  (${totalCount})`;
      const rule = `${DIM}${'─'.repeat(termWidth)}${RESET}`;

      Log.raw('');
      Log.raw(rule);
      Log.raw(`${opts.lineColor}${BOLD}${header}${RESET}`);
      Log.raw(rule);

      const bySection = bucketBySection(projectRows, sectionDefs);
      const activeSections = [...sectionDefs, OTHER_SECTION].filter(
        (def) => (bySection[def.key]?.length ?? 0) > 0,
      );
      const showSectionLabel = activeSections.length > 1;
      const allProjectItems = activeSections.flatMap((def) => bySection[def.key] ?? []);
      const maxLen =
        allProjectItems.length > 0
          ? Math.max(...allProjectItems.map((r) => (r.titlePath[r.titlePath.length - 1] || '').length))
          : 0;

      for (const def of activeSections) {
        const items = bySection[def.key];
        if (!items || items.length === 0) continue;

        if (showSectionLabel) {
          Log.raw(
            `\n  ${SECTION_COLOR}${BOLD}${def.label}${RESET}  ${GREY}(${items.length} test${items.length !== 1 ? 's' : ''})${RESET}`,
          );
        }

        items.forEach((r, i) => {
          const testName = r.titlePath[r.titlePath.length - 1] || '';
          const padded = testName.padEnd(maxLen);
          const line = opts.formatItem({ ...r, title: testName } as T, i, padded);
          const num = `${GREY}${String(i + 1).padStart(2)}.${RESET}`;
          Log.raw(`    ${num}  ${opts.itemColor}${line}${RESET}`);
        });
      }
    }
  });
}

function renderSummaryHeader(opts: {
  ticketId: string;
  description: string;
  startTime: Date;
  durationMs: number;
  environmentCount: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  interrupted: number;
  passRate: string;
  hasAxe: boolean;
}): void {
  const RESET = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const BGREEN = '\x1b[1;92m';
  const BRED = '\x1b[1;91m';
  const GREY = '\x1b[90m';
  const WHITE = '\x1b[97m';
  const BORDER = '\x1b[90m';
  const LABEL = '\x1b[1;97m';

  const ansiRe = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');
  const visibleLen = (s: string) => s.replace(ansiRe, '').length;
  const padEnd = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - visibleLen(s)));

  const termWidth = Math.min(Math.max(process.stdout.columns || 90, 72), 120);
  const innerW = termWidth - 2;
  const allPassed = opts.failed === 0;

  const statusBadge = allPassed
    ? `${BGREEN}● All passed${RESET}`
    : `${BRED}● ${opts.failed} failed${RESET}`;
  const statusVis = visibleLen(statusBadge) + 1;
  const statusRow = `${' '.repeat(Math.max(0, innerW - statusVis))}${statusBadge} `;

  const BIG_CYAN = '\x1b[1;96m';
  const bigText = 'T E S T   R U N   S U M M A R Y';
  const bigPad = Math.max(0, Math.floor((innerW - visibleLen(bigText)) / 2));
  const bigRow = ' '.repeat(bigPad) + `${BIG_CYAN}${bigText}${RESET}`;

  const descPart = opts.description ? toTitleCase(opts.description) : 'Playwright';
  const descTitle = opts.ticketId ? `${opts.ticketId} — ${descPart}` : descPart;

  const dateStr = opts.startTime
    .toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .replace(',', '');
  const durationMin = (opts.durationMs / 60000).toFixed(1);
  const tools = ['Playwright', opts.hasAxe ? 'axe-core' : ''].filter(Boolean).join(' · ');
  const subtitle = `${dateStr}  •  Duration ${durationMin}m  •  ${opts.environmentCount} environment${opts.environmentCount !== 1 ? 's' : ''}  •  ${tools}`;

  const NUM_COLS = 6;
  const COL = Math.floor((innerW - (NUM_COLS - 1)) / NUM_COLS);
  const lastCOL = innerW - (NUM_COLS - 1) - COL * (NUM_COLS - 1);

  const statHeaders = ['TOTAL TESTS', 'PASSED', 'FAILED', 'SKIPPED', 'INTERRUPTED', 'PASS RATE'];
  const passedColor = opts.passed > 0 ? BGREEN : `${BOLD}${WHITE}`;
  const failedColor = opts.failed > 0 ? BRED : `${BOLD}${WHITE}`;
  const skippedColor = opts.skipped > 0 ? '\x1b[1;93m' : `${BOLD}${WHITE}`;
  const intrColor = opts.interrupted > 0 ? '\x1b[1;93m' : `${BOLD}${WHITE}`;
  const rateColor = allPassed ? BGREEN : opts.failed > 0 ? BRED : `${BOLD}${WHITE}`;
  const statValues = [
    `${BOLD}${WHITE}${opts.total}${RESET}`,
    `${passedColor}${opts.passed}${RESET}`,
    `${failedColor}${opts.failed}${RESET}`,
    `${skippedColor}${opts.skipped}${RESET}`,
    `${intrColor}${opts.interrupted}${RESET}`,
    `${rateColor}${opts.passRate}%${RESET}`,
  ];

  const B = BORDER;
  const contentRow = (content: string) => `${B}│${RESET}${padEnd(content, innerW)}${B}│${RESET}`;
  const statsRow = (cols: string[]) => {
    const cells = cols.map((c, i) => {
      const w = i === NUM_COLS - 1 ? lastCOL : COL;
      return padEnd(` ${c}`, w);
    });
    return `${B}│${RESET}${cells.join(`${BORDER}│${RESET}`)}${B}│${RESET}`;
  };
  const divLine = (L: string, M: string, R: string, fill: string) => {
    const segs = [...Array(NUM_COLS - 1).fill(COL), lastCOL].map((w) => fill.repeat(w));
    return `${BORDER}${L}${segs.join(M)}${R}${RESET}`;
  };

  Log.raw('');
  Log.raw(`${BORDER}┌${'─'.repeat(innerW)}┐${RESET}`);
  Log.raw(contentRow(statusRow));
  Log.raw(contentRow(''));
  Log.raw(contentRow(bigRow));
  Log.raw(contentRow(''));
  Log.raw(contentRow(` ${BOLD}${WHITE}${descTitle}${RESET}`));
  Log.raw(contentRow(` ${GREY}${subtitle}${RESET}`));
  Log.raw(divLine('├', '┬', '┤', '─'));
  Log.raw(statsRow(statHeaders.map((h) => `${LABEL}${h}${RESET}`)));
  Log.raw(statsRow(statValues));
  Log.raw(divLine('└', '┴', '┘', '─'));
}

// ─── Slack ────────────────────────────────────────────────────────────────────

async function postSummaryToSlack(
  channel: string,
  opts: {
    ticketId: string;
    description: string;
    startTime: Date;
    durationMs: number;
    environmentCount: number;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    interrupted: number;
    passRate: string;
    localeResults: Array<{ locale: string; passed: number; failed: number }>;
  },
): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const slackEnabled = process.env.SLACK_NOTIFY === '1' || process.env.SLACK_ALWAYS === '1';
  if (!token || !slackEnabled) return;

  const channels = [channel, ...(process.env.SLACK_EXTRA_CHANNEL ? [process.env.SLACK_EXTRA_CHANNEL] : [])];

  const allPassed = opts.failed === 0;
  const status = allPassed ? '● All passed' : `● ${opts.failed} failed`;
  const descPart = opts.description ? toTitleCase(opts.description) : 'Playwright';
  const title = opts.ticketId ? `${opts.ticketId} — ${descPart}` : descPart;

  const dateStr = opts.startTime
    .toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .replace(',', '');
  const durationMin = (opts.durationMs / 60000).toFixed(1);
  const subtitle = `${dateStr}  •  Duration ${durationMin}m  •  ${opts.environmentCount} environment${opts.environmentCount !== 1 ? 's' : ''}  •  Playwright`;

  const COL = 13;
  const headers = ['TOTAL TESTS', 'PASSED', 'FAILED', 'SKIPPED', 'INTERRUPTED', 'PASS RATE'];
  const values = [
    `${opts.total}`,
    `${opts.passed}`,
    `${opts.failed}`,
    `${opts.skipped}`,
    `${opts.interrupted}`,
    `${opts.passRate}%`,
  ];
  const cell = (s: string) => ` ${s.padEnd(COL - 1)}`;
  const rowLine = (cols: string[]) => `│${cols.map(cell).join('│')}│`;
  const sepLine = (L: string, M: string, R: string) =>
    `${L}${Array(6).fill('─'.repeat(COL)).join(M)}${R}`;

  const innerW = 6 * COL + 5;
  const bigText = 'T E S T   R U N   S U M M A R Y';
  const bigPad = Math.max(0, Math.floor((innerW - bigText.length) / 2));

  const localeRow = opts.localeResults
    .map((lr) => `${lr.locale} ${lr.failed === 0 ? '🟢' : `🔴 ${lr.failed} failed`}`)
    .join('  ·  ');
  const statusPad = Math.max(1, innerW - (localeRow.length || 0) - status.length - 1);
  const firstLine = localeRow
    ? `${localeRow}${' '.repeat(statusPad)}${status}`
    : `${' '.repeat(Math.max(0, innerW - status.length - 1))}${status}`;

  const lines = [
    firstLine,
    '',
    `${' '.repeat(bigPad)}${bigText}`,
    '',
    ` ${title}`,
    ` ${subtitle}`,
    sepLine('├', '┬', '┤'),
    rowLine(headers),
    rowLine(values),
    sepLine('└', '┴', '┘'),
  ].join('\n');

  const body = `\`\`\`\n${lines}\n\`\`\``;

  try {
    for (const ch of channels) {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: ch, text: body }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (payload.ok) {
        process.stdout.write(`📊 Test run summary posted to Slack channel ${ch}\n`);
      } else {
        process.stdout.write(`⚠️  Slack post failed (${ch}): ${payload.error}\n`);
      }
    }
  } catch (e) {
    process.stdout.write(`⚠️  Slack post error: ${e}\n`);
  }
}

// ─── Reporter ─────────────────────────────────────────────────────────────────

class FinalSummaryReporter implements Reporter {
  private cases = new Map<string, CaseAggregate>();
  private readonly sectionDefs: SectionDef[];
  private readonly summaryFileName: string;
  private readonly slackChannel: string;

  constructor(options: ReporterOptions = {}) {
    this.sectionDefs = options.sections ?? DEFAULT_SECTIONS;
    this.summaryFileName = options.summaryFileName ?? 'playwright-summary.html';
    this.slackChannel =
      options.slackChannel ?? process.env.SLACK_CHANNEL_ID ?? '';
  }

  onStdOut(chunk: string | Buffer): void {
    if (process.env.CI) process.stdout.write(chunk);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const id = test.id;
    const project = test.parent?.project();
    const isMobileViewport = detectPlatformForTest(test);
    const projectName = project?.name || 'unknown';

    const nativeTagsSource = test as TestCase & { tags?: string[] };
    const nativeTags = Array.isArray(nativeTagsSource.tags) ? nativeTagsSource.tags : [];
    const annoTags = (test.annotations ?? [])
      .map((a) => (a.description || a.type || '').trim())
      .filter((s) => s.startsWith('@'));
    const fromTitle = [test.title, test.titlePath().join(' ')].join(' ').match(/@\w[\w-]*/g) ?? [];
    const tags = Array.from(
      new Set([...nativeTags, ...annoTags, ...fromTitle].map((s) => s.toLowerCase())),
    );

    let agg = this.cases.get(id);
    if (!agg) {
      agg = { id, title: test.title, titlePath: test.titlePath(), projectName, tags, attempts: [], isMobileViewport };
      this.cases.set(id, agg);
    } else {
      agg.tags = tags;
    }

    agg.attempts.push({ status: result.status ?? 'failed', duration: result.duration ?? 0 });
    if (!agg.firstError && result.status === 'failed' && result.error) {
      agg.firstError = result.error.message;
    }

    if (process.env.DEBUG_TAGS) {
      Log.info(`[tags] ${test.titlePath().join(' › ')} -> ${tags.join(', ')}`);
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    const isCI = !!process.env.CI;

    const passed: SummaryRow[] = [];
    const failed: SummaryRow[] = [];
    const flaky: SummaryRow[] = [];
    const skipped: SummaryRow[] = [];
    const interrupted: SummaryRow[] = [];

    for (const t of this.cases.values()) {
      const statuses = t.attempts.map((a) => a.status);
      const hasPassed = statuses.includes('passed');
      const hasFailed = statuses.includes('failed');
      const allSkippedFlag = statuses.length > 0 && statuses.every((s) => s === 'skipped');

      const row: SummaryRow = {
        id: t.id,
        title: t.title,
        duration: t.attempts[t.attempts.length - 1]?.duration ?? 0,
        tags: t.tags,
        projectName: t.projectName,
        titlePath: t.titlePath,
        isMobileViewport: t.isMobileViewport,
      };

      if (allSkippedFlag) skipped.push(row);
      else if (hasPassed && hasFailed) flaky.push(row);
      else if (hasPassed) passed.push(row);
      else if (statuses.includes('interrupted')) interrupted.push(row);
      else failed.push(row);
    }

    const items = [...this.cases.values()];
    const total = items.length;
    const executed = total - skipped.length;
    const passCount = passed.length + flaky.length;
    const passRate = executed ? ((passCount / executed) * 100).toFixed(2) : '0.00';

    const { ticketId, description: branchDescription } = getBranchInfo();
    const projectNames = Array.from(new Set(items.map((t) => t.projectName)));
    const businessEnvironment = summarizeBusinessEnvironments(projectNames);
    const description = !process.env.NP_REPORT_TITLE && !ticketId ? businessEnvironment : branchDescription;
    const environmentCount = projectNames.length;
    const hasAxe = items.some((t) =>
      t.tags.some((tag) => ['@axe', '@axe-uat', '@axe-prod', '@accessibility'].includes(tag)),
    );

    try {
      renderSummaryHeader({
        ticketId,
        description,
        startTime: result.startTime ?? new Date(),
        durationMs: result.duration ?? 0,
        environmentCount,
        total,
        passed: passCount,
        failed: failed.length,
        skipped: skipped.length,
        interrupted: interrupted.length,
        passRate,
        hasAxe,
      });
    } catch (e) {
      Log.warn(`Summary header render failed: ${String(e).slice(0, 200)}`);
    }

    const peach = '\x1b[93m';
    const grey = '\x1b[90m';
    const red = '\x1b[91m';
    const boldYellow = '\x1b[1;93m';
    const reset = '\x1b[0m';

    if (failed.length > 0) {
      renderPlatformProjectSections(failed, this.sectionDefs, {
        lineColor: red,
        itemColor: red,
        formatItem: (r, _i, paddedName) => {
          const mins = ((r.duration ?? 0) / 60000).toFixed(2);
          return `❌ ${paddedName}  ${grey}(${mins}m)${reset}`;
        },
      });
    }

    if (passed.length > 0 || flaky.length > 0) {
      renderPlatformProjectSections([...passed, ...flaky], this.sectionDefs, {
        lineColor: peach,
        itemColor: peach,
        formatItem: (_r, _i, paddedName) => `✅ ${paddedName}`,
      });
    }

    if (skipped.length > 0) {
      renderPlatformProjectSections(skipped, this.sectionDefs, {
        lineColor: '\x1b[33m',
        itemColor: '\x1b[33m',
        formatItem: (_r, _i, paddedName) => `⏭️ ${paddedName}`,
      });
    }

    const failedForErrors = items.filter((t) => {
      const s = t.attempts.map((a) => a.status);
      return !s.every((x) => x === 'skipped') && !s.includes('passed') && s.includes('failed') && !!t.firstError;
    });

    if (failedForErrors.length > 0) {
      const DIM_BORDER = '\x1b[38;5;238m';
      const termWidth = Math.min(Math.max(process.stdout.columns || 90, 72), 120);

      Log.raw(
        `\n${red}🪲 Error Details  ${grey}(${failedForErrors.length} failing test${failedForErrors.length !== 1 ? 's' : ''})${reset}`,
      );
      Log.raw(`${DIM_BORDER}${'─'.repeat(termWidth)}${reset}`);
      failedForErrors.forEach((t, idx) => {
        const name = t.titlePath[t.titlePath.length - 1] ?? t.title;
        Log.raw(`\n  ${boldYellow}${idx + 1}. ${name}${reset}  ${grey}· ${t.projectName}${reset}`);
        Log.raw(`  ${grey}${t.firstError}${reset}`);
      });
      Log.raw(`${DIM_BORDER}${'─'.repeat(termWidth)}${reset}`);
    }

    const SHOULD_PERSIST = process.env.PLAYWRIGHT_SUMMARY_PUBLISH === '1' || isCI;
    if (SHOULD_PERSIST) {
      try {
        const reportDir =
          (process.env.PLAYWRIGHT_HTML_REPORT?.trim()) ||
          (process.env.PLAYWRIGHT_REPORTER?.includes('=')
            ? process.env.PLAYWRIGHT_REPORTER.split('=')[1]
            : '') ||
          'playwright-report';

        const html = buildHtmlSummary({
          passed,
          flaky,
          failed,
          skipped,
          executed,
          passRate,
          sectionDefs: this.sectionDefs,
        });

        writeHtmlSummary(reportDir!, html, this.summaryFileName);
        Log.info(`📄 Wrote summary to ${reportDir}/${this.summaryFileName}`);
      } catch (e) {
        Log.warn(`Could not write summary: ${String(e).slice(0, 300)}`);
      }
    }

    if (this.slackChannel) {
      const localeMap = new Map<string, { passed: number; failed: number }>();
      for (const row of [...passed, ...flaky]) {
        const locale = extractLocaleFromProject(row.projectName);
        const entry = localeMap.get(locale) ?? { passed: 0, failed: 0 };
        entry.passed++;
        localeMap.set(locale, entry);
      }
      for (const row of failed) {
        const locale = extractLocaleFromProject(row.projectName);
        const entry = localeMap.get(locale) ?? { passed: 0, failed: 0 };
        entry.failed++;
        localeMap.set(locale, entry);
      }

      await postSummaryToSlack(this.slackChannel, {
        ticketId,
        description,
        startTime: result.startTime ?? new Date(),
        durationMs: result.duration ?? 0,
        environmentCount,
        total,
        passed: passCount,
        failed: failed.length,
        skipped: skipped.length,
        interrupted: interrupted.length,
        passRate,
        localeResults: [...localeMap.entries()].map(([locale, counts]) => ({ locale, ...counts })),
      });
    }
  }
}

export default FinalSummaryReporter;

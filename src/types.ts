export interface SectionDef {
  key: string;
  label: string;
  matchers: string[];
}

export interface ReporterOptions {
  /**
   * Custom section definitions used to bucket tests in the summary.
   * Defaults to DEFAULT_SECTIONS if not provided.
   */
  sections?: SectionDef[];
  /**
   * Output filename for the HTML summary written next to the Playwright report.
   * Defaults to `playwright-summary.html`.
   */
  summaryFileName?: string;
  /**
   * Slack channel ID to post the summary to.
   * Can also be set via SLACK_CHANNEL_ID env var.
   * Requires SLACK_BOT_TOKEN and SLACK_NOTIFY=1 (or SLACK_ALWAYS=1).
   */
  slackChannel?: string;
}

export type Attempt = { status: string; duration: number };

export type CaseAggregate = {
  id: string;
  title: string;
  titlePath: string[];
  projectName: string;
  tags: string[];
  attempts: Attempt[];
  firstError?: string;
  isMobileViewport?: boolean;
};

export type SummaryRow = {
  id?: string;
  title: string;
  duration: number;
  tags: string[];
  projectName: string;
  titlePath: string[];
  isMobileViewport?: boolean;
};

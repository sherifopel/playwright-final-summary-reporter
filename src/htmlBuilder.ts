import * as path from 'path';
import * as fs from 'fs';
import type { SectionDef } from './types';
import { OTHER_SECTION } from './sections';
import { groupByPlatformProject, bucketBySection } from './utils';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function buildPlatformProjectSectionBlocks(
  rows: Array<{ title?: string; titlePath: string[]; projectName: string; isMobileViewport?: boolean; tags?: string[] }>,
  icon: '✅' | '❌',
  sectionDefs: SectionDef[],
): string {
  const platformBuckets = groupByPlatformProject(rows);

  return (['Desktop', 'Mobile'] as const)
    .map((platform) => {
      const projects = platformBuckets[platform];
      const projectNames = Object.keys(projects);
      if (!projectNames.length) return '';

      const platformIcon = platform === 'Desktop' ? '🖥️' : '📱';

      return projectNames
        .map((project) => {
          const projectRows = projects[project] ?? [];
          const bySection = bucketBySection(projectRows, sectionDefs);

          const sectionsHtml = [...sectionDefs, OTHER_SECTION]
            .map((def) => {
              const items = bySection[def.key];
              if (!items?.length) return '';
              const list = items
                .map((r) => {
                  const describe =
                    r.titlePath.length > 1 ? r.titlePath[r.titlePath.length - 2] : r.titlePath[0] ?? '';
                  const testName = r.titlePath[r.titlePath.length - 1] ?? '';
                  return `<li>${icon} <code>${esc(describe)} › ${esc(testName)}</code></li>`;
                })
                .join('');
              return `
                <div class="sect">
                  <h4>🗂 ${esc(def.label)}</h4>
                  <ul>${list}</ul>
                </div>`;
            })
            .join('');

          return `
            <div class="group">
              <h3>${platformIcon} ${platform} : ${esc(project)}</h3>
              ${sectionsHtml || `<div class="muted">No tests in this project.</div>`}
            </div>`;
        })
        .join('');
    })
    .join('');
}

export function buildHtmlSummary(opts: {
  passed: Array<{ titlePath: string[]; projectName: string; isMobileViewport?: boolean; tags?: string[] }>;
  flaky: Array<{ titlePath: string[]; projectName: string; isMobileViewport?: boolean; tags?: string[] }>;
  failed: Array<{ titlePath: string[]; projectName: string; isMobileViewport?: boolean; tags?: string[] }>;
  skipped: Array<{ titlePath: string[]; projectName: string; isMobileViewport?: boolean; tags?: string[] }>;
  executed: number;
  passRate: string;
  sectionDefs: SectionDef[];
}): string {
  const { passed, flaky, failed, skipped, executed, passRate, sectionDefs } = opts;
  const passedLike = [...passed, ...flaky];
  const passedBlocksHtml = buildPlatformProjectSectionBlocks(passedLike, '✅', sectionDefs);
  const failedBlocksHtml = buildPlatformProjectSectionBlocks(failed, '❌', sectionDefs);

  return `<!doctype html>
<html lang="en"><meta charset="utf-8">
<title>Playwright Run Summary</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;max-width:1100px;margin:auto;line-height:1.45}
  .chips{margin:.5rem 0 1.25rem;display:flex;gap:.5rem;flex-wrap:wrap}
  .chip{padding:.25rem .6rem;border-radius:999px;font-size:14px;background:#f3f4f6}
  .ok{background:#d1fae5} .fail{background:#fee2e2} .skip{background:#e5e7eb}
  h1{margin:0 0 .75rem;font-size:22px}
  h2{margin:1.25rem 0 .4rem;font-size:18px}
  h3{margin:1rem 0 .35rem;font-size:16px}
  h4{margin:.5rem 0 .25rem;font-size:15px}
  code{background:#f9fafb;padding:.15rem .35rem;border-radius:6px}
  a{color:#2563eb;text-decoration:none}
  .muted{color:#6b7280}
  .card{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:1rem 0}
  .group{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:.75rem 0;background:#fafafa}
  .sect{border:1px dashed #e5e7eb;border-radius:10px;padding:10px;margin:.6rem 0}
  ul{margin:.25rem 0 .25rem 1.1rem}
  .summary-header{font-size:28px;font-weight:700;margin:0 0 1rem}
  .summary-stats{font-size:16px;line-height:1.7;margin:0 0 1.5rem}
  .summary-stats strong{font-weight:600}
</style>
<body>
  <h1 class="summary-header">Playwright Run Summary</h1>
  <div class="summary-stats">
    <div><strong>Total:</strong> ${executed} tests</div>
    <div><strong>Passed:</strong> ${passed.length + flaky.length} (${passRate}%)</div>
    <div><strong>Failed:</strong> ${failed.length} (${((failed.length / executed) * 100).toFixed(0)}%)</div>
    <div><strong>Skipped:</strong> ${skipped.length} (${((skipped.length / executed) * 100).toFixed(0)}%)</div>
  </div>
  <div class="card"><h2>Quick links</h2><div>▶️ <a href="./index.html">Open full Playwright report</a></div></div>
  <div class="card"><h2>Passed (grouped by Platform → Project → Section)</h2>${passedBlocksHtml || '<div class="muted">No passed tests</div>'}</div>
  <div class="card"><h2>Failures (grouped by Platform → Project → Section)</h2>${failedBlocksHtml || '<div class="muted">None 🎉</div>'}</div>
</body></html>`;
}

export function writeHtmlSummary(reportDir: string, html: string, fileName = 'playwright-summary.html'): void {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, fileName), html, 'utf8');
}

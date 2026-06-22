import type { SectionDef, SummaryRow } from './types';
import { OTHER_SECTION } from './sections';

export function sectionsForRow(
  row: { titlePath: string[]; tags?: string[] },
  sectionDefs: SectionDef[],
): SectionDef[] {
  const haystack = (row.tags ?? []).map((s) => s.toLowerCase());
  const matched = sectionDefs.find((def) => def.matchers.some((m) => haystack.includes(m.toLowerCase())));
  return matched ? [matched] : [OTHER_SECTION];
}

export function groupByPlatformProject<T extends { projectName: string; isMobileViewport?: boolean }>(
  rows: T[],
): Record<'Desktop' | 'Mobile', Record<string, T[]>> {
  const out: Record<'Desktop' | 'Mobile', Record<string, T[]>> = { Desktop: {}, Mobile: {} };
  for (const r of rows) {
    const plat = (r.isMobileViewport ?? /Mobile/i.test(r.projectName)) ? 'Mobile' : 'Desktop';
    (out[plat][r.projectName] ??= []).push(r);
  }
  return out;
}

export function bucketBySection<T extends { titlePath: string[]; tags?: string[] }>(
  rows: T[],
  sectionDefs: SectionDef[],
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of rows) {
    const secs = sectionsForRow({ titlePath: r.titlePath, tags: r.tags }, sectionDefs);
    for (const s of secs) (map[s.key] ??= []).push(r);
  }
  return map;
}

// Extracts locale abbreviation from a project name e.g. "Chrome-UK-Cat-Dev" → "UK"
export function extractLocaleFromProject(projectName: string): string {
  for (const part of projectName.split('-')) {
    if (/^[A-Z]{2,3}$/.test(part)) return part;
  }
  return 'Other';
}

type BusinessEnvironment = 'Development' | 'Staging' | 'Preview' | 'Pre-Production' | 'Production' | 'Custom';
const BUSINESS_ENV_ORDER: BusinessEnvironment[] = ['Development', 'Staging', 'Preview', 'Pre-Production', 'Production', 'Custom'];

export function inferBusinessEnvironment(projectName: string): BusinessEnvironment {
  const name = projectName.toLowerCase();
  if (/(^|[-_])cat[-_]preprod($|[-_])/.test(name)) return 'Pre-Production';
  if (/(^|[-_])(?:cat[-_])?preview($|[-_])/.test(name)) return 'Preview';
  if (/(^|[-_])(?:cat[-_])?prod($|[-_])/.test(name)) return 'Production';
  if (/(^|[-_])(?:cat[-_])?(?:stage|staging)($|[-_])/.test(name)) return 'Staging';
  if (/(^|[-_])(?:cat[-_])?dev($|[-_])/.test(name)) return 'Development';
  if (/(^|[-_])(uk|us|eu|de|fr|ww|cn)($|[-_])/.test(name)) return 'Development';
  return 'Custom';
}

export function summarizeBusinessEnvironments(projectNames: string[]): string {
  const environments = Array.from(new Set(projectNames.map(inferBusinessEnvironment))).sort(
    (a, b) => BUSINESS_ENV_ORDER.indexOf(a) - BUSINESS_ENV_ORDER.indexOf(b),
  );
  const first = environments[0];
  if (!first) return 'Custom';
  if (environments.length === 1) return first;
  return environments.join(' + ');
}

const LOWER_WORDS = new Set(['and', 'or', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

export function toTitleCase(str: string): string {
  return str
    .split(' ')
    .map((w, i) =>
      i === 0 || !LOWER_WORDS.has(w.toLowerCase())
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toLowerCase(),
    )
    .join(' ');
}

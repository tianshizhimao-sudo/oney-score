/* Human-readable label mappings for enum fields on the wire.
 * Kept in sync with docs/report-email-templates.md. */

import type { ReadinessBand, RecommendedPath } from './types';

export const BAND_LABELS: Record<ReadinessBand, string> = {
  strong: 'Strong',
  borderline: 'Borderline',
  needs_work: 'Needs work before application',
};

export const PATH_LABELS: Record<RecommendedPath, string> = {
  approach_bank: 'Approach a lender with a well-prepared file',
  broker_review: 'Seek broker-led review before application',
  improve_first: 'Improve key gaps before application',
};

export const DEFAULT_DISCLAIMER =
  'This report is a readiness signal, not credit approval, a credit decision, or financial advice. It is designed to highlight likely lending gaps before a formal lender review.';

export const SHORT_DISCLAIMER =
  'This report is a readiness signal, not credit approval or financial advice.';

export const BROKER_DISCLAIMER =
  'This client-shared report is a readiness signal based on user-provided information. It is not a formal credit assessment or approval.';

export const REVIEW_CTA_URL = 'https://oneyco.com.au/';

/* Produce the 1-line profile-summary sentence used across all three
 * flows. Mirrors the phrasing in the in-page result card + report.html
 * so the user gets a consistent narrative. */
export function renderProfileSummary(opts: {
  completion: string;
  strongest: string | null;
  weakest: string | null;
  fastest: string | null;
}): string {
  if (opts.completion === 'skipped') {
    return 'This report is based mainly on your core lending readiness answers.';
  }
  const parts: string[] = [];
  if (opts.strongest) parts.push(`strongest in ${opts.strongest}`);
  if (opts.weakest) parts.push(`weaker in ${opts.weakest}`);
  if (opts.fastest) parts.push(`most likely to improve quickly through ${opts.fastest}`);
  if (!parts.length) {
    return 'The report points to a manageable set of readiness gaps rather than one dominant issue.';
  }
  return `Based on your answers, your current lending profile looks ${parts.join(', ')}.`;
}

export function tagsOrNeutral(tags: string[]): string {
  if (!tags || tags.length === 0) {
    return 'The report points to a manageable set of readiness gaps rather than one dominant issue.';
  }
  return tags.slice(0, 3).join(', ');
}

import type { ReportSubmitRequest } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ValidationError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function nonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

/* Runtime shape check. Intentionally permissive on optional fields so
 * minor contract drift from the frontend doesn't break delivery. Only
 * the 5 fields we actually need to deliver mail are enforced. */
export function validateSubmitRequest(body: unknown): ReportSubmitRequest {
  if (!isObject(body)) throw new ValidationError('body must be a JSON object');

  const lead = body.lead;
  if (!isObject(lead)) throw new ValidationError('lead missing', 'lead');
  if (!nonEmptyString(lead.first_name)) throw new ValidationError('lead.first_name required', 'lead.first_name');
  if (!nonEmptyString(lead.email) || !EMAIL_RE.test(lead.email)) {
    throw new ValidationError('lead.email must be a valid email', 'lead.email');
  }

  const report = body.report;
  if (!isObject(report)) throw new ValidationError('report missing', 'report');
  if (!nonEmptyString(report.report_id)) throw new ValidationError('report.report_id required', 'report.report_id');
  if (typeof report.overall_score !== 'number') throw new ValidationError('report.overall_score must be number', 'report.overall_score');

  const band = report.readiness_band;
  if (band !== 'strong' && band !== 'borderline' && band !== 'needs_work') {
    throw new ValidationError('report.readiness_band invalid enum', 'report.readiness_band');
  }

  const share = body.share;
  if (!isObject(share)) throw new ValidationError('share missing', 'share');
  if (share.enabled === true) {
    if (!nonEmptyString(share.recipient_email) || !EMAIL_RE.test(share.recipient_email)) {
      throw new ValidationError('share.recipient_email required when share.enabled', 'share.recipient_email');
    }
    if (share.consent_confirmed !== true) {
      throw new ValidationError('share.consent_confirmed must be true when share.enabled', 'share.consent_confirmed');
    }
  }

  // Passed. Trust the rest of the payload (defaults applied in renderers).
  return body as unknown as ReportSubmitRequest;
}

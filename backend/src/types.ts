/* Worker environment + payload types.
 *
 * The request payload shape is defined by docs/report-integration.md →
 * ReportSubmitRequest. Wire is snake_case. These TS interfaces are
 * runtime-optional — validate.ts enforces the shape on every request.
 */

export interface Env {
  // Secrets (set via `wrangler secret put`):
  RESEND_API_KEY: string;
  MAIL_FROM: string;          // e.g. "Oney & Co <hello@oneyco.com.au>"
  INTERNAL_NOTIFY_TO: string; // e.g. "hello@oneyco.com.au"
  ALLOWED_ORIGIN: string;     // e.g. "https://score.oneyco.com.au"

  // Non-secret runtime flags (wrangler.toml [vars]):
  ENABLE_BROKER_SHARE?: string;
}

export type ReadinessBand = 'strong' | 'borderline' | 'needs_work';
export type RecommendedPath = 'approach_bank' | 'broker_review' | 'improve_first';
export type InsightCompletionState = 'skipped' | 'partial' | 'complete';
export type RecipientType = 'broker' | 'lender' | 'banker' | 'other';

export interface ReportSubmitRequest {
  lead: {
    first_name: string;
    email: string;
    business_name?: string;
    mobile?: string;
    wants_follow_up: boolean;
  };
  share: {
    enabled: boolean;
    recipient_type?: RecipientType;
    recipient_name?: string;
    recipient_email?: string;
    consent_confirmed?: boolean;
  };
  report: {
    report_id: string;
    created_at: string;
    overall_score: number;
    readiness_band: ReadinessBand;
    recommended_path: RecommendedPath;
    dimension_scores: Record<string, number>;
    insight_completion_state: InsightCompletionState;
    profile_tags: string[];
    profile_summary: {
      strongest_area: string | null;
      weakest_area: string | null;
      fastest_improvement: string | null;
    } | null;
    top_priority_actions: Array<{ id: string; label: string; body: string }>;
    key_answers?: Record<string, string | string[]>;
    funding_signals?: string[];
    product_version: string;
    scoring_version: string;
    disclaimer_version: string;
  };
  meta: {
    source: 'bank-ready-score';
    mode: 'mock' | 'live';
    user_agent?: string;
    locale?: string;
    page_url?: string;
    report_url?: string;
  };
}

/* Matches ReportSubmitResponse in docs/report-integration.md */
export interface ReportSubmitResponse {
  success: boolean;
  mode: 'mock' | 'live';
  report: {
    reportId: string;
    reportUrl: string;
    reportPath: string | null;
    expiresAt: string | null;
  };
  deliveries: {
    userEmail: { queued: boolean; sent?: boolean; email: string };
    recipientEmail?: { queued: boolean; sent?: boolean; email: string };
    internalNotification: { queued: boolean; sent?: boolean };
  };
  unsubscribeUrlTemplate?: string | null;
  message?: string | null;
}

/* Internal Oney triage notification.
 * Lightweight plain-layout email sent to INTERNAL_NOTIFY_TO.
 */

export const INTERNAL_SUBJECT = 'New Bank-Ready Score report lead: {{first_name}} · {{score}}';

export const INTERNAL_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>New Bank-Ready Score report lead — {{first_name}}</title>
  </head>
  <body style="margin:0;padding:16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;font-size:13px;line-height:1.55;">
    <h2 style="font-size:16px;margin:0 0 12px;">New Bank-Ready Score report lead</h2>

    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:13px;">
      <tr><td style="color:#64748b;">Name</td><td>{{first_name}}</td></tr>
      <tr><td style="color:#64748b;">Email</td><td><a href="mailto:{{email}}">{{email}}</a></td></tr>
      <tr><td style="color:#64748b;">Business</td><td>{{business_name}}</td></tr>
      <tr><td style="color:#64748b;">Mobile</td><td>{{mobile}}</td></tr>
      <tr><td style="color:#64748b;">Wants follow-up</td><td>{{wants_follow_up}}</td></tr>
      <tr><td style="color:#64748b;">Created</td><td>{{created_at}}</td></tr>
    </table>

    <h3 style="font-size:14px;margin:20px 0 8px;">Report</h3>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:13px;">
      <tr><td style="color:#64748b;">Score</td><td><strong>{{score}}</strong> / 100 — {{score_band}}</td></tr>
      <tr><td style="color:#64748b;">Recommended path</td><td>{{recommended_path}}</td></tr>
      <tr><td style="color:#64748b;">Profile tags</td><td>{{profile_tags}}</td></tr>
      <tr><td style="color:#64748b;">Profile summary</td><td>{{profile_summary}}</td></tr>
    </table>

    <h3 style="font-size:14px;margin:20px 0 8px;">Top actions</h3>
    <ol style="margin:0 0 16px 18px;padding:0;">
      <li style="margin-bottom:6px;">{{top_action_1}}</li>
      <li style="margin-bottom:6px;">{{top_action_2}}</li>
      <li style="margin-bottom:6px;">{{top_action_3}}</li>
    </ol>

    <h3 style="font-size:14px;margin:20px 0 8px;">Share status</h3>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-size:13px;">
      <tr><td style="color:#64748b;">Shared with recipient</td><td>{{shared_with_recipient}}</td></tr>
      <tr><td style="color:#64748b;">Recipient name</td><td>{{recipient_name}}</td></tr>
      <tr><td style="color:#64748b;">Recipient type</td><td>{{recipient_type}}</td></tr>
      <tr><td style="color:#64748b;">Recipient email</td><td>{{recipient_email}}</td></tr>
    </table>

    <p style="margin:18px 0 8px;">Report link: <a href="{{report_url}}">{{report_url}}</a></p>

    <h3 style="font-size:14px;margin:20px 0 8px;">Raw payload (archive)</h3>
    <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:11px;">{{raw_payload_json}}</pre>
  </body>
</html>`;

export const INTERNAL_TEXT = `New Bank-Ready Score report lead

Lead
- Name: {{first_name}}
- Email: {{email}}
- Business: {{business_name}}
- Mobile: {{mobile}}
- Wants follow-up: {{wants_follow_up}}

Report
- Score: {{score}} / 100
- Readiness: {{score_band}}
- Recommended path: {{recommended_path}}
- Created: {{created_at}}

Profile tags
- {{profile_tags}}

Profile summary
- {{profile_summary}}

Top actions
1. {{top_action_1}}
2. {{top_action_2}}
3. {{top_action_3}}

Share status
- Shared with broker/lender: {{shared_with_recipient}}
- Recipient name: {{recipient_name}}
- Recipient type: {{recipient_type}}
- Recipient email: {{recipient_email}}

Report link
{{report_url}}`;

/* Thin Resend HTTP client.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  status: number;
  error?: string;
}

export async function sendViaResend(apiKey: string, input: SendEmailInput): Promise<SendEmailResult> {
  const body: Record<string, unknown> = {
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (input.replyTo) body.reply_to = input.replyTo;
  if (input.headers) body.headers = input.headers;

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message || 'network' };
  }

  const status = res.status;
  let json: unknown = null;
  try { json = await res.json(); } catch { /* ignore parse failure */ }

  if (!res.ok) {
    const err = (isObject(json) && typeof json.message === 'string') ? json.message : `resend-${status}`;
    return { ok: false, status, error: err };
  }

  const id = (isObject(json) && typeof json.id === 'string') ? json.id : undefined;
  return { ok: true, status, id };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

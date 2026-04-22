/* Tiny Mustache-lite renderer.
 *
 * Supports only what the templates need:
 *   {{token}}              — flat substitution (HTML-escaped by default)
 *   {{#condition}}…{{/condition}}   — truthy-block
 *   {{^condition}}…{{/condition}}   — falsy-block
 *
 * No nested sections, no lists, no partials. Keep it boring.
 */

export type TokenMap = Record<string, string | number | boolean | null | undefined>;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] || c);
}

/* Render conditional blocks first, then scalar tokens. */
export function renderTemplate(
  template: string,
  tokens: TokenMap,
  opts: { escape?: boolean } = {}
): string {
  const escape = opts.escape !== false;

  // {{#key}} ... {{/key}}
  let out = template.replace(/\{\{#([a-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gi, (_m, key, body) => {
    return isTruthy(tokens[key]) ? body : '';
  });

  // {{^key}} ... {{/key}}
  out = out.replace(/\{\{\^([a-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gi, (_m, key, body) => {
    return isTruthy(tokens[key]) ? '' : body;
  });

  // {{token}}
  out = out.replace(/\{\{([a-z0-9_]+)\}\}/gi, (_m, key) => {
    const val = tokens[key];
    if (val == null) return '';
    return escape ? escapeHtml(val) : String(val);
  });

  return out;
}

function isTruthy(v: unknown): boolean {
  if (v == null || v === false) return false;
  if (typeof v === 'string') return v.trim().length > 0 && v !== 'false' && v !== '0' && v !== 'no';
  if (typeof v === 'number') return v !== 0;
  return true;
}

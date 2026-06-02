// Heuristic complexity classifier — pure text analysis, zero network/disk I/O.
// Returns 'trivial' for single-field / single-type / rename requests so the
// pipeline can take the fast path (implement+test in one shot, no scout/spec/plan).
// Conservative: false-positives (trivial→standard) are safe; false-negatives are not.

const TRIVIAL = [
  /\badd\b.{0,60}(field|property|attribute|column|param)\b/i,
  /\b(field|property|attribute|column|param)\b.{0,60}\badd\b/i,
  /\badd\b.{0,80}:\s*(string|number|boolean|bigint|null|undefined)\b/i,
  /:\s*(string|number|boolean)\s*\|\s*(null|undefined)\b/i,
  /\b(null|undefined)\s*\|\s*(string|number|boolean)\b/i,
  /\brename\b.{3,80}\bto\b/i,
  /\bchange\s+(the\s+)?type\s+of\b/i,
  /\bmake\b.{3,60}\b(optional|nullable|required)\b/i,
];

// Any of these force the standard pipeline regardless of trivial match.
const COMPLEX = [
  /\bendpoint\b|\broute\b/i,
  /\bauth(entication|orization)?\b/i,
  /\bmigrat/i,
  /\brefactor\b/i,
  /\bsecurity\b/i,
  /\bnew\s+(service|controller|module|guard|interceptor|pipe)\b/i,
  /\band\s+(also|additionally)\b/i,
  /multiple\s+fields?|several\s+fields?|all\s+models?/i,
];

/**
 * Classify a feature request as 'trivial' or 'standard'.
 * Trivial → fast path (1 combined agent call).
 * Standard → full pipeline (scout → spec → plan → implement → test → pr → review → curate).
 */
export function classify(request) {
  const trimmed = request.trim();
  // Multi-line requests are almost always standard
  if (trimmed.split('\n').filter(l => l.trim()).length > 2) return 'standard';

  const line = trimmed.split('\n')[0].trim();

  if (COMPLEX.some(p => p.test(line))) return 'standard';
  if (TRIVIAL.some(p => p.test(line))) return 'trivial';

  // Short single-action requests with no complexity markers → trivial
  if (line.length < 80 && /^(add|remove|delete|rename|update|change|make)\b/i.test(line)) {
    return 'trivial';
  }

  return 'standard';
}

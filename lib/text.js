'use strict';

// Tokenization, stemming, Jaccard, IDF, weighted-recall — language-agnostic
// helpers used by the routing and overlap suites. No filesystem access here;
// callers pass in plain strings and lists of agents.

const DEFAULT_STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','do','does','did',
  'have','has','had','this','that','these','those','of','in','on','to','for',
  'with','at','by','from','about','as','it','its','and','or','but','if','then',
  'use','when','i','you','your','my','me','we','us','our','make','need','want',
  'show','give','get','asked','ask','please','can','could','would','should','will',
  'one','any','some','all','no','not','only','also','just','still','very','more',
]);

// Pragmatic English morphology stemmer: ies→y, ing→drop+undouble, ed→drop,
// es→drop with sxzh/o exception, s→drop except ss. Approximates what an LLM
// classifier handles implicitly.
function stem(w) {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) {
    let s = w.slice(0, -3);
    if (s.length > 2 && s[s.length - 1] === s[s.length - 2] && !'aeiou'.includes(s[s.length - 1])) {
      s = s.slice(0, -1);
    }
    return s;
  }
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) {
    const prev = w[w.length - 3];
    if ('sxzh'.includes(prev) || prev === 'o') return w.slice(0, -2);
    return w.slice(0, -1);
  }
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function tokenize(s, stopwords = DEFAULT_STOPWORDS) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w))
    .map(stem);
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const uni = sa.size + sb.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

// IDF over a corpus of agent descriptions. Tokens appearing in many agents are
// common (low signal); rare tokens are discriminating (high signal).
function buildIDF(agents) {
  const N = agents.length;
  const df = new Map();
  for (const a of agents) {
    const seen = new Set(tokenize(a.description));
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map();
  for (const [t, count] of df) {
    idf.set(t, Math.log((N + 1) / (count + 1)) + 1);
  }
  return idf;
}

// Of the prompt's discriminative tokens (IDF-weighted), what fraction does the
// agent description cover? Better proxy for "which agent fits this prompt"
// than plain Jaccard, because long descriptions aren't penalized for length.
function weightedRecall(promptTokens, agentTokens, idf) {
  const sa = new Set(promptTokens);
  const sb = new Set(agentTokens);
  let interW = 0, promptW = 0;
  for (const t of sa) {
    const w = idf.get(t) ?? 1;
    promptW += w;
    if (sb.has(t)) interW += w;
  }
  return promptW === 0 ? 0 : interW / promptW;
}

module.exports = { stem, tokenize, jaccard, buildIDF, weightedRecall, DEFAULT_STOPWORDS };

// lib/lessonAI/wer.ts
//
// Mixed zh/en error rate for the L1 STT go/no-go. Chinese is scored per-character
// and Latin/digits per-word (the standard "mixed error rate" for zh-en ASR), so a
// single number is comparable across code-switched teaching audio. Pure + offline.

/**
 * Tokenize for mixed-language error rate: each CJK char is one token; each run of
 * latin letters/digits is one token; punctuation and whitespace are dropped.
 */
export function tokenizeMixed(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[㐀-䶿一-鿿぀-ヿ]|[a-z0-9]+/g);
  return matches ?? [];
}

/** Levenshtein edit distance over token arrays. */
export function editDistance(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

export interface WerResult {
  wer: number; // edits / refLen (mixed error rate)
  refLen: number;
  hypLen: number;
  edits: number;
}

/** Mixed zh/en error rate of `hyp` against reference `ref`. */
export function werMixed(ref: string, hyp: string): WerResult {
  const r = tokenizeMixed(ref);
  const h = tokenizeMixed(hyp);
  const edits = editDistance(r, h);
  const wer = r.length ? edits / r.length : h.length ? 1 : 0;
  return { wer: Math.round(wer * 10000) / 10000, refLen: r.length, hypLen: h.length, edits };
}

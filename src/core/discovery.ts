import { candidate, classify, isSegment } from './url';
import type { Candidate, MediaKind } from './types';
/** Retain MIME-based page classifications for extensionless player endpoints. */
export function pageCandidate(
  url: string,
  hint: MediaKind,
  extra: Partial<Candidate> = {},
): Candidate {
  const detected = candidate(url, 'page', extra);
  if (isSegment(detected.url)) return { ...detected, kind: 'page' };
  return {
    ...detected,
    kind:
      detected.kind === 'page' && ['direct', 'hls', 'dash'].includes(hint) ? hint : detected.kind,
  };
}
/** Recover media requested before network observation/site permissions were enabled. */
export function resourceCandidates(urls: string[], title: string, pageUrl: string): Candidate[] {
  const found = new Map<string, Candidate>();
  for (const url of urls) {
    try {
      const kind = classify(url);
      if (kind === 'page' || isSegment(url)) continue;
      const value = candidate(url, 'page', { title, pageUrl, kind });
      found.set(value.id, value);
    } catch {
      /* Ignore inaccessible schemes and private endpoints. */
    }
  }
  return [...found.values()];
}

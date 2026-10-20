import type { Retention } from '@interim/types';

/**
 * When a photo or render made at `from` expires (docs/product/spec.md section 12). Standard keeps
 * 30 days; keep history keeps 24 months, restarted by every new check in.
 */
export function expiresAt(retention: Retention, from: Date): Date {
  const result = new Date(from);
  if (retention === 'standard') result.setUTCDate(result.getUTCDate() + 30);
  else result.setUTCMonth(result.getUTCMonth() + 24);
  return result;
}

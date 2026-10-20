import type { LiveLocale, Moment, TemplateKey, Tone } from '@interim/types';
import { en } from './copy/en';

/** Fixed user facing copy for one language. */
export interface Copy {
  /** Neutral situation names (docs/product/overview.md, Templates). */
  templateLabels: Record<TemplateKey, string>;
  /** Companion note used when model text fails its checks twice (docs/product/spec.md section 8). */
  companionFallback: Record<Tone, string>;
  /** Lines the person can use when someone asks. Empty for moments without other people. */
  whatToSay: Record<Moment, readonly string[]>;
}

/** All fixed copy by language. Adding a live locale fails the build until its copy is here. */
export const copy: Record<LiveLocale, Copy> = { en };

import type { MeasureTool, RenderTool, Strategy, TemplateKey, TraceReason } from '@interim/types';

/** The answer for one tool: allowed, or blocked with the reason the trace records. */
export type Eligibility = { allowed: true } | { allowed: false; reason: TraceReason };

/** What decides whether a tool may run on this snapshot (docs/product/spec.md section 7). */
export interface EligibilityContext {
  templateKey: TemplateKey;
  /** Turns off every tool that changes or removes what is on the head. */
  headCovering: boolean;
  /** A reliable density reading exists for this person, which hair volume previews need. */
  hasDensity: boolean;
  /** Tools the capture check refused, or that YouCam marked blocked, for this snapshot. */
  blockedTools: ReadonlySet<string>;
  /** Units left under the tightest cap that applies to this call. */
  remainingUnits: number;
}

const hairMeasures: ReadonlySet<string> = new Set(['hair_type', 'hair_density', 'hair_length']);
// Tools that change what is on the head. Beard style and brows work on the face, so a covering does not stop them.
const changesTheHead: ReadonlySet<string> = new Set(['hairstyle', 'hair_volume', 'hair_color']);

/**
 * Decides, in the order of spec section 7, whether a tool may run. Rules 1 and 3 (live switch,
 * reuse of a recorded result) sit in the YouCam gateway, because they depend on the network mode
 * and the cache. A blocked tool is never a failure: the agent moves to the fallback.
 * @param cost Units the call is estimated to cost.
 */
export function toolEligibility(tool: MeasureTool | RenderTool, cost: number, context: EligibilityContext): Eligibility {
  if (context.blockedTools.has(tool)) return { allowed: false, reason: 'blocked_tool' };
  // Hair length cannot tell a covered head from a bald one, so the setting decides, not a measurement.
  if (context.headCovering && (changesTheHead.has(tool) || hairMeasures.has(tool))) {
    return { allowed: false, reason: 'blocked_head_covering' };
  }
  if (tool === 'beard_style' && context.templateKey !== 'beard_growth') {
    return { allowed: false, reason: 'blocked_not_allowed' };
  }
  if (tool === 'hair_volume' && !context.hasDensity) return { allowed: false, reason: 'blocked_not_allowed' };
  if (cost > context.remainingUnits) return { allowed: false, reason: 'blocked_budget' };
  return { allowed: true };
}

/**
 * The tools a strategy renders with, in the order to try them. Hat and scarf try on are not used
 * (spec section 7, rule 6), so cover has no tool, and hold renders nothing.
 */
export function strategyTools(strategy: Strategy, templateKey: TemplateKey): readonly RenderTool[] {
  switch (strategy) {
    case 'cut':
      return templateKey === 'beard_growth' ? ['beard_style'] : ['hairstyle'];
    case 'volume':
      return ['hair_volume'];
    case 'colour':
      return ['hair_color', 'makeup_brows'];
    case 'cover':
    case 'hold':
      return [];
  }
}

/** What to try when hair transfer is blocked or off: brow makeup, then earlier looks (spec section 7, rule 6). */
export const hairTransferFallback: readonly RenderTool[] = ['makeup_brows'];

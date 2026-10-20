// docs/product/spec.md section 10. Costs marked null are unconfirmed (verify in the spike).
// Confirmed against docs.perfectcorp.com on 2026-10-20 unless noted. Keys are tool names in youcam.tools.ts.
export const unitCosts: Record<string, number | null> = {
  hair_type: 2,
  hair_density: 1,
  hair_length: 2,
  hair_volume: 2,
  hair_color: 1,
  hairstyle: 2, // v2.1, preset and custom mode
  beard_style: 2,
  fitzpatrick: 10, // charged only when the task succeeds
  skin_tone: 20, // facial colour tones, charged only when the task succeeds
  face_shape: 10, // one feature; 6 to 14 features cost 20, 15 to 28 cost 30
  hat: 2,
  makeup_brows: 1, // charged only when the task succeeds
  cloth_v4: null, // v2.0 and v3.0 cost 2; v4.0 is not in the docs table
};

// Skin analysis is priced by the number of concerns and the tier: [max concerns, SD, HD].
export const skinAnalysisUnits = [
  [4, 9, 12],
  [8, 12, 16],
  [12, 14, 20],
  [16, 16, 22],
] as const;

// Documented limit: 250 requests per 300 seconds, per IP address and per access token (both
// must hold), and the docs advise about 5 requests per second.
export const rateLimit = { requests: 250, windowSeconds: 300, perSecond: 5 } as const;

export const defaultBaseUrl = 'https://yce-api-01.makeupar.com';

// Uploaded files and task results live 24 hours on the YouCam side.
export const youcamRetentionSeconds = 24 * 60 * 60;

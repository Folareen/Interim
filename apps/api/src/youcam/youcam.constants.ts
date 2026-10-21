/** Units per call, as Get_Feature_Cost lists them (docs/product/spec.md section 10). Keys are tool names in `youcam.tools.ts`. */
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
  makeup_brows: 1, // charged only when the task succeeds
  cloth_v4: 2,
  text_to_image: 1, // spike only
  image_to_image: 1, // spike only
};

/** Dollars per unit: 500 units cost 27.50 dollars. */
export const usdPerUnit = 0.055;

/** Skin analysis price by number of concerns and tier: [max concerns, SD, HD]. */
export const skinAnalysisUnits = [
  [4, 9, 12],
  [8, 12, 16],
  [12, 14, 20],
  [16, 16, 22],
] as const;

/** YouCam's limit: 250 requests per 300 seconds per IP address and per access token, about 5 a second advised. */
export const rateLimit = { requests: 250, windowSeconds: 300, perSecond: 5 } as const;

/** YouCam's API host. */
export const defaultBaseUrl = 'https://yce-api-01.makeupar.com';

/** Uploaded files and task results live 24 hours on YouCam's side. */
export const youcamRetentionSeconds = 24 * 60 * 60;

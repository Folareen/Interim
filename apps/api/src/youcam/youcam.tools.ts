import { z } from 'zod';

// One entry per YouCam tool Interim uses. Schemas come from YouCam's OpenAPI bundles, corrected
// where the live API differed. Requests are validated here because the planner chooses their
// parameters; `result` is what `data.results` holds on success.

const srcFile = z.object({ src_file_id: z.string().min(1) });
const singleUrl = z.object({ url: z.string().url() });
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// Angle limit of the face check, from `strict` (about 5 degrees) to `flexible` (30).
const faceAngleStrictness = z.enum(['strict', 'high', 'medium', 'low', 'flexible']);

// YouCam's own read of the photo, returned with the face analysers (values such as "good").
const faceQuality = z.object({
  has_face: z.boolean().optional(),
  area: z.string().optional(),
  frontal: z.string().optional(),
  lighting: z.string().optional(),
  faceangle: z.string().optional(),
});

const garmentCategory = z.enum(['full_body', 'lower_body', 'upper_body', 'shoes', 'auto', 'outer']);

// Brow effect of Makeup VTO. `name` must match a label in YouCam's eyebrows.json.
const browEffect = z.object({
  category: z.literal('eyebrows'),
  pattern: z.union([
    z.object({ type: z.literal('color') }),
    z.object({
      type: z.literal('shape'),
      name: z.string().min(1),
      curvature: z.number().int().min(-100).max(100).optional(),
      thickness: z.number().int().min(-100).max(100).optional(),
      definition: z.number().int().min(0).max(100).optional(),
    }),
  ]),
  palettes: z
    .array(z.object({ color: hex, colorIntensity: z.number().int().min(0).max(100), texture: z.literal('matte') }))
    .min(1),
});

const skinConcerns = [
  'wrinkle', 'droopy_upper_eyelid', 'droopy_lower_eyelid', 'firmness', 'acne', 'moisture', 'eye_bag',
  'dark_circle_v2', 'age_spot', 'radiance', 'redness', 'oiliness', 'pore', 'texture',
] as const;

const hairColorPresets = [
  'Jet Black',
  'Chocolate Brown',
  'Honey Blonde',
  'Platinum Blonde',
  'Ash Gray',
  'Rose Gold',
  'Burgundy',
  'Copper Red',
  'Lavender',
  'Teal Blue',
] as const;

const hairStyleSource = z.union([
  z.object({ template_id: z.string().min(1) }),
  z.object({ ref_file_id: z.string().min(1) }),
]);

export const tools = {
  // Three photos, in the order front, right, left.
  hair_type: {
    version: 'v2.0',
    path: 'hair-type-detection',
    request: z.object({ src_file_ids: z.tuple([z.string(), z.string(), z.string()]) }),
    result: z.object({
      hair_type: z.object({
        // The docs write the grades in lower case; the live API returned "4B to 4C".
        mapping: z
          .string()
          .transform((value) => value.toLowerCase())
          .pipe(
            z.enum([
              '1 to 2a',
              '2a to 2b',
              '2b to 2c',
              '2c to 3a',
              '3a to 3b',
              '3b to 3c',
              '3c to 4a',
              '4a to 4b',
              '4b to 4c',
            ]),
          ),
        term: z.string(),
      }),
    }),
  },
  // One front facing selfie with the head lowered about 45 degrees.
  hair_density: {
    version: 'v2.0',
    path: 'hair-density-detection',
    request: srcFile,
    result: z.object({
      hair_density: z.object({
        mapping: z.string(), // a float as a string; the docs say 0 to 3, the live API returned -0.06 too
        // The docs spell the first grade "Extremely"; the live API returned "Extreme". Both are accepted.
        term: z.enum(['Extreme Low Density', 'Extremely Low Density', 'Low Density', 'Medium Density', 'High Density']),
      }),
    }),
  },
  hair_length: {
    version: 'v2.0',
    path: 'hair-length-detection',
    request: srcFile,
    result: z.object({
      hair_length: z.object({
        term: z.enum([
          'above the ears',
          'ear length',
          'ear length or longer',
          'short hair',
          'short hair or longer',
          'above chest',
          'above chest or longer',
          'long hair',
        ]),
      }),
    }),
  },
  hair_color: {
    version: 'v2.0',
    path: 'hair-color',
    request: srcFile.extend({ preset: z.enum(hairColorPresets) }),
    result: singleUrl,
  },
  // Hair transfer v2.1. `hair_color: 'src'` keeps the person's own colour.
  hairstyle: {
    version: 'v2.1',
    path: 'hair-transfer',
    request: z.intersection(
      srcFile.extend({ hair_color: z.enum(['ref', 'src']).default('ref') }),
      hairStyleSource,
    ),
    result: singleUrl,
  },
  hair_volume: {
    version: 'v2.0',
    path: 'hair-vol',
    request: srcFile.extend({ template_id: z.string().min(1) }),
    result: singleUrl,
  },
  beard_style: {
    version: 'v2.0',
    path: 'beard-style',
    request: srcFile.extend({ template_id: z.string().min(1) }),
    result: singleUrl,
  },
  fitzpatrick: {
    version: 'v2.0',
    path: 'fitzpatrick-scale-analyzer',
    request: srcFile.extend({ version: z.literal('1.0') }), // required, though the docs page omits it
    result: z.object({ fitzpatrick_scale: z.enum(['I', 'II', 'III', 'IV', 'V', 'VI']) }),
  },
  // Only `skin_color` is reliable: the eye and hair colour names change with the light.
  skin_tone: {
    version: 'v2.0',
    path: 'skin-tone-analysis',
    request: srcFile.extend({ face_angle_strictness_level: faceAngleStrictness.optional() }),
    result: z.object({
      face_quality: faceQuality.optional(),
      color: z.object({
        skin_color: hex,
        eye_color: z.string().optional(),
        eye_color_name: z.string().optional(),
        eyebrow_color: z.string().optional(),
        lip_color: z.string().optional(),
        hair_color: z.string().optional(),
        hair_color_name: z.string().optional(),
      }),
    }),
  },
  // Face shape and aspect ratio only: the analyser can also return age and gender, which Interim
  // never requests (overview, Language and safety rules).
  face_shape: {
    version: 'v2.0',
    path: 'face-attr-analysis',
    request: srcFile.extend({
      features: z.array(z.enum(['faceShape', 'faceAspectRatio'])).min(1).max(2),
      face_angle_strictness_level: faceAngleStrictness.optional(),
    }),
    result: z.object({
      face_quality: faceQuality.optional(),
      faceshape: z
        .enum(['Triangle', 'Diamond', 'Heart', 'InvTriangle', 'Oblong', 'Oval', 'Round', 'Square', 'Unknown'])
        .optional(),
      // `[1, ratio]`: the second number is the face's height for a width of one. The one tracked for fullness.
      facialratio: z.object({ face_aspect_ratio: z.tuple([z.number(), z.number()]) }).optional(),
    }),
  },
  // Priced by concern count and tier (`skinAnalysisUnits`). Capped at four SD concerns, the 9 unit tier,
  // so `unitCosts` can hold one price. The price list gives v2.1 for the path; the docs page says v2.0.
  // The face must be tight and near frontal (docs/integrations/youcam.md, Observed live).
  skin_analysis: {
    version: 'v2.1',
    path: 'skin-analysis',
    request: srcFile.extend({
      dst_actions: z.array(z.enum(skinConcerns)).min(1).max(4),
    }),
    result: singleUrl, // a zip of per concern masks and a score_info.json; reading it is not built
  },
  // Keeps the person's face, pose and background and changes only the garment.
  cloth_v4: {
    version: 'v2.0',
    path: 'cloth-v4',
    request: srcFile.extend({
      ref_file_id: z.string().min(1),
      garment_category: garmentCategory,
      change_shoes: z.boolean().optional(),
      filter_multi_person: z.enum(['off', 'normal', 'strict']).optional(),
    }),
    result: singleUrl,
  },
  // The docs show the result as `{ url }` and as a list of `{ download_url }`; the live API always returned `{ url }`.
  makeup_brows: {
    version: 'v2.0',
    path: 'makeup-vto',
    request: srcFile.extend({ effects: z.tuple([browEffect]) }),
    result: singleUrl,
  },
  // The next two make synthetic test photos for the spike runner. The product never calls them.
  // `size` is width*height; text to image accepts only five sizes.
  text_to_image: {
    version: 'v2.0',
    path: 'text-to-image/youcam',
    request: z.object({
      model: z.literal('youcam-image-v2'),
      prompt: z.string().min(1).max(800),
      negative_prompt: z.string().min(1).max(500).optional(),
      size: z.enum(['1664*928', '1472*1104', '1328*1328', '1104*1472', '928*1664']).optional(),
      prompt_extend: z.boolean().optional(),
    }),
    result: singleUrl,
  },
  image_to_image: {
    version: 'v2.0',
    path: 'image-to-image/youcam',
    request: z.object({
      src_file_ids: z.array(z.string().min(1)).min(1).max(3),
      model: z.literal('youcam-image-v2'),
      prompt: z.string().min(1).max(800),
      negative_prompt: z.string().min(1).max(500).optional(),
      size: z.string().regex(/^\d{3,4}\*\d{3,4}$/).optional(),
      prompt_extend: z.boolean().optional(),
    }),
    result: singleUrl,
  },
} as const;

export type ToolName = keyof typeof tools;

/** The names in `tools`, for checking input. */
export const toolNames = Object.keys(tools) as ToolName[];
export type ToolRequest<T extends ToolName> = z.input<(typeof tools)[T]['request']>;
export type ToolResult<T extends ToolName> = z.infer<(typeof tools)[T]['result']>;

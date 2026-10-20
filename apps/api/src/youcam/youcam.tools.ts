import { z } from 'zod';

// One entry per YouCam tool Interim uses: where it lives, what it takes and what comes back.
// Source: the OpenAPI bundles at docs.perfectcorp.com/_bundle/reference, read 2026-10-20.
// Request bodies are validated here because the planner chooses their parameters.
// The result is what `data.results` holds when the task status is `success`.

const srcFile = z.object({ src_file_id: z.string().min(1) });
const singleUrl = z.object({ url: z.string().url() });
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// How strict the face angle check is, from `strict` (4 to 6 degrees) to `flexible` (30 degrees).
const faceAngleStrictness = z.enum(['strict', 'high', 'medium', 'low', 'flexible']);

// Returned with the face analysers. YouCam's own read of the photo, such as "good".
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
  // Three photos in the order front, right, left. Short side at least 320 px, jpg or png.
  hair_type: {
    version: 'v2.0',
    path: 'hair-type-detection',
    request: z.object({ src_file_ids: z.tuple([z.string(), z.string(), z.string()]) }),
    result: z.object({
      hair_type: z.object({
        mapping: z.enum([
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
        mapping: z.string(), // a float as a string, 0 to 3
        term: z.enum(['Extremely Low Density', 'Low Density', 'Medium Density', 'High Density']),
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
  // Fields beyond template_id are not documented; this follows the template list flow.
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
    request: srcFile,
    result: z.object({ fitzpatrick_scale: z.enum(['I', 'II', 'III', 'IV', 'V', 'VI']) }),
  },
  // Facial colour tones: hex colours of skin, eyes, brows, lips and hair. 20 units, charged only
  // on success. One front photo, hair worn down, face width over 60 percent of the image.
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
  // Only face shape is allowed. The analyser can also return age and gender, which Interim never
  // asks for (docs/product/overview.md, Language and safety rules). 10 units for 1 to 5 features.
  face_shape: {
    version: 'v2.0',
    path: 'face-attr-analysis',
    request: srcFile.extend({
      features: z.tuple([z.literal('faceShape')]),
      face_angle_strictness_level: faceAngleStrictness.optional(),
    }),
    result: z.object({
      face_quality: faceQuality.optional(),
      faceshape: z
        .enum(['Triangle', 'Diamond', 'Heart', 'InvTriangle', 'Oblong', 'Oval', 'Round', 'Square', 'Unknown'])
        .optional(),
    }),
  },
  // Clothes try on v4. The cost is not in the docs table; read it with Get_Feature_Cost. The docs
  // disagree on whether the person photo is full body or chest up (docs/product/spec.md section 17).
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
  // Hat try on, 2 units. YouCam requires a gender of female or male, which Interim does not ask
  // for, so the caller must decide what to send (docs/product/spec.md section 17). The docs do
  // not say whether it works on bald or very short hair.
  hat: {
    version: 'v2.0',
    path: 'hat',
    request: srcFile.extend({ ref_file_id: z.string().min(1), gender: z.enum(['female', 'male']) }),
    result: singleUrl,
  },
  // Brow makeup, the fallback when hair tools are blocked. 1 unit. The docs show the result both
  // as `{ url }` and as a list of `{ download_url }`; both parse until the spike settles which.
  makeup_brows: {
    version: 'v2.0',
    path: 'makeup-vto',
    request: srcFile.extend({ effects: z.tuple([browEffect]) }),
    result: z.union([
      singleUrl,
      z.array(z.object({ download_url: z.string().url() })).min(1),
    ]),
  },
} as const;

export type ToolName = keyof typeof tools;
export const toolNames = Object.keys(tools) as ToolName[];
export type ToolRequest<T extends ToolName> = z.input<(typeof tools)[T]['request']>;
export type ToolResult<T extends ToolName> = z.infer<(typeof tools)[T]['result']>;

import { z } from 'zod';

// One entry per YouCam tool Interim uses: where it lives, what it takes and what comes back.
// Source: the OpenAPI bundles at docs.perfectcorp.com/_bundle/reference, read 2026-10-20.
// Request bodies are validated here because the planner chooses their parameters.
// The result is what `data.results` holds when the task status is `success`.

const srcFile = z.object({ src_file_id: z.string().min(1) });
const singleUrl = z.object({ url: z.string().url() });

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
} as const;

export type ToolName = keyof typeof tools;
export const toolNames = Object.keys(tools) as ToolName[];
export type ToolRequest<T extends ToolName> = z.input<(typeof tools)[T]['request']>;
export type ToolResult<T extends ToolName> = z.infer<(typeof tools)[T]['result']>;

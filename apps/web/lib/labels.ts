import { messages } from '@interim/templates';

/** A stage with a name in the catalogs. Stage keys are internal and never shown as they are. */
export type StageKey = keyof (typeof messages)['en']['stages'];
/** A tool with a name in the catalogs. */
export type ToolKey = keyof (typeof messages)['en']['tools'];

/** A catalog piece with a name in the catalogs. */
export type GarmentKey = keyof (typeof messages)['en']['garments'];

/** A preview look with a name in the catalogs. */
export type LookKey = keyof (typeof messages)['en']['looks'];

/** Whether a key from the API names a stage the catalogs know. */
export const isStageKey = (key: string): key is StageKey => key in messages.en.stages;

/** Whether a key from the API names a tool the catalogs know. */
export const isToolKey = (key: string): key is ToolKey => key in messages.en.tools;

/** Whether a sku from the API names a piece the catalogs know. */
export const isGarmentKey = (sku: string): sku is GarmentKey => sku in messages.en.garments;

/** Whether a look id from the API names a look the catalogs know. */
export const isLookKey = (id: string): id is LookKey => id in messages.en.looks;

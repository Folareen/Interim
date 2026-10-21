import { messages } from '@interim/templates';

/** A stage with a name in the catalogs. Stage keys are internal and never shown as they are. */
export type StageKey = keyof (typeof messages)['en']['stages'];
/** A tool with a name in the catalogs. */
export type ToolKey = keyof (typeof messages)['en']['tools'];

/** Whether a key from the API names a stage the catalogs know. */
export const isStageKey = (key: string): key is StageKey => key in messages.en.stages;

/** Whether a key from the API names a tool the catalogs know. */
export const isToolKey = (key: string): key is ToolKey => key in messages.en.tools;

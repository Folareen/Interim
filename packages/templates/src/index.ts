import type { TemplateKey } from '@interim/types';

export interface Template {
  key: TemplateKey;
  label: string;
  stages: readonly string[];
  checkInEveryDays: number;
  sensitive: boolean;
  usesFit: boolean;
  /** Whether a new profile starts with body photos on. The person can switch it either way at any time. */
  bodyPhotosByDefault: boolean;
  unitBudgetPerRun: number;
  version: number;
  remeasureEvery: number;
}

// Labels follow docs/product/overview.md. Stage keys are internal and never shown. Stage thresholds are tuned in the spike.
export const templates: Record<TemplateKey, Template> = {
  hair_loss_ahead: {
    key: 'hair_loss_ahead',
    label: 'Hair loss ahead',
    stages: ['full', 'thinning', 'short', 'none', 'growing_in'],
    checkInEveryDays: 14,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  hair_patches: {
    key: 'hair_patches',
    label: 'Hair coming out in patches',
    stages: ['full', 'patchy', 'widespread', 'growing_in'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  face_fullness: {
    key: 'face_fullness',
    label: 'Face shape changing',
    stages: ['usual', 'fuller', 'settling'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: true,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  // Body photos start off: scars, drains and a changed shape are the most private change Interim sees.
  after_surgery: {
    key: 'after_surgery',
    label: 'Body changed after surgery',
    stages: ['recovering', 'settling', 'settled'],
    checkInEveryDays: 21,
    sensitive: true,
    usesFit: true,
    bodyPhotosByDefault: false,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  skin_colour: {
    key: 'skin_colour',
    label: 'Skin colour changing',
    stages: ['usual', 'changing', 'settled'],
    checkInEveryDays: 45,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  weight_change: {
    key: 'weight_change',
    label: 'Weight change',
    stages: ['baseline_size', 'size_down_one', 'size_down_two', 'stable'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: true,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  midlife_change: {
    key: 'midlife_change',
    label: 'Midlife change',
    stages: ['full', 'thinning', 'sparse'],
    checkInEveryDays: 60,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  after_a_baby: {
    key: 'after_a_baby',
    label: 'After a baby',
    stages: ['full', 'shedding', 'growing_in'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  going_grey: {
    key: 'going_grey',
    label: 'Going grey',
    stages: ['mostly_coloured', 'mixed', 'mostly_grey'],
    checkInEveryDays: 45,
    sensitive: false,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  textured_growth: {
    key: 'textured_growth',
    label: 'Growing out textured hair',
    stages: ['very_short', 'short', 'chin_length', 'shoulder_length'],
    checkInEveryDays: 45,
    sensitive: false,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
  beard_growth: {
    key: 'beard_growth',
    label: 'Growing a beard',
    stages: ['clean', 'stubble', 'short', 'full'],
    checkInEveryDays: 14,
    sensitive: false,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
  },
};

export * from './companion';
export * from './words';

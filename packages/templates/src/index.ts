import type { MeasureTool, Placement, Strategy, TemplateKey } from '@interim/types';

/** One situation: its stages, cadence and flags (docs/product/spec.md section 4). */
export interface Template {
  key: TemplateKey;
  stages: readonly string[];
  checkInEveryDays: number;
  sensitive: boolean;
  usesFit: boolean;
  /** Whether a new profile starts with body photos on. The person can switch it either way at any time. */
  bodyPhotosByDefault: boolean;
  unitBudgetPerRun: number;
  version: number;
  remeasureEvery: number;
  /** The measurements followed over time, once the baseline has taken them all. */
  tracks: readonly MeasureTool[];
  /** How a stage is placed (docs/product/spec.md section 6). Thresholds are tuned in the spike. */
  placement: Placement;
  /** The strategies the agent may choose in each stage. */
  strategies: Readonly<Record<string, readonly Strategy[]>>;
}

/** Every situation by key. Labels live in `copy`. Stage keys are internal and never shown, and stage thresholds are tuned in the spike. */
export const templates: Record<TemplateKey, Template> = {
  hair_loss_ahead: {
    key: 'hair_loss_ahead',
    stages: ['full', 'thinning', 'short', 'none', 'growing_in'],
    checkInEveryDays: 14,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: ['hair_density', 'hair_length'],
    placement: {
      by: 'density',
      bands: [
        { minDrop: 1.8, stage: 'none' },
        { minDrop: 0.7, stage: 'thinning' },
      ],
      recovery: { minRise: 0.7, stage: 'growing_in' },
    },
    strategies: {
      full: ['cut', 'colour', 'hold'],
      thinning: ['volume', 'cut', 'colour'],
      short: ['cut', 'colour', 'hold'],
      none: ['cut', 'colour', 'hold'],
      growing_in: ['cut', 'colour', 'hold'],
    },
  },
  hair_patches: {
    key: 'hair_patches',
    stages: ['full', 'patchy', 'widespread', 'growing_in'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: ['hair_density'],
    placement: {
      by: 'density',
      bands: [
        { minDrop: 1.5, stage: 'widespread' },
        { minDrop: 0.7, stage: 'patchy' },
      ],
      recovery: { minRise: 0.7, stage: 'growing_in' },
    },
    strategies: {
      full: ['cut', 'colour', 'hold'],
      patchy: ['volume', 'cut', 'colour'],
      widespread: ['cut', 'colour', 'hold'],
      growing_in: ['cut', 'colour', 'hold'],
    },
  },
  face_fullness: {
    key: 'face_fullness',
    stages: ['usual', 'fuller', 'settling'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: true,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: ['face_shape'],
    placement: { by: 'reported_change' },
    strategies: {
      usual: ['cut', 'colour', 'hold'],
      fuller: ['cut', 'colour', 'hold'],
      settling: ['cut', 'colour', 'hold'],
    },
  },
  // Body photos start off: scars, drains and a changed shape are the most private change Interim sees.
  after_surgery: {
    key: 'after_surgery',
    stages: ['recovering', 'settling', 'settled'],
    checkInEveryDays: 21,
    sensitive: true,
    usesFit: true,
    bodyPhotosByDefault: false,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: [],
    placement: { by: 'reported_change' },
    strategies: {
      recovering: ['colour', 'hold'],
      settling: ['cut', 'colour', 'hold'],
      settled: ['cut', 'colour', 'hold'],
    },
  },
  skin_colour: {
    key: 'skin_colour',
    stages: ['usual', 'changing', 'settled'],
    checkInEveryDays: 45,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: ['skin_tone'],
    placement: {
      by: 'skin_colour',
      bands: [{ minChange: 8, stage: 'changing' }],
      settled: 'settled',
    },
    strategies: {
      usual: ['cut', 'colour', 'hold'],
      changing: ['cut', 'colour', 'hold'],
      settled: ['cut', 'colour', 'hold'],
    },
  },
  weight_change: {
    key: 'weight_change',
    // Either direction: gaining or losing, on purpose or not. Placed from the reported size.
    stages: ['usual_size', 'one_size_away', 'two_sizes_away', 'settled'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: true,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 2,
    remeasureEvery: 3,
    tracks: [],
    placement: {
      by: 'reported_size',
      steps: ['usual_size', 'one_size_away', 'two_sizes_away'],
      settled: 'settled',
    },
    strategies: {
      usual_size: ['cut', 'colour', 'hold'],
      one_size_away: ['cut', 'colour', 'hold'],
      two_sizes_away: ['cut', 'colour', 'hold'],
      settled: ['cut', 'colour', 'hold'],
    },
  },
  midlife_change: {
    key: 'midlife_change',
    stages: ['full', 'thinning', 'sparse'],
    checkInEveryDays: 60,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: ['hair_density'],
    placement: {
      by: 'density',
      bands: [
        { minDrop: 1.5, stage: 'sparse' },
        { minDrop: 0.7, stage: 'thinning' },
      ],
      recovery: { minRise: 0.7, stage: 'full' },
    },
    strategies: {
      full: ['cut', 'colour', 'hold'],
      thinning: ['volume', 'cut', 'colour'],
      sparse: ['volume', 'cut', 'colour'],
    },
  },
  after_a_baby: {
    key: 'after_a_baby',
    stages: ['full', 'shedding', 'growing_in'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: ['hair_density'],
    placement: {
      by: 'density',
      bands: [{ minDrop: 0.7, stage: 'shedding' }],
      recovery: { minRise: 0.7, stage: 'growing_in' },
    },
    strategies: {
      full: ['cut', 'colour', 'hold'],
      shedding: ['volume', 'cut', 'colour'],
      growing_in: ['cut', 'colour', 'hold'],
    },
  },
  going_grey: {
    key: 'going_grey',
    stages: ['mostly_coloured', 'mixed', 'mostly_grey'],
    checkInEveryDays: 45,
    sensitive: false,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: [],
    placement: { by: 'reported_change' },
    strategies: {
      mostly_coloured: ['cut', 'colour', 'hold'],
      mixed: ['cut', 'colour', 'hold'],
      mostly_grey: ['cut', 'colour', 'hold'],
    },
  },
  textured_growth: {
    key: 'textured_growth',
    stages: ['very_short', 'short', 'chin_length', 'shoulder_length'],
    checkInEveryDays: 45,
    sensitive: false,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: ['hair_length'],
    placement: {
      by: 'length',
      stages: {
        'above the ears': 'very_short',
        'ear length': 'short',
        'ear length or longer': 'short',
        'short hair': 'chin_length',
        'short hair or longer': 'chin_length',
        'above chest': 'shoulder_length',
        'above chest or longer': 'shoulder_length',
        'long hair': 'shoulder_length',
      },
    },
    strategies: {
      very_short: ['cut', 'colour', 'hold'],
      short: ['cut', 'colour', 'hold'],
      chin_length: ['cut', 'colour', 'hold'],
      shoulder_length: ['cut', 'colour', 'hold'],
    },
  },
  beard_growth: {
    key: 'beard_growth',
    stages: ['clean', 'stubble', 'short', 'full'],
    checkInEveryDays: 14,
    sensitive: false,
    usesFit: false,
    bodyPhotosByDefault: true,
    unitBudgetPerRun: 50,
    version: 1,
    remeasureEvery: 3,
    tracks: [],
    placement: { by: 'reported_change' },
    strategies: {
      clean: ['cut', 'colour', 'hold'],
      stubble: ['cut', 'colour', 'hold'],
      short: ['cut', 'colour', 'hold'],
      full: ['cut', 'colour', 'hold'],
    },
  },
};

export * from './copy';
export * from './looks';
export * from './words';
export * from './display';

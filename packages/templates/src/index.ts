import type { TemplateKey } from '@interim/types';

export interface Template {
  key: TemplateKey;
  label: string;
  stages: readonly string[];
  checkInEveryDays: number;
  sensitive: boolean;
  usesFit: boolean;
  unitBudgetPerRun: number;
}

// Labels follow docs/product/spec.md section 13. Stage thresholds are tuned in the spike.
export const templates: Record<TemplateKey, Template> = {
  weight_change: {
    key: 'weight_change',
    label: 'Weight change',
    stages: ['baseline_size', 'size_down_one', 'size_down_two', 'stable'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: true,
    unitBudgetPerRun: 50,
  },
  midlife_change: {
    key: 'midlife_change',
    label: 'Midlife change',
    stages: ['full', 'thinning', 'sparse'],
    checkInEveryDays: 60,
    sensitive: true,
    usesFit: false,
    unitBudgetPerRun: 50,
  },
  after_a_baby: {
    key: 'after_a_baby',
    label: 'After a baby',
    stages: ['full', 'shedding', 'regrowing'],
    checkInEveryDays: 30,
    sensitive: true,
    usesFit: false,
    unitBudgetPerRun: 50,
  },
  going_grey: {
    key: 'going_grey',
    label: 'Going grey',
    stages: ['mostly_coloured', 'mixed', 'mostly_grey'],
    checkInEveryDays: 45,
    sensitive: false,
    usesFit: false,
    unitBudgetPerRun: 50,
  },
  textured_growth: {
    key: 'textured_growth',
    label: 'Growing out textured hair',
    stages: ['very_short', 'short', 'chin_length', 'shoulder_length'],
    checkInEveryDays: 45,
    sensitive: false,
    usesFit: false,
    unitBudgetPerRun: 50,
  },
  beard_growth: {
    key: 'beard_growth',
    label: 'Growing a beard',
    stages: ['clean', 'stubble', 'short', 'full'],
    checkInEveryDays: 14,
    sensitive: false,
    usesFit: false,
    unitBudgetPerRun: 50,
  },
  hair_loss_ahead: {
    key: 'hair_loss_ahead',
    label: 'Hair loss ahead',
    stages: ['full', 'thinning', 'short', 'none', 'regrowing'],
    checkInEveryDays: 14,
    sensitive: true,
    usesFit: false,
    unitBudgetPerRun: 50,
  },
};

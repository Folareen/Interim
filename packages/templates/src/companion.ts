import type { Moment, Tone } from '@interim/types';

// docs/product/overview.md (The companion) owns the shape: notice, normalise, one thing for today.

/** Companion note used when model text fails its checks twice (docs/product/spec.md section 8). */
export const companionFallback: Record<Tone, string> = {
  practical: 'Here’s what changed since last time, and a few options for what’s coming up.',
  warm: 'Things look a little different this time, and that’s a normal part of this stage. Here are a few looks that still feel like you, for whatever is coming up.',
  light: 'New check in, new options. Here are a few looks to try for what’s coming up.',
};

// Explain briefly, reassure, then move the conversation on: the pattern visible difference
// charities teach for when someone stares or asks. The app shows them in quotes.
/** Lines the person can use when someone asks. Empty for moments without other people. */
export const whatToSay: Record<Moment, readonly string[]> = {
  back_to_work: [
    'I’ve had some changes this year. I’m glad to be back.',
    'Thanks for asking. I’d rather talk about work today.',
    'It’s a long story. What did I miss?',
  ],
  family_event: [
    'Yes, my hair’s different. It’s so good to see you.',
    'I’ll tell you about it another time. How have you been?',
  ],
  date: [
    'Things have changed for me lately. I’m happy to talk about it another time.',
    'I’d rather hear about you first.',
  ],
  photos: ['Can we take one more? I want to pick my favourite.', 'Can I see it before it goes up?'],
  video_call: ['New look this month. Shall we get started?'],
  going_out: [
    'It’s a change I’m still getting used to. Anyway, what are we having?',
    'I’d rather not get into it today.',
  ],
  everyday: [],
};

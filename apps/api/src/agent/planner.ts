import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { env } from '../config/env';

/** Stub: the real planner receives only eligible tools and measurements, never photos (docs/agent.md, docs/llm.md). */
export async function planStrategy(prompt: string) {
  const { text } = await generateText({ model: google(env.LLM_MODEL), prompt });
  return text;
}

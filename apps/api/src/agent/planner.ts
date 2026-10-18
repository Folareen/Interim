import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { env } from '../config/env';

// Planner stub. The real planner receives only eligible tools and measurement
// records (never raw photos). See docs/agent.md and docs/llm.md.
export async function planStrategy(prompt: string) {
  const { text } = await generateText({ model: google(env.LLM_MODEL), prompt });
  return text;
}

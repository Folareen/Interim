'use client';

import { type RunView, runViewSchema } from '@interim/types';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Actions } from '@/components/actions';
import { primaryClass, secondaryClass } from '@/components/button';
import { Notice } from '@/components/notice';
import { PageHeading } from '@/components/page-heading';
import { fetchRun } from '@/lib/api';
import { isToolKey } from '@/lib/labels';

const POLL_MS = 2000;

/**
 * Shows what the agent is doing as it does it, one short line per step. It listens to the run's
 * event stream, and asks for its state every two seconds if the stream is not available.
 */
export function RunProgress({ initial }: { initial: RunView }) {
  const t = useTranslations('run');
  const trace = useTranslations('trace');
  const tools = useTranslations('tools');
  const problems = useTranslations('photoProblems');
  const router = useRouter();
  const [run, setRun] = useState(initial);

  useEffect(() => {
    if (run.status === 'done' || run.status === 'failed') return;
    let closed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const apply = (next: RunView) => !closed && setRun(next);

    const source = new EventSource(`/api/runs/${initial.id}/events`);
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = runViewSchema.safeParse(JSON.parse(event.data));
      if (parsed.success) apply(parsed.data);
    };
    source.onerror = () => {
      // The stream is down: fall back to asking, and stop trying to reconnect.
      source.close();
      timer ??= setInterval(() => void fetchRun(initial.id).then(apply, () => undefined), POLL_MS);
    };
    return () => {
      closed = true;
      source.close();
      if (timer) clearInterval(timer);
    };
  }, [initial.id, run.status]);

  useEffect(() => {
    if (run.cardId) router.replace(`/cards/${run.cardId}`);
    if (run.styleRequestId && run.status === 'done')
      router.replace(`/style/${run.profileId}/results/${run.styleRequestId}`);
  }, [run.cardId, run.styleRequestId, run.status, run.profileId, router]);

  const failed = run.status === 'failed';
  const failure = run.stopReason === 'not_recorded' ? t('failedNotRecorded') : t('failedError');
  const style = useTranslations('style');
  const isStyle = run.styleRequestId !== null;
  let heading: { title: string; intro?: string } = { title: t('title'), intro: t('intro') };
  if (isStyle) heading = { title: style('runTitle'), intro: style('runIntro') };
  if (failed) heading = { title: t('failedTitle') };
  return (
    <div className="flex flex-1 flex-col">
      <PageHeading title={heading.title} intro={heading.intro} />
      {failed && (
        <div className="mt-6 space-y-3">
          {run.retake ? (
            <>
              <p>{t('failedRetake')}</p>
              <Notice>{problems(run.retake)}</Notice>
            </>
          ) : (
            <Notice>{failure}</Notice>
          )}
        </div>
      )}

      <section className="mt-8 pb-8">
        <h2 className="text-[1.25rem]">{t('stepsTitle')}</h2>
        <ol className="mt-3 space-y-2" aria-live="polite">
          {run.trace.map((line) => (
            <li key={line.seq} className="border-l-2 border-accent pl-4">
              {trace(line.reason, { tool: line.tool && isToolKey(line.tool) ? tools(line.tool) : '' })}
            </li>
          ))}
        </ol>
        {!failed && (
          <p role="status" className="mt-4 text-muted">
            {t('working')}
          </p>
        )}
      </section>

      {failed && run.styleRequestId && (
        <Actions>
          <Link href={`/style/${run.profileId}`} className={primaryClass}>
            {style('tryOthers')}
          </Link>
        </Actions>
      )}
      {failed && !run.styleRequestId && (
        <Actions>
          <Link href={`/capture/${run.profileId}`} className={run.retake ? primaryClass : secondaryClass}>
            {t('retakeAction')}
          </Link>
          <Link href={`/ready/${run.profileId}`} className={secondaryClass}>
            {t('profileAction')}
          </Link>
        </Actions>
      )}
    </div>
  );
}

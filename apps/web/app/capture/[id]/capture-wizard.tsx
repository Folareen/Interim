'use client';

import {
  type CapturePlan,
  type CaptureProblem,
  type ChangeReport,
  type LiveLocale,
  type Moment,
  type PhotoKind,
  type Size,
  momentSchema,
  sizeLadder,
} from '@interim/types';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button, secondaryClass } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { Notice } from '@/components/notice';
import { ApiError, createSnapshot, createUploads, putPhoto, startRun } from '@/lib/api';
import { type KitMode, openCameraKit } from '@/lib/camera-kit';
import { checkPhoto } from '@/lib/photo-check';

type Step = { type: 'photo'; kind: PhotoKind; optional: boolean } | { type: 'questions' } | { type: 'review' };
type Photos = Partial<Record<PhotoKind, { blob: Blob; url: string }>>;

// The hair type capture takes the front and both sides in one go, in this order.
const hairTypeOrder: PhotoKind[] = ['front', 'right', 'left'];
const changes: ChangeReport[] = ['none', 'some', 'lot'];

// The kit takes the front and both sides together for the first set, a front selfie later, and the top
// with the head lowered. The side and body photos come from the file input.
function kitModeFor(kind: PhotoKind, isBaseline: boolean): KitMode | undefined {
  if (kind === 'top') return 'hairdensity';
  if (kind !== 'front') return undefined;
  return isBaseline ? 'hairtype' : 'shadefinder';
}

/**
 * The capture wizard: one photo at a time, then the check in questions, then a review. Each photo
 * is checked on the device before it is kept, and nothing is uploaded until the person sends. The
 * server checks every photo again, so these checks only save a round trip.
 */
export function CaptureWizard({ profileId, plan, locale }: { profileId: string; plan: CapturePlan; locale: LiveLocale }) {
  const t = useTranslations('capture');
  const problems = useTranslations('photoProblems');
  const common = useTranslations('common');
  const router = useRouter();

  const steps: Step[] = [
    ...plan.required.map((kind): Step => ({ type: 'photo', kind, optional: false })),
    ...plan.optional.map((kind): Step => ({ type: 'photo', kind, optional: true })),
    { type: 'questions' },
    { type: 'review' },
  ];
  const photoSteps = steps.filter((s) => s.type === 'photo').length;

  const [index, setIndex] = useState(0);
  const [photos, setPhotos] = useState<Photos>({});
  const [problem, setProblem] = useState<CaptureProblem>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState<'checking' | 'camera' | 'sending'>();
  const [changed, setChanged] = useState<ChangeReport>();
  const [size, setSize] = useState<Size>();
  const [moment, setMoment] = useState<Moment | 'none'>('none');
  const closeKit = useRef<() => void>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const urls = useRef<string[]>([]);

  const step: Step = steps[index] ?? { type: 'review' };

  // Move focus to the new step's heading, so a screen reader announces where it is.
  useEffect(() => heading.current?.focus(), [index]);
  useEffect(
    () => () => {
      closeKit.current?.();
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  function keep(entries: [PhotoKind, Blob][]) {
    const added: Photos = {};
    for (const [kind, blob] of entries) {
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      added[kind] = { blob, url };
    }
    setPhotos((current) => ({ ...current, ...added }));
    return { ...photos, ...added };
  }

  // Steps are already in order, so the next one is the next photo not yet taken, or the questions.
  function advance(from: Photos) {
    const next = steps.findIndex((s, i) => i > index && (s.type !== 'photo' || !from[s.kind]));
    setIndex(next === -1 ? steps.length - 1 : next);
  }

  async function accept(entries: [PhotoKind, Blob][]) {
    setBusy('checking');
    setProblem(undefined);
    for (const [, blob] of entries) {
      const found = await checkPhoto(blob);
      if (found) {
        setProblem(found);
        setBusy(undefined);
        return;
      }
    }
    advance(keep(entries));
    setBusy(undefined);
  }

  function openKit(mode: KitMode, kinds: PhotoKind[]) {
    setBusy('camera');
    setMessage(undefined);
    setProblem(undefined);
    closeKit.current = openCameraKit(mode, locale, {
      onPhotos: (captured) => {
        closeKit.current?.();
        closeKit.current = undefined;
        void accept(kinds.flatMap((kind, i) => (captured[i] ? [[kind, captured[i]] as [PhotoKind, Blob]] : [])));
      },
      onFailure: (reason) => {
        closeKit.current?.();
        closeKit.current = undefined;
        setBusy(undefined);
        setMessage(t(reason === 'permission' ? 'cameraBlocked' : 'cameraUnavailable'));
      },
      onClosed: () => setBusy((current) => (current === 'camera' ? undefined : current)),
    });
  }

  function retake(kind: PhotoKind) {
    setPhotos((current) => ({ ...current, [kind]: undefined }));
    setProblem(undefined);
    setIndex(steps.findIndex((s) => s.type === 'photo' && s.kind === kind));
  }

  const missingRequired = plan.required.find((kind) => !photos[kind]);
  const answered = (!plan.asksChange || changed !== undefined) && (!plan.asksSize || size !== undefined);

  async function send() {
    setBusy('sending');
    setProblem(undefined);
    setMessage(undefined);
    const entries = (Object.keys(photos) as PhotoKind[]).flatMap((kind) => {
      const photo = photos[kind];
      return photo ? [{ kind, blob: photo.blob }] : [];
    });
    try {
      const { uploads } = await createUploads(profileId, { uploads: entries.map((e) => ({ kind: e.kind, sizeBytes: e.blob.size })) });
      await Promise.all(
        uploads.map((upload) => {
          const entry = entries.find((e) => e.kind === upload.kind);
          if (!entry) throw new Error(`No photo for ${upload.kind}`);
          return putPhoto(upload.url, entry.blob);
        }),
      );
      const snapshotId = await createSnapshot(profileId, {
        uploads: uploads.map((u) => ({ uploadId: u.uploadId, kind: u.kind })),
        moment: moment === 'none' ? undefined : moment,
        selfReport: changed ? { changed, reportedSize: size } : undefined,
      });
      const run = await startRun(snapshotId);
      router.push(`/runs/${run.id}`);
    } catch (cause) {
      setBusy(undefined);
      if (cause instanceof ApiError && cause.problem) {
        setProblem(cause.problem.code);
        const { kind } = cause.problem;
        if (kind) retake(kind);
        return;
      }
      if (cause instanceof ApiError && cause.status === 403) return router.push(`/consent/${profileId}`);
      setMessage(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
    }
  }

  if (step.type === 'photo') {
    const kind = step.kind;
    const photo = photos[kind];
    const mode = kitModeFor(kind, plan.isBaseline);
    const kitKinds = mode === 'hairtype' ? hairTypeOrder : [kind];
    const position = steps.slice(0, index + 1).filter((s) => s.type === 'photo').length;
    return (
      <div className="flex flex-1 flex-col">
        <div className="mt-8 flex-1 space-y-5 pb-8">
          <p className="text-[0.9rem] text-muted">{t('photoOf', { current: position, total: photoSteps })}</p>
          <h2 ref={heading} tabIndex={-1} className="text-[1.5rem] outline-none">
            {t(`kinds.${kind}.title`)}
          </h2>
          <p>{t(`kinds.${kind}.help`)}</p>
          {problem && <Notice>{problems(problem)}</Notice>}
          {message && <Notice>{message}</Notice>}
          {busy === 'camera' && <div id="YMK-module" className="mx-auto w-full overflow-hidden rounded-card" />}
          {busy === 'checking' && <p role="status">{t('checking')}</p>}
          {photo && (
            <img src={photo.url} alt={t('photoAlt', { kind: t(`kinds.${kind}.title`) })} className="w-full rounded-card border border-border" />
          )}
          {!photo && !busy && (
            <div className="space-y-3">
              {mode && (
                <Button onClick={() => openKit(mode, kitKinds)}>
                  {t(kind === 'front' && plan.isBaseline ? 'cameraAllAction' : 'cameraAction')}
                </Button>
              )}
              <label className={`${secondaryClass} relative cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}>
                {t('fileAction')}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void accept([[kind, file]]);
                  }}
                />
              </label>
              {step.optional && (
                <>
                  <Button variant="secondary" onClick={() => advance(photos)} aria-describedby="skip-help">
                    {t('skipAction')}
                  </Button>
                  <p id="skip-help" className="text-[0.9rem] text-muted">
                    {t('skipHelp')}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        <Actions>
          {photo && (
            <Button variant="secondary" onClick={() => retake(kind)}>
              {t('retake')}
            </Button>
          )}
          {!step.optional && !photo && (
            <p id="need-photo" className="text-[0.9rem] text-muted">
              {t('needPhoto')}
            </p>
          )}
          <Button
            onClick={() => advance(photos)}
            disabled={(!photo && !step.optional) || busy !== undefined}
            aria-describedby={!photo && !step.optional ? 'need-photo' : undefined}
          >
            {common('continue')}
          </Button>
        </Actions>
      </div>
    );
  }

  if (step.type === 'questions') {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mt-8 flex-1 space-y-9 pb-8">
          <h2 ref={heading} tabIndex={-1} className="text-[1.5rem] outline-none">
            {t('questionsTitle')}
          </h2>
          {plan.asksChange && (
            <fieldset className="space-y-3">
              <legend className="mb-3 text-[1.25rem] font-medium font-serif">{t('changedTitle')}</legend>
              {changes.map((key) => (
                <ChoiceRow key={key} kind="radio" name="changed" label={t(`changed.${key}`)} checked={changed === key} onChange={() => setChanged(key)} />
              ))}
            </fieldset>
          )}
          {plan.asksSize && (
            <fieldset className="space-y-3">
              <legend className="mb-1 text-[1.25rem] font-medium font-serif">{t('sizeTitle')}</legend>
              <p className="mb-3 text-[0.95rem] text-muted">{t('sizeHelp')}</p>
              {sizeLadder.map((key) => (
                <ChoiceRow key={key} kind="radio" name="size" label={key} labelLang="en" checked={size === key} onChange={() => setSize(key)} />
              ))}
            </fieldset>
          )}
          <fieldset className="space-y-3">
            <legend className="mb-1 text-[1.25rem] font-medium font-serif">{t('momentTitle')}</legend>
            <p className="mb-3 text-[0.95rem] text-muted">{t('momentHelp')}</p>
            <ChoiceRow kind="radio" name="moment" label={t('momentNone')} checked={moment === 'none'} onChange={() => setMoment('none')} />
            {momentSchema.options.map((key) => (
              <ChoiceRow key={key} kind="radio" name="moment" label={t(`moments.${key}`)} checked={moment === key} onChange={() => setMoment(key)} />
            ))}
          </fieldset>
        </div>
        <Actions>
          <Button onClick={() => setIndex(index + 1)} disabled={!answered}>
            {common('continue')}
          </Button>
        </Actions>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-8 flex-1 space-y-6 pb-8">
        <h2 ref={heading} tabIndex={-1} className="text-[1.5rem] outline-none">
          {t('reviewTitle')}
        </h2>
        <p>{t('reviewIntro')}</p>
        {problem && <Notice>{problems(problem)}</Notice>}
        {message && <Notice>{message}</Notice>}
        <ul className="grid grid-cols-2 gap-4">
          {(Object.keys(photos) as PhotoKind[]).map((kind) => (
            <li key={kind} className="space-y-2">
              <img src={photos[kind]?.url} alt={t('photoAlt', { kind: t(`kinds.${kind}.title`) })} className="aspect-[3/4] w-full rounded-card border border-border object-cover" />
              <Button variant="secondary" onClick={() => retake(kind)} disabled={busy === 'sending'}>
                {t('retake')}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <Actions>
        <p role="status" className="sr-only">
          {busy === 'sending' ? t('uploading') : ''}
        </p>
        <Button onClick={send} disabled={busy === 'sending' || missingRequired !== undefined}>
          {busy === 'sending' ? t('sending') : t('send')}
        </Button>
      </Actions>
    </div>
  );
}

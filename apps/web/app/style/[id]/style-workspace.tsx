'use client';

import { STYLE_MAX_REFERENCES } from '@interim/rules';
import type { CaptureProblem, StylePhotoView, StyleSampleSet } from '@interim/types';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button, secondaryClass } from '@/components/button';
import { Notice } from '@/components/notice';
import {
  ApiError,
  addStylePhoto,
  addStyleSamples,
  createStyleRequest,
  createStyleUploads,
  deleteStylePhoto,
  putPhoto,
} from '@/lib/api';
import { checkPhoto } from '@/lib/photo-check';

/**
 * Where the person brings the style they are going for and a photo of themselves now, then asks
 * for previews. The latest "me now" photo is the one used; outfits are chosen one by one.
 */
export function StyleWorkspace({ profileId, initial, after }: { profileId: string; initial: StylePhotoView[]; after?: ReactNode }) {
  const t = useTranslations('style');
  const common = useTranslations('common');
  const problems = useTranslations('photoProblems');
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const [chosen, setChosen] = useState(
    () => new Set(initial.filter((p) => p.role === 'reference').slice(0, STYLE_MAX_REFERENCES).map((p) => p.id)),
  );
  const [busy, setBusy] = useState<'adding' | 'starting' | 'removing'>();
  const [problem, setProblem] = useState<CaptureProblem>();
  const [message, setMessage] = useState<string>();

  const references = photos.filter((p) => p.role === 'reference');
  // The list is newest first, so the first current photo is the latest one.
  const current = photos.find((p) => p.role === 'current');
  const ready = current !== undefined && chosen.size > 0;

  function fail(cause: unknown) {
    if (cause instanceof ApiError && cause.problem) return setProblem(cause.problem.code);
    if (cause instanceof ApiError && cause.status === 403) return router.push(`/consent/${profileId}`);
    if (cause instanceof ApiError && cause.status === 409) return setMessage(t('notEnough'));
    if (cause instanceof ApiError && cause.status === 'network') return setMessage(common('networkError'));
    setMessage(t('uploadFailed'));
  }

  async function add(role: 'reference' | 'current', files: File[]) {
    setBusy('adding');
    setProblem(undefined);
    setMessage(undefined);
    try {
      for (const file of files.slice(0, STYLE_MAX_REFERENCES)) {
        // Only the photo of the person is held to the light and sharpness check on the device.
        const found = role === 'current' ? await checkPhoto(file) : undefined;
        if (found) return setProblem(found);
        const { uploads } = await createStyleUploads(profileId, { uploads: [{ sizeBytes: file.size }] });
        const upload = uploads[0];
        if (!upload) throw new Error('No upload link came back');
        await putPhoto(upload.url, file);
        const added = await addStylePhoto(profileId, { uploadId: upload.uploadId, role });
        setPhotos((all) => [added, ...all.filter((p) => p.id !== added.id)]);
        if (role === 'reference') {
          setChosen((set) => (set.size < STYLE_MAX_REFERENCES ? new Set(set).add(added.id) : set));
        }
      }
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(undefined);
    }
  }

  async function useSample(set: StyleSampleSet) {
    setBusy('adding');
    setProblem(undefined);
    setMessage(undefined);
    try {
      const { photos: added } = await addStyleSamples(profileId, set);
      const ids = new Set(added.map((p) => p.id));
      setPhotos((all) => [...added.filter((p) => p.role === 'current'), ...added.filter((p) => p.role === 'reference'), ...all.filter((p) => !ids.has(p.id))]);
      // Choose exactly the outfits that came with the set, so "Show me" works at once.
      setChosen(new Set(added.filter((p) => p.role === 'reference').slice(0, STYLE_MAX_REFERENCES).map((p) => p.id)));
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(undefined);
    }
  }

  async function remove(photoId: string) {
    setBusy('removing');
    setMessage(undefined);
    try {
      await deleteStylePhoto(profileId, photoId);
      setPhotos((all) => all.filter((p) => p.id !== photoId));
      setChosen((set) => {
        const next = new Set(set);
        next.delete(photoId);
        return next;
      });
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(undefined);
    }
  }

  function toggle(photoId: string) {
    setMessage(undefined);
    if (chosen.has(photoId)) {
      setChosen((set) => {
        const next = new Set(set);
        next.delete(photoId);
        return next;
      });
    } else if (chosen.size >= STYLE_MAX_REFERENCES) {
      setMessage(t('tooMany', { max: STYLE_MAX_REFERENCES }));
    } else {
      setChosen((set) => new Set(set).add(photoId));
    }
  }

  async function show() {
    if (!current) return;
    setBusy('starting');
    setProblem(undefined);
    setMessage(undefined);
    try {
      const { runId } = await createStyleRequest(profileId, {
        currentPhotoId: current.id,
        referencePhotoIds: [...chosen],
      });
      router.push(`/runs/${runId}`);
    } catch (cause) {
      setBusy(undefined);
      fail(cause);
    }
  }

  const pickLabel = (role: 'reference' | 'current') => {
    if (role === 'reference') return 'addReferences';
    return current ? 'replaceCurrent' : 'addCurrent';
  };
  const pick = (role: 'reference' | 'current', multiple: boolean) => (
    <label
      className={`${secondaryClass} relative cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}
    >
      {busy === 'adding' ? t('adding') : t(pickLabel(role))}
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        disabled={busy !== undefined}
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) void add(role, files);
        }}
      />
    </label>
  );

  return (
    <div className="mt-8 flex flex-1 flex-col">
      <div className="space-y-10 pb-8">
        <section aria-labelledby="style-samples" className="workspace-card p-4 sm:p-5">
          <h2 id="style-samples" className="text-[1.15rem]">
            {t('sampleTitle')}
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted">{t('sampleHelp')}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => void useSample('one')} disabled={busy !== undefined}>
              {t('sampleOne')}
            </Button>
            <Button variant="secondary" onClick={() => void useSample('two')} disabled={busy !== undefined}>
              {t('sampleTwo')}
            </Button>
          </div>
        </section>

        <section aria-labelledby="style-references">
          <h2 id="style-references" className="text-[1.25rem]">
            {t('referencesTitle')}
          </h2>
          <p className="mt-2 text-muted">{t('referencesHelp', { max: STYLE_MAX_REFERENCES })}</p>
          {references.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 items-stretch gap-3 sm:gap-4 xl:grid-cols-3">
              {references.map((photo, index) => {
                const isChosen = chosen.has(photo.id);
                return (
                  <li key={photo.id} data-selected={isChosen} className="workspace-card flex min-w-0 flex-col overflow-hidden">
                    <img
                      src={photo.url}
                      alt={t('referenceAlt', { n: index + 1 })}
                      className="aspect-[3/4] w-full border-b border-border object-cover"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
                      <Button
                        variant="secondary"
                        className="min-w-0 px-2! text-[0.9rem]!"
                        aria-pressed={isChosen}
                        onClick={() => toggle(photo.id)}
                        disabled={busy !== undefined}
                      >
                        {t(isChosen ? 'usingOutfit' : 'useOutfit')}
                      </Button>
                      <button
                        type="button"
                        onClick={() => void remove(photo.id)}
                        disabled={busy !== undefined}
                        className="min-h-11 text-[0.9rem] font-semibold text-accent underline underline-offset-4 disabled:text-muted"
                      >
                        {t('remove')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {references.length > 0 && <p className="mt-3 text-[0.9rem] text-muted">{t('removeNote')}</p>}
          <div className="mt-4">{pick('reference', true)}</div>
        </section>

        <section aria-labelledby="style-current">
          <h2 id="style-current" className="text-[1.25rem]">
            {t('currentTitle')}
          </h2>
          <p className="mt-2 text-muted">{t('currentHelp')}</p>
          {current && (
            <img
              src={current.url}
              alt={t('currentAlt')}
              className="mt-4 aspect-[3/4] w-full max-w-xs rounded-card border border-border object-cover"
            />
          )}
          <div className="mt-4">{pick('current', false)}</div>
        </section>

        <p className="text-[0.9rem] text-muted">{t('limits')}</p>
        <p className="text-[0.9rem] text-muted">
          {t('otherWay')}{' '}
          <Link href="/situation" className="font-semibold text-accent underline underline-offset-4">
            {t('otherWayLink')}
          </Link>
        </p>
        {after}
        {problem && <Notice>{problems(problem)}</Notice>}
        {message && <Notice>{message}</Notice>}
      </div>
      <Actions>
        <p role="status" className="text-[0.9rem] text-muted">
          {ready ? t('selectedCount', { count: chosen.size }) : t('needBoth')}
        </p>
        <Button onClick={() => void show()} disabled={!ready || busy !== undefined}>
          {busy === 'starting' ? t('starting') : t('show')}
        </Button>
      </Actions>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/button';

/**
 * One look. When the person's own photo is available a button swaps between the photo and the
 * preview, which is the before and after as a plain control a keyboard and a screen reader can use.
 */
export function OptionImage({
  previewUrl,
  photoUrl,
  label,
  previewAlt,
  photoLabel,
}: {
  previewUrl: string;
  photoUrl: string | null;
  label: string;
  /** What the preview shows, when it is not a look. */
  previewAlt?: string;
  /** What the person's own photo is called, when it is not from a check in. */
  photoLabel?: string;
}) {
  const t = useTranslations('card');
  const [showingPhoto, setShowingPhoto] = useState(false);
  const photoName = photoLabel ?? t('photoAlt');
  return (
    <div className="space-y-3">
      <div className="relative">
        <img
          src={showingPhoto && photoUrl ? photoUrl : previewUrl}
          alt={showingPhoto ? photoName : (previewAlt ?? t('previewAlt'))}
          className="aspect-[3/4] w-full rounded-card border border-border object-cover"
        />
        <span className="absolute top-3 left-3 rounded-lg bg-bg px-3 py-1 text-[0.9rem] font-semibold">{showingPhoto ? photoName : label}</span>
      </div>
      {photoUrl && (
        <Button variant="secondary" onClick={() => setShowingPhoto((current) => !current)} aria-pressed={showingPhoto}>
          {showingPhoto ? t('showPreview') : t('showPhoto')}
        </Button>
      )}
    </div>
  );
}

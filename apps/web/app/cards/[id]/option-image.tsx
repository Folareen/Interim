'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/button';

/**
 * One look. When the person's own photo is available a button swaps between the photo and the
 * preview, which is the before and after as a plain control a keyboard and a screen reader can use.
 */
export function OptionImage({ previewUrl, photoUrl, label }: { previewUrl: string; photoUrl: string | null; label: string }) {
  const t = useTranslations('card');
  const [showingPhoto, setShowingPhoto] = useState(false);
  return (
    <div className="space-y-3">
      <div className="relative">
        <img
          src={showingPhoto && photoUrl ? photoUrl : previewUrl}
          alt={showingPhoto ? t('photoAlt') : t('previewAlt')}
          className="aspect-[3/4] w-full rounded-card border border-border object-cover"
        />
        <span className="absolute top-3 left-3 rounded-lg bg-bg px-3 py-1 text-[0.9rem] font-semibold">{showingPhoto ? t('photoAlt') : label}</span>
      </div>
      {photoUrl && (
        <Button variant="secondary" onClick={() => setShowingPhoto((current) => !current)} aria-pressed={showingPhoto}>
          {showingPhoto ? t('showPreview') : t('showPhoto')}
        </Button>
      )}
    </div>
  );
}

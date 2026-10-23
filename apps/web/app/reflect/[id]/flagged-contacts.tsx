'use client';

import { useState } from 'react';
import { CrisisContacts } from '@/components/crisis-contacts';
import { dismissContacts } from '@/lib/api';

/** The contacts card for a profile whose reflection was flagged. Closing it keeps it closed until the next flag. */
export function FlaggedContacts({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <CrisisContacts
      onClose={() => {
        setOpen(false);
        // Closing is not worth an error message; the card comes back on the next visit if this failed.
        void dismissContacts(profileId).catch(() => undefined);
      }}
    />
  );
}

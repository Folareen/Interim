'use client';

import { type InputHTMLAttributes, useId } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
  label: string;
  help?: string;
};

/** A labelled text input at the same size as the buttons. The label is always visible. */
export function Field({ label, help, ...input }: Props) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={help ? helpId : undefined}
        className="mt-2 h-14 w-full rounded-xl border border-outline bg-surface px-4 text-base text-text placeholder:text-muted"
        {...input}
      />
      {help && (
        <p id={helpId} className="mt-2 text-[0.9rem] text-muted">
          {help}
        </p>
      )}
    </div>
  );
}

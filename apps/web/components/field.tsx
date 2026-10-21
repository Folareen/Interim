'use client';

import { useTranslations } from 'next-intl';
import { type InputHTMLAttributes, useId, useState } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
  label: string;
  help?: string;
};

const iconProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  className: 'size-6',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/**
 * A labelled text input at the same size as the buttons. The label is always visible, and a password
 * field has a button that shows or hides what was typed, which helps on a phone keyboard.
 */
export function Field({ label, help, type, ...input }: Props) {
  const t = useTranslations('common');
  const id = useId();
  const helpId = `${id}-help`;
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          id={id}
          type={isPassword && shown ? 'text' : type}
          aria-describedby={help ? helpId : undefined}
          className={`h-14 w-full rounded-xl border border-outline bg-surface px-4 text-base text-text placeholder:text-muted ${isPassword ? 'pr-14' : ''}`}
          {...input}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((current) => !current)}
            aria-label={shown ? t('hidePassword') : t('showPassword')}
            aria-pressed={shown}
            className="absolute inset-y-0 right-1 grid w-12 place-items-center rounded-lg text-muted transition-colors hover:text-text"
          >
            {shown ? (
              <svg {...iconProps}>
                <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A9.7 9.7 0 0 1 12 5c5 0 8.5 3.6 9.5 7a10.6 10.6 0 0 1-2.4 3.9M6.1 6.1A10.7 10.7 0 0 0 2.5 12c1 3.4 4.5 7 9.5 7 1.5 0 2.8-.3 4-.9" />
              </svg>
            ) : (
              <svg {...iconProps}>
                <path d="M2.5 12C3.5 8.6 7 5 12 5s8.5 3.6 9.5 7c-1 3.4-4.5 7-9.5 7s-8.5-3.6-9.5-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {help && (
        <p id={helpId} className="mt-2 text-[0.9rem] text-muted">
          {help}
        </p>
      )}
    </div>
  );
}

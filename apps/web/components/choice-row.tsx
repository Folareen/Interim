import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  kind: 'radio' | 'checkbox';
  label: string;
  description?: string;
};

/**
 * A large, tappable radio or checkbox row. The real input is hidden but stays focusable, so it
 * works with a keyboard and a screen reader, and the form works without JavaScript.
 */
export function ChoiceRow({ kind, label, description, lang, ...input }: Props) {
  return (
    <label className="group flex cursor-pointer items-start gap-4 rounded-card border border-border bg-surface p-4 transition-colors hover:border-outline has-[:checked]:border-accent has-[:checked]:bg-tint has-[:checked]:ring-1 has-[:checked]:ring-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
      <input type={kind} className="peer sr-only" {...input} />
      <span
        aria-hidden
        className={`mt-0.5 grid size-6 shrink-0 place-items-center border-2 border-outline bg-bg group-has-[:checked]:border-accent group-has-[:checked]:bg-accent ${kind === 'radio' ? 'rounded-full' : 'rounded-md'}`}
      >
        {kind === 'radio' ? (
          <span className="size-2.5 rounded-full bg-on-accent opacity-0 group-has-[:checked]:opacity-100" />
        ) : (
          <svg viewBox="0 0 16 16" className="size-4 text-on-accent opacity-0 group-has-[:checked]:opacity-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        )}
      </span>
      <span className="min-w-0" lang={lang}>
        <span className="block font-semibold leading-snug">{label}</span>
        {description && <span className="mt-1 block text-[0.9rem] leading-snug text-muted">{description}</span>}
      </span>
    </label>
  );
}

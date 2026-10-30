import type { ButtonHTMLAttributes } from 'react';

const base =
  'inline-flex min-h-14 w-full items-center justify-center rounded-xl px-6 py-3 text-base text-center font-semibold transition-colors';

/** Class names for a link that should look like the primary button. */
export const primaryClass = `${base} bg-accent text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-muted`;

/** Class names for a link or button that should look like the quiet button. */
export const secondaryClass = `${base} border border-outline bg-surface text-text hover:bg-tint disabled:cursor-not-allowed disabled:text-muted`;

/** Class names for the one irreversible action, such as deleting a profile. */
export const dangerClass = `${base} border border-danger bg-surface text-danger hover:bg-tint disabled:cursor-not-allowed disabled:opacity-60`;

/** A full width button. The primary one is the single main action of a screen. */
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const style = { primary: primaryClass, secondary: secondaryClass, danger: dangerClass }[variant];
  return <button className={`${style} ${className}`} {...props} />;
}

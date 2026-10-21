import type { ReactNode } from 'react';

/** An error the person can act on. Announced by screen readers when it appears. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-danger bg-surface px-4 py-3 text-danger">
      {children}
    </p>
  );
}

import type { ReactNode } from 'react';

/** The bottom bar that holds a screen's main action, where a thumb reaches it. */
export function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-auto border-t border-border bg-bg px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="space-y-3">{children}</div>
    </div>
  );
}

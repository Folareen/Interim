import type { ReactNode } from 'react';
import { PageHeading } from './page-heading';

/** What every emailed-link flow shows once the email is on its way: say where to look, never whether an account exists. */
export function CheckEmail({ title, message, spam }: { title: string; message: string; spam: ReactNode }) {
  return (
    <div role="status">
      <PageHeading title={title} />
      <p className="mt-6 text-[1.05rem]">{message}</p>
      <p className="mt-3 text-muted">{spam}</p>
    </div>
  );
}

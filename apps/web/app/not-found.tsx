import Link from 'next/link';
import { primaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getCopy } from '@/lib/prefs';

export default async function NotFound() {
  const { ui } = await getCopy();
  return (
    <Shell>
      <PageHeading title={ui.common.notFoundTitle} intro={ui.common.notFoundBody} />
      <div className="mt-8">
        <Link href="/" className={primaryClass}>
          {ui.common.startAgain}
        </Link>
      </div>
    </Shell>
  );
}

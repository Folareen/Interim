import Link from 'next/link';
import { Actions } from '@/components/actions';
import { primaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { StageDots } from '@/components/stage-dots';
import { getCopy } from '@/lib/prefs';

export default async function Welcome() {
  const { ui } = await getCopy();
  return (
    <Shell>
      <div className="pt-8">
        <StageDots />
      </div>
      <h1 className="mt-8 text-[2.25rem] leading-[1.12]">{ui.welcome.title}</h1>
      <p className="mt-6 text-[1.1rem] leading-relaxed">{ui.welcome.intro}</p>
      <p className="mt-4 text-muted">{ui.welcome.reassurance}</p>
      <p className="mt-auto pt-10 pb-6 text-[0.9rem] text-muted">{ui.welcome.footnote}</p>
      <Actions>
        <Link href="/language" className={primaryClass}>
          {ui.welcome.start}
        </Link>
      </Actions>
    </Shell>
  );
}

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** The task destinations shared by the mobile bar and desktop sidebar. */
export type WorkspaceSection = 'today' | 'looks' | 'you';

/** Navigation stays visible while the content changes, so a task always has a way back. */
export async function WorkspaceNav({
  profileId,
  active,
  mobile = false,
}: {
  profileId: string;
  active: WorkspaceSection;
  mobile?: boolean;
}) {
  const t = await getTranslations('workspace');
  const destinations = [
    { key: 'today', href: `/ready/${profileId}`, path: 'M3 10l9-7 9 7v10H3z M9 20v-7h6v7' },
    {
      key: 'looks',
      href: `/looks/${profileId}`,
      path: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
    },
    {
      key: 'you',
      href: `/you/${profileId}`,
      path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
    },
  ] as const;
  return (
    <nav
      aria-label={t('navigation')}
      className={`workspace-nav ${mobile ? 'grid grid-cols-3 gap-1' : 'space-y-2'}`}
    >
      {destinations.map(({ key, href, path }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? 'page' : undefined}
          className={`flex min-h-14 items-center rounded-xl text-muted transition-colors hover:bg-tint hover:text-text ${mobile ? 'flex-col justify-center gap-1 px-1 py-2 text-[0.9rem]' : 'gap-3 px-4 py-3'}`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="size-5 shrink-0"
          >
            <path d={path} />
          </svg>
          <span className={active === key ? 'font-semibold' : ''}>{t(key)}</span>
        </Link>
      ))}
    </nav>
  );
}

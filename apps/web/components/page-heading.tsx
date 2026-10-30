/** The title and one line of introduction at the top of a screen. */
export function PageHeading({ title, intro }: { title: string; intro?: string }) {
  return (
    <div>
      <h1 className="text-[1.75rem] leading-[1.2] sm:text-[2rem]">{title}</h1>
      {intro && <p className="mt-2 max-w-xl text-base text-muted">{intro}</p>}
    </div>
  );
}

/** The title and one line of introduction at the top of a screen. */
export function PageHeading({ title, intro }: { title: string; intro?: string }) {
  return (
    <div>
      <h1 className="text-[2rem] leading-[1.15]">{title}</h1>
      {intro && <p className="mt-3 text-[1.05rem] text-muted">{intro}</p>}
    </div>
  );
}

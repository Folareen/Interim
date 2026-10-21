/**
 * A line with five dots, the middle one filled. It stands for the in between months the app is
 * for, and is decoration only.
 */
export function StageDots() {
  return (
    <svg aria-hidden viewBox="0 0 136 16" className="h-4 w-[8.5rem] text-outline" fill="none">
      <line x1="8" y1="8" x2="128" y2="8" stroke="currentColor" strokeWidth="1.5" />
      {[8, 38, 68, 98, 128].map((x) => (
        <circle
          key={x}
          cx={x}
          cy="8"
          r={x === 68 ? 6 : 4.5}
          className={x === 68 ? 'fill-accent' : 'fill-bg'}
          stroke={x === 68 ? 'none' : 'currentColor'}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

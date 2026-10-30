/** Decorative line drawings keep the public story visual without implying a promised appearance. */
export function LandingIllustration({ kind }: { kind: 'care' | 'everyday' | 'record' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 360 230" fill="none" className="h-auto w-full text-accent">
      {kind === 'care' && (
        <>
          <path d="M106 199V91c0-38 25-65 62-65s62 27 62 65v108" className="fill-peach" />
          <path
            d="M136 114c-17-48 4-70 34-70 35 0 48 29 35 72"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M142 100c-9 31 4 53 28 53s37-22 29-53M153 151v20m32-20v20M110 210c0-27 24-43 43-43 7 11 27 11 34 0 23 0 45 16 45 43"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M149 72c15 11 34 15 56 13M123 93c-13 12-14 39-9 57m111-58c11 16 12 38 5 60"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect
            x="246"
            y="65"
            width="69"
            height="94"
            rx="12"
            className="fill-butter"
            stroke="currentColor"
            strokeOpacity=".3"
            transform="rotate(8 246 65)"
          />
          <path
            d="M263 91l17 3m-21 14 34 5m-36 12 25 4M58 101c8-10 12-21 12-35m-18 17c9 1 15 5 18 12m-1-17c7-7 14-10 22-10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === 'everyday' && (
        <>
          <path
            d="M83 64l39-22c15 19 43 19 59 0l39 22 31 50-37 23-14-19v92H102v-92l-14 19-36-23z"
            className="fill-butter"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M122 43c0 43 57 43 59 0M112 163h78M112 177h78"
            stroke="currentColor"
            strokeWidth="2"
            strokeOpacity=".35"
          />
          <path
            d="M258 83h43v127h-43z"
            className="fill-peach"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M258 102h16m-16 20h25m-25 20h16m-16 20h25m-25 20h16"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M40 184c15 0 22-8 22-23M40 184c0-15-8-22-23-22"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === 'record' && (
        <>
          <rect
            x="58"
            y="37"
            width="139"
            height="171"
            rx="14"
            transform="rotate(-8 58 37)"
            className="fill-lilac"
            stroke="currentColor"
            strokeOpacity=".35"
          />
          <rect
            x="140"
            y="24"
            width="150"
            height="188"
            rx="14"
            className="fill-surface"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M157 48h116v100H157z" className="fill-tint" />
          <circle cx="214" cy="84" r="19" stroke="currentColor" strokeWidth="2" />
          <path
            d="M179 148c0-26 13-43 35-43s35 17 35 43M158 170h66m-66 17h97"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M80 92c0-19 11-33 28-33m-25 88c1-19 11-33 29-33M306 66h25m-12-12v24"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

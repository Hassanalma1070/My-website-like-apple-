// Flat illustration: a man and a woman at a shared desk, writing on paper.
const SKIN_HIM = '#c68642'
const SKIN_HER = '#f1c27d'
const INK = '#1d1d1f'

function Paper({ x }) {
  // Sheet lying on the desk, drawn in slight perspective
  return (
    <g>
      <polygon points={`${x},264 ${x + 92},264 ${x + 84},232 ${x + 8},232`} fill="#ffffff" stroke="#d2d2d7" strokeWidth="1.5" />
      {[240, 247, 254].map((y, i) => (
        <line key={y} x1={x + 16 - i} y1={y} x2={x + 70 + i * 2} y2={y} stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" />
      ))}
    </g>
  )
}

function Pen({ x, y, flip = false }) {
  const dx = flip ? -16 : 16
  return <line x1={x} y1={y + 4} x2={x + dx} y2={y - 24} stroke={INK} strokeWidth="4" strokeLinecap="round" />
}

export default function HeroIllustration() {
  return (
    <svg viewBox="0 0 800 360" role="img" aria-label="A man and a woman sitting at a desk, writing on paper" className="hero-illustration">
      {/* Soft background shapes */}
      <circle cx="250" cy="150" r="118" className="art-bg-blue" />
      <circle cx="550" cy="150" r="118" className="art-bg-peach" />

      {/* ---- Man ---- */}
      <rect x="190" y="150" width="120" height="110" rx="24" fill="#d9dde3" />
      <path d="M190 250 C190 192 210 166 250 166 C290 166 310 192 310 250 Z" fill="#3a6fd8" />
      <path d="M236 166 L250 186 L264 166 Z" fill="#ffffff" />
      <rect x="240" y="146" width="20" height="22" rx="6" fill={SKIN_HIM} />
      <circle cx="217" cy="124" r="7" fill={SKIN_HIM} />
      <circle cx="283" cy="124" r="7" fill={SKIN_HIM} />
      <circle cx="250" cy="122" r="33" fill={SKIN_HIM} />
      <path d="M217 118 C214 86 236 80 252 80 C274 80 288 94 284 118 C276 104 262 99 250 100 C236 101 224 107 217 118 Z" fill="#2b2b2b" />
      <circle cx="239" cy="129" r="2.8" fill={INK} />
      <circle cx="261" cy="129" r="2.8" fill={INK} />
      <path d="M243 141 Q250 146 257 141" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* ---- Woman ---- */}
      <rect x="490" y="150" width="120" height="110" rx="24" fill="#d9dde3" />
      <path d="M514 126 C508 80 592 76 587 126 L594 196 Q550 210 506 196 Z" fill="#6b4226" />
      <path d="M490 250 C490 192 510 166 550 166 C590 166 610 192 610 250 Z" fill="#f06d5b" />
      <path d="M538 166 Q550 182 562 166 Z" fill={SKIN_HER} />
      <rect x="540" y="146" width="20" height="22" rx="6" fill={SKIN_HER} />
      <circle cx="550" cy="122" r="32" fill={SKIN_HER} />
      <path d="M517 120 C516 88 584 84 584 116 C570 100 545 98 517 120 Z" fill="#6b4226" />
      <circle cx="519" cy="134" r="3.5" fill="#f5c542" />
      <circle cx="581" cy="134" r="3.5" fill="#f5c542" />
      <circle cx="539" cy="129" r="2.8" fill={INK} />
      <circle cx="561" cy="129" r="2.8" fill={INK} />
      <path d="M543 141 Q550 146 557 141" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* ---- Desk ---- */}
      <rect x="110" y="226" width="580" height="44" rx="8" fill="#ead9c6" />
      <rect x="110" y="266" width="580" height="16" rx="4" fill="#c9a98a" />
      <rect x="150" y="280" width="14" height="72" rx="4" fill="#b8977a" />
      <rect x="636" y="280" width="14" height="72" rx="4" fill="#b8977a" />

      {/* Books */}
      <rect x="128" y="218" width="58" height="12" rx="3" fill="#30d158" />
      <rect x="132" y="206" width="52" height="12" rx="3" fill="#0071e3" />
      <rect x="126" y="194" width="56" height="12" rx="3" fill="#ff9f0a" />

      {/* Mug */}
      <path d="M392 186 q-6 -8 0 -16 q6 -8 0 -16" stroke="#c7c7cc" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M406 186 q-6 -8 0 -16 q6 -8 0 -16" stroke="#c7c7cc" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M414 202 q14 0 14 11 q0 11 -14 11" stroke="#0071e3" strokeWidth="5" fill="none" />
      <rect x="384" y="194" width="32" height="40" rx="6" fill="#0071e3" />

      {/* Plant */}
      <ellipse cx="642" cy="178" rx="9" ry="22" fill="#34a853" transform="rotate(-28 642 178)" />
      <ellipse cx="664" cy="172" rx="9" ry="24" fill="#2e9b4b" transform="rotate(20 664 172)" />
      <ellipse cx="653" cy="168" rx="8" ry="26" fill="#3cbf5f" />
      <polygon points="636,196 670,196 664,234 642,234" fill="#f2f2f7" stroke="#d2d2d7" strokeWidth="1.5" />

      {/* Papers on the desk */}
      <Paper x={214} />
      <Paper x={498} />

      {/* Man's arms: one steadies the paper, one writes */}
      <path d="M200 190 Q186 236 222 250" stroke="#3a6fd8" strokeWidth="20" fill="none" strokeLinecap="round" />
      <circle cx="226" cy="251" r="9" fill={SKIN_HIM} />
      <path d="M300 190 Q318 238 282 248" stroke="#3a6fd8" strokeWidth="20" fill="none" strokeLinecap="round" />
      <Pen x={276} y={250} />
      <circle cx="278" cy="249" r="9" fill={SKIN_HIM} />

      {/* Woman's arms */}
      <path d="M600 190 Q614 236 578 250" stroke="#f06d5b" strokeWidth="20" fill="none" strokeLinecap="round" />
      <circle cx="574" cy="251" r="9" fill={SKIN_HER} />
      <path d="M500 190 Q482 238 518 248" stroke="#f06d5b" strokeWidth="20" fill="none" strokeLinecap="round" />
      <Pen x={524} y={250} flip />
      <circle cx="522" cy="249" r="9" fill={SKIN_HER} />
    </svg>
  )
}

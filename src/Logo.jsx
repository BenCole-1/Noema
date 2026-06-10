// Noema logo — radiating-node mark + wordmark, recreated as inline SVG.
// Text rendered in a light color so it stays legible on the dark UI.

const BRANCHES = [
  // [endX, endY, ctrlX, ctrlY, color, radius]
  [52, 28, 46, 40, '#a78bfa', 4.5],   // upper-left purple
  [16, 42, 25, 47, '#7cc4f0', 4],     // left small blue
  [74, 22, 52, 35, '#f6c64a', 5],     // top yellow
  [62, 40, 48, 47, '#f3a05f', 5.5],   // orange mid-up
  [96, 40, 66, 43, '#f6c64a', 5],     // yellow right
  [82, 53, 58, 53, '#f3a05f', 5],     // orange right
  [88, 63, 60, 59, '#bcd99a', 4],     // green
  [104, 58, 70, 57, '#e9e08f', 4],    // pale far right
  [74, 69, 54, 63, '#6ccdd8', 5],     // teal mid
  [60, 82, 46, 67, '#5fc4d2', 6],     // teal low
  [44, 91, 38, 73, '#7cc4f0', 4],     // blue bottom
]

const CX = 34
const CY = 55

export default function Logo({ height = 30 }) {
  return (
    <div className="brand-logo" style={{ '--logo-h': `${height}px` }}>
      <svg
        className="brand-mark"
        viewBox="0 0 118 104"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Noema"
      >
        <defs>
          <radialGradient id="noema-core" cx="42%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#6f8bff" />
            <stop offset="55%" stopColor="#4a6cf0" />
            <stop offset="100%" stopColor="#3a4fd6" />
          </radialGradient>
        </defs>

        {/* connector lines */}
        {BRANCHES.map(([ex, ey, cxp, cyp], i) => (
          <path
            key={`l${i}`}
            d={`M ${CX} ${CY} Q ${cxp} ${cyp} ${ex} ${ey}`}
            stroke="rgba(200,206,224,0.40)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ))}

        {/* soft glow behind core */}
        <circle cx={CX} cy={CY} r="19" fill="#4a6cf0" opacity="0.16" />

        {/* endpoint nodes */}
        {BRANCHES.map(([ex, ey, , , color, r], i) => (
          <circle key={`n${i}`} cx={ex} cy={ey} r={r} fill={color} />
        ))}

        {/* central core */}
        <circle cx={CX} cy={CY} r="12.5" fill="url(#noema-core)" />
      </svg>

      <span className="brand-word">Noema</span>
    </div>
  )
}

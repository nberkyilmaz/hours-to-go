/** How far along: a picture first, since that's the question the app is for. */
export function Ring({ percent, label }: { percent: number; label?: string }) {
  const length = 2 * Math.PI * 44;
  return (
    <svg className={`ring${percent === 100 ? ' is-full' : ''}`} viewBox="0 0 100 100" role="img" aria-label={label ?? `${percent}% of the way there`}>
      <circle className="ring-track" cx="50" cy="50" r="44" />
      <circle className="ring-fill" cx="50" cy="50" r="44" strokeDasharray={length} strokeDashoffset={length * (1 - percent / 100)} transform="rotate(-90 50 50)" />
      <text x="50" y="50" dominantBaseline="central" textAnchor="middle">
        {percent}%
      </text>
    </svg>
  );
}

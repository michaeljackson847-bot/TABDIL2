export function Sparkline({
  values,
  up,
  width = 96,
  height = 30,
}: {
  values: number[];
  up: boolean;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <div style={{ width, height }} className="opacity-30" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`)
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={up ? "stroke-gain" : "stroke-loss"}
      />
    </svg>
  );
}

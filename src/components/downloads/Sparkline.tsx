interface Props {
  values: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ values, width = 240, height = 40 }: Props) {
  if (values.length < 2) {
    return <div style={{ width, height }} className="text-xs text-zinc-600" />;
  }

  const max = Math.max(...values, 1);
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - (v / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="rgb(56, 189, 248)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

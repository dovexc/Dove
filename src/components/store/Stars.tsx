function StarIcon({ fill }: { fill: number }) {
  const clamped = Math.max(0, Math.min(1, fill));
  return (
    <span className="relative inline-block">
      <span className="text-zinc-600">★</span>
      <span
        className="absolute inset-0 overflow-hidden text-amber-400"
        style={{ width: `${clamped * 100}%` }}
      >
        ★
      </span>
    </span>
  );
}

export function Stars({ rating, size = "text-sm" }: { rating: number; size?: string }) {
  return (
    <span className={`${size} inline-flex`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <StarIcon key={i} fill={rating - i} />
      ))}
    </span>
  );
}

export function RatingPicker({
  value,
  onChange,
  size = "text-lg",
}: {
  value: number;
  onChange: (value: number) => void;
  size?: string;
}) {
  return (
    <span className={`${size} inline-flex`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? n - 0.5 : n)}
          className="relative inline-block"
        >
          <StarIcon fill={value - (n - 1)} />
        </button>
      ))}
    </span>
  );
}

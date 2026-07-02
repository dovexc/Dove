// Deterministic fallback cover gradient for games with no cover art — hashes
// the name to a hue so the same game always gets the same look instead of a
// random one on every render. Shared by the sidebar grid, the overview
// carousel/list, and the per-game hero banner so a given game looks
// consistent across all three.
export function coverGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `linear-gradient(125deg, hsl(${hue},45%,28%), hsl(${(hue + 45) % 360},50%,14%))`;
}

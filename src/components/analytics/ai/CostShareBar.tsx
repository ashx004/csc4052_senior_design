import { formatShare, shareOf } from "./format";
import { TAN } from "./palette";

export function CostShareBar({ micros, totalMicros }: { micros: number; totalMicros: number }) {
  return (
    <span
      role="img"
      aria-label={`${formatShare(micros, totalMicros)} of AI cost`}
      className="inline-block h-1.5 w-6 shrink-0 overflow-hidden rounded-full bg-bg-warm align-middle"
    >
      <span
        data-share-fill
        className="block h-full rounded-full"
        style={{ width: `${shareOf(micros, totalMicros) * 100}%`, backgroundColor: TAN }}
      />
    </span>
  );
}

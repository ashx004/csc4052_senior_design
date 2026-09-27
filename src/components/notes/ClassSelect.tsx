import type { ClassOption } from "@/src/library/notes/types";

export function classLabel(c: ClassOption): string {
  return [c.classCode, c.className].filter(Boolean).join(" - ") || "Untitled class";
}

export default function ClassSelect({
  id,
  classes,
  value,
  onChange,
  allowNone,
  disabled,
}: {
  id: string;
  classes: ClassOption[];
  value: string;
  onChange: (value: string) => void;
  allowNone?: boolean;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
    >
      {allowNone && <option value="">No class (general)</option>}
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {classLabel(c)}
        </option>
      ))}
    </select>
  );
}

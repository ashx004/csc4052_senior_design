"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowRight, Check, Clock, Minus, Play, X } from "lucide-react";
import { usePracticeCountdown } from "@/src/hooks/usePracticeCountdown";
import {
  fixDirections,
  formatClock,
  isComplete,
  placeTile,
  roundPoints,
  scorePlacement,
  unplacedTiles,
  type Placement,
} from "@/src/library/practice/dragDrop";
import type { DragDropItem, DragTile, DropZone, ItemResult } from "@/src/library/practice/types";
import { PRIMARY_BUTTON, ProgressDots, SECONDARY_BUTTON } from "./PracticeShell";

const TRAY_ID = "tray";

type TileState = "idle" | "correct" | "wrong";

function TileChip({
  tile,
  selected,
  state,
  disabled,
  onClick,
}: {
  tile: DragTile;
  selected: boolean;
  state: TileState;
  disabled: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: tile.id, disabled });
  const tone =
    state === "correct"
      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
      : state === "wrong"
        ? "border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
        : selected
          ? "border-primary bg-bg-warm text-text-main ring-2 ring-primary"
          : "border-border-hover bg-bg-warm text-text-main hover:border-primary";
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={onClick}
      aria-pressed={selected}
      className={`touch-none select-none rounded-lg border px-3 py-2 text-left text-sm font-medium shadow-sm transition ${tone} ${
        isDragging ? "opacity-30" : disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {tile.label}
    </button>
  );
}

function Zone({
  zone,
  mode,
  tiles,
  checked,
  answerTile,
  selectedId,
  onZoneClick,
  onTileClick,
  stateOf,
}: {
  zone: DropZone;
  mode: DragDropItem["mode"];
  tiles: DragTile[];
  checked: boolean;
  /** The tile that belongs here (single-tile zones), shown after checking a wrong answer. */
  answerTile: DragTile | undefined;
  selectedId: string | null;
  onZoneClick: () => void;
  onTileClick: (id: string) => void;
  stateOf: (tile: DragTile) => TileState;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id, disabled: checked });
  const single = mode !== "categorize";
  const wrong = checked && single && tiles[0] && stateOf(tiles[0]) === "wrong";
  const empty = checked && single && tiles.length === 0;
  return (
    <div
      ref={setNodeRef}
      onClick={onZoneClick}
      className={`rounded-xl border-2 border-dashed p-3 transition-colors ${
        isOver ? "border-primary bg-bg-warm" : selectedId && !checked ? "border-primary/50" : "border-border-hover"
      } ${checked ? "" : "cursor-pointer"}`}
    >
      <p className={`mb-2 text-xs font-semibold ${mode === "sequence" ? "uppercase tracking-wide text-text-muted" : "text-text-main"}`}>{zone.label}</p>
      <div className="flex min-h-[2.75rem] flex-wrap gap-2">
        {tiles.map((tile) => (
          <TileChip
            key={tile.id}
            tile={tile}
            selected={selectedId === tile.id}
            state={checked ? stateOf(tile) : "idle"}
            disabled={checked}
            onClick={() => onTileClick(tile.id)}
          />
        ))}
        {tiles.length === 0 && !checked && <span className="self-center text-xs text-text-muted">Drop here</span>}
      </div>
      {(wrong || empty) && answerTile && (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          Correct: <strong>{answerTile.label}</strong>
        </p>
      )}
    </div>
  );
}

function Tray({ children, active }: { children: React.ReactNode; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_ID });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[3.5rem] rounded-xl border border-border-light bg-bg-main p-3 transition-colors ${isOver ? "border-primary bg-bg-warm" : ""}`}
      data-active={active}
    >
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function RoundView({
  item,
  roundNumber,
  totalRounds,
  isLast,
  onNext,
}: {
  item: DragDropItem;
  roundNumber: number;
  totalRounds: number;
  isLast: boolean;
  onNext: (result: ItemResult & { points: number }) => void;
}) {
  const [status, setStatus] = useState<"ready" | "playing" | "checked">("ready");
  const [placement, setPlacement] = useState<Placement>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragTile | null>(null);
  const [outcome, setOutcome] = useState<{ fraction: number; points: number; seconds: number } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const remaining = usePracticeCountdown(item.timeLimitSeconds, status === "playing", () => finish(0));
  const tileById = useMemo(() => new Map(item.tiles.map((t) => [t.id, t])), [item.tiles]);

  /** Ends the round. When the clock runs out it reports zero seconds left, since `remaining` may not have caught up yet. */
  function finish(secondsLeft: number = remaining) {
    if (status === "checked") return;
    const fraction = scorePlacement(item, placement);
    setOutcome({ fraction, points: roundPoints(fraction, secondsLeft, item.timeLimitSeconds), seconds: item.timeLimitSeconds - secondsLeft });
    setSelected(null);
    setStatus("checked");
  }

  function move(tileId: string, zoneId: string | null) {
    setPlacement((p) => placeTile(item, p, tileId, zoneId));
    setSelected(null);
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(tileById.get(String(event.active.id)) ?? null);
    setSelected(null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const over = event.over?.id;
    if (over === undefined) return;
    move(String(event.active.id), over === TRAY_ID ? null : String(over));
  }

  function clickTile(id: string) {
    if (status !== "playing") return;
    setSelected((current) => (current === id ? null : id));
  }

  function clickZone(zoneId: string) {
    if (status !== "playing" || !selected) return;
    move(selected, zoneId);
  }

  const stateOf = (tile: DragTile): TileState => (placement[tile.id] === item.solution[tile.id] ? "correct" : "wrong");
  const tilesIn = (zoneId: string) => item.tiles.filter((t) => placement[t.id] === zoneId);
  const answerFor = (zoneId: string) => item.tiles.find((t) => item.solution[t.id] === zoneId);
  const tray = unplacedTiles(item, placement);
  const urgent = status === "playing" && remaining <= 10;
  const percentLeft = Math.max(0, Math.min(100, (remaining / item.timeLimitSeconds) * 100));

  if (status === "ready") {
    return (
      <div className="rounded-2xl border border-border-light bg-bg-container p-6 text-center shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Round {roundNumber} of {totalRounds}
        </p>
        <h3 className="mt-2 text-lg font-bold text-text-main">{fixDirections(item.instructions)}</h3>
        <p className="mt-2 flex items-center justify-center gap-2 text-sm text-text-muted">
          <Clock size={15} /> {formatClock(item.timeLimitSeconds)} on the clock &middot; {item.tiles.length} tiles
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs text-text-muted">
          Drag each tile into place &mdash; or click a tile, then click where it goes. Finish with time to spare for bonus points.
        </p>
        <button type="button" onClick={() => setStatus("playing")} className={`${PRIMARY_BUTTON} mt-5`}>
          <Play size={15} /> Start round
        </button>
      </div>
    );
  }

  const checked = status === "checked";

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Round {roundNumber} of {totalRounds}
          </p>
          <div
            role="timer"
            aria-label="Time left"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
              urgent ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200" : "bg-bg-warm text-text-main"
            }`}
          >
            <Clock size={14} /> {formatClock(remaining)}
          </div>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border-light">
          <div className={`h-full rounded-full transition-[width] duration-300 ${urgent ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${percentLeft}%` }} />
        </div>

        <h3 className="mb-4 text-base font-bold text-text-main">{fixDirections(item.instructions)}</h3>

        <Tray active={!checked}>
          {tray.length === 0 ? (
            <span className="self-center text-xs text-text-muted">{checked ? "All tiles were placed." : "Every tile is placed. Check your answer, or move things around."}</span>
          ) : (
            tray.map((tile) => (
              <TileChip key={tile.id} tile={tile} selected={selected === tile.id} state={checked ? "wrong" : "idle"} disabled={checked} onClick={() => clickTile(tile.id)} />
            ))
          )}
        </Tray>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {item.zones.map((zone) => (
            <Zone
              key={zone.id}
              zone={zone}
              mode={item.mode}
              tiles={tilesIn(zone.id)}
              checked={checked}
              answerTile={answerFor(zone.id)}
              selectedId={selected}
              onZoneClick={() => clickZone(zone.id)}
              onTileClick={clickTile}
              stateOf={stateOf}
            />
          ))}
        </div>

        {selected && !checked && (
          <button type="button" onClick={() => move(selected, null)} className="mt-3 text-xs font-medium text-primary hover:underline">
            Put the selected tile back
          </button>
        )}

        {checked && outcome && (
          <div
            role="status"
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              outcome.fraction >= 1
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
                : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
            }`}
          >
            <p className="flex items-center gap-2 font-semibold">
              {outcome.fraction >= 1 ? <Check size={16} /> : outcome.fraction > 0 ? <Minus size={16} /> : <X size={16} />}
              {outcome.fraction >= 1 ? "Perfect round!" : `${Math.round(outcome.fraction * item.tiles.length)} of ${item.tiles.length} in the right place`}
              <span className="ml-auto tabular-nums">{outcome.points} pts</span>
            </p>
            <p className="mt-1 text-xs opacity-90">
              {outcome.seconds >= item.timeLimitSeconds && outcome.fraction < 1 ? "Time ran out. " : ""}Finished in {formatClock(outcome.seconds)}.
            </p>
            {item.explanation && <p className="mt-2 leading-relaxed">{item.explanation}</p>}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          {checked && outcome ? (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() =>
                onNext({
                  itemId: item.id,
                  score: outcome.fraction,
                  response: placement,
                  seconds: outcome.seconds,
                  points: outcome.points,
                })
              }
            >
              {isLast ? "See results" : "Next round"} <ArrowRight size={15} />
            </button>
          ) : (
            <>
              <button type="button" className={SECONDARY_BUTTON} onClick={() => setPlacement({})} disabled={Object.keys(placement).length === 0}>
                Reset
              </button>
              <button type="button" className={PRIMARY_BUTTON} onClick={() => finish()}>
                {isComplete(item, placement) ? "Check answer" : "Check what I have"}
              </button>
            </>
          )}
        </div>
      </div>

      <DragOverlay>
        {dragging ? (
          <div className="cursor-grabbing rounded-lg border border-primary bg-bg-warm px-3 py-2 text-sm font-medium text-text-main shadow-lg">{dragging.label}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/** Rounds of click-and-drag against the clock, one after another. */
export default function DragDropRunner({
  items,
  onFinish,
}: {
  items: DragDropItem[];
  onFinish: (results: (ItemResult & { points?: number })[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<(ItemResult & { points: number })[]>([]);

  function next(result: ItemResult & { points: number }) {
    const all = [...results, result];
    setResults(all);
    if (index + 1 >= items.length) onFinish(all);
    else setIndex(index + 1);
  }

  return (
    <div className="space-y-4">
      <ProgressDots total={items.length} current={index} scores={results.map((r) => r.score)} />
      <RoundView key={items[index].id} item={items[index]} roundNumber={index + 1} totalRounds={items.length} isLast={index + 1 >= items.length} onNext={next} />
    </div>
  );
}

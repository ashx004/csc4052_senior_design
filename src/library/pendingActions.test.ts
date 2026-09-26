import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory Firestore standing in for the REST helpers.
const store = new Map<string, Record<string, unknown>>();
let nextId = 1;
const key = (collection: string, id: string) => `${collection}/${id}`;
const writes: string[] = [];

vi.mock("./firestoreRest", () => ({
  firestoreCreate: async (_t: string, collection: string, fields: Record<string, unknown>) => {
    const id = `p${nextId++}`;
    store.set(key(collection, id), JSON.parse(JSON.stringify(fields)));
    return id;
  },
  firestoreGet: async (_t: string, collection: string, id: string) => store.get(key(collection, id)) ?? null,
  firestoreUpdate: async (_t: string, collection: string, id: string, fields: Record<string, unknown>) => {
    if (!collection.includes("pendingActions")) writes.push(`update ${key(collection, id)}`);
    store.set(key(collection, id), { ...(store.get(key(collection, id)) ?? {}), ...JSON.parse(JSON.stringify(fields)) });
    return true;
  },
  firestoreDelete: async (_t: string, collection: string, id: string) => {
    writes.push(`delete ${key(collection, id)}`);
    return store.delete(key(collection, id));
  },
  firestoreListCollection: async (_t: string, collection: string) =>
    [...store.entries()]
      .filter(([k]) => k.startsWith(`${collection}/`) && !k.slice(collection.length + 1).includes("/"))
      .map(([k, data]) => ({ id: k.split("/").pop()!, data })),
}));

const { opsBelongTo, proposeAction, resolveAction, getActionStatus, recentActionOutcomes } = await import("./pendingActions");

const UID = "student1";
const EVENTS = `users/${UID}/events`;
const deleteEvent = () =>
  proposeAction("token", UID, {
    tool: "delete_calendar_event",
    title: 'Delete "Lab" from your calendar',
    details: ["Fri, Oct 2, 1:00 PM"],
    ops: [{ op: "delete", collection: EVENTS, docId: "e1" }],
    doneText: 'Deleted "Lab" from your calendar.',
  });

beforeEach(() => {
  store.clear();
  writes.length = 0;
  store.set(key(EVENTS, "e1"), { title: "Lab" });
});

describe("opsBelongTo", () => {
  it("only allows writes inside the student's own data", () => {
    expect(opsBelongTo(UID, [{ op: "delete", collection: EVENTS, docId: "e1" }])).toBe(true);
    expect(opsBelongTo(UID, [{ op: "delete", collection: "users/someoneElse/events", docId: "e1" }])).toBe(false);
    expect(opsBelongTo(UID, [{ op: "delete", collection: `users/${UID}/../other/events`, docId: "e1" }])).toBe(false);
    expect(opsBelongTo(UID, [{ op: "update", collection: `users/${UID}/pendingActions`, docId: "x", fields: { status: "done" } }])).toBe(false);
  });

  it("refuses to store a proposal that reaches outside", async () => {
    const card = await proposeAction("token", UID, { tool: "x", title: "t", details: [], ops: [{ op: "delete", collection: "users/other/events", docId: "e1" }], doneText: "" });
    expect(card).toBeNull();
  });
});

describe("resolveAction", () => {
  it("changes nothing until confirmed, then applies exactly once", async () => {
    const card = (await deleteEvent())!;
    expect(store.has(key(EVENTS, "e1"))).toBe(true);
    expect(await resolveAction("token", UID, card.id, "confirm")).toEqual({ status: "done", message: 'Deleted "Lab" from your calendar.' });
    expect(store.has(key(EVENTS, "e1"))).toBe(false);
    // A double click doesn't apply it again.
    expect((await resolveAction("token", UID, card.id, "confirm")).status).toBe("done");
    expect(writes).toEqual([`delete ${EVENTS}/e1`]);
  });

  it("cancel leaves the data alone and can't be confirmed afterwards", async () => {
    const card = (await deleteEvent())!;
    expect((await resolveAction("token", UID, card.id, "cancel")).status).toBe("cancelled");
    expect((await resolveAction("token", UID, card.id, "confirm")).status).toBe("cancelled");
    expect(store.has(key(EVENTS, "e1"))).toBe(true);
    expect(writes).toEqual([]);
  });

  it("does nothing once expired", async () => {
    const card = (await deleteEvent())!;
    const doc = store.get(key(`users/${UID}/pendingActions`, card.id))!;
    doc.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect((await resolveAction("token", UID, card.id, "confirm")).status).toBe("expired");
    expect(store.has(key(EVENTS, "e1"))).toBe(true);
  });

  it("won't recreate something deleted in the meantime", async () => {
    const card = (await proposeAction("token", UID, {
      tool: "update_calendar_event",
      title: 'Change "Lab"',
      details: ["From 1 PM → 3 PM"],
      ops: [{ op: "update", collection: EVENTS, docId: "e1", fields: { startTime: "2026-10-02T20:00:00.000Z" } }],
      doneText: "Updated.",
    }))!;
    store.delete(key(EVENTS, "e1"));
    expect((await resolveAction("token", UID, card.id, "confirm")).status).toBe("failed");
    expect(store.has(key(EVENTS, "e1"))).toBe(false);
  });

  it("clears a note's drawing pages before deleting the note", async () => {
    const notes = `users/${UID}/notes`;
    store.set(key(notes, "n1"), { title: "Heaps" });
    store.set(key(`${notes}/n1/pages`, "pg1"), {});
    const card = (await proposeAction("token", UID, {
      tool: "delete_note",
      title: 'Delete the note "Heaps"',
      details: [],
      ops: [
        { op: "clear", collection: `${notes}/n1/pages` },
        { op: "delete", collection: notes, docId: "n1" },
      ],
      doneText: 'Deleted the note "Heaps".',
    }))!;
    expect((await resolveAction("token", UID, card.id, "confirm")).status).toBe("done");
    expect(writes).toEqual([`delete ${notes}/n1/pages/pg1`, `delete ${notes}/n1`]);
  });

  it("reuses a card that's still waiting instead of making a duplicate", async () => {
    const first = (await deleteEvent())!;
    const again = (await deleteEvent())!;
    expect(again.id).toBe(first.id);
    expect(again.alreadyShown).toBe(true);
    await resolveAction("token", UID, first.id, "cancel");
    // Once that card is settled, asking again makes a fresh one.
    const fresh = (await deleteEvent())!;
    expect(fresh.id).not.toBe(first.id);
  });

  it("reports status for a card reopened from history, and tells the chat what happened", async () => {
    const card = (await deleteEvent())!;
    expect((await getActionStatus("token", UID, card.id))?.status).toBe("pending");
    await resolveAction("token", UID, card.id, "confirm");
    expect(await getActionStatus("token", UID, card.id)).toEqual({ status: "done", message: 'Deleted "Lab" from your calendar.' });
    expect(await recentActionOutcomes("token", UID, [card.id])).toEqual(['- Delete "Lab" from your calendar (Fri, Oct 2, 1:00 PM): confirmed by the student and done']);
    // Cards from other conversations aren't reported.
    expect(await recentActionOutcomes("token", UID, ["someOtherCard"])).toEqual([]);
  });
});

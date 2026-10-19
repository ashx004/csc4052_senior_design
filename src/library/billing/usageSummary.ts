// Pure totals over aiUsage records, for scripts/usageReport.ts. No Firebase here.

export type UsageRow = {
  uid: string | null;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  costSource: string;
  requestId: string | null;
  incomplete: boolean;
  at: Date;
};

export type Tally = { requests: number; inputTokens: number; outputTokens: number; costMicros: number };

const empty = (): Tally => ({ requests: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 });

function add(map: Map<string, Tally>, key: string, row: UsageRow) {
  const t = map.get(key) ?? empty();
  t.requests += 1;
  t.inputTokens += row.inputTokens;
  t.outputTokens += row.outputTokens;
  t.costMicros += row.costMicros;
  map.set(key, t);
}

export type UsageSummary = {
  total: Tally;
  byDay: Map<string, Tally>;
  byProviderDay: Map<string, Tally>;
  byModel: Map<string, Tally>;
  byFeature: Map<string, Tally>;
  byUser: Map<string, Tally>;
  /** Requests no route attributed to a student: each is a missing enterAiUser(). */
  unattributed: Map<string, Tally>;
  /** Requests with no trustworthy cost yet: stopped streams and models missing from the rate table. */
  needsCost: UsageRow[];
};

/** UTC day, which is how the OpenRouter dashboard groups spend. */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export function summarizeUsage(rows: UsageRow[]): UsageSummary {
  const s: UsageSummary = { total: empty(), byDay: new Map(), byProviderDay: new Map(), byModel: new Map(), byFeature: new Map(), byUser: new Map(), unattributed: new Map(), needsCost: [] };
  for (const row of rows) {
    const day = utcDay(row.at);
    s.total.requests += 1;
    s.total.inputTokens += row.inputTokens;
    s.total.outputTokens += row.outputTokens;
    s.total.costMicros += row.costMicros;
    add(s.byDay, day, row);
    add(s.byProviderDay, `${row.model.split(":")[0]} ${day}`, row);
    add(s.byModel, row.model, row);
    add(s.byFeature, row.feature, row);
    if (row.uid) add(s.byUser, row.uid, row);
    else add(s.unattributed, row.feature, row);
    if (row.incomplete || row.costSource === "unknown") s.needsCost.push(row);
  }
  return s;
}

import { useMemo, useState, type ReactNode } from "react";
import { timelineRows, type TimelinePlatform } from "../../../shared/aiReview";
import { easternDateKey } from "../../../shared/names";
import { ALL, filterTimeline } from "../../../shared/timelineFilter";
import type { CaseBundle } from "../../../shared/types";
import { Button } from "../components/ui/button";
import { EmptyBlock } from "./states";

const PLATFORM_LABEL: Record<TimelinePlatform, string> = {
  sms: "SMS",
  call: "Call",
  media: "Media",
};

export function Timeline({ bundle }: { bundle: CaseBundle }) {
  const [newest, setNewest] = useState(false);
  const [date, setDate] = useState(ALL);
  const [sender, setSender] = useState(ALL);
  const [platform, setPlatform] = useState<TimelinePlatform | "all">(ALL);
  const events = useMemo(() => timelineRows(bundle), [bundle]);
  const dates = useMemo(() => [...new Set(events.map((event) => easternDateKey(event.at)))].sort(), [events]);
  const senders = useMemo(() => [...new Set(events.map((event) => event.sender))].sort((a, b) => a.localeCompare(b)), [events]);
  const rows = useMemo(() => {
    const list = filterTimeline(events, { date, sender, platform });
    return newest ? [...list].reverse() : list;
  }, [events, date, sender, platform, newest]);

  if (events.length === 0) {
    return <EmptyBlock title="No timeline yet" body="Messages, calls, and media show up here after a logical extraction, or in the Harbor Street sample." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted">{rows.length} of {events.length} events · US Eastern, EDT or EST</p>
        <Button variant="outline" size="sm" onClick={() => setNewest((value) => !value)}>{newest ? "Oldest first" : "Newest first"}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Filter label="Date" value={date} onChange={setDate}>
          <option value={ALL}>All dates</option>
          {dates.map((item) => <option key={item} value={item}>{item}</option>)}
        </Filter>
        <Filter label="Sender" value={sender} onChange={setSender}>
          <option value={ALL}>All senders</option>
          {senders.map((item) => <option key={item} value={item}>{item}</option>)}
        </Filter>
        <Filter label="Platform" value={platform} onChange={(value) => setPlatform(value as TimelinePlatform | "all")}>
          <option value={ALL}>All platforms</option>
          {(Object.keys(PLATFORM_LABEL) as TimelinePlatform[]).map((item) => <option key={item} value={item}>{PLATFORM_LABEL[item]}</option>)}
        </Filter>
      </div>
      {rows.length === 0 ? <EmptyBlock title="No matching events" body="Nothing in this case matches that date, sender, and platform." /> : (
        <ol className="relative space-y-4 border-l border-line pl-4">
          {rows.map((row) => (
            <li key={`${row.at}-${row.line}`} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full bg-brass" />
              <p className="text-sm leading-6 text-paper">{row.line}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border border-line bg-ink px-3 text-sm text-paper"
        value={value}
        aria-label={`Filter by ${label.toLowerCase()}`}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

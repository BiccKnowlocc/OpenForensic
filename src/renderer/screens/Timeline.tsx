import { useMemo, useState } from "react";
import { timelineRows } from "../../../shared/aiReview";
import type { CaseBundle } from "../../../shared/types";
import { Button } from "../components/ui/button";
import { EmptyBlock } from "./states";

export function Timeline({ bundle }: { bundle: CaseBundle }) {
  const [newest, setNewest] = useState(false);
  const rows = useMemo(() => {
    const list = timelineRows(bundle);
    return newest ? [...list].reverse() : list;
  }, [bundle, newest]);

  if (rows.length === 0) {
    return <EmptyBlock title="No timeline yet" body="Messages, calls, and media show up here after a logical extraction, or in the Harbor Street sample." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{rows.length} events · US Eastern, EDT or EST</p>
        <Button variant="outline" size="sm" onClick={() => setNewest((value) => !value)}>{newest ? "Oldest first" : "Newest first"}</Button>
      </div>
      <ol className="relative space-y-4 border-l border-line pl-4">
        {rows.map((row) => (
          <li key={`${row.at}-${row.line}`} className="relative">
            <span className="absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full bg-brass" />
            <p className="text-sm leading-6 text-paper">{row.line}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

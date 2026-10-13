import { easternDateKey } from "./names";
import type { TimelineEvent, TimelinePlatform } from "./aiReview";

export type TimelineFilter = {
  date: string;
  sender: string;
  platform: TimelinePlatform | "all";
};

export const ALL = "all";

export function filterTimeline(events: TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
  return events.filter((event) => {
    if (filter.date !== ALL && easternDateKey(event.at) !== filter.date) return false;
    if (filter.sender !== ALL && event.sender !== filter.sender) return false;
    if (filter.platform !== ALL && event.platform !== filter.platform) return false;
    return true;
  });
}

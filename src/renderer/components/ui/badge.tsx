import { cn } from "../../lib/utils";

export function Badge({ className, tone = "brass", children }: { className?: string; tone?: "brass" | "moss" | "danger" | "sea" | "muted"; children: React.ReactNode }) {
  const tones = {
    brass: "bg-brass/15 text-brass",
    moss: "bg-moss/15 text-moss",
    danger: "bg-danger/15 text-danger",
    sea: "bg-sea/15 text-sea",
    muted: "bg-white/5 text-muted",
  };
  return <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase", tones[tone], className)}>{children}</span>;
}

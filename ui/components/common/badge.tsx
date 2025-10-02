"use client";

import clsx from "clsx";

export function Badge({ children, color = "neutral" }: { children: React.ReactNode; color?: "neutral" | "green" | "amber" | "red" }) {
  const classes = clsx(
    "inline-flex items-center rounded-full px-2 py-[2px] text-xs font-medium",
    color === "neutral" && "bg-neutral-100 text-neutral-700",
    color === "green" && "bg-green-100 text-green-700",
    color === "amber" && "bg-amber-100 text-amber-700",
    color === "red" && "bg-red-100 text-red-700",
  );
  return <span className={classes}>{children}</span>;
}


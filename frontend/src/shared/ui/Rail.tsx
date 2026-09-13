import type { ReactNode } from "react";

import { useRailScroll } from "@/shared/hooks/useRailScroll";

/**
 * A horizontal row that a mouse can actually move. The scrollbar is hidden by
 * design, and a wheel sends deltaY which no browser applies to horizontal
 * overflow, so on a desktop these rows were simply stuck.
 */
export const Rail = ({ className = "", children }: { className?: string; children: ReactNode }) => {
  const ref = useRailScroll<HTMLDivElement>();
  return (
    <div ref={ref} className={`no-scrollbar flex overflow-x-auto ${className}`}>
      {children}
    </div>
  );
};

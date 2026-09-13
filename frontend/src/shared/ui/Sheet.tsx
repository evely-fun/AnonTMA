import { AnimatePresence, m } from "motion/react";
import { useEffect, type ReactNode } from "react";

import { sheetPanel } from "@/shared/lib/motion";

export const Sheet = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        // The full screen layer is a keyed motion element on purpose. It used
        // to be a plain unkeyed div, which AnimatePresence cannot track: the
        // panel inside animated away but the layer itself was never unmounted,
        // leaving an invisible sheet of z-50 over the whole app that swallowed
        // every tap. That is the freeze where the only way out was a reload.
        <m.div
          key="sheet"
          className="fixed inset-0 z-50 mx-auto flex max-w-[480px] items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="veil absolute inset-0" onClick={onClose} />
          <m.div
            className="relative flex max-h-[88vh] w-full flex-col rounded-t-[26px] bg-surface pb-[calc(18px+env(safe-area-inset-bottom))] shadow-[0_-30px_80px_-40px_oklch(0_0_0/0.55)]"
            variants={sheetPanel}
            initial="initial"
            animate="animate"
            exit="exit"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 620) onClose();
            }}
          >
            <span className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-bezel" />
            {title && (
              <header className="px-5 pb-3 pt-4">
                <h2 className="font-display text-[20px] font-extrabold tracking-[-0.02em]">
                  {title}
                </h2>
                {description && (
                  <p className="mt-1 text-[13px] leading-snug text-hint">{description}</p>
                )}
              </header>
            )}
            <div className="flex-1 overflow-y-auto px-4 pb-2">{children}</div>
            {footer && <div className="px-4 pt-3">{footer}</div>}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};

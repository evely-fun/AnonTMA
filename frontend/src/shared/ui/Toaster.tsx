import { AnimatePresence, motion } from "framer-motion";

import { spring } from "@/shared/lib/motion";
import { useUi } from "@/store/ui";

import styles from "./Toaster.module.css";

export const Toaster = () => {
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismiss);

  return (
    <div className={styles.stack}>
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.button
            key={item.id}
            type="button"
            layout
            className={[styles.toast, styles[item.tone]].join(" ")}
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={spring}
            onClick={() => dismiss(item.id)}
          >
            {item.icon ? <span className={styles.icon}>{item.icon}</span> : null}
            <span className={styles.text}>
              <span className={styles.title}>{item.title}</span>
              {item.description ? <span className={styles.description}>{item.description}</span> : null}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
};

import { motion } from "framer-motion";

import { haptics } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

import styles from "./Segmented.module.css";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

interface SegmentedProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  id: string;
  size?: "sm" | "md";
}

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  id,
  size = "md",
}: SegmentedProps<T>) => (
  <div className={[styles.track, styles[size]].join(" ")} role="tablist">
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={selected}
          className={[styles.option, selected ? styles.selected : ""].filter(Boolean).join(" ")}
          onClick={() => {
            if (!selected) {
              haptics.select();
              onChange(option.value);
            }
          }}
        >
          {selected ? (
            <motion.span layoutId={`segment-${id}`} className={styles.pill} transition={spring} />
          ) : null}
          <span className={styles.content}>
            {option.icon ? <span className={styles.icon}>{option.icon}</span> : null}
            {option.label}
          </span>
        </button>
      );
    })}
  </div>
);

import { motion } from "framer-motion";

import { haptics } from "@/shared/lib/telegram";
import { spring } from "@/shared/lib/motion";

import styles from "./Switch.module.css";

interface SwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}

export const Switch = ({ checked, onChange, label }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={[styles.track, checked ? styles.on : ""].filter(Boolean).join(" ")}
    onClick={() => {
      haptics.select();
      onChange(!checked);
    }}
  >
    <motion.span className={styles.knob} layout transition={spring} />
  </button>
);

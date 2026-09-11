import { motion } from "framer-motion";

import { itemVariants } from "@/shared/lib/motion";

import styles from "./StatTile.module.css";

interface StatTileProps {
  icon: string;
  value: string;
  label: string;
  tone?: "neutral" | "accent" | "mint" | "amber";
}

export const StatTile = ({ icon, value, label, tone = "neutral" }: StatTileProps) => (
  <motion.div className={[styles.tile, styles[tone]].join(" ")} variants={itemVariants}>
    <span className={styles.icon}>{icon}</span>
    <span className={styles.value}>{value}</span>
    <span className={styles.label}>{label}</span>
  </motion.div>
);

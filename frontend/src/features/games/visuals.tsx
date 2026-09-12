import type { ReactNode } from "react";

import { BoltIcon, GhostIcon, GridIcon, PhoneIcon, WaveIcon } from "@/shared/ui/icons";

type Tone = "accent" | "live" | "warn" | "danger" | "neutral";

const MAP: Record<string, { Icon: (props: { size?: number }) => ReactNode; tone: Tone }> = {
  mafia: { Icon: GhostIcon, tone: "danger" },
  telephone: { Icon: PhoneIcon, tone: "warn" },
  alias: { Icon: WaveIcon, tone: "live" },
  flappy: { Icon: BoltIcon, tone: "warn" },
  tictactoe: { Icon: GridIcon, tone: "accent" },
};

export const gameVisual = (key: string) => MAP[key] ?? { Icon: GridIcon, tone: "accent" as Tone };

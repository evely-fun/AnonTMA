import alias from "@/assets/games/alias.webp";
import bunker from "@/assets/games/bunker.webp";
import flappy from "@/assets/games/flappy.webp";
import mafia from "@/assets/games/mafia.webp";
import telephone from "@/assets/games/telephone.webp";
import tictactoe from "@/assets/games/tictactoe.webp";

export interface Cover {
  src: string;
  /** Flat background of the artwork, used as the tile behind a loading image. */
  tint: string;
}

const COVERS: Record<string, Cover> = {
  mafia: { src: mafia, tint: "#4e1ea0" },
  bunker: { src: bunker, tint: "#04324c" },
  alias: { src: alias, tint: "#1376de" },
  telephone: { src: telephone, tint: "#e6454e" },
  tictactoe: { src: tictactoe, tint: "#016028" },
  flappy: { src: flappy, tint: "#cf6701" },
};

const FALLBACK: Cover = { src: alias, tint: "#1376de" };

export const gameCover = (key: string): Cover => COVERS[key] ?? FALLBACK;

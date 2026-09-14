import { m } from "motion/react";

import bkAction from "@/assets/bunker/action.webp";
import bkBiology from "@/assets/bunker/biology.webp";
import bkCatastrophe from "@/assets/bunker/catastrophe.webp";
import bkFact from "@/assets/bunker/fact.webp";
import bkHealth from "@/assets/bunker/health.webp";
import bkHobby from "@/assets/bunker/hobby.webp";
import bkLuggage from "@/assets/bunker/luggage.webp";
import bkProfession from "@/assets/bunker/profession.webp";
import bkShelter from "@/assets/bunker/shelter.webp";
import roleCivilian from "@/assets/mafia/civilian.webp";
import roleDoctor from "@/assets/mafia/doctor.webp";
import roleDon from "@/assets/mafia/don.webp";
import roleMafia from "@/assets/mafia/mafia.webp";
import phaseDay from "@/assets/mafia/phase-day.webp";
import phaseNight from "@/assets/mafia/phase-night.webp";
import phaseSpeech from "@/assets/mafia/phase-speech.webp";
import phaseVote from "@/assets/mafia/phase-vote.webp";
import roleSheriff from "@/assets/mafia/sheriff.webp";
import { spring } from "@/shared/lib/motion";

import { Countdown } from "./shared";

/**
 * Every role and every phase is a drawn object rather than an outline glyph,
 * in the same clay as the covers. A hand of five identical icon tiles reads as
 * a settings list; this reads as a game.
 */
export const ROLE_ART: Record<string, string> = {
  mafia: roleMafia,
  don: roleDon,
  sheriff: roleSheriff,
  detective: roleSheriff,
  doctor: roleDoctor,
  civilian: roleCivilian,
};

export const PHASE_ART: Record<string, string> = {
  night: phaseNight,
  first_night: phaseNight,
  reveal: phaseDay,
  morning: phaseDay,
  discussion: phaseDay,
  intro: phaseSpeech,
  speech: phaseSpeech,
  defence: phaseSpeech,
  last_word: phaseSpeech,
  vote: phaseVote,
  table_vote: phaseVote,
  finished: phaseDay,
};

const BLACK = ["mafia", "don"];

/** The card you are dealt. It is the one thing on the screen you must not misread. */
export const RoleCard = ({
  role,
  title,
  hint,
  seat,
}: {
  role: string;
  title: string;
  hint: string;
  seat?: number;
}) => {
  const black = BLACK.includes(role);
  return (
    <m.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.soft}
      className={`role-card relative flex items-center gap-4 overflow-hidden rounded-[22px] px-4 py-4 ${
        black ? "is-black" : "is-red"
      }`}
    >
      <img
        src={ROLE_ART[role] ?? roleCivilian}
        alt=""
        width={72}
        height={72}
        className="size-[72px] shrink-0 object-contain"
      />
      <span className="min-w-0 flex-1">
        {seat !== undefined && seat > 0 && (
          <span className="block font-display text-[12px] font-bold tabular opacity-60">
            {seat}
          </span>
        )}
        <span className="block font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em]">
          {title}
        </span>
        <span className="mt-1 block text-[12.5px] leading-snug opacity-75">{hint}</span>
      </span>
    </m.div>
  );
};

/** What the table is doing right now, and how long it has left to do it. */
export const PhaseBanner = ({
  phase,
  eyebrow,
  title,
  seconds,
}: {
  phase: string;
  eyebrow?: string;
  title: string;
  seconds?: number;
}) => (
  <div className="flex items-center gap-3">
    <m.img
      key={phase}
      src={PHASE_ART[phase] ?? phaseDay}
      alt=""
      width={46}
      height={46}
      initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={spring.snappy}
      className="size-[46px] shrink-0 object-contain"
    />
    <span className="min-w-0 flex-1">
      {eyebrow && <span className="block text-[12px] text-hint">{eyebrow}</span>}
      <span className="mt-0.5 block truncate font-display text-[17px] font-extrabold tracking-[-0.02em]">
        {title}
      </span>
    </span>
    {seconds !== undefined && seconds > 0 && <Countdown seconds={seconds} />}
  </div>
);

/**
 * The Bunker deck. One drawn object per kind of card, so a dossier is six
 * distinct things rather than six lines of text, and a card keeps its identity
 * wherever it is shown: in your hand, opened on the table, or in the shelter
 * header at the top of the screen.
 */
export const CARD_ART: Record<string, string> = {
  profession: bkProfession,
  biology: bkBiology,
  health: bkHealth,
  hobby: bkHobby,
  luggage: bkLuggage,
  fact: bkFact,
  action: bkAction,
  catastrophe: bkCatastrophe,
  shelter: bkShelter,
};

/** The hue each kind of card is filed under, so a row of them is readable. */
const CARD_HUE: Record<string, string> = {
  profession: "245",
  biology: "158",
  health: "28",
  hobby: "62",
  luggage: "292",
  fact: "38",
  action: "185",
};

export const BunkerCard = ({
  field,
  label,
  value,
  opened = true,
  compact = false,
  onClick,
}: {
  field: string;
  label: string;
  value: string;
  opened?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) => {
  const Tag = onClick ? m.button : m.div;
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      transition={spring.snappy}
      style={{ "--card-hue": CARD_HUE[field] ?? "245" } as React.CSSProperties}
      className={`bunker-card flex w-full items-center gap-3 text-left ${
        compact ? "is-compact" : ""
      } ${opened ? "" : "is-closed"}`}
    >
      <img
        src={CARD_ART[field] ?? bkFact}
        alt=""
        width={compact ? 30 : 40}
        height={compact ? 30 : 40}
        className={`${compact ? "size-[30px]" : "size-10"} shrink-0 object-contain`}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] opacity-55">{label}</span>
        <span
          className={`block truncate font-display font-extrabold tracking-[-0.01em] ${
            compact ? "text-[13px]" : "text-[14.5px]"
          }`}
        >
          {opened ? value : "· · ·"}
        </span>
      </span>
    </Tag>
  );
};

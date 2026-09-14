import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/shared/i18n";
import { rise } from "@/shared/lib/motion";
import { haptic } from "@/shared/lib/telegram";
import { Avatar, Button, Chip, Panel } from "@/shared/ui";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";

import { PhaseBanner } from "./art";
import { DrawCanvas, DrawnSheet, type Stroke } from "./DrawCanvas";

interface Step {
  by: number;
  kind: "write" | "draw";
  text?: string;
  strokes?: Stroke[];
}

interface Sheet {
  owner: number;
  suggestion: string;
  steps: Step[];
}

interface View {
  phase: string;
  step: number;
  steps: number;
  kind: "write" | "draw" | null;
  yourSheet: number | null;
  prompt: string | null;
  previous: Step | null;
  submitted: boolean;
  waiting: number;
  sheets: Sheet[];
  owners: number[];
  votes: Record<string, number>;
  voted: boolean;
  winner: number | null;
  secondsLeft: number;
}

export const TelephoneBoard = ({ view }: { view: View }) => {
  const { t } = useT();
  const act = useGames((state) => state.act);
  const members = useRooms((state) => state.members);
  const profile = useSession((state) => state.profile);
  const [text, setText] = useState("");
  const strokes = useRef<Stroke[]>([]);
  const [ready, setReady] = useState(false);

  // A fresh sheet every step, so nothing carries over from the last one.
  useEffect(() => {
    setText("");
    strokes.current = [];
    setReady(false);
  }, [view.step, view.phase]);

  const nameOf = (userId: number) =>
    userId === profile?.id
      ? t("common.you")
      : (members.find((item) => item.userId === userId)?.anonName.split(" ")[0] ?? `#${userId}`);
  const seedOf = (userId: number) =>
    members.find((item) => item.userId === userId)?.avatarSeed ?? String(userId);

  const submitWrite = () => {
    if (text.trim().length < 2) return;
    haptic.impact("light");
    act("submit", { text: text.trim() });
  };

  const submitDraw = () => {
    if (strokes.current.length === 0) return;
    haptic.impact("light");
    act("submit", { strokes: strokes.current });
  };

  const showing = view.phase === "gallery" || view.phase === "vote" || view.phase === "finished";

  return (
    <div className="flex flex-col gap-4">
      <PhaseBanner
        phase={view.kind === "draw" ? "discussion" : "speech"}
        eyebrow={
          showing
            ? t("games.board.telephone.gallery")
            : t("games.board.telephone.stepOf", { current: view.step + 1, total: view.steps })
        }
        title={
          showing
            ? view.phase === "vote"
              ? t("games.board.telephone.pickBest")
              : t("games.board.telephone.howItWent")
            : view.kind === "draw"
              ? t("games.board.telephone.drawIt")
              : view.step === 0
                ? t("games.board.telephone.writeSituation")
                : t("games.board.telephone.whatIsIt")
        }
        seconds={view.secondsLeft}
      />

      {!showing && view.submitted && (
        <Panel className="mx-0 px-4 py-6 text-center">
          <p className="text-[13.5px] text-hint">
            {t("games.board.telephone.waitingFor", { count: view.waiting })}
          </p>
        </Panel>
      )}

      {/* Your turn. You see exactly one thing: the step before yours. */}
      {!showing && !view.submitted && view.kind === "write" && (
        <>
          {view.previous?.strokes ? (
            <div className="flex justify-center">
              <DrawnSheet strokes={view.previous.strokes} size={280} />
            </div>
          ) : (
            <Panel className="mx-0 px-4 py-4">
              <p className="text-[12.5px] text-hint">
                {t("games.board.telephone.suggestion")}
              </p>
              <p className="mt-1 font-display text-[15px] font-bold leading-snug">
                {view.prompt ?? t("games.board.telephone.anything")}
              </p>
            </Panel>
          )}

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 120))}
            rows={2}
            placeholder={
              view.previous?.strokes
                ? t("games.board.telephone.whatIsIt")
                : t("games.board.telephone.writePlaceholder")
            }
            className="w-full resize-none rounded-[16px] bg-elevated px-4 py-3 text-[14.5px] outline-none"
          />
          <Button full disabled={text.trim().length < 2} onClick={submitWrite}>
            {t("games.board.telephone.pass")}
          </Button>
        </>
      )}

      {!showing && !view.submitted && view.kind === "draw" && (
        <>
          <Panel className="mx-0 px-4 py-3.5">
            <p className="text-[12.5px] text-hint">{t("games.board.telephone.drawThis")}</p>
            <p className="mt-1 font-display text-[15px] font-bold leading-snug">
              {view.previous?.text ?? "…"}
            </p>
          </Panel>
          <DrawCanvas
            onChange={(value) => {
              strokes.current = value;
              setReady(value.length > 0);
            }}
          />
          <Button full disabled={!ready} onClick={submitDraw}>
            {t("games.board.telephone.pass")}
          </Button>
        </>
      )}

      {/* The whole point of the game: every chain laid out side by side. */}
      {showing && (
        <div className="flex flex-col gap-4">
          {view.sheets.map((sheet, index) => {
            const votes = Object.values(view.votes).filter((value) => value === index).length;
            const mine = sheet.owner === profile?.id;
            const won = view.winner === index;
            return (
              <m.div
                key={index}
                variants={rise}
                initial="initial"
                animate="animate"
                className={`flex flex-col gap-2.5 rounded-[20px] px-4 py-4 ${
                  won ? "bg-accent-quiet" : "panel"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar seed={seedOf(sheet.owner)} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                    {t("games.board.telephone.startedBy", { name: nameOf(sheet.owner) })}
                  </span>
                  {votes > 0 && <Chip tone={won ? "live" : undefined}>{votes}</Chip>}
                </div>

                <div className="flex flex-col gap-2">
                  {sheet.steps.map((step, position) => (
                    <div key={position} className="flex items-start gap-2.5">
                      <Avatar seed={seedOf(step.by)} size={22} />
                      {step.kind === "draw" && step.strokes ? (
                        <DrawnSheet strokes={step.strokes} size={132} />
                      ) : (
                        <span className="min-w-0 flex-1 rounded-[12px] bg-elevated px-3 py-2 text-[13px] leading-snug">
                          {step.text}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {view.phase === "vote" && !view.voted && !mine && (
                  <Button
                    full
                    variant="surface"
                    onClick={() => {
                      haptic.select();
                      act("vote", { sheet: index });
                    }}
                  >
                    {t("games.board.telephone.voteThis")}
                  </Button>
                )}
              </m.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

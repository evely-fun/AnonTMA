import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { request } from "@/shared/lib/api";
import { itemVariants, listVariants } from "@/shared/lib/motion";
import { Card, Chip, Screen, Section } from "@/shared/ui";
import { useSession } from "@/store/session";

import styles from "./GamesPage.module.css";

interface SummaryItem {
  gameKey: string;
  played: number;
  won: number;
  best: number;
}

export const GamesPage = () => {
  const navigate = useNavigate();
  const games = useSession((state) => state.games);
  const [summary, setSummary] = useState<SummaryItem[]>([]);

  useEffect(() => {
    void request<{ items: SummaryItem[] }>("/games/summary")
      .then((response) => setSummary(response.items))
      .catch(() => setSummary([]));
  }, []);

  const statsFor = (key: string): SummaryItem | undefined =>
    summary.find((item) => item.gameKey === key);

  return (
    <Screen title="Games" subtitle="play with voice">
      <Section title="Pick a game" subtitle="Everything works with the voice channel">
        <motion.div className={styles.list} variants={listVariants} initial="initial" animate="animate">
          {games.map((game) => {
            const stats = statsFor(game.key);
            return (
              <motion.div key={game.key} variants={itemVariants}>
                <Card onClick={() => navigate(`/games/${game.key}`)} className={styles.card}>
                  <span
                    className={styles.glow}
                    style={{ background: `radial-gradient(60% 60% at 20% 0%, ${game.accent}33, transparent)` }}
                  />
                  <div className={styles.cardBody}>
                    <span className={styles.icon} style={{ background: `${game.accent}22`, color: game.accent }}>
                      {game.icon}
                    </span>
                    <div className={styles.cardText}>
                      <div className={styles.titleRow}>
                        <h3 className={styles.title}>{game.title}</h3>
                        {game.voiceRequired ? (
                          <Chip size="sm" tone="mint">
                            voice
                          </Chip>
                        ) : null}
                      </div>
                      <p className={styles.subtitle}>{game.subtitle}</p>
                      <div className={styles.meta}>
                        <span>
                          {game.minPlayers}–{game.maxPlayers} players
                        </span>
                        <span className={styles.dot} />
                        <span>{game.durationMinutes} min</span>
                        {stats && stats.played > 0 ? (
                          <>
                            <span className={styles.dot} />
                            <span>
                              {stats.won}/{stats.played} won
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </Section>
    </Screen>
  );
};

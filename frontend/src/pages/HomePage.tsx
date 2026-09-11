import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { itemVariants, listVariants } from "@/shared/lib/motion";
import { compactNumber } from "@/shared/lib/format";
import { Avatar, Button, Card, Chip, ProgressBar, Screen, Section, Segmented } from "@/shared/ui";
import { useChat } from "@/store/chat";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";

import styles from "./HomePage.module.css";

const QUICK_LINKS = [
  { to: "/rooms", icon: "◍", title: "Voice rooms", hint: "Join a live topic" },
  { to: "/games", icon: "◈", title: "Games", hint: "Mafia, Alias and more" },
  { to: "/friends", icon: "◐", title: "Friends", hint: "Call the people you liked" },
  { to: "/leaderboard", icon: "✦", title: "Leaderboard", hint: "Climb the ranks" },
];

export const HomePage = () => {
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const presence = useSession((state) => state.presence);
  const connection = useSession((state) => state.connection);
  const startSearch = useChat((state) => state.startSearch);
  const loadSocial = useSocial((state) => state.load);
  const friends = useSocial((state) => state.friends);
  const [mode, setMode] = useState<"voice" | "text">("voice");

  useEffect(() => {
    void loadSocial();
  }, [loadSocial]);

  const onlineFriends = friends.filter((friend) => friend.isOnline).slice(0, 6);
  const progress = profile?.progress;

  const begin = (): void => {
    startSearch(mode);
    navigate("/chat");
  };

  return (
    <Screen>
      <motion.div variants={listVariants} initial="initial" animate="animate" className={styles.stack}>
        <motion.header variants={itemVariants} className={styles.top}>
          <div className={styles.identity}>
            <Avatar seed={profile?.avatarSeed ?? "anon"} size={44} />
            <div className={styles.identityText}>
              <span className={styles.greeting}>Your mask today</span>
              <span className={styles.mask}>{profile?.anonName ?? "Anonymous"}</span>
            </div>
          </div>
          <button type="button" className={styles.coins} onClick={() => navigate("/profile")}>
            <span className={styles.coinIcon}>◆</span>
            <span className="numeric">{compactNumber(profile?.stats.coins ?? 0)}</span>
          </button>
        </motion.header>

        <motion.div variants={itemVariants}>
          <Card glow padded={false} className={styles.hero}>
            <div className={styles.heroBody}>
              <div className={styles.liveRow}>
                <span className={[styles.liveDot, connection === "online" ? styles.liveOn : ""].join(" ")} />
                <span className={styles.liveText}>
                  <b className="numeric">{compactNumber(presence.online)}</b> online
                </span>
                <span className={styles.liveDivider} />
                <span className={styles.liveText}>
                  <b className="numeric">{compactNumber(presence.searching)}</b> searching
                </span>
              </div>

              <h1 className={styles.heroTitle}>
                Talk to someone
                <br />
                <span className="gradient-text">completely anonymous</span>
              </h1>
              <p className={styles.heroHint}>
                No names, no history. A fresh mask every conversation, voice or text.
              </p>

              <Segmented
                id="home-mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "voice", label: "Voice", icon: "🎙" },
                  { value: "text", label: "Text", icon: "✉️" },
                ]}
              />

              <Button size="lg" full onClick={begin} icon="⚡️">
                Find a companion
              </Button>
            </div>
          </Card>
        </motion.div>

        {progress ? (
          <motion.div variants={itemVariants}>
            <Card>
              <div className={styles.levelRow}>
                <div>
                  <span className={styles.levelTitle}>{progress.title}</span>
                  <span className={styles.levelMeta}>Level {progress.level}</span>
                </div>
                <div className={styles.streak}>
                  <span>🔥</span>
                  <span className="numeric">{profile?.stats.streakDays ?? 0}</span>
                </div>
              </div>
              <ProgressBar
                ratio={progress.ratio}
                hint={`${progress.xpIntoLevel} / ${progress.xpForNext} XP`}
              />
            </Card>
          </motion.div>
        ) : null}

        {onlineFriends.length > 0 ? (
          <motion.div variants={itemVariants}>
            <Section title="Friends online" action={<Chip size="sm" onClick={() => navigate("/friends")}>All</Chip>}>
              <div className={[styles.friendRow, "scroller"].join(" ")}>
                {onlineFriends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    className={styles.friendChip}
                    onClick={() => navigate("/friends")}
                  >
                    <Avatar seed={friend.avatarSeed} size={46} online />
                    <span className={styles.friendName}>{friend.anonName.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            </Section>
          </motion.div>
        ) : null}

        <motion.div variants={itemVariants}>
          <Section title="Explore">
            <div className={styles.grid}>
              {QUICK_LINKS.map((link) => (
                <Card key={link.to} onClick={() => navigate(link.to)} className={styles.quick}>
                  <span className={styles.quickIcon}>{link.icon}</span>
                  <span className={styles.quickTitle}>{link.title}</span>
                  <span className={styles.quickHint}>{link.hint}</span>
                </Card>
              ))}
            </div>
          </Section>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className={styles.safety}>
            <span className={styles.safetyIcon}>🛡</span>
            <div>
              <p className={styles.safetyTitle}>You stay anonymous</p>
              <p className={styles.safetyText}>
                Your Telegram profile is never shared unless both of you tap reveal.
              </p>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </Screen>
  );
};

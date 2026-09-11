import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { request } from "@/shared/lib/api";
import { compactNumber, durationLabel } from "@/shared/lib/format";
import { itemVariants, listVariants } from "@/shared/lib/motion";
import { openLink } from "@/shared/lib/telegram";
import type { Achievement, Profile } from "@/shared/lib/types";
import {
  Avatar,
  Button,
  Card,
  Chip,
  IconButton,
  LevelRing,
  ProgressBar,
  Screen,
  Section,
  Sheet,
  StatTile,
} from "@/shared/ui";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";
import { toast } from "@/store/ui";

import styles from "./ProfilePage.module.css";

const INTERESTS = [
  "music",
  "films",
  "games",
  "travel",
  "sport",
  "books",
  "tech",
  "art",
  "food",
  "science",
  "memes",
  "night talks",
];

export const ProfilePage = () => {
  const navigate = useNavigate();
  const profile = useSession((state) => state.profile);
  const patchProfile = useSession((state) => state.patchProfile);
  const refreshProfile = useSession((state) => state.refreshProfile);
  const inviteLink = useSocial((state) => state.inviteLink);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    void request<Achievement[]>("/users/me/achievements")
      .then(setAchievements)
      .catch(() => setAchievements([]));
  }, []);

  useEffect(() => {
    setBio(profile?.bio ?? "");
    setInterests(profile?.interests ?? []);
  }, [profile?.bio, profile?.interests]);

  if (!profile) {
    return <Screen title="Profile" />;
  }

  const stats = profile.stats;
  const unlocked = achievements.filter((item) => item.unlocked);

  const save = async (): Promise<void> => {
    const updated = await request<Profile>("/users/me", {
      method: "PATCH",
      body: { bio, interests },
    });
    patchProfile(updated);
    setEditing(false);
    toast("Profile updated", { icon: "✅", tone: "success" });
  };

  const regenerate = async (): Promise<void> => {
    const updated = await request<Profile>("/users/me", {
      method: "PATCH",
      body: { regenerateMask: true },
    });
    patchProfile(updated);
    toast("New mask generated", { icon: "🎭", tone: "success" });
  };

  const invite = async (): Promise<void> => {
    const link = await inviteLink();
    if (link) {
      openLink(link.shareUrl);
    }
  };

  return (
    <Screen
      title="Profile"
      trailing={
        <IconButton label="Settings" size="sm" onClick={() => navigate("/settings")}>
          ⚙
        </IconButton>
      }
    >
      <motion.div variants={listVariants} initial="initial" animate="animate" className={styles.stack}>
        <motion.div variants={itemVariants}>
          <Card glow className={styles.hero}>
            <div className={styles.heroTop}>
              <Avatar seed={profile.avatarSeed} size={76} />
              <LevelRing level={profile.progress.level} ratio={profile.progress.ratio} size={76} />
            </div>
            <h2 className={styles.name}>{profile.anonName}</h2>
            <p className={styles.title}>{profile.progress.title}</p>
            {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
            <ProgressBar
              ratio={profile.progress.ratio}
              hint={`${profile.progress.xpIntoLevel} / ${profile.progress.xpForNext} XP`}
            />
            <div className={styles.heroActions}>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void regenerate()}>
                New mask
              </Button>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Section title="Your numbers">
            <div className={styles.grid}>
              <StatTile icon="💬" value={compactNumber(stats.dialogsTotal)} label="chats" />
              <StatTile
                icon="🎙"
                value={durationLabel(stats.voiceSeconds)}
                label="voice"
                tone="mint"
              />
              <StatTile icon="🎮" value={`${stats.gamesWon}/${stats.gamesPlayed}`} label="games" />
              <StatTile icon="💜" value={compactNumber(stats.likesReceived)} label="likes" />
              <StatTile icon="🔥" value={String(stats.streakDays)} label="streak" tone="amber" />
              <StatTile icon="◆" value={compactNumber(stats.coins)} label="coins" tone="accent" />
            </div>
          </Section>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Section
            title="Achievements"
            subtitle={`${unlocked.length} of ${achievements.length} unlocked`}
          >
            <div className={styles.achievements}>
              {achievements.map((item) => (
                <div
                  key={item.key}
                  className={[styles.achievement, item.unlocked ? styles.achievementOn : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className={styles.achievementIcon}>{item.icon}</span>
                  <div className={styles.achievementBody}>
                    <span className={styles.achievementTitle}>{item.title}</span>
                    <span className={styles.achievementHint}>{item.description}</span>
                    {!item.unlocked ? (
                      <ProgressBar ratio={item.progress / item.threshold} tone="accent" />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card onClick={() => void invite()} className={styles.invite}>
            <span className={styles.inviteIcon}>🎁</span>
            <div>
              <p className={styles.inviteTitle}>Invite a friend</p>
              <p className={styles.inviteHint}>You both get 100 coins when they join</p>
            </div>
          </Card>
        </motion.div>
      </motion.div>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit profile"
        footer={
          <Button full onClick={() => void save()}>
            Save
          </Button>
        }
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="bio">
            About you
          </label>
          <textarea
            id="bio"
            className={styles.textarea}
            value={bio}
            maxLength={200}
            rows={3}
            placeholder="A short line, no personal details"
            onChange={(event) => setBio(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Interests</label>
          <div className={styles.chipRow}>
            {INTERESTS.map((item) => (
              <Chip
                key={item}
                active={interests.includes(item)}
                onClick={() =>
                  setInterests((current) =>
                    current.includes(item)
                      ? current.filter((entry) => entry !== item)
                      : [...current, item].slice(0, 8),
                  )
                }
              >
                {item}
              </Chip>
            ))}
          </div>
        </div>
        <Button variant="ghost" onClick={() => void refreshProfile()}>
          Refresh stats
        </Button>
      </Sheet>
    </Screen>
  );
};

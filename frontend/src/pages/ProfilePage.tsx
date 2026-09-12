import { m } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { request } from "@/shared/lib/api";
import { compactNumber, durationLabel } from "@/shared/lib/format";
import { listStagger, rise } from "@/shared/lib/motion";
import { openLink } from "@/shared/lib/telegram";
import type { Achievement, Profile } from "@/shared/lib/types";
import {
  Avatar,
  Button,
  Chip,
  IconTile,
  ListRow,
  Meter,
  Panel,
  SectionHead,
  Sheet,
  StatTile,
  TabScreen,
} from "@/shared/ui";
import {
  ChatIcon,
  CheckIcon,
  LockIcon,
  CrownIcon,
  FlameIcon,
  GamesIcon,
  HeartIcon,
  LinkIcon,
  MaskIcon,
  MicIcon,
  SettingsIcon,
} from "@/shared/ui/icons";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";
import { toast } from "@/store/ui";

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
  const inviteLink = useSocial((state) => state.inviteLink);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void request<Achievement[]>("/users/me/achievements")
      .then(setAchievements)
      .catch(() => setAchievements([]));
  }, []);

  useEffect(() => {
    setBio(profile?.bio ?? "");
    setInterests(profile?.interests ?? []);
  }, [profile?.bio, profile?.interests]);

  if (!profile) return null;

  const stats = profile.stats;
  const progress = profile.progress;
  const unlocked = achievements.filter((item) => item.unlocked);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await request<Profile>("/users/me", {
        method: "PATCH",
        body: { bio, interests },
      });
      patchProfile(updated);
      setEditing(false);
      toast("Profile updated", { tone: "success" });
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    const updated = await request<Profile>("/users/me", {
      method: "PATCH",
      body: { regenerateMask: true },
    });
    patchProfile(updated);
    toast("New mask generated", { tone: "success", description: updated.anonName });
  };

  const invite = async () => {
    const link = await inviteLink();
    if (link) openLink(link.shareUrl);
  };

  return (
    <TabScreen>
      <m.div className="space-y-7 pb-4" variants={listStagger} initial="initial" animate="animate">
        <m.section className="px-4" variants={rise}>
          <div className="panel-hero rounded-[24px] px-5 py-5">
            <div className="flex items-center gap-4">
              <Avatar seed={profile.avatarSeed} size={68} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-[21px] font-extrabold tracking-[-0.025em]">
                  {profile.anonName}
                </h2>
                <p className="font-display text-[11.5px] font-bold uppercase tracking-[0.12em] text-accent">
                  {progress.title} · level {progress.level}
                </p>
              </div>
            </div>

            {profile.bio && (
              <p className="mt-3.5 text-[13.5px] leading-snug text-secondary">{profile.bio}</p>
            )}

            <div className="mt-4">
              <Meter ratio={progress.ratio} />
              <p className="mt-2 font-display text-[11px] font-bold uppercase tracking-[0.1em] text-hint tabular">
                {progress.xpIntoLevel} / {progress.xpForNext} xp to level {progress.level + 1}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="surface" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
              <Button
                size="sm"
                variant="quiet"
                icon={<MaskIcon size={15} />}
                onClick={() => void regenerate()}
              >
                New mask
              </Button>
            </div>
          </div>
        </m.section>

        <m.section variants={rise}>
          <SectionHead title="Your numbers" />
          <div className="grid grid-cols-3 gap-2 px-4">
            <StatTile
              icon={<ChatIcon size={15} />}
              value={compactNumber(stats.dialogsTotal)}
              label="chats"
            />
            <StatTile
              icon={<MicIcon size={15} />}
              value={durationLabel(stats.voiceSeconds)}
              label="voice"
              tone="live"
            />
            <StatTile
              icon={<GamesIcon size={15} />}
              value={`${stats.gamesWon}/${stats.gamesPlayed}`}
              label="games"
            />
            <StatTile
              icon={<HeartIcon size={15} />}
              value={compactNumber(stats.likesReceived)}
              label="likes"
            />
            <StatTile
              icon={<FlameIcon size={15} />}
              value={String(stats.streakDays)}
              label="streak"
              tone="warn"
            />
            <StatTile
              icon={<CrownIcon size={15} />}
              value={String(stats.rating)}
              label="rating"
              tone="accent"
            />
          </div>
        </m.section>

        <m.section variants={rise}>
          <SectionHead
            title="Achievements"
            trailing={
              <span className="font-display text-[12px] font-bold text-hint tabular">
                {unlocked.length}/{achievements.length}
              </span>
            }
          />
          <div className="space-y-2 px-4">
            {achievements.slice(0, 8).map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-3.5 rounded-[16px] px-4 py-3 ${
                  item.unlocked ? "panel" : "border border-separator"
                }`}
              >
                <IconTile tone={item.unlocked ? "accent" : "neutral"} size={36}>
                  {item.unlocked ? <CheckIcon size={16} /> : <LockIcon size={15} />}
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate font-display text-[14px] font-bold ${
                      item.unlocked ? "text-label" : "text-secondary"
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="truncate text-[11.5px] text-hint">{item.description}</p>
                  {!item.unlocked && (
                    <div className="mt-2">
                      <Meter ratio={item.progress / item.threshold} height={4} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </m.section>

        <m.section variants={rise}>
          <Panel divided>
            <ListRow
              leading={
                <IconTile tone="live">
                  <LinkIcon size={18} />
                </IconTile>
              }
              title="Invite a friend"
              subtitle="You both get 100 coins"
              chevron
              onClick={() => void invite()}
            />
            <ListRow
              leading={
                <IconTile>
                  <CrownIcon size={18} />
                </IconTile>
              }
              title="Leaderboard"
              subtitle="See where you stand"
              chevron
              onClick={() => navigate("/leaderboard")}
            />
            <ListRow
              leading={
                <IconTile>
                  <SettingsIcon size={18} />
                </IconTile>
              }
              title="Settings"
              subtitle="Voice, matching, privacy"
              chevron
              onClick={() => navigate("/settings")}
            />
          </Panel>
          <p className="px-6 pt-3 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-hint">
            Anon v1.0
          </p>
        </m.section>
      </m.div>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit profile"
        description="Keep it anonymous, no personal details."
        footer={
          <Button full loading={busy} onClick={() => void save()}>
            Save
          </Button>
        }
      >
        <div className="space-y-4 pb-2">
          <div>
            <SectionHead title="About you" />
            <textarea
              className="w-full rounded-[16px] bg-elevated/60 px-4 py-3 text-[14.5px] leading-snug"
              value={bio}
              maxLength={200}
              rows={3}
              placeholder="One line about you"
              onChange={(event) => setBio(event.target.value)}
            />
          </div>
          <div>
            <SectionHead title="Interests" note="Used to find better matches" />
            <div className="flex flex-wrap gap-2 px-5">
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
        </div>
      </Sheet>
    </TabScreen>
  );
};

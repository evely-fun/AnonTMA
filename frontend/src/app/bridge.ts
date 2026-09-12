import { peerManager } from "@/features/voice/webrtc";
import { celebrate, shower } from "@/shared/lib/celebrate";
import { translate } from "@/shared/i18n";
import { haptics } from "@/shared/lib/telegram";
import { realtime } from "@/shared/lib/socket";
import type { PresenceSnapshot, Reward, RoomMember } from "@/shared/lib/types";
import { useChat } from "@/store/chat";
import { useEconomy } from "@/store/economy";
import { useGames } from "@/store/games";
import { useRooms } from "@/store/rooms";
import { useSession } from "@/store/session";
import { useSocial } from "@/store/social";
import { toast } from "@/store/ui";
import { useVoice } from "@/store/voice";

const rewardToast = (reward: Reward | undefined, title: string): void => {
  if (!reward || (!reward.xp && !reward.coins)) {
    return;
  }
  if (reward.levelUp) {
    shower();
    haptics.notify("success");
    toast(translate("progression.levelUp", { level: reward.level ?? 0 }), {
      description: translate("progression.levelUpBody"),
      tone: "success",
    });
  } else if (reward.achievements?.length) {
    celebrate("small");
  }
  toast(title, {
    description: `+${reward.xp ?? 0} XP · +${reward.coins ?? 0} ${translate("common.coins")}`,
    icon: reward.levelUp ? "🎉" : "✨",
    tone: "success",
  });
  reward.achievements?.forEach((achievement) => {
    toast(translate(`achievements.${achievement.key}.title`), {
      description: translate(`achievements.${achievement.key}.description`),
      icon: achievement.icon,
      tone: "success",
    });
  });
};

let bound = false;

export const bindRealtime = (): void => {
  if (bound) {
    return;
  }
  bound = true;

  let wasOnline = false;

  realtime.onStatus((status) => {
    useSession.getState().setConnection(status);
    // A backgrounded webview drops the socket. Nothing re-enters the room on
    // its own, so the roster would stay frozen and the room would look empty.
    if (status === "online") {
      if (wasOnline) {
        const room = useRooms.getState().current;
        if (room) {
          realtime.send("room.join", { roomId: room.id });
        }
      }
      wasOnline = true;
    }
  });

  peerManager.onBlocked((blocked) => useVoice.getState().setPlaybackBlocked(blocked));

  realtime.on("ready", (payload) => {
    useSession.getState().setPresence(payload.presence as PresenceSnapshot);
    const dialog = payload.dialog as Record<string, unknown> | null;
    if (dialog) {
      useChat.getState().matched({ ...dialog, polite: true });
    }
  });

  realtime.on("pong", (payload) => {
    const online = Number(payload.online ?? 0);
    const presence = useSession.getState().presence;
    useSession.getState().setPresence({ ...presence, online });
  });

  realtime.on("presence.snapshot", (payload) => {
    useSession.getState().setPresence(payload as unknown as PresenceSnapshot);
  });

  realtime.on("match.searching", (payload) => {
    useChat.getState().setQueue(Number(payload.queue ?? 0));
  });

  realtime.on("match.found", (payload) => {
    haptics.notify("success");
    useChat.getState().matched(payload);
    const partnerId = Number(payload.partnerId);
    const polite = Boolean(payload.polite);
    if (payload.mode === "voice") {
      void useVoice
        .getState()
        .enable()
        .then((granted) => {
          if (granted) {
            peerManager.connect(partnerId, polite);
          }
        });
    }
  });

  realtime.on("dialog.message", (payload) => {
    const state = useChat.getState();
    const own = Number(payload.from) === useSession.getState().profile?.id;
    if (own) {
      return;
    }
    haptics.impact("light");
    state.appendMessage({
      id: Number(payload.id),
      text: String(payload.text),
      from: Number(payload.from),
      own: false,
      createdAt: String(payload.createdAt),
    });
  });

  realtime.on("dialog.typing", (payload) => {
    useChat.getState().setPartnerTyping(Boolean(payload.typing));
  });

  realtime.on("dialog.partner_liked", () => {
    useChat.getState().setPartnerLiked();
    toast(translate("chat.partnerLiked"), { tone: "success" });
  });

  realtime.on("dialog.reveal_request", () => {
    haptics.notify("warning");
    useChat.getState().setRevealIncoming(true);
  });

  realtime.on("dialog.reveal_declined", () => {
    useChat.getState().setRevealIncoming(false);
    useChat.getState().setRevealPending(false);
    toast(translate("chat.revealDeclined"));
  });

  realtime.on("dialog.revealed", (payload) => {
    haptics.notify("success");
    useChat.getState().setRevealed({
      userId: Number(payload.userId),
      anonName: String(payload.anonName),
      avatarSeed: String(payload.avatarSeed ?? ""),
      name: (payload.name as string | null) ?? null,
      username: (payload.username as string | null) ?? null,
      photoUrl: (payload.photoUrl as string | null) ?? null,
      level: Number(payload.level ?? 1),
      friend: Boolean(payload.friend),
    });
    toast(translate("chat.revealed"), {
      description: payload.friend ? translate("chat.revealedFriend") : undefined,
      tone: "success",
    });
    void useSocial.getState().load();
  });

  realtime.on("dialog.ended", (payload) => {
    const partnerId = useChat.getState().partnerId;
    if (partnerId) {
      peerManager.disconnect(partnerId);
    }
    void useVoice.getState().disable();
    useChat.getState().finish({
      durationSeconds: Number(payload.durationSeconds ?? 0),
      reward: (payload.reward as Reward) ?? {},
      mutualLike: Boolean(payload.mutualLike),
      reason: String(payload.reason ?? "ended"),
    });
    rewardToast(payload.reward as Reward, translate("chat.finished"));
    void useSession.getState().refreshProfile();
    void useEconomy.getState().load();
  });

  realtime.on("room.joined", (payload) => {
    useRooms.getState().setMembers(payload.members as RoomMember[]);
    const peers = (payload.peers as number[]) ?? [];
    const selfId = useSession.getState().profile?.id ?? 0;
    void useVoice
      .getState()
      .enable()
      .then((granted) => {
        if (!granted) {
          return;
        }
        peers.forEach((peerId) => peerManager.connect(peerId, selfId < peerId));
      });
  });

  realtime.on("room.roster", (payload) => {
    useRooms.getState().setMembers(payload.members as RoomMember[]);
  });

  realtime.on("room.member_joined", (payload) => {
    const member = payload.member as RoomMember;
    useRooms.getState().upsertMember(member);
    const selfId = useSession.getState().profile?.id ?? 0;
    if (member.userId !== selfId && useVoice.getState().active) {
      peerManager.connect(member.userId, selfId < member.userId);
    }
  });

  realtime.on("room.member_updated", (payload) => {
    useRooms.getState().upsertMember(payload.member as RoomMember);
  });

  realtime.on("room.kicked", () => {
    haptics.notify("warning");
    toast(translate("moderation.kicked"), { tone: "danger" });
    useRooms.getState().setKicked(true);
  });

  realtime.on("room.moderation", (payload) => {
    const action = String(payload.action ?? "");
    if (action === "mute") {
      haptics.notify("warning");
      toast(translate("moderation.forceMuted"), { tone: "danger" });
      void useVoice.getState().mute();
    } else if (action === "unmute") {
      toast(translate("moderation.unmutedByHost"), { tone: "success" });
    }
  });

  realtime.on("room.member_left", (payload) => {
    const userId = Number(payload.userId);
    useRooms.getState().removeMember(userId);
    peerManager.disconnect(userId);
  });

  realtime.on("room.message", (payload) => {
    useRooms.getState().appendMessage({
      id: Number(payload.id),
      from: Number(payload.from),
      anonName: String(payload.anonName ?? "Anon"),
      text: String(payload.text),
      createdAt: new Date().toISOString(),
    });
  });

  realtime.on("friend.request", (payload) => {
    toast(translate("friends.newRequest"), { description: String(payload.anonName ?? "") });
    void useSocial.getState().load();
  });

  realtime.on("friend.accepted", () => {
    toast(translate("friends.accepted"), { tone: "success" });
    void useSocial.getState().load();
  });

  realtime.on("call.incoming", (payload) => {
    haptics.notify("warning");
    useSocial.getState().setIncomingCall({
      callId: String(payload.callId),
      mode: (payload.mode as "voice" | "text") ?? "voice",
      from: payload.from as { userId: number; anonName: string; avatarSeed: string },
    });
  });

  realtime.on("call.ringing", (payload) => {
    useSocial.getState().setActiveCall({
      callId: String(payload.callId),
      userId: Number(payload.userId),
      polite: false,
      status: "ringing",
    });
  });

  realtime.on("call.accepted", (payload) => {
    const social = useSocial.getState();
    const current = social.activeCall;
    const incoming = social.incomingCall;
    const peerId = current?.userId ?? incoming?.from.userId ?? 0;
    const polite = Boolean(payload.polite);
    social.setActiveCall({
      callId: String(payload.callId),
      userId: peerId,
      polite,
      status: "active",
    });
    social.setIncomingCall(null);
    void useVoice
      .getState()
      .enable()
      .then((granted) => {
        if (granted && peerId) {
          peerManager.connect(peerId, polite);
        }
      });
  });

  realtime.on("call.declined", () => {
    toast(translate("friends.declined"));
    useSocial.getState().setActiveCall(null);
  });

  realtime.on("call.ended", () => {
    const call = useSocial.getState().activeCall;
    if (call) {
      peerManager.disconnect(call.userId);
    }
    void useVoice.getState().disable();
    useSocial.getState().setActiveCall(null);
    useSocial.getState().setIncomingCall(null);
  });

  realtime.on("game.created", (payload) => {
    useGames.getState().created(payload);
  });

  realtime.on("game.state", (payload) => {
    useGames.getState().setView(payload);
  });

  realtime.on("game.rewards", (payload) => {
    useGames.getState().setReward(payload.reward as Reward);
    rewardToast(payload.reward as Reward, translate("games.board.gameOver"));
    void useSession.getState().refreshProfile();
    void useEconomy.getState().load();
  });

  realtime.on("mafia.role", (payload) => {
    useGames.getState().mergePrivate({ role: payload.role, team: payload.team });
  });

  realtime.on("mafia.check_result", (payload) => {
    toast(payload.isMafia ? translate("games.board.mafiaTag") : translate("games.board.cleanTag"), {
      description: `#${payload.target}`,
      tone: payload.isMafia ? "danger" : "success",
    });
  });

  realtime.on("alias.word", (payload) => {
    useGames.getState().mergePrivate({ word: payload.word });
  });

  realtime.on("telephone.phrase", (payload) => {
    useGames.getState().mergePrivate({ phrase: payload.phrase });
  });

  realtime.on("telephone.turn", (payload) => {
    const route = [payload.speaker, payload.listener].filter(Boolean) as number[];
    peerManager.restrictAudio(route);
  });

  realtime.on("error", (payload) => {
    const code = String(payload.code ?? "error");
    if (code === "rate_limited") {
      return;
    }
    const known = translate(`errors.${code}`);
    const message = known === `errors.${code}` ? String(payload.message ?? translate("errors.generic")) : known;
    if (code === "no_energy") {
      toast(message, { description: translate("economy.notEnoughHint"), tone: "danger" });
      useChat.getState().reset();
      void useEconomy.getState().load();
      return;
    }
    toast(message, { tone: "danger" });
  });

  const gameEvents = [
    "game.move",
    "game.round",
    "game.reset",
    "game.phase",
    "game.finished",
    "game.aborted",
    "mafia.night_result",
    "mafia.vote_result",
    "mafia.vote",
    "alias.guess",
    "alias.score",
    "alias.round_over",
    "telephone.reveal",
    "flappy.countdown",
    "flappy.go",
    "flappy.progress",
    "flappy.crash",
  ];
  gameEvents.forEach((type) => {
    realtime.on(type, (payload) => useGames.getState().pushEvent(type, payload));
  });
};

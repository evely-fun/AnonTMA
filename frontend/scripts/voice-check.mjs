import { chromium } from "playwright";

const API = process.env.API_URL ?? "http://127.0.0.1:8000";
const APP = process.env.APP_URL ?? "http://127.0.0.1:4173";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const login = async (tgId) => {
  const response = await fetch(`${API}/api/v1/auth/dev?tg_id=${tgId}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`dev login failed for ${tgId}: ${response.status}`);
  }
  return response.json();
};

const openApp = async (browser, tokens, label, errors) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["microphone"],
  });
  context.on("weberror", (error) => errors.push(`${label} weberror: ${error.error()}`));

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`${label} console: ${message.text()}`);
    }
  });

  await page.addInitScript(
    ([access, refresh]) => {
      window.localStorage.setItem("anon.access", access);
      window.localStorage.setItem("anon.refresh", refresh);
    },
    [tokens.accessToken, tokens.refreshToken],
  );

  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return { context, page };
};

const startVoice = (page) =>
  page.evaluate(async () => {
    const store = window.__voiceStore;
    await store.getState().enable();
    return store.getState().permission;
  });

const audioStats = (page) =>
  page.evaluate(async () => {
    const manager = window.__peerManager;
    const peers = manager.debugPeers();
    const results = [];
    for (const { peerId, connection } of peers) {
      const report = await connection.getStats();
      let bytesReceived = 0;
      let bytesSent = 0;
      let packetsReceived = 0;
      let audioLevel = 0;
      let pair = null;
      report.forEach((item) => {
        if (item.type === "inbound-rtp" && item.kind === "audio") {
          bytesReceived += item.bytesReceived ?? 0;
          packetsReceived += item.packetsReceived ?? 0;
          audioLevel = Math.max(audioLevel, item.audioLevel ?? 0);
        }
        if (item.type === "outbound-rtp" && item.kind === "audio") {
          bytesSent += item.bytesSent ?? 0;
        }
        if (item.type === "candidate-pair" && item.state === "succeeded" && item.nominated) {
          pair = `${item.localCandidateId} -> ${item.remoteCandidateId}`;
        }
      });
      results.push({
        peerId,
        connectionState: connection.connectionState,
        iceState: connection.iceConnectionState,
        signalingState: connection.signalingState,
        bytesReceived,
        bytesSent,
        packetsReceived,
        audioLevel,
        pair,
      });
    }
    return results;
  });

const run = async () => {
  // Fresh identities per run, the server keeps a fifteen minute cooldown on
  // rematching the same pair.
  const seed = 920000 + Math.floor(Math.random() * 500000) * 2;
  const [first, second] = await Promise.all([login(seed), login(seed + 1)]);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const errors = [];
  const alice = await openApp(browser, first, "alice", errors);
  const bob = await openApp(browser, second, "bob", errors);

  await Promise.all([startVoice(alice.page), startVoice(bob.page)]);

  await alice.page.evaluate(() => window.__chatStore?.getState().startSearch("voice"));
  await alice.page.waitForTimeout(600);
  await bob.page.evaluate(() => window.__chatStore?.getState().startSearch("voice"));

  const deadline = Date.now() + 30000;
  let aliceStats = [];
  let bobStats = [];
  while (Date.now() < deadline) {
    await alice.page.waitForTimeout(1500);
    aliceStats = await audioStats(alice.page);
    bobStats = await audioStats(bob.page);
    const flowing =
      aliceStats.length > 0 &&
      bobStats.length > 0 &&
      aliceStats.every((item) => item.bytesReceived > 3000) &&
      bobStats.every((item) => item.bytesReceived > 3000);
    if (flowing) {
      break;
    }
  }

  const connected =
    aliceStats.length > 0 &&
    bobStats.length > 0 &&
    aliceStats.every((item) => item.bytesReceived > 3000) &&
    bobStats.every((item) => item.bytesReceived > 3000);

  // Connecting is not the same as staying audible. The gate that caused this
  // bug only collapsed after the call had been running a while, so the second
  // sample is the one that matters.
  const firstAlice = aliceStats[0]?.bytesReceived ?? 0;
  const firstBob = bobStats[0]?.bytesReceived ?? 0;
  await alice.page.waitForTimeout(25000);
  const laterAlice = await audioStats(alice.page);
  const laterBob = await audioStats(bob.page);

  const aliceDelta = (laterAlice[0]?.bytesReceived ?? 0) - firstAlice;
  const bobDelta = (laterBob[0]?.bytesReceived ?? 0) - firstBob;
  const alicePackets = (laterAlice[0]?.packetsReceived ?? 0) - (aliceStats[0]?.packetsReceived ?? 0);
  const bobPackets = (laterBob[0]?.packetsReceived ?? 0) - (bobStats[0]?.packetsReceived ?? 0);
  const route = await alice.page.evaluate(() => window.__voiceStore.getState().route);

  console.log("alice peers:", JSON.stringify(laterAlice, null, 2));
  console.log("bob peers:", JSON.stringify(laterBob, null, 2));
  console.log("alice capture route:", route);
  console.log(
    `over the following 25s: alice ${aliceDelta} bytes / ${alicePackets} packets, ` +
      `bob ${bobDelta} bytes / ${bobPackets} packets`,
  );

  // Opus is asked to stop sending while nobody is speaking, so a byte count is
  // no longer a measure of a healthy call: a quiet one legitimately drops to a
  // few hundred bytes a second. Packets still arriving in both directions is
  // the thing that separates a quiet call from a dead one.
  const sustained = alicePackets > 200 && bobPackets > 200 && aliceDelta > 4000 && bobDelta > 4000;

  if (errors.length) {
    console.log("page errors:");
    errors.slice(0, 20).forEach((line) => console.log("  -", line));
  }

  await browser.close();

  if (!connected) {
    console.error("FAIL: audio never flowed in both directions");
    process.exit(1);
  }
  if (!sustained) {
    console.error("FAIL: audio stopped flowing while the call was still up");
    process.exit(1);
  }
  console.log("PASS: both peers received audio and kept receiving it");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

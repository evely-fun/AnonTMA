import { chromium } from "playwright";

const API = process.env.API_URL ?? "http://127.0.0.1:8000";
const APP = process.env.APP_URL ?? "http://127.0.0.1:4173";

const login = async (tgId) => {
  const response = await fetch(`${API}/api/v1/auth/dev?tg_id=${tgId}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`dev login failed: ${response.status}`);
  }
  return response.json();
};

const run = async () => {
  const tokens = await login(910001);
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    permissions: ["microphone"],
  });

  const errors = [];
  context.on("weberror", (error) => errors.push(String(error.error())));

  const page = await context.newPage();
  page.on("requestfailed", (requestItem) => {
    errors.push(`request failed: ${requestItem.url()} ${requestItem.failure()?.errorText ?? ""}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
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
  await page.waitForTimeout(1200);

  const steps = [];
  // eslint-disable-next-line no-unused-vars
  const visit = async (name, action, expect) => {
    await action();
    await page.waitForTimeout(700);
    const text = await page.locator("body").innerText();
    const ok = expect.every((needle) => text.includes(needle));
    steps.push({ name, ok, sample: text.slice(0, 70).replace(/\n/g, " | ") });
    await page.screenshot({ path: `/tmp/shots/${name}.png` });
  };

  const bodyText = await page.locator("body").innerText();
  if (bodyText.includes("Meet people")) {
    await page.getByText("Let us start").click();
    await page.waitForTimeout(500);
    await page.getByText("Keep it").click();
    await page.waitForTimeout(500);
    await page.getByText("night talks").first().click();
    await page.getByText("Enter Anon").click();
    await page.waitForTimeout(1200);
    steps.push({ name: "onboarding", ok: true, sample: "" });
    await page.screenshot({ path: "/tmp/shots/onboarding.png" });
  }

  await visit("home", async () => undefined, ["Find someone now", "PEOPLE ONLINE"]);
  await visit("rooms", async () => page.getByRole("link", { name: /Rooms/ }).click(), ["Rooms"]);
  await visit("games", async () => page.getByRole("link", { name: /Play/ }).click(), [
    "Mafia",
    "Voice Flappy",
  ]);
  await visit("game-detail", async () => page.getByText("Tic Tac Toe").first().click(), [
    "HOW IT WORKS",
    "Play against the bot",
  ]);
  await visit("tictactoe", async () => page.getByText("Play against the bot").click(), [
    "ROUND 1 OF 3",
  ]);
  await visit("friends", async () => {
    await page.goBack();
    await page.getByRole("link", { name: /Friends/ }).click();
  }, ["Friends"]);
  await visit("profile", async () => page.getByRole("link", { name: /Profile/ }).click(), [
    "YOUR NUMBERS",
    "ACHIEVEMENTS",
  ]);
  await visit("settings", async () => page.getByText("Settings", { exact: true }).first().click(), [
    "NOISE SUPPRESSION",
    "MATCHING",
  ]);

  await browser.close();

  let failed = 0;
  for (const step of steps) {
    console.log(`${step.ok ? "PASS" : "FAIL"}  ${step.name}  ${step.ok ? "" : step.sample}`);
    if (!step.ok) {
      failed += 1;
    }
  }
  const realErrors = errors.filter(
    (item) => !item.includes("favicon") && !item.includes("Telegram"),
  );
  if (realErrors.length > 0) {
    console.log("\nConsole errors:");
    realErrors.slice(0, 8).forEach((item) => console.log(" -", item));
  }
  process.exit(failed > 0 || realErrors.length > 0 ? 1 : 0);
};

run().catch((error) => {
  console.error("check crashed:", error.message);
  process.exit(1);
});

import { roleColours, withAlpha } from "@/shared/lib/theme";

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 560;
export const GROUND_HEIGHT = 54;
export const BIRD_X = 96;
export const BIRD_RADIUS = 13;
export const PIPE_WIDTH = 58;

export interface ScenePipe {
  x: number;
  gapCenter: number;
  gapSize: number;
}

export interface SceneState {
  distance: number;
  y: number;
  velocity: number;
  level: number;
  dead: boolean;
}

interface Mote {
  x: number;
  y: number;
  size: number;
  depth: number;
  glow: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  warm: boolean;
}

interface Ridge {
  /** Sampled heights across one seamless tile, in world pixels from the top. */
  points: number[];
  width: number;
  depth: number;
  alpha: number;
}

const TAU = Math.PI * 2;

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return (): number => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/** One ridge is three sine harmonics sampled into a seamless tile. */
const buildRidge = (
  random: () => number,
  baseline: number,
  amplitude: number,
  depth: number,
  alpha: number,
): Ridge => {
  const width = WORLD_WIDTH * 2;
  const step = 6;
  const harmonics = [1, 2, 3].map((index) => ({
    cycles: index,
    phase: random() * TAU,
    weight: amplitude / (index * index),
  }));

  const points: number[] = [];
  for (let x = 0; x <= width; x += step) {
    let height = baseline;
    harmonics.forEach((harmonic) => {
      height += Math.sin((x / width) * TAU * harmonic.cycles + harmonic.phase) * harmonic.weight;
    });
    points.push(height);
  }
  return { points, width, depth, alpha };
};

const BODY_LIGHT = "#ffd873";
const BODY_DEEP = "#eda23a";

export class FlappyScene {
  private colours = roleColours();
  private dark = (document.documentElement.dataset.theme ?? "dark") !== "light";
  private motes: Mote[] = [];
  private ridges: Ridge[] = [];
  private sparks: Spark[] = [];
  private flash = 0;
  private shake = 0;
  private wingPhase = 0;
  private emitCarry = 0;

  constructor(seed: number) {
    const random = mulberry32(seed ^ 0x9e3779b9);

    this.motes = Array.from({ length: 54 }, () => {
      const depth = 0.05 + random() * 0.28;
      return {
        x: random() * WORLD_WIDTH,
        y: random() * (WORLD_HEIGHT - GROUND_HEIGHT),
        size: 0.7 + random() * 1.7,
        depth,
        glow: 0.16 + random() * 0.4,
      };
    });

    this.ridges = [
      buildRidge(random, WORLD_HEIGHT * 0.58, 46, 0.12, 0.1),
      buildRidge(random, WORLD_HEIGHT * 0.7, 38, 0.26, 0.14),
      buildRidge(random, WORLD_HEIGHT * 0.82, 26, 0.45, 0.2),
    ];
  }

  crash(): void {
    this.flash = 1;
    this.shake = 1;
  }

  private drawSky(context: CanvasRenderingContext2D): void {
    const { accent, surface } = this.colours;
    const sky = context.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    sky.addColorStop(0, withAlpha(surface, 1));
    sky.addColorStop(0.52, withAlpha(accent, 0.09));
    sky.addColorStop(1, withAlpha(accent, 0.2));
    context.fillStyle = sky;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const halo = context.createRadialGradient(
      WORLD_WIDTH * 0.74,
      WORLD_HEIGHT * 0.24,
      0,
      WORLD_WIDTH * 0.74,
      WORLD_HEIGHT * 0.24,
      WORLD_WIDTH * 0.62,
    );
    halo.addColorStop(0, withAlpha(accent, 0.26));
    halo.addColorStop(1, withAlpha(accent, 0));
    context.fillStyle = halo;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private drawMotes(context: CanvasRenderingContext2D, distance: number): void {
    const { ink } = this.colours;
    this.motes.forEach((mote) => {
      let x = (mote.x - distance * mote.depth) % WORLD_WIDTH;
      if (x < 0) {
        x += WORLD_WIDTH;
      }
      context.fillStyle = withAlpha(ink, mote.glow * 0.5);
      context.beginPath();
      context.arc(x, mote.y, mote.size, 0, TAU);
      context.fill();
    });
  }

  private drawRidges(context: CanvasRenderingContext2D, distance: number): void {
    const { accent } = this.colours;
    this.ridges.forEach((ridge) => {
      const offset = (distance * ridge.depth) % ridge.width;
      const step = ridge.width / (ridge.points.length - 1);

      context.beginPath();
      context.moveTo(-4, WORLD_HEIGHT);
      for (let repeat = 0; repeat < 2; repeat += 1) {
        ridge.points.forEach((height, index) => {
          const x = repeat * ridge.width + index * step - offset;
          if (x < -step || x > WORLD_WIDTH + step) {
            return;
          }
          context.lineTo(x, height);
        });
      }
      context.lineTo(WORLD_WIDTH + 4, WORLD_HEIGHT);
      context.closePath();
      context.fillStyle = withAlpha(accent, ridge.alpha);
      context.fill();
    });
  }

  private drawPipe(context: CanvasRenderingContext2D, x: number, pipe: ScenePipe): void {
    const { accent, surface, ink } = this.colours;
    const top = pipe.gapCenter - pipe.gapSize / 2;
    const bottom = pipe.gapCenter + pipe.gapSize / 2;
    const radius = 13;

    // In light mode the surface is white, so a surface coloured column would
    // vanish into the sky. The stalk is tinted with ink instead.
    const shell = this.dark ? withAlpha(surface, 0.97) : withAlpha(ink, 0.62);
    const belly = this.dark ? withAlpha(ink, 0.13) : withAlpha(ink, 0.86);
    const column = context.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    column.addColorStop(0, shell);
    column.addColorStop(0.34, belly);
    column.addColorStop(1, shell);

    // Both stalks are drawn as one rounded shape that runs off screen, so the
    // only visible corners are the two that frame the gap.
    context.fillStyle = column;
    context.beginPath();
    context.roundRect(x, -radius * 2, PIPE_WIDTH, top + radius * 2, radius);
    context.fill();
    context.beginPath();
    context.roundRect(x, bottom, PIPE_WIDTH, WORLD_HEIGHT - bottom + radius * 2, radius);
    context.fill();

    context.fillStyle = withAlpha(accent, 0.85);
    context.beginPath();
    context.roundRect(x + 6, top - 3.5, PIPE_WIDTH - 12, 3.5, 2);
    context.fill();
    context.beginPath();
    context.roundRect(x + 6, bottom, PIPE_WIDTH - 12, 3.5, 2);
    context.fill();

    // Only the two lips of the gap glow. A wash across the whole opening reads
    // as a pane of glass you are supposed to avoid.
    const bleed = 22;
    const upper = context.createLinearGradient(x, top - bleed, x, top);
    upper.addColorStop(0, withAlpha(accent, 0));
    upper.addColorStop(1, withAlpha(accent, 0.3));
    context.fillStyle = upper;
    context.fillRect(x, top - bleed, PIPE_WIDTH, bleed);

    const lower = context.createLinearGradient(x, bottom, x, bottom + bleed);
    lower.addColorStop(0, withAlpha(accent, 0.3));
    lower.addColorStop(1, withAlpha(accent, 0));
    context.fillStyle = lower;
    context.fillRect(x, bottom, PIPE_WIDTH, bleed);
  }

  private drawGround(context: CanvasRenderingContext2D, distance: number): void {
    const { accent, surface, ink } = this.colours;
    const top = WORLD_HEIGHT - GROUND_HEIGHT;

    const band = context.createLinearGradient(0, top, 0, WORLD_HEIGHT);
    band.addColorStop(0, withAlpha(accent, 0.26));
    band.addColorStop(1, withAlpha(surface, 0.98));
    context.fillStyle = band;
    context.fillRect(0, top, WORLD_WIDTH, GROUND_HEIGHT);

    context.fillStyle = withAlpha(ink, 0.1);
    context.fillRect(0, top, WORLD_WIDTH, 1);

    context.fillStyle = withAlpha(ink, 0.06);
    const pitch = 26;
    const offset = distance % pitch;
    for (let x = -offset; x < WORLD_WIDTH; x += pitch) {
      context.fillRect(x, top + 12, 12, 2);
    }
  }

  private drawBird(context: CanvasRenderingContext2D, state: SceneState, delta: number): void {
    const { accent } = this.colours;
    const lift = Math.max(0, state.level - 0.08);
    this.wingPhase += delta * (7 + lift * 26);

    const tilt = Math.max(-0.42, Math.min(0.78, state.velocity / 620));
    const flap = Math.sin(this.wingPhase);

    context.save();
    context.translate(BIRD_X, state.y);

    const halo = 18 + lift * 26;
    const glow = context.createRadialGradient(0, 0, BIRD_RADIUS * 0.5, 0, 0, halo);
    glow.addColorStop(0, withAlpha(accent, 0.3 + lift * 0.34));
    glow.addColorStop(1, withAlpha(accent, 0));
    context.fillStyle = glow;
    context.beginPath();
    context.arc(0, 0, halo, 0, TAU);
    context.fill();

    context.rotate(tilt);

    const body = context.createLinearGradient(-BIRD_RADIUS, -BIRD_RADIUS, BIRD_RADIUS, BIRD_RADIUS);
    body.addColorStop(0, BODY_LIGHT);
    body.addColorStop(1, BODY_DEEP);
    context.fillStyle = body;
    context.beginPath();
    context.moveTo(BIRD_RADIUS + 3, 0);
    context.quadraticCurveTo(BIRD_RADIUS * 0.5, -BIRD_RADIUS, -BIRD_RADIUS * 0.55, -BIRD_RADIUS * 0.8);
    context.quadraticCurveTo(-BIRD_RADIUS - 4, 0, -BIRD_RADIUS * 0.55, BIRD_RADIUS * 0.8);
    context.quadraticCurveTo(BIRD_RADIUS * 0.5, BIRD_RADIUS, BIRD_RADIUS + 3, 0);
    context.closePath();
    context.fill();

    context.fillStyle = withAlpha(accent, 0.72 + lift * 0.24);
    context.beginPath();
    context.ellipse(-2.5, 1 + flap * 4, 8.5, 3.6 + Math.abs(flap) * 3, -0.28 + flap * 0.6, 0, TAU);
    context.fill();

    context.fillStyle = "#e8853a";
    context.beginPath();
    context.moveTo(BIRD_RADIUS + 1, -2);
    context.lineTo(BIRD_RADIUS + 8.5, 0.5);
    context.lineTo(BIRD_RADIUS + 1, 3.5);
    context.closePath();
    context.fill();

    context.fillStyle = "#0b0d13";
    context.beginPath();
    context.arc(5.5, -4, 2.6, 0, TAU);
    context.fill();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(6.4, -4.9, 0.9, 0, TAU);
    context.fill();

    context.restore();
  }

  private emitSparks(state: SceneState, delta: number): void {
    if (state.dead) {
      return;
    }
    const lift = Math.max(0, state.level - 0.08);
    this.emitCarry += delta * (6 + lift * 90);
    while (this.emitCarry >= 1) {
      this.emitCarry -= 1;
      this.sparks.push({
        x: BIRD_X - BIRD_RADIUS,
        y: state.y + (Math.random() - 0.5) * 10,
        vx: -90 - Math.random() * 70,
        vy: (Math.random() - 0.5) * 40 + state.velocity * 0.12,
        life: 0.5 + Math.random() * 0.4,
        size: 1 + Math.random() * 2.4,
        warm: Math.random() < 0.45,
      });
    }
  }

  private drawSparks(context: CanvasRenderingContext2D, delta: number): void {
    const { accent, warn } = this.colours;
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index];
      spark.life -= delta;
      if (spark.life <= 0) {
        this.sparks.splice(index, 1);
        continue;
      }
      spark.x += spark.vx * delta;
      spark.y += spark.vy * delta;
      spark.vy += 120 * delta;

      const fade = Math.min(1, spark.life * 2.2);
      context.fillStyle = withAlpha(spark.warm ? warn : accent, fade * 0.6);
      context.beginPath();
      context.arc(spark.x, spark.y, spark.size * fade, 0, TAU);
      context.fill();
    }
  }

  private drawVignette(context: CanvasRenderingContext2D): void {
    const vignette = context.createRadialGradient(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      WORLD_HEIGHT * 0.36,
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      WORLD_HEIGHT * 0.78,
    );
    vignette.addColorStop(0, "#00000000");
    vignette.addColorStop(1, "#0000004d");
    context.fillStyle = vignette;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  render(
    context: CanvasRenderingContext2D,
    state: SceneState,
    pipes: ScenePipe[],
    delta: number,
  ): void {
    context.save();
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - delta * 3.4);
      const power = this.shake * this.shake * 9;
      context.translate((Math.random() - 0.5) * power, (Math.random() - 0.5) * power);
    }

    this.drawSky(context);
    this.drawMotes(context, state.distance);
    this.drawRidges(context, state.distance);

    pipes.forEach((pipe) => {
      const x = pipe.x - state.distance;
      if (x > -PIPE_WIDTH - 4 && x < WORLD_WIDTH + 4) {
        this.drawPipe(context, x, pipe);
      }
    });

    this.drawGround(context, state.distance);
    this.emitSparks(state, delta);
    this.drawSparks(context, delta);
    this.drawBird(context, state, delta);
    this.drawVignette(context);
    context.restore();

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - delta * 2.6);
      context.fillStyle = withAlpha(this.colours.ink, this.flash * 0.5);
      context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }
  }
}

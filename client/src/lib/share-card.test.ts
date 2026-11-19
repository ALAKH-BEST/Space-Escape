import assert from "node:assert/strict";
import test from "node:test";
import { CARD_HEIGHT, CARD_WIDTH, drawShareCard, formatSurvival, seededRandom, shareFileName, shareText, type ShareStats } from "./share-card";

const stats: ShareStats = { score: 12340, sector: 3, survivalSeconds: 41.23, shipName: "PHANTOM X", shipColor: "#22d3ee", newBest: false };

test("survival time reads as seconds, then minutes", () => {
  assert.equal(formatSurvival(41.23), "41.2s");
  assert.equal(formatSurvival(0), "0.0s");
  assert.equal(formatSurvival(-3), "0.0s");
  assert.equal(formatSurvival(60), "1m 00s");
  assert.equal(formatSurvival(185.9), "3m 05s");
});

test("the message names the score, sector, time and link, and a new best only when it is one", () => {
  const url = "https://example.com/";
  const text = shareText(stats, url);
  assert.match(text, /12,340/);
  assert.match(text, /Sector 3 \(Crystal Veil\)|Sector 3 \(/);
  assert.match(text, /41\.2s/);
  assert.ok(text.endsWith(url));
  assert.doesNotMatch(text, /personal best/i);
  assert.match(shareText({ ...stats, newBest: true }, url), /new personal best/i);
});

test("the file name carries the score", () => {
  assert.equal(shareFileName(stats), "astrododge-12340.png");
});

test("the same run always gets the same stars", () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  const first = [a(), a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b(), b()]);
  assert.ok(first.every((n) => n >= 0 && n < 1));
  assert.notEqual(seededRandom(42)(), seededRandom(43)(), "a different run gets different stars");
});

/** A drawing context that remembers what was drawn, to check the card without a browser. */
function recordingContext() {
  const texts: string[] = [];
  const widthOf = (s: string) => s.length * 20;
  const target: Record<string, unknown> = {
    measureText: (s: string) => ({ width: widthOf(s) }),
    fillText: (s: string) => {
      texts.push(s);
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      return () => {};
    },
    set(t, key: string, value) {
      t[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

test("the card says what the run was and leaves out the badge unless it is a new best", () => {
  const plain = recordingContext();
  drawShareCard(plain.ctx, stats, "sans-serif", "example.com");
  for (const want of ["ASTRODODGE", "12,340", "03", "41.2s", "PHANTOM X", "CAN YOU BEAT IT?", "example.com"]) {
    assert.ok(plain.texts.includes(want), `the card should say ${want}; it says ${plain.texts.join(" | ")}`);
  }
  assert.ok(!plain.texts.includes("NEW PERSONAL BEST"));

  const best = recordingContext();
  drawShareCard(best.ctx, { ...stats, newBest: true }, "sans-serif", "example.com");
  assert.ok(best.texts.includes("NEW PERSONAL BEST"));
});

test("a huge score still fits on the card", () => {
  const widths: number[] = [];
  const { ctx } = recordingContext();
  const measured = ctx.measureText.bind(ctx);
  ctx.measureText = (s: string) => {
    const m = measured(s);
    if (s.includes(",")) widths.push(m.width);
    return m;
  };
  drawShareCard(ctx, { ...stats, score: 123456789 }, "sans-serif", "example.com");
  assert.ok(CARD_WIDTH === 1080 && CARD_HEIGHT === 1350);
  assert.ok(widths.length > 0 && widths[widths.length - 1] <= CARD_WIDTH - 160, "the score was shrunk to fit");
});

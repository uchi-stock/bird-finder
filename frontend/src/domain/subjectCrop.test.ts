import { describe, expect, it } from "vitest";
import { cropFromBox, cropStyle, subjectCrop } from "./subjectCrop";
import { seededRng } from "./quiz";

const BG = 200;
/** 無地の背景に、細かい模様（被写体）の長方形を置いた画像 */
function image(w: number, h: number, subject?: { x0: number; y0: number; x1: number; y1: number }, bg = BG): Uint8Array {
  const gray = new Uint8Array(w * h).fill(bg);
  if (subject) {
    for (let y = subject.y0; y < subject.y1; y++) for (let x = subject.x0; x < subject.x1; x++) gray[y * w + x] = (x + y) % 2 === 0 ? 40 : 220;
  }
  return gray;
}

describe("subjectCrop: 余白が多い画像を、被写体に寄せて正方形で切り出す（#148）", () => {
  it("中央に小さな被写体があれば、被写体を含む正方形を、下限の大きさで切り出す", () => {
    const c = subjectCrop(image(100, 100, { x0: 40, y0: 40, x1: 60, y1: 60 }), 100, 100)!;
    expect(c).not.toBeNull();
    expect(c.w).toBeCloseTo(0.5, 1); // 被写体は小さいため、寄りすぎない下限（半分）
    expect(c.x).toBeCloseTo(0.25, 1);
    expect(c.y).toBeCloseTo(0.25, 1);
    // 被写体が、切り出し範囲に含まれる
    expect(c.x).toBeLessThanOrEqual(0.4);
    expect(c.x + c.w).toBeGreaterThanOrEqual(0.6);
  });
  it("被写体が隅にあれば、切り出し範囲は画像の中に収まる", () => {
    const c = subjectCrop(image(100, 100, { x0: 0, y0: 0, x1: 20, y1: 20 }), 100, 100)!;
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    const r = subjectCrop(image(100, 100, { x0: 80, y0: 80, x1: 100, y1: 100 }), 100, 100)!;
    expect(r.x + r.w).toBeCloseTo(1, 5);
    expect(r.y + r.h).toBeCloseTo(1, 5);
  });
  it("被写体がやや大きければ、被写体に余白を足した大きさで切り出す", () => {
    const c = subjectCrop(image(100, 100, { x0: 25, y0: 25, x1: 65, y1: 65 }), 100, 100)!;
    expect(c).not.toBeNull();
    expect(c.w).toBeCloseTo((40 * 1.24) / 100, 1);
  });
  it("縦長・横長の画像でも、切り出しは、画素では正方形", () => {
    for (const [w, h] of [
      [100, 160],
      [160, 100],
    ]) {
      const c = subjectCrop(image(w, h, { x0: Math.round(w * 0.4), y0: Math.round(h * 0.4), x1: Math.round(w * 0.6), y1: Math.round(h * 0.6) }), w, h)!;
      expect(c).not.toBeNull();
      expect(c.w * w).toBeCloseTo(c.h * h, 5);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it("余白が少ない（被写体が画像いっぱい）なら、切り出さない", () => {
    expect(subjectCrop(image(100, 100, { x0: 5, y0: 5, x1: 95, y1: 95 }), 100, 100)).toBeNull();
  });
  it("被写体が正方形に収まらない（横に長い）なら、切り出さない", () => {
    expect(subjectCrop(image(100, 60, { x0: 5, y0: 20, x1: 95, y1: 40 }), 100, 60)).toBeNull();
  });
  it("被写体が無い（無地）なら、切り出さない", () => {
    expect(subjectCrop(image(100, 100), 100, 100)).toBeNull();
  });
  it("背景が複雑（全面が細かい模様）なら、被写体を決められないため、切り出さない", () => {
    const rng = seededRng(1);
    const noise = Uint8Array.from({ length: 100 * 100 }, () => Math.floor(rng() * 256));
    expect(subjectCrop(noise, 100, 100)).toBeNull();
  });
  it("画像の周囲の無地の余白（白い縁など）が広ければ、中央の被写体へ寄せる", () => {
    const gray = image(100, 100, { x0: 35, y0: 35, x1: 65, y1: 65 }, 255);
    const c = subjectCrop(gray, 100, 100)!;
    expect(c).not.toBeNull();
    expect(c.w).toBeLessThan(0.85);
  });
  it("小さすぎる画像は、切り出さない", () => {
    expect(subjectCrop(new Uint8Array(16), 4, 4)).toBeNull();
  });
});

describe("cropStyle: 切り出し範囲を、正方形のセルいっぱいに出すための配置", () => {
  it("半分の大きさ・中央の範囲は、画像を2倍にして、半分ずらす", () => {
    expect(cropStyle({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toEqual({ width: "200%", height: "200%", left: "-50%", top: "-50%" });
  });
  it("縦長の画像（高さ方向の割合が小さい）は、縦方向をより拡大する", () => {
    const s = cropStyle({ x: 0, y: 0.2, w: 0.5, h: 0.25 });
    expect(s.width).toBe("200%");
    expect(s.height).toBe("400%");
    expect(s.top).toBe("-80%");
  });
});

describe("cropFromBox: 被写体の範囲（物体検出の結果など）から、切り出す正方形を決める（#150）", () => {
  it("被写体の周囲に余白（12%）を足した正方形で、被写体の中心に合わせる", () => {
    // 100x100の画像で、中央の40x40の被写体 → 一辺は 40 * 1.24 = 49.6 だが、下限（半分）の50
    const c = cropFromBox({ x0: 30, y0: 30, x1: 70, y1: 70 }, 100, 100)!;
    expect(c.w).toBeCloseTo(0.5, 5);
    expect(c.x).toBeCloseTo(0.25, 5);
    const d = cropFromBox({ x0: 25, y0: 25, x1: 70, y1: 70 }, 100, 100)!; // 45 * 1.24 = 55.8
    expect(d.w).toBeCloseTo(0.558, 3);
  });
  it("被写体が隅にあれば、画像の中に収める", () => {
    const c = cropFromBox({ x0: 0, y0: 0, x1: 20, y1: 20 }, 100, 100)!;
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });
  it("縦長・横長の画像でも、画素では正方形", () => {
    const c = cropFromBox({ x0: 80, y0: 120, x1: 130, y1: 170 }, 200, 300)!;
    expect(c.w * 200).toBeCloseTo(c.h * 300, 5);
  });
  it("被写体が大きい（余白が少ない）・正方形に収まらないときは、null", () => {
    expect(cropFromBox({ x0: 5, y0: 5, x1: 95, y1: 95 }, 100, 100)).toBeNull();
    expect(cropFromBox({ x0: 5, y0: 20, x1: 95, y1: 40 }, 100, 60)).toBeNull();
  });
  it("被写体が点（大きさ0）でも、下限の大きさで切り出す", () => {
    expect(cropFromBox({ x0: 10, y0: 10, x1: 10, y1: 10 }, 100, 100)?.w).toBeCloseTo(0.5, 5);
  });
});

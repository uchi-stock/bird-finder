"use strict";

const { inJapan } = require("./tile");
const SPECIES = new Set(require("./species.json"));

const ALLOWED_KEYS = ["speciesId", "date", "lat", "lon"];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAST_DAYS = 7;

const round4 = (n) => Math.round(n * 10000) / 10000; // 約11m。ぼかし済みの位置に、これ以上の精度は要らない

/**
 * 投稿の入力を検証する。受け付けるのは、鳥の種類・日付・（端末側でぼかした）位置だけ。
 * 余分な項目（名前・端末ID・時刻など）は、受け取らず拒否する。
 */
function validateSighting(body, now = new Date()) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "投稿の形式が正しくありません" };
  const keys = Object.keys(body);
  if (keys.some((k) => !ALLOWED_KEYS.includes(k)) || ALLOWED_KEYS.some((k) => !(k in body))) {
    return { ok: false, message: "投稿できる項目は speciesId・date・lat・lon だけです" };
  }
  if (typeof body.speciesId !== "string" || !SPECIES.has(body.speciesId)) return { ok: false, message: "speciesId が正しくありません" };
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return { ok: false, message: "date は YYYY-MM-DD で指定してください" };
  const t = Date.parse(`${body.date}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== body.date) return { ok: false, message: "date が正しくありません" };
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  if (t < today - MAX_PAST_DAYS * DAY_MS || t > today + DAY_MS) return { ok: false, message: `date は直近${MAX_PAST_DAYS}日以内で指定してください` };
  if (typeof body.lat !== "number" || typeof body.lon !== "number" || !inJapan(body.lat, body.lon)) return { ok: false, message: "位置は日本国内で指定してください" };
  return { ok: true, value: { speciesId: body.speciesId, date: body.date, lat: round4(body.lat), lon: round4(body.lon) } };
}

module.exports = { validateSighting, ALLOWED_KEYS, MAX_PAST_DAYS };

"use strict";

// 地図を約5km四方の区画（タイル）に分け、区画ごとに保存・取得する。
// 区画の鍵は "<緯度の区画番号>:<経度の区画番号>"（0.05度刻み）。フロントエンドも同じ規則で計算する。
const TILE_DEG = 0.05;
const MAX_TILES_PER_REQUEST = 25;

// 日本国内（沖縄〜北海道）の範囲。フロントエンドのisInJapanと同じ
const BOUNDS = { latMin: 24, latMax: 46, lonMin: 122, lonMax: 154 };

function inJapan(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax;
}

function tileOf(lat, lon) {
  return `${Math.floor(lat / TILE_DEG)}:${Math.floor(lon / TILE_DEG)}`;
}

/** "a:b,c:d" を検証してタイルの配列にする。不正・重複・多すぎる場合はnull */
function parseTiles(param) {
  if (typeof param !== "string" || param === "") return null;
  const tiles = Array.from(new Set(param.split(",")));
  if (tiles.length > MAX_TILES_PER_REQUEST) return null;
  const rowMin = Math.floor(BOUNDS.latMin / TILE_DEG);
  const rowMax = Math.floor(BOUNDS.latMax / TILE_DEG);
  const colMin = Math.floor(BOUNDS.lonMin / TILE_DEG);
  const colMax = Math.floor(BOUNDS.lonMax / TILE_DEG);
  for (const t of tiles) {
    const m = /^(\d{1,5}):(\d{1,5})$/.exec(t);
    if (!m) return null;
    const row = Number(m[1]);
    const col = Number(m[2]);
    if (row < rowMin || row > rowMax || col < colMin || col > colMax) return null;
  }
  return tiles;
}

module.exports = { TILE_DEG, MAX_TILES_PER_REQUEST, BOUNDS, inJapan, tileOf, parseTiles };

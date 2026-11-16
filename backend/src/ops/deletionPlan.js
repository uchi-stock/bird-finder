"use strict";

// 運用者が不正な投稿を消すときの計画づくり（純粋な関数）。実際のAWS呼び出しは scripts/deleteSightings.js が行う。
// 絞り込みの入力（区画・日付）が必須で、全件削除はできない。

const TILE = /^\d{1,5}:\d{1,5}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SPECIES = /^[a-z0-9_]{1,64}$/;

/** 入力を検証する。区画と日付は必須。speciesIdは任意 */
function parseFilters({ tile, date, speciesId } = {}) {
  if (typeof tile !== "string" || !TILE.test(tile)) return { ok: false, message: "tile は 'a:b' の形式で必須です" };
  if (typeof date !== "string" || !DATE.test(date)) return { ok: false, message: "date は 'YYYY-MM-DD' の形式で必須です" };
  if (speciesId !== undefined && speciesId !== "" && (typeof speciesId !== "string" || !SPECIES.test(speciesId))) {
    return { ok: false, message: "speciesId の形式が正しくありません" };
  }
  return { ok: true, value: { tile, date, speciesId: speciesId || undefined } };
}

/** 区画と日付で絞るQueryの引数。sk は "<日付>#<ID>" なので、日付の前方一致で取る */
function buildQuery(tableName, { tile, date }) {
  return {
    TableName: tableName,
    KeyConditionExpression: "tile = :t AND begins_with(sk, :d)",
    ExpressionAttributeValues: { ":t": { S: tile }, ":d": { S: `${date}#` } },
    ProjectionExpression: "tile, sk, speciesId, lat, lon",
  };
}

/** 取得した項目を、speciesId（任意）で絞り、削除の対象（鍵）と表示用の要約にする */
function planDeletion(items, { speciesId }) {
  const targets = items.filter((i) => !speciesId || i.speciesId?.S === speciesId);
  const bySpecies = {};
  for (const i of targets) bySpecies[i.speciesId?.S ?? "?"] = (bySpecies[i.speciesId?.S ?? "?"] ?? 0) + 1;
  return {
    count: targets.length,
    bySpecies,
    keys: targets.map((i) => ({ tile: i.tile, sk: i.sk })),
  };
}

module.exports = { parseFilters, buildQuery, planDeletion };

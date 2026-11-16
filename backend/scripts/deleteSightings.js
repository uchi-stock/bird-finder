"use strict";

// 運用者用: 不正な投稿を、区画・日付（・種）を指定して消す。GitHub Actionsの手動実行から呼ぶ。
// 環境変数: TABLE（必須）, TILE, DATE, SPECIES_ID（任意）, CONFIRM（"true"のときだけ削除。それ以外は件数の表示のみ）
const { DynamoDBClient, QueryCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const { parseFilters, buildQuery, planDeletion } = require("../src/ops/deletionPlan");

async function main() {
  const table = process.env.TABLE;
  if (!table) throw new Error("TABLE が指定されていません");
  const parsed = parseFilters({ tile: process.env.TILE, date: process.env.DATE, speciesId: process.env.SPECIES_ID });
  if (!parsed.ok) throw new Error(parsed.message);
  const ddb = new DynamoDBClient({});

  const items = [];
  let key;
  do {
    const res = await ddb.send(new QueryCommand({ ...buildQuery(table, parsed.value), ExclusiveStartKey: key }));
    items.push(...(res.Items ?? []));
    key = res.LastEvaluatedKey;
  } while (key);

  const plan = planDeletion(items, parsed.value);
  console.log(`対象: ${plan.count} 件（区画 ${parsed.value.tile} / 日付 ${parsed.value.date}${parsed.value.speciesId ? ` / 種 ${parsed.value.speciesId}` : ""}）`);
  console.log(`種ごとの件数: ${JSON.stringify(plan.bySpecies)}`);
  if (process.env.CONFIRM !== "true") {
    console.log("確認のみです（削除していません）。削除するには confirm を true にして、もう一度実行してください");
    return;
  }
  for (const k of plan.keys) await ddb.send(new DeleteItemCommand({ TableName: table, Key: k }));
  console.log(`${plan.count} 件を削除しました`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

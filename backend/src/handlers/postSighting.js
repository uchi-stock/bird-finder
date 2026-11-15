"use strict";

const crypto = require("node:crypto");
const { DynamoDBClient, PutItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { incrementAndCheckDailyLimit } = require("../shared/dailyRateLimit");
const { jsonResponse } = require("../shared/httpResponse");
const { tileOf } = require("../tile");
const { validateSighting } = require("../validate");

const MAX_BODY_BYTES = 2048;

/** アクセス元（IP）は、デプロイごとに変わる秘密の値を混ぜたハッシュにして、上限の数え上げにだけ使う（元に戻せない・最大2日で削除） */
function sourceId(event, pepper) {
  const ip = event?.requestContext?.http?.sourceIp ?? "unknown";
  return crypto.createHash("sha256").update(`${pepper}|${ip}`).digest("hex").slice(0, 32);
}

function createHandler({ ddb, env = process.env, now = () => new Date(), randomId = () => crypto.randomBytes(6).toString("hex") }) {
  const origin = env.ALLOWED_ORIGIN;
  const limit = Number(env.DAILY_LIMIT ?? 30);

  return async function handler(event) {
    try {
      const raw = event?.body ?? "";
      if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_BODY_BYTES) return jsonResponse(origin, 413, { message: "投稿が大きすぎます" });
      let body;
      try {
        body = JSON.parse(event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf-8") : raw);
      } catch {
        return jsonResponse(origin, 400, { message: "JSONとして読み取れません" });
      }
      const v = validateSighting(body, now());
      if (!v.ok) return jsonResponse(origin, 400, { message: v.message });

      const allowed = await incrementAndCheckDailyLimit({
        ddb,
        UpdateItemCommand,
        tableName: env.RATE_TABLE,
        keyAttribute: "idDate",
        identifier: sourceId(event, env.RATE_PEPPER ?? ""),
        limit,
      });
      if (!allowed) return jsonResponse(origin, 429, { message: "1日の投稿上限に達しました。明日また投稿できます" });

      const { speciesId, date, lat, lon } = v.value;
      await ddb.send(
        new PutItemCommand({
          TableName: env.SIGHTINGS_TABLE,
          Item: {
            tile: { S: tileOf(lat, lon) },
            sk: { S: `${date}#${randomId()}` },
            speciesId: { S: speciesId },
            date: { S: date },
            lat: { N: String(lat) },
            lon: { N: String(lon) },
          },
        })
      );
      return jsonResponse(origin, 201, { ok: true });
    } catch (error) {
      console.error(error);
      return jsonResponse(origin, 500, { message: "Internal Server Error" });
    }
  };
}

module.exports = { createHandler, sourceId, MAX_BODY_BYTES };
// Lambdaのエントリ。テストでは、createHandlerへ偽のDynamoDBを渡す
module.exports.handler = createHandler({ ddb: new DynamoDBClient({}) });

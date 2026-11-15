"use strict";

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { jsonResponse } = require("../shared/httpResponse");
const { parseTiles } = require("../tile");

const PER_TILE_LIMIT = 200;
const MAX_ITEMS = 1000;

function createHandler({ ddb, env = process.env }) {
  const origin = env.ALLOWED_ORIGIN;

  return async function handler(event) {
    try {
      const tiles = parseTiles(event?.queryStringParameters?.tiles);
      if (!tiles) return jsonResponse(origin, 400, { message: "tiles は 'a:b,c:d' の形式で、25区画以内・日本国内で指定してください" });
      const results = await Promise.all(
        tiles.map((tile) =>
          ddb.send(
            new QueryCommand({
              TableName: env.SIGHTINGS_TABLE,
              KeyConditionExpression: "tile = :t",
              ExpressionAttributeValues: { ":t": { S: tile } },
              ScanIndexForward: false, // 新しい日付から
              Limit: PER_TILE_LIMIT,
            })
          )
        )
      );
      const items = results
        .flatMap((r) => r.Items ?? [])
        .slice(0, MAX_ITEMS)
        .map((i) => ({ speciesId: i.speciesId.S, date: i.date.S, lat: Number(i.lat.N), lon: Number(i.lon.N) }));
      const res = jsonResponse(origin, 200, { items });
      res.headers["Cache-Control"] = "public, max-age=60";
      return res;
    } catch (error) {
      console.error(error);
      return jsonResponse(origin, 500, { message: "Internal Server Error" });
    }
  };
}

module.exports = { createHandler, PER_TILE_LIMIT, MAX_ITEMS };
module.exports.handler = createHandler({ ddb: new DynamoDBClient({}) });

import { describe, expect, it, vi } from "vitest";
import { MAX_ITEMS, PER_TILE_LIMIT, createHandler } from "./getSightings";

const ENV = { SIGHTINGS_TABLE: "sightings", ALLOWED_ORIGIN: "https://uchi-stock.github.io" };
const item = (id, date, lat = 35.65, lon = 139.54) => ({ speciesId: { S: id }, date: { S: date }, lat: { N: String(lat) }, lon: { N: String(lon) }, tile: { S: "x" }, sk: { S: "y" } });

function make(itemsByTile) {
  const sent = [];
  const ddb = {
    send: vi.fn(async (cmd) => {
      sent.push(cmd.input);
      if (itemsByTile === "fail") throw new Error("boom");
      return { Items: itemsByTile[cmd.input.ExpressionAttributeValues[":t"].S] };
    }),
  };
  return { sent, handler: createHandler({ ddb, env: ENV }) };
}

describe("GET /sightings", () => {
  it("区画ごとに新しい日付から取得し、種・日付・位置だけを返す（キャッシュ60秒）", async () => {
    const { sent, handler } = make({ "713:2790": [item("sparrow", "2026-11-15")], "713:2791": [item("crow", "2026-11-14", 35.7, 139.6)] });
    const res = await handler({ queryStringParameters: { tiles: "713:2790,713:2791" } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).items).toEqual([
      { speciesId: "sparrow", date: "2026-11-15", lat: 35.65, lon: 139.54 },
      { speciesId: "crow", date: "2026-11-14", lat: 35.7, lon: 139.6 },
    ]);
    expect(res.headers["Cache-Control"]).toBe("public, max-age=60");
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://uchi-stock.github.io");
    expect(sent[0]).toMatchObject({ TableName: "sightings", ScanIndexForward: false, Limit: PER_TILE_LIMIT });
  });
  it("何も無い区画は空の配列（Itemsが無い応答も扱う）", async () => {
    const { handler } = make({ "713:2790": undefined });
    const res = await handler({ queryStringParameters: { tiles: "713:2790" } });
    expect(JSON.parse(res.body)).toEqual({ items: [] });
  });
  it("tilesが不正・無いときは400", async () => {
    const { sent, handler } = make({});
    expect((await handler({ queryStringParameters: { tiles: "x" } })).statusCode).toBe(400);
    expect((await handler({ queryStringParameters: {} })).statusCode).toBe(400);
    expect((await handler({})).statusCode).toBe(400);
    expect((await handler(undefined)).statusCode).toBe(400);
    expect(sent).toHaveLength(0);
  });
  it("返す件数には上限がある", async () => {
    const many = Array.from({ length: MAX_ITEMS + 50 }, (_, i) => item("sparrow", "2026-11-15", 35.65, 139.54 + i * 1e-6));
    const { handler } = make({ "713:2790": many });
    expect(JSON.parse((await handler({ queryStringParameters: { tiles: "713:2790" } })).body).items).toHaveLength(MAX_ITEMS);
  });
  it("DynamoDBの障害は500（内部の詳細は返さない）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler } = make("fail");
    const res = await handler({ queryStringParameters: { tiles: "713:2790" } });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("boom");
    vi.restoreAllMocks();
  });
});

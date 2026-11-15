import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_BYTES, createHandler, sourceId } from "./postSighting";

const NOW = new Date("2026-11-15T10:00:00Z");
const ENV = { SIGHTINGS_TABLE: "sightings", RATE_TABLE: "rate", ALLOWED_ORIGIN: "https://uchi-stock.github.io", RATE_PEPPER: "pepper", DAILY_LIMIT: "2", TTL_DAYS: "90" };
const good = { speciesId: "sparrow", date: "2026-11-15", lat: 35.6506, lon: 139.5407 };
const event = (body, ip = "203.0.113.9") => ({ body: typeof body === "string" ? body : JSON.stringify(body), requestContext: { http: { sourceIp: ip } } });

function make({ rateOk = true, failOn = null } = {}) {
  const sent = [];
  const ddb = {
    send: vi.fn(async (cmd) => {
      sent.push({ name: cmd.constructor.name, input: cmd.input });
      if (failOn === cmd.constructor.name) throw new Error("boom");
      if (cmd.constructor.name === "UpdateItemCommand" && !rateOk) {
        const e = new Error("limit");
        e.name = "ConditionalCheckFailedException";
        throw e;
      }
      return {};
    }),
  };
  return { sent, handler: createHandler({ ddb, env: ENV, now: () => NOW, randomId: () => "abc123" }) };
}

describe("POST /sightings", () => {
  it("正しい投稿を保存する（区画・日付・種・ぼかし済みの位置・90日後のTTLだけ）", async () => {
    const { sent, handler } = make();
    const res = await handler(event(good));
    expect(res.statusCode).toBe(201);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("https://uchi-stock.github.io");
    const put = sent.find((s) => s.name === "PutItemCommand").input;
    expect(put.TableName).toBe("sightings");
    expect(put.Item).toEqual({
      tile: { S: "713:2790" },
      sk: { S: "2026-11-15#abc123" },
      speciesId: { S: "sparrow" },
      date: { S: "2026-11-15" },
      lat: { N: "35.6506" },
      lon: { N: "139.5407" },
      expiresAt: { N: String(Math.floor(NOW.getTime() / 1000) + 90 * 86400) },
    });
    expect(Object.keys(put.Item).sort()).toEqual(["date", "expiresAt", "lat", "lon", "sk", "speciesId", "tile"]); // IP・端末IDなどは保存しない
  });
  it("アクセス元のIPは、そのままでは保存されず、上限の数え上げの鍵はハッシュになる", async () => {
    const { sent, handler } = make();
    await handler(event(good, "203.0.113.9"));
    const key = sent.find((s) => s.name === "UpdateItemCommand").input.Key.idDate.S;
    expect(key).not.toContain("203.0.113.9");
    expect(key).toMatch(/^[0-9a-f]{32}#\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(sent)).not.toContain("203.0.113.9");
  });
  it("base64の本文も読める", async () => {
    const { handler } = make();
    const res = await handler({ ...event(""), body: Buffer.from(JSON.stringify(good)).toString("base64"), isBase64Encoded: true });
    expect(res.statusCode).toBe(201);
  });
  it("壊れたJSONは400、検証に通らない投稿は400（上限を消費しない）", async () => {
    const { sent, handler } = make();
    expect((await handler(event("{broken"))).statusCode).toBe(400);
    const r = await handler(event({ ...good, speciesId: "dragon" }));
    expect(r.statusCode).toBe(400);
    expect(sent).toHaveLength(0);
  });
  it("大きすぎる本文は413、本文が無い・文字列でないものも拒否", async () => {
    const { handler } = make();
    expect((await handler(event("x".repeat(MAX_BODY_BYTES + 1)))).statusCode).toBe(413);
    expect((await handler({ body: 123 })).statusCode).toBe(413);
    expect((await handler({})).statusCode).toBe(400);
    expect((await handler(undefined)).statusCode).toBe(400);
  });
  it("1日の上限を超えると429で、保存しない", async () => {
    const { sent, handler } = make({ rateOk: false });
    const res = await handler(event(good));
    expect(res.statusCode).toBe(429);
    expect(sent.some((s) => s.name === "PutItemCommand")).toBe(false);
  });
  it("DynamoDBの障害は500（内部の詳細は返さない）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler } = make({ failOn: "PutItemCommand" });
    const res = await handler(event(good));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("boom");
    vi.restoreAllMocks();
  });
  it("設定が無い場合の既定値（上限30・90日）で動く", async () => {
    const ddb = { send: vi.fn(async () => ({})) };
    const h = createHandler({ ddb, env: { SIGHTINGS_TABLE: "s", RATE_TABLE: "r", ALLOWED_ORIGIN: "o" }, now: () => NOW });
    expect((await h(event(good))).statusCode).toBe(201);
  });
});

describe("sourceId", () => {
  it("同じIP・同じ秘密の値なら同じ、違えば別の値。IPが無ければunknown扱い", () => {
    const a = sourceId(event(good, "1.1.1.1"), "p");
    expect(sourceId(event(good, "1.1.1.1"), "p")).toBe(a);
    expect(sourceId(event(good, "1.1.1.1"), "q")).not.toBe(a);
    expect(sourceId(event(good, "2.2.2.2"), "p")).not.toBe(a);
    expect(sourceId({}, "p")).toHaveLength(32);
  });
});

#!/usr/bin/env bash
# デプロイ後の動作確認。実際のAPIへ、読み取り・不正な入力・CORS・投稿を確認する
set -uo pipefail

: "${URL:?APIのURLを解決できませんでした}"
ORIGIN="${ORIGIN:-https://uchi-stock.github.io}"
FAILED=0
body=$(mktemp)

check() { # 名前 期待コード 実際コード
  if [ "$2" = "$3" ]; then echo "  OK  : $1 ($3)"; else echo "  NG  : $1 (期待 $2 / 実際 $3)"; FAILED=1; fi
}
http() { curl -s -o "$body" -w "%{http_code}" --max-time 20 "$@"; }

echo "API: $URL"

check "GET 区画を指定して取得" 200 "$(http "$URL/sightings?tiles=713:2790")"
check "GET tilesが不正" 400 "$(http "$URL/sightings?tiles=abc")"
check "GET tilesが無い" 400 "$(http "$URL/sightings")"
check "POST 収録されていない種" 400 "$(http -X POST -H 'Content-Type: application/json' -d '{"speciesId":"dragon","date":"2026-01-01","lat":35.6,"lon":139.5}' "$URL/sightings")"
check "POST 余分な項目（端末ID）" 400 "$(http -X POST -H 'Content-Type: application/json' -d '{"speciesId":"sparrow","date":"2026-01-01","lat":35.6,"lon":139.5,"deviceId":"x"}' "$URL/sightings")"
check "POST 壊れたJSON" 400 "$(http -X POST -H 'Content-Type: application/json' -d '{broken' "$URL/sightings")"

# CORS: 許可したオリジンにだけ、許可のヘッダーを返す
allow=$(curl -s -o /dev/null -D - --max-time 20 -X OPTIONS -H "Origin: $ORIGIN" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type" "$URL/sightings" | grep -i '^access-control-allow-origin' | tr -d '\r' | awk '{print $2}')
check "CORS 許可したオリジン" "$ORIGIN" "$allow"
other=$(curl -s -o /dev/null -D - --max-time 20 -X OPTIONS -H "Origin: https://example.com" -H "Access-Control-Request-Method: POST" "$URL/sightings" | grep -ci '^access-control-allow-origin: https://example.com')
check "CORS 他のオリジンは許可しない" 0 "$other"

# 正しい投稿を1件送り、取得できることを確認する（太平洋の真ん中の点。確認後に削除する）
today=$(date -u +%F)
check "POST 正しい投稿" 201 "$(http -X POST -H 'Content-Type: application/json' -d "{\"speciesId\":\"sparrow\",\"date\":\"$today\",\"lat\":30.0,\"lon\":150.0}" "$URL/sightings")"
sleep 2
check "GET 投稿が取得できる" 200 "$(http "$URL/sightings?tiles=600:3000")"
if grep -q '"speciesId":"sparrow"' "$body"; then echo "  OK  : 投稿した内容が返る"; else echo "  NG  : 投稿した内容が返らない"; FAILED=1; fi

# 後片付け（権限が無ければ警告だけ）
table="bird-finder-api-prod-sightings"
sk=$(aws dynamodb query --table-name "$table" --key-condition-expression "tile = :t" --expression-attribute-values '{":t":{"S":"600:3000"}}' --query 'Items[].sk.S' --output text 2>/dev/null || true)
for k in $sk; do aws dynamodb delete-item --table-name "$table" --key "{\"tile\":{\"S\":\"600:3000\"},\"sk\":{\"S\":\"$k\"}}" 2>/dev/null && echo "  後片付け: 確認用の投稿を削除" || echo "  警告: 確認用の投稿を削除できませんでした（90日で自動削除されます）"; done

if [ "$FAILED" -ne 0 ]; then echo "::error::動作確認に失敗しました"; exit 1; fi
echo "動作確認: すべて成功"

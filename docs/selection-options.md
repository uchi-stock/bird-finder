# 条件入力の選択肢ツリー

「探す」タブで入力する条件の選択肢と、前の回答による絞り込みの規則を図にまとめる。
規則の正本は`frontend/src/domain/choices.ts`である。
1・2・3番目の図は、そのコードから自動生成した文字列と一致することをテストで確認している。
規則を変えて図を直し忘れると、テストが失敗する。

## 絞り込みの原則

- 周辺の環境を選ぶと、「どこで見たか」はその環境にあり得る場所だけになる
- 「飛ぶ」は場所が「空」のときだけ出る。空を選ぶと自動で選ばれる
- 「見えない（声だけ）」を選ぶと、行動は「鳴く・歌う」だけになり、自動で選ばれる
- 「泳ぐ」「水の中に立つ・歩く」は、水辺・水面のとき（場所が未選択なら水辺の環境）だけ出る
- 「見えない」は場所の手がかりにならないため、場所のスコアは加点も減点もしない

## 1. 周辺の環境 → どこで見たか

<details open><summary>図を表示</summary>

```mermaid
flowchart LR
  subgraph ENV["周辺の環境"]
    H_waterside["川辺・水辺"]
    H_urban["住宅街・市街地"]
    H_woodland["森・林・公園"]
    H_open["草地・農地"]
  end
  subgraph PLACE["どこで見たか"]
    P_feeder["餌台"]
    P_ground["地面の上"]
    P_tree["木や茂みの中"]
    P_wire["柵や電線の上"]
    P_roof["建物や屋根の上"]
    P_water["水辺・水面"]
    P_grass["草むら・ヨシ原"]
    P_sky["空（飛んでいた）"]
    P_unseen["見えない（声だけ）"]
  end
  H_waterside --> P_water
  H_waterside --> P_ground
  H_waterside --> P_grass
  H_waterside --> P_tree
  H_waterside --> P_wire
  H_waterside --> P_sky
  H_waterside --> P_unseen
  H_urban --> P_feeder
  H_urban --> P_ground
  H_urban --> P_tree
  H_urban --> P_wire
  H_urban --> P_roof
  H_urban --> P_sky
  H_urban --> P_unseen
  H_woodland --> P_tree
  H_woodland --> P_ground
  H_woodland --> P_grass
  H_woodland --> P_sky
  H_woodland --> P_unseen
  H_open --> P_ground
  H_open --> P_grass
  H_open --> P_tree
  H_open --> P_wire
  H_open --> P_sky
  H_open --> P_unseen
```

![選択肢の図（rendered）](https://raw.githubusercontent.com/uchi-stock/bird-finder/docs-diagrams/latest/selection-options-1.png?5011e99b36a783ae72a5afba1cc14e726e14f8d4)

</details>

## 2. どこで見たか → 行動

太い矢印は、場所を選ぶと自動で選ばれる行動。

<details open><summary>図を表示</summary>

```mermaid
flowchart LR
  subgraph PLACE["どこで見たか"]
    P_feeder["餌台"]
    P_ground["地面の上"]
    P_tree["木や茂みの中"]
    P_wire["柵や電線の上"]
    P_roof["建物や屋根の上"]
    P_water["水辺・水面"]
    P_grass["草むら・ヨシ原"]
    P_sky["空（飛んでいた）"]
    P_unseen["見えない（声だけ）"]
  end
  subgraph BEHAVIOR["行動"]
    B_swimming["泳ぐ"]
    B_wading["水の中に立つ・歩く"]
    B_perching["止まる・立つ・歩く"]
    B_flying["飛ぶ・滑空する"]
    B_singing["鳴く・歌う"]
    B_foraging["採食する・つつく"]
    B_preening["羽繕いする"]
  end
  P_feeder --> B_perching
  P_feeder --> B_singing
  P_feeder --> B_foraging
  P_feeder --> B_preening
  P_ground --> B_perching
  P_ground --> B_singing
  P_ground --> B_foraging
  P_ground --> B_preening
  P_tree --> B_perching
  P_tree --> B_singing
  P_tree --> B_foraging
  P_tree --> B_preening
  P_wire --> B_perching
  P_wire --> B_singing
  P_wire --> B_foraging
  P_wire --> B_preening
  P_roof --> B_perching
  P_roof --> B_singing
  P_roof --> B_foraging
  P_roof --> B_preening
  P_water --> B_swimming
  P_water --> B_wading
  P_water --> B_perching
  P_water --> B_singing
  P_water --> B_foraging
  P_water --> B_preening
  P_grass --> B_perching
  P_grass --> B_singing
  P_grass --> B_foraging
  P_grass --> B_preening
  P_sky ==>|自動で選ばれる| B_flying
  P_sky --> B_singing
  P_unseen ==>|自動で選ばれる| B_singing
```

![選択肢の図（rendered）](https://raw.githubusercontent.com/uchi-stock/bird-finder/docs-diagrams/latest/selection-options-2.png?5011e99b36a783ae72a5afba1cc14e726e14f8d4)

</details>

## 3. 入力カードの流れ

<details open><summary>図を表示</summary>

```mermaid
flowchart LR
  S0["1. 周辺の環境"]
  S1["2. どこで見たか"]
  S2["3. 行動"]
  S3["4. 鳴き声"]
  S4["5. 大きさ"]
  S5["6. 羽の色"]
  S6["7. 時間帯・観察日"]
  S0 --> S1 --> S2 --> S3 --> S4 --> S5 --> S6
```

![選択肢の図（rendered）](https://raw.githubusercontent.com/uchi-stock/bird-finder/docs-diagrams/latest/selection-options-3.png?5011e99b36a783ae72a5afba1cc14e726e14f8d4)

</details>

## 4. 入口の三択（案・Issue #60、未実装）

鳴き声だけ分かる場合と、姿だけ分かる場合で、不要なカードを省く案。
この図は手書きで、実装と同期していない。

<details open><summary>図を表示</summary>

```mermaid
flowchart LR
  START["入力のはじめ（案）"] --> MODE{"何をもとに探す？"}
  MODE -->|鳴き声から| V["鳴き声のカード（オノマトペ）"]
  MODE -->|姿から| A["環境・場所・行動・大きさ・羽の色"]
  MODE -->|両方| ALL["すべてのカード"]
  V --> COMMON["時間帯・観察日"]
  A --> COMMON
  ALL --> COMMON
```

![選択肢の図（rendered）](https://raw.githubusercontent.com/uchi-stock/bird-finder/docs-diagrams/latest/selection-options-4.png?5011e99b36a783ae72a5afba1cc14e726e14f8d4)

</details>

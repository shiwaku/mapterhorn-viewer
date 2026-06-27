# Mapterhorn Viewer

[Mapterhorn](https://mapterhorn.com/) の世界標高タイル（Terrarium エンコード WebP）を表示する
統合ビューワ。公式の 5 サンプルを 1 画面にまとめ、コントロールパネルから機能を切り替えられます。

## 機能（5 サンプルの統合）

| 公式サンプル | このビューワでの機能 |
|---|---|
| migration | データソース **zxy-http** + 陰影手法 `igor` |
| hillshade  | データソース **TileJSON** + 陰影 ON/OFF |
| terrain    | ベースマップ + **3D 地形** + sky + 誇張スライダー |
| contour    | **等高線**（線 + 標高ラベル） |
| pmtiles    | データソース **PMTiles プロトコル**（`mapterhorn://` ルーティング） |

コントロールパネル：
- **Data source**: TileJSON / zxy-http / PMTiles を切替（hillshade と 3D 地形に作用）
- **Base map**: ベクトルタイル（[OpenFreeMap](https://openfreemap.org/), OSM ベース・無料・APIキー不要）の ON/OFF と
  スタイル選択（Liberty / Bright / Positron）。陰影は base map のラベルの下に挿入される。
- **Earthquakes (USGS)**: [USGS](https://earthquake.usgs.gov/) のリアルタイム地震フィード（GeoJSON）を重畳。
  フィード選択（Significant 30d / M4.5+ 30d / M2.5+ 7d / All 24h）、円の大きさ=マグニチュード・色=深さ、
  クリックでポップアップ（場所・M・深さ・時刻・USGS イベントページへのリンク）。
  - 特定イベントの表示：パネルの入力欄に **USGS イベントID または イベントページURL** を入れて Show すると、
    その地震をハイライトして揺れの範囲を画面に収める。`?event=<id>` のクエリで直リンク表示も可能
    （例: `…/mapterhorn-viewer/?event=atth5pbk`）。
  - **ShakeMap MMI コンタ**：そのイベントに ShakeMap があれば、揺れの強さ（MMI 震度）の等値線を
    USGS 公式の色で重畳（ローマ数字ラベル付き）。トグルで ON/OFF。
- **Hillshade**: ON/OFF・手法（igor / multidirectional / standard / basic / combined）・誇張
- **3D terrain**: ON/OFF・誇張
- **Contours**: ON/OFF（ズームインで表示）

> 注: 等高線は maplibre-contour が DEM を直接 `fetch()` するため、データソース設定に
> かかわらず常に zxy エンドポイント（`tiles.mapterhorn.com/{z}/{x}/{y}.webp`）を使用します。

## 技術スタック

- Vite 8 + TypeScript 6（素の TS + DOM、フレームワークなし）
- maplibre-gl 5.6.0 / maplibre-contour 0.0.5 / pmtiles 4.3.0

## 使い方

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 型チェック (tsc) + 本番ビルド
npm run preview  # 本番ビルドのプレビュー
```

地図の位置・ズームは URL ハッシュ（`#zoom/lat/lng/bearing/pitch`）に保存され共有可能です。
初期表示は富士山周辺。

### 特定の地震イベントを表示する

Earthquakes パネルの入力欄に指定して **Show**、または URL の `?event=` クエリで直接開けます。
ShakeMap がある地震なら、震源点に加えて MMI（揺れの強さ）の等値線が表示され、揺れの範囲に自動ズームします。
（`Clear` で解除）

指定できる形式（いずれも可）：

| 形式 | 例 |
|---|---|
| 正規イベントID | `us6000t7zc`（M7.2）, `us6000t7zp`（M7.5） |
| イベントページの短縮ID | `atth5pbk`（URL から ID を自動抽出） |
| イベントページURL まるごと | `https://earthquake.usgs.gov/earthquakes/eventpage/us6000t7zc/map` |
| 直リンク（`?event=`） | `https://shiwaku.github.io/mapterhorn-viewer/?event=us6000t7zc` |

イベントIDは [USGS Earthquakes](https://earthquake.usgs.gov/earthquakes/map/) の各イベントページURL
（`/eventpage/<ID>`）で確認できます。ShakeMap が無いイベントは震源点のみ表示されます。

> MMI（Modified Mercalli Intensity）は各地点の揺れの強さを I〜XII で表す USGS の震度階級で、
> 地震の規模を表すマグニチュード（M）とは別物です（気象庁の震度 0〜7 とも尺度が異なります）。

## 構成

```
src/
├── main.ts            エントリ（プロトコル登録 → Map 生成 → パネル配線・地震操作）
├── config.ts          エンドポイント・型・初期状態・陰影プリセット
├── basemap.ts         OpenFreeMap ベクトルスタイルの取得・キャッシュ
├── earthquakes.ts     USGS フィード/単一イベント/ShakeMap MMI の取得・整形
├── style.ts           buildStyle(state, base, quakes, focus, mmi) → MapLibre スタイル（純関数）
├── demSource.ts       PMTiles/contour プロトコル登録・ソース別 raster-dem 定義
└── ui/ControlPanel.ts コントロールパネル（DOM 直書き）
```

状態が変わるたびに base map スタイル・地震データ（必要なら fetch）を解決し、
`map.setStyle(buildStyle(...), { diff: true })` でスタイルを再適用します。

## データ提供

Terrain data © [Mapterhorn](https://mapterhorn.com/attribution) ・
Base map [OpenFreeMap](https://openfreemap.org/) © OpenMapTiles / OpenStreetMap contributors ・
Earthquake & ShakeMap data © [USGS](https://earthquake.usgs.gov/)

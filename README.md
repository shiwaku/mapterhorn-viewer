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

## 構成

```
src/
├── main.ts            エントリ（プロトコル登録 → Map 生成 → パネル配線）
├── config.ts          エンドポイント・型・初期状態・陰影プリセット
├── basemap.ts         OpenFreeMap ベクトルスタイルの取得・キャッシュ
├── style.ts           buildStyle(state, base) → MapLibre スタイル（純関数）
├── demSource.ts       PMTiles/contour プロトコル登録・ソース別 raster-dem 定義
└── ui/ControlPanel.ts コントロールパネル（DOM 直書き）
```

状態が変わるたびに base map スタイル（必要なら fetch）を解決し、
`map.setStyle(buildStyle(state, base), { diff: true })` でスタイルを再適用します。

## データ提供

Terrain data © [Mapterhorn](https://mapterhorn.com/attribution) ・
Base map [OpenFreeMap](https://openfreemap.org/) © OpenMapTiles / OpenStreetMap contributors

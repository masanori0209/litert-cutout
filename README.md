# litert-cutout

ブラウザ内だけで背景を消す検証アプリです。  
[LiteRT.js](https://ai.google.dev/edge/litert/web) と、Hugging Face の [U²-Net LiteRT モデル](https://huggingface.co/litert-community/U-2-Net)（`.tflite`）を使います。

画像ファイル自体はサーバーにアップロードしません（初回にモデルと Wasm を取得するだけです）。

## できること

- プロフィール写真・商品写真っぽい切り抜きを、タブの中で試す
- `webgpu` / `wasm` の切り替え
- 透明 PNG のダウンロード
- 推論時間の表示（手元環境の参考値）

## セットアップ

```bash
git clone https://github.com/masanori0209/litert-cutout.git
cd litert-cutout
bash scripts/setup.sh
npm run dev
```

`setup.sh` は次を行います。

1. `npm install`
2. `@litertjs/core` の Wasm を `public/wasm/` へ同期
3. U²-Net（約 88MB）を `public/models/u2net_fp16.tflite` へ取得

ブラウザで `http://localhost:5173` を開き、画像を選ぶか「サンプル画像」を押して「切り抜く」を実行します。

## 技術メモ

| 項目 | 内容 |
|---|---|
| Runtime | `@litertjs/core` 2.5.x |
| Model | `u2net_fp16.tflite`（320×320、NCHW） |
| Preprocess | resize → `/max` → ImageNet normalize |
| Output | saliency mask → alpha として合成 |

モデルの前処理・入出力仕様は [litert-community/U-2-Net](https://huggingface.co/litert-community/U-2-Net) に従っています。

## 言えること / 言えないこと

- 言える: 画像を外に出さずに切り抜きを試せること、手元での推論時間
- 言えない: 商用背景消しサービス並みの品質、全端末での同じ速度

髪の毛の境界や複雑な背景では、マスクが粗くなることがあります。

## ライセンス

- このリポジトリのコード: Apache-2.0
- U²-Net モデル: Apache-2.0（[xuebinqin/U-2-Net](https://github.com/xuebinqin/U-2-Net) / LiteRT community conversion）

## 関連

- LiteRT.js: https://ai.google.dev/edge/litert/web
- Zenn 記事（公開後に追記）

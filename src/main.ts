import './style.css'
import { isWebGPUSupported } from '@litertjs/core'
import { removeBackground, type Accelerator } from './cutout'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('#app not found')
}

app.innerHTML = `
  <main class="page">
    <header class="hero">
      <p class="eyebrow">LiteRT.js · U²-Net</p>
      <h1>写真を、タブの外に出さずに切り抜く</h1>
      <p class="lede">
        プロフィール写真や商品写真の背景消しを、ブラウザ内だけで試す検証アプリです。
        画像はサーバーにアップロードしません（モデルの初回取得を除く）。
      </p>
    </header>

    <section class="panel">
      <div class="controls">
        <label class="file">
          <span>画像を選ぶ</span>
          <input id="file" type="file" accept="image/*" />
        </label>
        <label>
          バックエンド
          <select id="accelerator">
            <option value="auto">auto（WebGPU優先）</option>
            <option value="webgpu">webgpu</option>
            <option value="wasm">wasm（CPU）</option>
          </select>
        </label>
        <button id="run" type="button" disabled>切り抜く</button>
        <button id="sample" type="button">サンプル画像</button>
        <a id="download" class="button-link hidden" download="cutout.png">PNGを保存</a>
      </div>
      <p id="status" class="status">モデル準備中の表示は、ここに出ます。</p>
      <p id="meta" class="meta"></p>
    </section>

    <section class="preview">
      <figure>
        <figcaption>元画像</figcaption>
        <div class="frame">
          <img id="source" alt="元画像プレビュー" />
        </div>
      </figure>
      <figure>
        <figcaption>切り抜き結果</figcaption>
        <div class="frame checker">
          <canvas id="result" aria-label="切り抜き結果"></canvas>
        </div>
      </figure>
      <figure>
        <figcaption>マスク</figcaption>
        <div class="frame">
          <canvas id="mask" aria-label="saliency mask"></canvas>
        </div>
      </figure>
    </section>
  </main>
`

const fileInput = document.querySelector<HTMLInputElement>('#file')!
const acceleratorSelect = document.querySelector<HTMLSelectElement>('#accelerator')!
const runButton = document.querySelector<HTMLButtonElement>('#run')!
const sampleButton = document.querySelector<HTMLButtonElement>('#sample')!
const downloadLink = document.querySelector<HTMLAnchorElement>('#download')!
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const metaEl = document.querySelector<HTMLParagraphElement>('#meta')!
const sourceImg = document.querySelector<HTMLImageElement>('#source')!
const resultCanvas = document.querySelector<HTMLCanvasElement>('#result')!
const maskCanvas = document.querySelector<HTMLCanvasElement>('#mask')!

let currentObjectUrl: string | null = null

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message
  statusEl.classList.toggle('error', isError)
}

function revokeCurrentUrl(): void {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  await image.decode()
  return image
}

function showImage(image: HTMLImageElement): void {
  sourceImg.src = image.src
  runButton.disabled = false
  downloadLink.classList.add('hidden')
  metaEl.textContent = `${image.naturalWidth}×${image.naturalHeight}`
}

async function onFileSelected(file: File): Promise<void> {
  revokeCurrentUrl()
  currentObjectUrl = URL.createObjectURL(file)
  const image = await loadImageFromUrl(currentObjectUrl)
  showImage(image)
  setStatus(`読み込みました: ${file.name}`)
}

async function runCutout(): Promise<void> {
  if (!sourceImg.src) {
    setStatus('先に画像を選んでください', true)
    return
  }

  runButton.disabled = true
  sampleButton.disabled = true
  setStatus('推論中…（初回はモデル読み込みで数十秒かかることがあります）')

  try {
    const image = await loadImageFromUrl(sourceImg.src)
    const preferred = acceleratorSelect.value as Accelerator | 'auto'
    const result = await removeBackground(image, preferred)

    const resultCtx = resultCanvas.getContext('2d')
    const maskCtx = maskCanvas.getContext('2d')
    if (!resultCtx || !maskCtx) {
      throw new Error('canvas context unavailable')
    }

    resultCanvas.width = result.cutoutCanvas.width
    resultCanvas.height = result.cutoutCanvas.height
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height)
    resultCtx.drawImage(result.cutoutCanvas, 0, 0)

    maskCanvas.width = result.maskCanvas.width
    maskCanvas.height = result.maskCanvas.height
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    maskCtx.drawImage(result.maskCanvas, 0, 0)

    downloadLink.href = resultCanvas.toDataURL('image/png')
    downloadLink.classList.remove('hidden')

    metaEl.textContent =
      `${image.naturalWidth}×${image.naturalHeight} · ` +
      `accelerator=${result.accelerator} · ` +
      `inference=${result.inferenceMs.toFixed(1)}ms · ` +
      `total=${result.totalMs.toFixed(1)}ms`

    setStatus('切り抜きが終わりました。画像ファイルは端末の外に出ていません。')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setStatus(`失敗しました: ${message}`, true)
    console.error(error)
  } finally {
    runButton.disabled = !sourceImg.src
    sampleButton.disabled = false
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) {
    void onFileSelected(file)
  }
})

runButton.addEventListener('click', () => {
  void runCutout()
})

sampleButton.addEventListener('click', () => {
  void (async () => {
    revokeCurrentUrl()
    const image = await loadImageFromUrl('/samples/product.png')
    showImage(image)
    setStatus('サンプル画像を読み込みました')
  })()
})

void (async () => {
  const webgpu = await isWebGPUSupported()
  setStatus(
    webgpu
      ? 'WebGPU 利用可。画像を選ぶか、サンプル画像を押してください。'
      : 'WebGPU なし。wasm（CPU）で動きます。画像を選ぶか、サンプル画像を押してください。',
  )
})()

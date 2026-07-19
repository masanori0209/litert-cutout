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
      <p class="brand">LiteRT.js · U²-Net · ブラウザ完結</p>
      <h1>「LiteRT.js で消してやるのさ」</h1>
      <p class="lede">
        消しゴムマジックっぽい切り抜きを、画像を外に出さずにタブの中だけでやる。
        初回だけモデルを取得します。写真そのものはアップロードしません。
      </p>
    </header>

    <section class="workspace" aria-label="操作">
      <label class="dropzone" id="dropzone" for="file">
        <input id="file" type="file" accept="image/*" />
        <div class="dropzone-copy">
          <p class="dropzone-title">画像をここに置く</p>
          <p class="dropzone-note">クリックして選ぶか、ドラッグ＆ドロップ</p>
        </div>
        <div class="dropzone-preview">
          <img id="source" alt="元画像プレビュー" />
        </div>
      </label>

      <div class="control-board">
        <p class="control-title">操作</p>
        <label class="field">
          <span>バックエンド</span>
          <select id="accelerator">
            <option value="auto">auto（WebGPU優先）</option>
            <option value="webgpu">webgpu</option>
            <option value="wasm">wasm（CPU）</option>
          </select>
        </label>
        <div class="actions">
          <button id="run" class="btn-primary" type="button" disabled>消す</button>
          <button id="sample" class="btn-secondary" type="button">サンプル</button>
        </div>
        <a id="download" class="button-link hidden" download="cutout.png">PNG を保存</a>
        <div class="status-block">
          <p id="status" class="status">準備中…</p>
          <p id="meta" class="meta"></p>
        </div>
      </div>
    </section>

    <section class="results" aria-label="結果">
      <figure class="pane">
        <div class="pane-head">
          <h2>元画像</h2>
          <span>入力</span>
        </div>
        <div class="frame" id="source-frame">
          <p class="placeholder">画像を選ぶとここに出ます</p>
          <img id="source-result" alt="元画像" />
        </div>
      </figure>
      <figure class="pane pane-featured">
        <div class="pane-head">
          <h2>消した結果</h2>
          <span>透明 PNG</span>
        </div>
        <div class="frame featured checker" id="result-frame">
          <p class="placeholder">まだ消していません</p>
          <canvas id="result" aria-label="背景を消した結果"></canvas>
        </div>
      </figure>
      <figure class="pane">
        <div class="pane-head">
          <h2>マスク</h2>
          <span>saliency</span>
        </div>
        <div class="frame" id="mask-frame">
          <p class="placeholder">推論後に表示</p>
          <canvas id="mask" aria-label="saliency mask"></canvas>
        </div>
      </figure>
    </section>

    <p class="footnote">
      写り込み除去（物体消去）ではなく、被写体を残す切り抜きです。画質は端末と写真次第。
    </p>
  </main>
`

const fileInput = document.querySelector<HTMLInputElement>('#file')!
const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!
const acceleratorSelect = document.querySelector<HTMLSelectElement>('#accelerator')!
const runButton = document.querySelector<HTMLButtonElement>('#run')!
const sampleButton = document.querySelector<HTMLButtonElement>('#sample')!
const downloadLink = document.querySelector<HTMLAnchorElement>('#download')!
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const metaEl = document.querySelector<HTMLParagraphElement>('#meta')!
const sourceImg = document.querySelector<HTMLImageElement>('#source')!
const sourceResultImg = document.querySelector<HTMLImageElement>('#source-result')!
const sourceFrame = document.querySelector<HTMLDivElement>('#source-frame')!
const resultFrame = document.querySelector<HTMLDivElement>('#result-frame')!
const maskFrame = document.querySelector<HTMLDivElement>('#mask-frame')!
const resultCanvas = document.querySelector<HTMLCanvasElement>('#result')!
const maskCanvas = document.querySelector<HTMLCanvasElement>('#mask')!

let currentObjectUrl: string | null = null

function setStatus(message: string, kind: 'plain' | 'ok' | 'error' = 'plain'): void {
  statusEl.textContent = message
  statusEl.classList.toggle('error', kind === 'error')
  statusEl.classList.toggle('ok', kind === 'ok')
}

function setBusy(busy: boolean): void {
  runButton.classList.toggle('is-busy', busy)
  runButton.disabled = busy || !sourceImg.src
  sampleButton.disabled = busy
  fileInput.disabled = busy
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

function clearOutputs(): void {
  const resultCtx = resultCanvas.getContext('2d')
  const maskCtx = maskCanvas.getContext('2d')
  resultCtx?.clearRect(0, 0, resultCanvas.width, resultCanvas.height)
  maskCtx?.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
  resultCanvas.width = 0
  resultCanvas.height = 0
  maskCanvas.width = 0
  maskCanvas.height = 0
  resultCanvas.classList.remove('is-ready')
  maskCanvas.classList.remove('is-ready')
  resultFrame.classList.remove('has-media')
  maskFrame.classList.remove('has-media')
  downloadLink.classList.add('hidden')
}

function showImage(image: HTMLImageElement): void {
  sourceImg.src = image.src
  sourceResultImg.src = image.src
  sourceImg.classList.add('is-ready')
  sourceResultImg.classList.add('is-ready')
  dropzone.classList.add('has-image')
  sourceFrame.classList.add('has-media')
  runButton.disabled = false
  clearOutputs()
  metaEl.textContent = `${image.naturalWidth}×${image.naturalHeight}`
}

async function onFileSelected(file: File): Promise<void> {
  revokeCurrentUrl()
  currentObjectUrl = URL.createObjectURL(file)
  const image = await loadImageFromUrl(currentObjectUrl)
  showImage(image)
  setStatus(`読み込みました: ${file.name}`, 'ok')
}

async function runCutout(): Promise<void> {
  if (!sourceImg.src) {
    setStatus('先に画像を選んでください', 'error')
    return
  }

  setBusy(true)
  setStatus('消しています…（初回はモデル読み込みで少し待ちます）')

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
    resultCanvas.classList.add('is-ready')
    resultFrame.classList.add('has-media')

    maskCanvas.width = result.maskCanvas.width
    maskCanvas.height = result.maskCanvas.height
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    maskCtx.drawImage(result.maskCanvas, 0, 0)
    maskCanvas.classList.add('is-ready')
    maskFrame.classList.add('has-media')

    downloadLink.href = resultCanvas.toDataURL('image/png')
    downloadLink.classList.remove('hidden')

    metaEl.textContent =
      `${image.naturalWidth}×${image.naturalHeight} · ` +
      `${result.accelerator} · ` +
      `推論 ${result.inferenceMs.toFixed(1)}ms · ` +
      `合計 ${result.totalMs.toFixed(1)}ms`

    setStatus('消しました。画像ファイルは端末の外に出ていません。', 'ok')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setStatus(`失敗しました: ${message}`, 'error')
    console.error(error)
  } finally {
    setBusy(false)
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) {
    void onFileSelected(file)
  }
})

;['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropzone.classList.add('is-dragover')
  })
})

;['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropzone.classList.remove('is-dragover')
  })
})

dropzone.addEventListener('drop', (event) => {
  const dragEvent = event as DragEvent
  const file = dragEvent.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
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
    setStatus('サンプル画像を読み込みました', 'ok')
  })()
})

void (async () => {
  const webgpu = await isWebGPUSupported()
  setStatus(
    webgpu
      ? 'WebGPU 利用可。画像を置くか、サンプルを押してください。'
      : 'WebGPU なし。wasm（CPU）で動きます。画像を置くか、サンプルを押してください。',
  )
})()

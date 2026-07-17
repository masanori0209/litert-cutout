import {
  isWebGPUSupported,
  loadAndCompile,
  loadLiteRt,
  Tensor,
  type CompiledModel,
} from '@litertjs/core'
import { drawToCanvas, imageToInputTensor, INPUT_SIZE } from './preprocess'

export type Accelerator = 'webgpu' | 'wasm'

export type CutoutResult = {
  cutoutCanvas: HTMLCanvasElement
  maskCanvas: HTMLCanvasElement
  accelerator: Accelerator
  inferenceMs: number
  totalMs: number
}

let readyPromise: Promise<unknown> | null = null
const modelCache = new Map<Accelerator, CompiledModel>()

async function ensureLiteRt(): Promise<void> {
  if (!readyPromise) {
    readyPromise = loadLiteRt('/wasm/')
  }
  await readyPromise
}

async function getModel(accelerator: Accelerator): Promise<CompiledModel> {
  await ensureLiteRt()
  const cached = modelCache.get(accelerator)
  if (cached) {
    return cached
  }
  const model = await loadAndCompile('/models/u2net_fp16.tflite', { accelerator })
  modelCache.set(accelerator, model)
  return model
}

export async function pickAccelerator(preferred: Accelerator | 'auto'): Promise<Accelerator> {
  if (preferred === 'wasm') {
    return 'wasm'
  }
  if (preferred === 'webgpu') {
    if (!(await isWebGPUSupported())) {
      throw new Error('WebGPU is not available in this browser')
    }
    return 'webgpu'
  }
  if (await isWebGPUSupported()) {
    return 'webgpu'
  }
  return 'wasm'
}

function maskToCanvas(mask: Float32Array, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D canvas context is unavailable')
  }
  const imageData = ctx.createImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    const v = Math.max(0, Math.min(255, Math.round(mask[i] * 255)))
    imageData.data[i * 4] = v
    imageData.data[i * 4 + 1] = v
    imageData.data[i * 4 + 2] = v
    imageData.data[i * 4 + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function composeCutout(
  image: HTMLImageElement | ImageBitmap,
  mask320: Float32Array,
): { cutoutCanvas: HTMLCanvasElement; maskCanvas: HTMLCanvasElement } {
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height

  const maskCanvasSmall = maskToCanvas(mask320, INPUT_SIZE, INPUT_SIZE)
  const { canvas: maskCanvas, ctx: alphaCtx } = drawToCanvas(maskCanvasSmall, width, height)
  const alphaData = alphaCtx.getImageData(0, 0, width, height)

  const { canvas: cutoutCanvas, ctx } = drawToCanvas(image, width, height)
  const rgba = ctx.getImageData(0, 0, width, height)
  for (let i = 0; i < width * height; i++) {
    rgba.data[i * 4 + 3] = alphaData.data[i * 4]
  }
  ctx.putImageData(rgba, 0, 0)

  return { cutoutCanvas, maskCanvas }
}

function safeDelete(tensor: Tensor | null | undefined): void {
  if (!tensor) {
    return
  }
  try {
    tensor.delete()
  } catch {
    // Already freed (e.g. after moveTo).
  }
}

export async function removeBackground(
  image: HTMLImageElement | ImageBitmap,
  preferred: Accelerator | 'auto' = 'auto',
): Promise<CutoutResult> {
  const totalStarted = performance.now()
  const accelerator = await pickAccelerator(preferred)
  const model = await getModel(accelerator)

  const inputData = imageToInputTensor(image)
  let inputTensor: Tensor | null = new Tensor(inputData, [1, 3, INPUT_SIZE, INPUT_SIZE])
  let results: Tensor[] | null = null
  let cpuOutput: Tensor | null = null

  try {
    if (accelerator === 'webgpu') {
      const gpuInput = await inputTensor.copyTo('webgpu')
      safeDelete(inputTensor)
      inputTensor = gpuInput
    }

    const inferenceStarted = performance.now()
    results = await model.run(inputTensor)
    const inferenceMs = performance.now() - inferenceStarted

    cpuOutput = await results[0].moveTo('wasm')
    const mask = cpuOutput.toTypedArray() as Float32Array
    const { cutoutCanvas, maskCanvas } = composeCutout(image, mask)

    return {
      cutoutCanvas,
      maskCanvas,
      accelerator,
      inferenceMs,
      totalMs: performance.now() - totalStarted,
    }
  } finally {
    safeDelete(inputTensor)
    if (results) {
      for (const tensor of results) {
        safeDelete(tensor)
      }
    }
    safeDelete(cpuOutput)
  }
}

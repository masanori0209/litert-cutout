const INPUT_SIZE = 320
const MEAN = [0.485, 0.456, 0.406] as const
const STD = [0.229, 0.224, 0.225] as const

export { INPUT_SIZE }

/** Resize an image onto a canvas and return RGBA pixels. */
export function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('2D canvas context is unavailable')
  }
  ctx.drawImage(source, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  return { canvas, ctx, imageData }
}

/**
 * U²-Net LiteRT preprocessing (NCHW float32):
 * resize → / per-image max → ImageNet normalize.
 * See https://huggingface.co/litert-community/U-2-Net
 */
export function imageToInputTensor(image: HTMLImageElement | ImageBitmap): Float32Array {
  const { imageData } = drawToCanvas(image, INPUT_SIZE, INPUT_SIZE)
  const { data } = imageData
  const pixelCount = INPUT_SIZE * INPUT_SIZE

  let maxVal = 0
  for (let i = 0; i < data.length; i += 4) {
    maxVal = Math.max(maxVal, data[i], data[i + 1], data[i + 2])
  }
  if (maxVal <= 0) {
    maxVal = 1
  }

  const out = new Float32Array(1 * 3 * pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * 4] / maxVal
    const g = data[i * 4 + 1] / maxVal
    const b = data[i * 4 + 2] / maxVal
    out[i] = (r - MEAN[0]) / STD[0]
    out[pixelCount + i] = (g - MEAN[1]) / STD[1]
    out[2 * pixelCount + i] = (b - MEAN[2]) / STD[2]
  }
  return out
}

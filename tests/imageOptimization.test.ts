import { optimizeImageFile } from '../src/lib/imageOptimization'

test('empty MIME image extension is decoded for the pixel guard before canvas allocation', async () => {
  const imageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  const createElement = jest.spyOn(document, 'createElement')
  const createObjectURL = jest.fn(() => 'blob:qa-image')
  const revokeObjectURL = jest.fn()
  class LargeImage {
    naturalWidth = 8000
    naturalHeight = 8000
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_value: string) { queueMicrotask(() => this.onload?.()) }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: LargeImage })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
  try {
    const file = new File(['tiny'], 'large.png', { type: '' })
    await expect(optimizeImageFile(file, { maxWidth: 1600, maxHeight: 1600, maxInputPixels: 32_000_000 }))
      .rejects.toThrow('Image dimensions are too large')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:qa-image')
    expect(createElement).not.toHaveBeenCalledWith('canvas')
  } finally {
    createElement.mockRestore()
    if (imageDescriptor) Object.defineProperty(globalThis, 'Image', imageDescriptor)
    if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor)
    else Reflect.deleteProperty(URL, 'createObjectURL')
    if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor)
    else Reflect.deleteProperty(URL, 'revokeObjectURL')
  }
})

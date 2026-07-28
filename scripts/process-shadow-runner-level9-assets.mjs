import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(
  repoRoot,
  'source-assets',
  'shadow-runner',
  'level-assets',
  'level-9',
);
const runtimeRoot = path.join(
  repoRoot,
  'public',
  'games',
  'shadow-runner',
  'level-assets',
  'level-9',
);
const locationButtonMaskPath = path.join(sourceRoot, 'level-9-location-button-mask.webp');
const locationButtonOutputPath = path.join(
  repoRoot,
  'public',
  'games',
  'shadow-runner',
  'home-assets',
  'optimized',
  'map-location-buttons',
  'level-9-captain-gate-location-button-v2.webp',
);

const ensureRuntimeDirectories = async () => {
  await Promise.all(
    ['background', 'collectibles', 'enemies', 'projectiles', 'props', 'ui'].map((directory) =>
      fs.mkdir(path.join(runtimeRoot, directory), { recursive: true }),
    ),
  );
};

const alphaBounds = ({ data, info }) => {
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha <= 12) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    throw new Error('A generated animation frame is empty after chroma removal.');
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
};

const makeStrip = async ({
  sourceName,
  outputDirectory,
  outputName,
  frameCount,
  frameSize,
  frameBoundaries,
}) => {
  const sourcePath = path.join(sourceRoot, sourceName);
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`${sourceName} has invalid source dimensions.`);
  }

  const boundaries = [0, ...(frameBoundaries ?? []), metadata.width];
  if (
    boundaries.length !== frameCount + 1 ||
    boundaries.some((boundary, index) => (
      boundary < 0 ||
      boundary > metadata.width ||
      (index > 0 && boundary <= boundaries[index - 1])
    ))
  ) {
    throw new Error(`${sourceName} has invalid frame boundaries.`);
  }

  const frames = [];
  const bounds = [];

  for (let index = 0; index < frameCount; index += 1) {
    const left = boundaries[index];
    const width = boundaries[index + 1] - left;
    const frame = await sharp(sourcePath)
      .extract({
        left,
        top: 0,
        width,
        height: metadata.height,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push(frame);
    bounds.push(alphaBounds(frame));
  }

  const unionWidth = Math.max(...bounds.map((bound) => bound.width));
  const unionHeight = Math.max(...bounds.map((bound) => bound.height));
  const gutter = frameSize >= 128 ? 5 : 3;
  const targetWidth = frameSize - gutter * 2;
  const targetHeight = frameSize - gutter * 2;
  const scale = Math.min(targetWidth / unionWidth, targetHeight / unionHeight);

  const composites = [];
  for (let index = 0; index < frameCount; index += 1) {
    const bound = bounds[index];
    const rendered = await sharp(frames[index].data, {
      raw: {
        width: frames[index].info.width,
        height: frames[index].info.height,
        channels: frames[index].info.channels,
      },
    })
      .extract(bound)
      .resize({
        width: Math.max(1, Math.round(bound.width * scale)),
        height: Math.max(1, Math.round(bound.height * scale)),
        kernel: sharp.kernel.nearest,
      })
      .png()
      .toBuffer();
    const renderedMetadata = await sharp(rendered).metadata();

    composites.push({
      input: rendered,
      left:
        index * frameSize +
        Math.round((frameSize - (renderedMetadata.width ?? frameSize)) / 2),
      top: frameSize - gutter - (renderedMetadata.height ?? frameSize),
    });
  }

  await sharp({
    create: {
      width: frameSize * frameCount,
      height: frameSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(runtimeRoot, outputDirectory, outputName));
};

const makeLocationButton = async () => {
  const size = 256;
  const generatedSourcePath = path.join(
    sourceRoot,
    'level-9-captain-gate-location-button-source.png',
  );
  const [generated, existingMask] = await Promise.all([
    sharp(generatedSourcePath)
      .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(locationButtonMaskPath)
      .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .extractChannel('alpha')
      .raw()
      .toBuffer(),
  ]);

  const mattePixels = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  let queueStart = 0;
  let queueEnd = 0;
  const enqueueMatte = (pixel) => {
    if (pixel < 0 || pixel >= size * size || mattePixels[pixel]) return;
    const red = generated[pixel * 4];
    const green = generated[pixel * 4 + 1];
    const blue = generated[pixel * 4 + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max - min > 20 || (red + green + blue) / 3 < 198) return;
    mattePixels[pixel] = 1;
    queue[queueEnd] = pixel;
    queueEnd += 1;
  };

  for (let edge = 0; edge < size; edge += 1) {
    enqueueMatte(edge);
    enqueueMatte((size - 1) * size + edge);
    enqueueMatte(edge * size);
    enqueueMatte(edge * size + size - 1);
  }

  while (queueStart < queueEnd) {
    const pixel = queue[queueStart];
    queueStart += 1;
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    if (x > 0) enqueueMatte(pixel - 1);
    if (x < size - 1) enqueueMatte(pixel + 1);
    if (y > 0) enqueueMatte(pixel - size);
    if (y < size - 1) enqueueMatte(pixel + size);
  }

  for (let pixel = 0; pixel < size * size; pixel += 1) {
    generated[pixel * 4 + 3] = mattePixels[pixel]
      ? 0
      : Math.min(generated[pixel * 4 + 3], existingMask[pixel]);
  }

  await sharp(generated, {
    raw: { width: size, height: size, channels: 4 },
  })
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toFile(locationButtonOutputPath);
};

await ensureRuntimeDirectories();

const backgroundOutput = path.join(
  runtimeRoot,
  'background',
  'captain-gate-background.webp',
);

await sharp(path.join(sourceRoot, 'captain-gate-background-source.png'))
  .resize(1920, 1080, { fit: 'cover', position: 'centre' })
  .webp({ quality: 88, effort: 6 })
  .toFile(backgroundOutput);

await Promise.all([
  sharp(backgroundOutput)
    .resize(320, 180, { fit: 'cover', position: 'centre' })
    .webp({ quality: 90, effort: 6 })
    .toFile(path.join(runtimeRoot, 'ui', 'captain-gate-thumbnail-320x180.webp')),
  sharp(backgroundOutput)
    .resize(160, 90, { fit: 'cover', position: 'centre' })
    .webp({ quality: 88, effort: 6 })
    .toFile(path.join(runtimeRoot, 'ui', 'captain-gate-thumbnail-160x90.webp')),
  sharp(path.join(sourceRoot, 'captain-gate-terrain-props-v1-transparent.png'))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(runtimeRoot, 'props', 'captain-gate-terrain-props-v1-transparent.png')),
]);

await Promise.all([
  makeStrip({
    sourceName: 'gate-pikeman-v1-6f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'gate-pikeman-v1-6f-128.png',
    frameCount: 6,
    frameSize: 128,
    frameBoundaries: [247, 480, 725, 1085, 1295],
  }),
  makeStrip({
    sourceName: 'storm-grenadier-v1-6f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'storm-grenadier-v1-6f-128.png',
    frameCount: 6,
    frameSize: 128,
    frameBoundaries: [241, 480, 745, 1060, 1274],
  }),
  makeStrip({
    sourceName: 'watch-captain-v1-8f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'watch-captain-v1-8f-128.png',
    frameCount: 8,
    frameSize: 128,
    frameBoundaries: [184, 379, 581, 812, 1022, 1199, 1347],
  }),
  makeStrip({
    sourceName: 'gale-mantle-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'gale-mantle-4f-64.png',
    frameCount: 4,
    frameSize: 64,
    frameBoundaries: [320, 686, 1132],
  }),
  makeStrip({
    sourceName: 'sunsteel-edge-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'sunsteel-edge-4f-64.png',
    frameCount: 4,
    frameSize: 64,
    frameBoundaries: [365, 708, 1130],
  }),
  makeStrip({
    sourceName: 'watchfire-crest-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'watchfire-crest-4f-64.png',
    frameCount: 4,
    frameSize: 64,
    frameBoundaries: [430, 734, 1132],
  }),
  makeStrip({
    sourceName: 'captains-orders-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'captains-orders-4f-64.png',
    frameCount: 4,
    frameSize: 64,
    frameBoundaries: [360, 750, 1138],
  }),
  makeStrip({
    sourceName: 'storm-bomb-4f-transparent.png',
    outputDirectory: 'projectiles',
    outputName: 'storm-bomb-4f-64.png',
    frameCount: 4,
    frameSize: 64,
    frameBoundaries: [355, 735, 1130],
  }),
]);

await makeLocationButton();

console.log(`Processed Captain Gate assets into ${runtimeRoot}`);

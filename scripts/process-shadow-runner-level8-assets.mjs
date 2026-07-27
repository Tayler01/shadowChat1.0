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
  'level-8',
);
const runtimeRoot = path.join(
  repoRoot,
  'public',
  'games',
  'shadow-runner',
  'level-assets',
  'level-8',
);
const locationButtonMaskPath = path.join(
  sourceRoot,
  'level-8-location-button-mask.webp',
);
const locationButtonOutputPath = path.join(
  repoRoot,
  'public',
  'games',
  'shadow-runner',
  'home-assets',
  'optimized',
  'map-location-buttons',
  'level-8-courier-catacombs-location-button-v2.webp',
);

const ensureRuntimeDirectories = async () => {
  await Promise.all(
    ['background', 'collectibles', 'enemies', 'props', 'ui'].map((directory) =>
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
  sourceBottom,
}) => {
  const sourcePath = path.join(sourceRoot, sourceName);
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height || metadata.width % frameCount !== 0) {
    throw new Error(`${sourceName} does not divide into ${frameCount} equal frames.`);
  }

  const sourceFrameWidth = metadata.width / frameCount;
  const sourceFrameHeight = Math.min(sourceBottom ?? metadata.height, metadata.height);
  const frames = [];
  const bounds = [];

  for (let index = 0; index < frameCount; index += 1) {
    const frame = await sharp(sourcePath)
      .extract({
        left: index * sourceFrameWidth,
        top: 0,
        width: sourceFrameWidth,
        height: sourceFrameHeight,
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
  const renderedWidth = Math.max(1, Math.round(unionWidth * scale));
  const renderedHeight = Math.max(1, Math.round(unionHeight * scale));

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
        Math.round((frameSize - (renderedMetadata.width ?? renderedWidth)) / 2),
      top: frameSize - gutter - (renderedMetadata.height ?? renderedHeight),
    });
  }

  const outputPath = path.join(runtimeRoot, outputDirectory, outputName);
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
    .toFile(outputPath);
};

const makeLocationButton = async () => {
  const size = 256;
  const generatedSourcePath = path.join(
    sourceRoot,
    'level-8-courier-catacombs-location-button-source.png',
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

  for (let pixel = 0; pixel < size * size; pixel += 1) {
    generated[pixel * 4 + 3] = existingMask[pixel];
  }

  const output = await sharp(generated, {
    raw: { width: size, height: size, channels: 4 },
  })
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toBuffer();
  await fs.writeFile(locationButtonOutputPath, output);
};

await ensureRuntimeDirectories();

const backgroundSource = path.join(sourceRoot, 'courier-catacombs-background-source.png');
const backgroundOutput = path.join(
  runtimeRoot,
  'background',
  'courier-catacombs-background.webp',
);

await sharp(backgroundSource)
  .resize(1920, 1080, { fit: 'cover', position: 'centre' })
  .webp({ quality: 88, effort: 6 })
  .toFile(backgroundOutput);

await Promise.all([
  sharp(backgroundOutput)
    .resize(320, 180, { fit: 'cover', position: 'centre' })
    .webp({ quality: 90, effort: 6 })
    .toFile(path.join(runtimeRoot, 'ui', 'courier-catacombs-thumbnail-320x180.webp')),
  sharp(backgroundOutput)
    .resize(160, 90, { fit: 'cover', position: 'centre' })
    .webp({ quality: 88, effort: 6 })
    .toFile(path.join(runtimeRoot, 'ui', 'courier-catacombs-thumbnail-160x90.webp')),
  sharp(path.join(sourceRoot, 'courier-catacombs-terrain-props-v1-transparent.png'))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(
      path.join(runtimeRoot, 'props', 'courier-catacombs-terrain-props-v1-transparent.png'),
    ),
]);

await Promise.all([
  makeStrip({
    sourceName: 'tomb-lurker-v1-6f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'tomb-lurker-v1-6f-128.png',
    frameCount: 6,
    frameSize: 128,
  }),
  makeStrip({
    sourceName: 'crypt-warden-v1-6f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'crypt-warden-v1-6f-128.png',
    frameCount: 6,
    frameSize: 128,
  }),
  makeStrip({
    sourceName: 'rival-courier-v1-6f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'rival-courier-v1-6f-128.png',
    frameCount: 6,
    frameSize: 128,
  }),
  makeStrip({
    sourceName: 'wraithlight-lantern-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'wraithlight-lantern-4f-64.png',
    frameCount: 4,
    frameSize: 64,
  }),
  makeStrip({
    sourceName: 'mirror-ward-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'mirror-ward-4f-64.png',
    frameCount: 4,
    frameSize: 64,
    sourceBottom: 600,
  }),
  makeStrip({
    sourceName: 'relay-seal-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'relay-seal-4f-64.png',
    frameCount: 4,
    frameSize: 64,
  }),
  makeStrip({
    sourceName: 'courier-cache-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'courier-cache-4f-64.png',
    frameCount: 4,
    frameSize: 64,
  }),
]);

await makeLocationButton();

console.log(`Processed Courier Catacombs assets into ${runtimeRoot}`);

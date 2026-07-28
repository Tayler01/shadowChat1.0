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
  'level-10',
);
const runtimeRoot = path.join(
  repoRoot,
  'public',
  'games',
  'shadow-runner',
  'level-assets',
  'level-10',
);
const legacyLocationButtonPath = path.join(
  repoRoot,
  'public',
  'games',
  'shadow-runner',
  'home-assets',
  'optimized',
  'map-location-buttons',
  'level-10-dawn-relay-spire-location-button.webp',
);
const locationButtonOutputPath = path.join(
  repoRoot,
  'public',
  'games',
  'shadow-runner',
  'home-assets',
  'optimized',
  'map-location-buttons',
  'level-10-dawn-relay-spire-location-button-v2.webp',
);

const ensureRuntimeDirectories = async () => {
  await Promise.all(
    [
      'background',
      'cinematics',
      'collectibles',
      'enemies',
      'projectiles',
      'props',
      'ui',
    ].map(directory => fs.mkdir(path.join(runtimeRoot, directory), { recursive: true })),
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
    throw new Error('A generated Level 10 animation frame is empty.');
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
};

const makeGridStrip = async ({
  sourceName,
  outputDirectory,
  outputName,
  columns,
  rows,
  frameSize,
  frameCount = columns * rows,
}) => {
  const sourcePath = path.join(sourceRoot, sourceName);
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`${sourceName} has invalid source dimensions.`);
  }

  const frames = [];
  const bounds = [];

  for (let index = 0; index < frameCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = Math.round((metadata.width * column) / columns);
    const right = Math.round((metadata.width * (column + 1)) / columns);
    const top = Math.round((metadata.height * row) / rows);
    const bottom = Math.round((metadata.height * (row + 1)) / rows);
    const frame = await sharp(sourcePath)
      .extract({
        left,
        top,
        width: right - left,
        height: bottom - top,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push(frame);
    bounds.push(alphaBounds(frame));
  }

  const unionWidth = Math.max(...bounds.map(bound => bound.width));
  const unionHeight = Math.max(...bounds.map(bound => bound.height));
  const gutter = frameSize >= 192 ? 7 : frameSize >= 128 ? 5 : 3;
  const scale = Math.min(
    (frameSize - gutter * 2) / unionWidth,
    (frameSize - gutter * 2) / unionHeight,
  );

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

const makeLocationButton = async (backgroundOutput) => {
  const size = 256;
  const circle = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      '<circle cx="128" cy="102" r="67" fill="white"/>' +
    '</svg>',
  );
  const medallionCircle = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      '<circle cx="65" cy="76" r="33" fill="white"/>' +
    '</svg>',
  );

  const [interior, frame, medallion] = await Promise.all([
    sharp(backgroundOutput)
      .resize(size, size, { fit: 'cover', position: 'north' })
      .ensureAlpha()
      .composite([{ input: circle, blend: 'dest-in' }])
      .png()
      .toBuffer(),
    sharp(legacyLocationButtonPath)
      .resize(size, size, { fit: 'fill' })
      .ensureAlpha()
      .composite([{ input: circle, blend: 'dest-out' }])
      .png()
      .toBuffer(),
    sharp(legacyLocationButtonPath)
      .resize(size, size, { fit: 'fill' })
      .ensureAlpha()
      .composite([{ input: medallionCircle, blend: 'dest-in' }])
      .png()
      .toBuffer(),
  ]);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: interior }, { input: frame }, { input: medallion }])
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toFile(locationButtonOutputPath);
};

await ensureRuntimeDirectories();

const backgroundOutput = path.join(
  runtimeRoot,
  'background',
  'dawn-relay-spire-background.webp',
);
const endingOutput = path.join(
  runtimeRoot,
  'cinematics',
  'dawn-restored-ending.webp',
);

await Promise.all([
  sharp(path.join(sourceRoot, 'dawn-relay-spire-background-source.png'))
    .resize(1920, 1080, { fit: 'cover', position: 'centre' })
    .webp({ quality: 89, effort: 6 })
    .toFile(backgroundOutput),
  sharp(path.join(sourceRoot, 'dawn-restored-ending-source.png'))
    .resize(1920, 1080, { fit: 'cover', position: 'centre' })
    .webp({ quality: 91, effort: 6 })
    .toFile(endingOutput),
]);

await Promise.all([
  sharp(backgroundOutput)
    .resize(320, 180, { fit: 'cover', position: 'centre' })
    .webp({ quality: 91, effort: 6 })
    .toFile(path.join(runtimeRoot, 'ui', 'dawn-relay-spire-thumbnail-320x180.webp')),
  sharp(backgroundOutput)
    .resize(160, 90, { fit: 'cover', position: 'centre' })
    .webp({ quality: 89, effort: 6 })
    .toFile(path.join(runtimeRoot, 'ui', 'dawn-relay-spire-thumbnail-160x90.webp')),
  sharp(path.join(sourceRoot, 'dawn-relay-spire-terrain-machinery-v1-transparent.png'))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(runtimeRoot, 'props', 'dawn-relay-spire-terrain-machinery-v1-transparent.png')),
  makeGridStrip({
    sourceName: 'relay-lancer-v1-6f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'relay-lancer-v1-6f-128.png',
    columns: 6,
    rows: 1,
    frameSize: 128,
  }),
  makeGridStrip({
    sourceName: 'prism-caster-v1-6f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'prism-caster-v1-6f-128.png',
    columns: 6,
    rows: 1,
    frameSize: 128,
  }),
  makeGridStrip({
    sourceName: 'gearwing-drone-v1-6f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'gearwing-drone-v1-6f-128.png',
    columns: 6,
    rows: 1,
    frameSize: 128,
  }),
  makeGridStrip({
    sourceName: 'sentry-sovereign-v1-10f-transparent.png',
    outputDirectory: 'enemies',
    outputName: 'sentry-sovereign-v1-10f-192.png',
    columns: 5,
    rows: 2,
    frameSize: 192,
  }),
  makeGridStrip({
    sourceName: 'dawnfire-aegis-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'dawnfire-aegis-4f-64.png',
    columns: 4,
    rows: 1,
    frameSize: 64,
  }),
  makeGridStrip({
    sourceName: 'aether-step-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'aether-step-4f-64.png',
    columns: 4,
    rows: 1,
    frameSize: 64,
  }),
  makeGridStrip({
    sourceName: 'relay-flame-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'relay-flame-4f-64.png',
    columns: 4,
    rows: 1,
    frameSize: 64,
  }),
  makeGridStrip({
    sourceName: 'last-dispatch-4f-transparent.png',
    outputDirectory: 'collectibles',
    outputName: 'last-dispatch-4f-64.png',
    columns: 4,
    rows: 1,
    frameSize: 64,
  }),
  makeGridStrip({
    sourceName: 'relay-orb-4f-transparent.png',
    outputDirectory: 'projectiles',
    outputName: 'relay-orb-4f-64.png',
    columns: 4,
    rows: 1,
    frameSize: 64,
  }),
]);

await makeLocationButton(backgroundOutput);

console.log(`Processed Dawn Relay Spire assets into ${runtimeRoot}`);

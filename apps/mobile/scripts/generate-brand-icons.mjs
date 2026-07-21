import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const output = resolve(here, '../assets/images')
const sourceIcon = resolve(root, 'public/icons/icon-512.svg')

const adaptiveForeground = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="gold" x1="512" y1="264" x2="512" y2="738" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FFF0B8"/>
        <stop offset="0.42" stop-color="#D7AA46"/>
        <stop offset="1" stop-color="#8F6925"/>
      </linearGradient>
    </defs>
    <path d="M276 380C276 316 328 264 392 264H632C696 264 748 316 748 380V512C748 576 696 628 632 628H506L400 738V628C336 628 284 576 284 512L276 380Z" fill="url(#gold)"/>
    <circle cx="422" cy="446" r="28" fill="#17191C"/>
    <circle cx="512" cy="446" r="28" fill="#17191C"/>
    <circle cx="602" cy="446" r="28" fill="#17191C"/>
  </svg>
`)

const monochrome = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <path d="M276 380C276 316 328 264 392 264H632C696 264 748 316 748 380V512C748 576 696 628 632 628H506L400 738V628C336 628 284 576 284 512L276 380Z" fill="none" stroke="#FFFFFF" stroke-width="44" stroke-linejoin="round"/>
    <circle cx="422" cy="446" r="25" fill="#FFFFFF"/>
    <circle cx="512" cy="446" r="25" fill="#FFFFFF"/>
    <circle cx="602" cy="446" r="25" fill="#FFFFFF"/>
  </svg>
`)

mkdirSync(output, { recursive: true })

await sharp(sourceIcon)
  .resize(1024, 1024)
  .flatten({ background: '#050505' })
  .png()
  .toFile(resolve(output, 'icon.png'))

await sharp(adaptiveForeground)
  .png()
  .toFile(resolve(output, 'android-icon-foreground.png'))

await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: '#050505',
  },
})
  .png()
  .toFile(resolve(output, 'android-icon-background.png'))

await sharp(monochrome)
  .png()
  .toFile(resolve(output, 'android-icon-monochrome.png'))

await sharp(adaptiveForeground)
  .resize(512, 512)
  .png()
  .toFile(resolve(output, 'splash-icon.png'))

await sharp(sourceIcon)
  .resize(96, 96)
  .flatten({ background: '#050505' })
  .png()
  .toFile(resolve(output, 'favicon.png'))

console.log('Generated branded iOS, Android, splash, and notification icons.')

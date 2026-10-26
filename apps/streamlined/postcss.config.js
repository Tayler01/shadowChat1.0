import { fileURLToPath } from 'node:url'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import sharedConfig from '../../tailwind.config.js'

const repository = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')

export default {
  plugins: [
    tailwindcss({
      ...sharedConfig,
      // This edition includes its own screens; the full app does not pay for
      // their generated utilities. Shared component tokens remain identical.
      content: [`${repository}apps/streamlined/index.html`, `${repository}src/**/*.{js,ts,jsx,tsx}`],
    }),
    autoprefixer(),
  ],
}

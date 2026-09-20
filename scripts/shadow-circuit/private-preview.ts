import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

// Preview middleware only: never emitted into a build or served by production.
export function privateCircuitPreview(): Plugin {
  return {
    name: 'shadow-circuit-private-preview',
    configurePreviewServer(server) {
      if (process.env.SHADOW_CIRCUIT_PRIVATE_ORIGINAL !== 'true') return
      const bytes = readFileSync(resolve('tools/shadow-circuit/private-originals/CHIPS.DAT'))
      if (createHash('sha256').update(bytes).digest('hex') !== 'b0a68f21642447385512e0ed9386a4a13a4f7e9a38f909da772104d8e6b5c1fb') {
        throw new Error('The private original pack has changed; review its identity before previewing.')
      }
      server.middlewares.use((req, res, next) => {
        const music=req.url==='/__shadow-circuit-private/chip01.mid'||req.url==='/__shadow-circuit-private/chip02.mid'
        if (req.url !== '/__shadow-circuit-private/chips.dat'&&!music) return next()
        const address = req.socket.remoteAddress
        const host = req.headers.host ?? ''
        const origin = req.headers.origin
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '') ||
          !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host) ||
          (origin && origin !== `http://${host}`) ||
          !['GET', 'HEAD'].includes(req.method ?? '')) {
          res.statusCode = 403; res.end(); return
        }
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        const body=music?readFileSync(resolve('tools/shadow-circuit/private-originals/game',req.url!.endsWith('chip01.mid')?'CHIP01.MID':'CHIP02.MID')):bytes
        res.end(req.method === 'HEAD' ? undefined : body)
      })
    },
  }
}

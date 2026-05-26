import { ArrowLeft, Film } from 'lucide-react'
import { motion } from 'framer-motion'

interface WillKirkScreenProps {
  onExit: () => void
}

export function WillKirkScreen({ onExit }: WillKirkScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#020202] text-white"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(215,170,70,0.1),transparent_36%),linear-gradient(180deg,rgba(6,5,4,0.94),#000)]" />
      <header className="relative z-10 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end border-b border-[#8a6328]/24 bg-black/72 px-3 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_12px_34px_rgba(0,0,0,0.58)]">
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            aria-label="Back to Entertainment"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d2b58a]/24 bg-black/32 text-[#e7c489] transition hover:border-[#e3b061]/55 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#8a6328]/55"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.24em] text-[#c89561]">Will &amp; Kirk</p>
            <p className="truncate text-sm font-black uppercase tracking-[0.12em] text-[#f1dbc0]">Grounded</p>
          </div>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d2b58a]/20 bg-black/28 text-[#c89561]">
            <Film className="h-5 w-5" />
          </span>
        </div>
      </header>
      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <h1 className="text-4xl font-black uppercase tracking-[0.14em] text-[#f1dbc0] sm:text-5xl">
          Coming soon!
        </h1>
      </main>
    </motion.div>
  )
}

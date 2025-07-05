import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useConnectivity } from '../../hooks/useConnectivity'

export const ConnectivityBanner: React.FC = () => {
  const { offline } = useConnectivity()
  
  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: 20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: -20, x: 20 }}
          className="fixed top-4 right-4 z-50 bg-red-500 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 max-w-xs"
        >
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span>Connectivity issue. Reconnecting...</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

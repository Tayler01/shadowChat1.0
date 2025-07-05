import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ClientResetStatus } from '../../hooks/useClientResetStatus'

interface ClientResetIndicatorProps {
  status: ClientResetStatus
}

export const ClientResetIndicator: React.FC<ClientResetIndicatorProps> = ({ 
  status
}) => {
  if (status === 'idle') return null

  const getStatusConfig = () => {
    switch (status) {
      case 'resetting':
        return {
          color: 'bg-red-500',
          animate: true
        }
      case 'success':
        return {
          color: 'bg-green-500',
          animate: false
        }
      case 'error':
        return {
          color: 'bg-orange-500',
          animate: false
        }
      default:
        return {
          color: 'bg-gray-500',
          animate: false
        }
    }
  }

  const config = getStatusConfig()

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="ml-2"
      >
        <motion.div
          className={`w-2 h-2 rounded-full ${config.color}`}
          animate={config.animate ? { 
            scale: [1, 1.3, 1],
            opacity: [1, 0.6, 1]
          } : {}}
          transition={config.animate ? {
            duration: 1,
            repeat: Infinity,
            ease: "easeInOut"
          } : {}}
        />
      </motion.div>
    </AnimatePresence>
  )
}

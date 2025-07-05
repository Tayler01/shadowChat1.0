import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ClientResetStatus } from '../../hooks/useClientResetStatus'

interface ClientResetIndicatorProps {
  status: ClientResetStatus
}

export const ClientResetIndicator: React.FC<ClientResetIndicatorProps> = ({ 
  status
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'resetting':
        return {
          color: 'bg-red-500',
          animate: true
        }
      case 'error':
        return {
          color: 'bg-orange-500',
          animate: false
        }
      case 'success':
      case 'idle':
      default:
        return {
          color: 'bg-green-500',
          animate: false
        }
    }
  }

  const config = getStatusConfig()

  return (
    <div className="ml-2">
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
    </div>
  )
}

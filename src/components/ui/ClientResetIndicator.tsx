import React from 'react'
import { motion } from 'framer-motion'
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
          color: 'bg-[var(--state-warning)]',
          animate: true
        }
      case 'error':
        return {
          color: 'bg-[var(--state-danger)]',
          animate: false
        }
      case 'success':
      case 'idle':
      default:
        return {
          color: 'bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.55)]',
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

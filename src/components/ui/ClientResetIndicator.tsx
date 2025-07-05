import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import type { ClientResetStatus } from '../../hooks/useClientResetStatus'

interface ClientResetIndicatorProps {
  status: ClientResetStatus
  lastResetTime?: Date | null
}

export const ClientResetIndicator: React.FC<ClientResetIndicatorProps> = ({ 
  status, 
  lastResetTime 
}) => {
  if (status === 'idle') return null

  const getStatusConfig = () => {
    switch (status) {
      case 'resetting':
        return {
          color: 'bg-red-500',
          icon: RefreshCw,
          text: 'Resetting client...',
          animate: true
        }
      case 'success':
        return {
          color: 'bg-green-500',
          icon: CheckCircle,
          text: 'Client reset complete',
          animate: false
        }
      case 'error':
        return {
          color: 'bg-orange-500',
          icon: AlertCircle,
          text: 'Client reset timeout',
          animate: false
        }
      default:
        return {
          color: 'bg-gray-500',
          icon: RefreshCw,
          text: 'Unknown status',
          animate: false
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="flex items-center space-x-2"
      >
        <div className="relative">
          <motion.div
            className={`w-3 h-3 rounded-full ${config.color}`}
            animate={config.animate ? { 
              scale: [1, 1.2, 1],
              opacity: [1, 0.7, 1]
            } : {}}
            transition={config.animate ? {
              duration: 1,
              repeat: Infinity,
              ease: "easeInOut"
            } : {}}
          />
          {config.animate && (
            <motion.div
              className={`absolute inset-0 w-3 h-3 rounded-full ${config.color} opacity-30`}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 0, 0.3]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut"
              }}
            />
          )}
        </div>
        
        <div className="flex items-center space-x-1 text-xs text-gray-600 dark:text-gray-400">
          <Icon 
            className={`w-3 h-3 ${config.animate ? 'animate-spin' : ''}`}
          />
          <span>{config.text}</span>
          {lastResetTime && (
            <span className="text-gray-500">
              ({lastResetTime.toLocaleTimeString()})
            </span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

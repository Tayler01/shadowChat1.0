import React from 'react'
import { useConnectivity } from '../../hooks/useConnectivity'

export const ConnectivityBanner: React.FC = () => {
  const { offline } = useConnectivity()
  if (!offline) return null
  return (
    <div className="bg-red-500 text-white text-sm text-center py-1">
      Temporary connectivity issue. Reconnecting...
    </div>
  )
}

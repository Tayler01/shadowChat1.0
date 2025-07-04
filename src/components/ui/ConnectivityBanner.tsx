import React from 'react'
import { useConnectivity } from '../../hooks/useConnectivity'

export const ConnectivityBanner: React.FC = () => {
  const { offline } = useConnectivity()
  
  // Connectivity is now handled by the dot indicator in the header
  return null
}

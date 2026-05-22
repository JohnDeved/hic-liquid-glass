/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react'

export type GlassBackend = 'refractive' | 'webgl'

const GlassBackendContext = createContext<GlassBackend>('refractive')

export function GlassBackendProvider({
  value,
  children,
}: {
  value: GlassBackend
  children: ReactNode
}) {
  return <GlassBackendContext.Provider value={value}>{children}</GlassBackendContext.Provider>
}

export function useGlassBackend(): GlassBackend {
  return useContext(GlassBackendContext)
}

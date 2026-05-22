import { useEffect, useMemo, useState } from 'react'
import { ThemeContext, type Theme } from './themeContext'

function readInitial(): Theme {
  if (typeof globalThis === 'undefined') return 'dark'
  const stored = globalThis.localStorage?.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitial)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    globalThis.localStorage?.setItem('theme', theme)
  }, [theme])

  const value = useMemo(
    () => ({ theme, toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) }),
    [theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

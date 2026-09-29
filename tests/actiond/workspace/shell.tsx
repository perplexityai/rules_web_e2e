import React from 'react'

/** A consumer-owned shell can supply providers, layout, and fixture defaults. */
export function TestShell({children}: {children: React.ReactNode}) {
  return (
    <div lang="en" dir="ltr" style={{fontFamily: 'sans-serif'}}>
      {children}
    </div>
  )
}

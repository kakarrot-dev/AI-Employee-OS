import type { ReactNode } from 'react'
import { IconoirProvider } from 'iconoir-react'

export const CLIENT_ICON_CONTRACT = Object.freeze({
  library: 'iconoir-react',
  strokeWidth: 1.5
})

export function ClientIconSystem({ children }: { children: ReactNode }): React.JSX.Element {
  return <IconoirProvider iconProps={{ strokeWidth: CLIENT_ICON_CONTRACT.strokeWidth }}>{children}</IconoirProvider>
}

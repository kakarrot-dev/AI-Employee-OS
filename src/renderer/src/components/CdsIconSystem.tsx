import { Fragment, type ReactNode } from 'react'

export const CDS_ICON_CONTRACT = Object.freeze({ library: 'lucide-react', strokeWidth: 1.5 })

export function CdsIconSystem({ children }: { children: ReactNode }): React.JSX.Element {
  return <Fragment>{children}</Fragment>
}

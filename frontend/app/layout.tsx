import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Secure Chat - AES-256-GCM',
  description: 'End-to-end encrypted chat application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

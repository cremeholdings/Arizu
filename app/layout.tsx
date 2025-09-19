import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Arizu - Natural Language Automations",
  description: "Turn natural language requests into working automations",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "hsl(221.2 83.2% 53.3%)",
          colorBackground: "hsl(222.2 84% 4.9%)",
          colorInputBackground: "hsl(217.2 32.6% 17.5%)",
          colorInputText: "hsl(210 40% 98%)",
        },
      }}
    >
      <html lang="en">
        <body className={inter.className}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
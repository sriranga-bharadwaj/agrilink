import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { getSession, homeFor } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgriLink",
  description: "Quality-aware direct farm-to-business agricultural marketplace",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <header className="border-b border-stone-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold text-brand-700">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-sm text-white">A</span>
              AgriLink
            </Link>
            <div className="flex flex-1 items-center gap-4 text-sm text-stone-600">
              <Link href="/market" className="hover:text-stone-900">Marketplace</Link>
              {session && (
                <Link href={homeFor(session.role)} className="hover:text-stone-900">Dashboard</Link>
              )}
            </div>
            {session ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="hidden text-stone-600 sm:inline">
                  {session.name} · <span className="text-stone-400">{session.role.toLowerCase()}</span>
                </span>
                <form action={logout}>
                  <button className="btn-outline">Log out</button>
                </form>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Link href="/login" className="btn-outline">Log in</Link>
                <Link href="/signup" className="btn">Sign up</Link>
              </div>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

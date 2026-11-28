import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
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
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col font-sans antialiased`}>
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-brand-700">
              <Logo />
              <span className="hidden sm:inline">AgriLink</span>
            </Link>
            <NavLinks
              links={[
                { href: "/market", label: "Marketplace" },
                ...(session ? [{ href: homeFor(session.role), label: "Dashboard" }] : []),
              ]}
            />
            {session ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="hidden text-stone-600 md:inline">
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
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-stone-500">
            <span>
              Mandi prices: Agmarknet, Ministry of Agriculture &amp; Farmers Welfare, via{" "}
              <a className="underline hover:text-stone-700" href="https://data.gov.in/resource/variety-wise-daily-market-prices-data-commodity">data.gov.in</a>{" "}
              (Government Open Data License – India)
            </span>
            <a className="underline hover:text-stone-700" href="https://github.com/sriranga-bharadwaj/agrilink">Source on GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Header links with the current section highlighted.
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="flex flex-1 items-center gap-1 text-sm sm:gap-2">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2 py-1 ${active ? "bg-brand-50 font-medium text-brand-700" : "text-stone-600 hover:text-stone-900"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}

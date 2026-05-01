"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "ホーム" },
  { href: "/tree", label: "全体" },
  { href: "/person-tree", label: "中心" },
  { href: "/people", label: "人物" },
  { href: "/relations", label: "関係" },
  { href: "/invite", label: "招待" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-6">
        {items.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex flex-col items-center justify-center px-2 py-3 text-xs font-semibold",
                active ? "text-blue-400" : "text-neutral-400",
              ].join(" ")}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/person-tree", label: "家系図", icon: "🌳" },
  { href: "/ancestor-tree", label: "先祖", icon: "👴" },
  { href: "/people", label: "人登録", icon: "👤" },
  { href: "/relations", label: "関係登録", icon: "🔗" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-neutral-700 bg-neutral-900">
  <div className="flex justify-center gap-10 px-2 py-1">
    {items.map((item) => {
      const active = pathname === item.href;

      return (
        <Link
          key={item.href}
          href={item.href}
          className={`flex flex-col items-center justify-center text-[10px] ${
            active ? "text-blue-400" : "text-neutral-400"
          }`}
        >
          <div className="text-base leading-none">{item.icon}</div>
          <div className="leading-none whitespace-nowrap">{item.label}</div>
        </Link>
      );
    })}
  </div>
</nav>
  );
}
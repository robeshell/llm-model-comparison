import Link from "next/link";

const links = [
  { href: "/", label: "梯队榜", key: "tiers" },
  { href: "/models", label: "模型目录", key: "models" },
  { href: "/rankings", label: "模型评测", key: "rankings" },
  { href: "/popularity", label: "使用排行", key: "popularity" },
  { href: "/custom-ranking", label: "自定义榜单", key: "custom-ranking" },
] as const;

export function SiteHeader({
  active,
}: {
  active?: "tiers" | "models" | "prices" | "rankings" | "popularity" | "custom-ranking";
}) {
  return (
    <header className="site-header sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6">
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap text-[0.9375rem] font-medium tracking-tight text-foreground transition-opacity duration-200 hover:opacity-70"
        >
          <span className="hidden sm:inline">LLM 模型对比</span>
          <span className="sm:hidden">LLM</span>
        </Link>
        <nav className="site-nav flex min-w-0 items-center gap-0 overflow-x-auto sm:gap-1" aria-label="主导航">
          {links.map((link) => {
            const isActive = active === link.key;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  "inline-flex h-11 shrink-0 items-center whitespace-nowrap px-2 text-sm transition-colors duration-200 sm:px-3",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

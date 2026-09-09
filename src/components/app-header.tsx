"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  active?: "home" | "batch";
};

export function AppHeader({ active }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const current =
    active ?? (pathname.startsWith("/batches/") ? "batch" : pathname === "/" ? "home" : undefined);

  async function logout() {
    await fetch("/api/auth/login", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="min-w-0 space-y-0.5">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              AutoAce
            </p>
            <p className="truncate text-sm font-medium">Tone & noise evaluation</p>
          </Link>
          <Separator orientation="vertical" className="hidden h-8 sm:block" />
          <nav className="hidden items-center gap-1 sm:flex">
            <HeaderLink href="/" active={current === "home"}>
              Upload
            </HeaderLink>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href="/">New batch</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

function HeaderLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

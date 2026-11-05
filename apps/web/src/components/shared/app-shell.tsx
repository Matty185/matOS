"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  ScrollText,
  Settings,
  Home,
  TrendingUp,
  UserCog,
  Swords,
  Award,
  Megaphone,
  UserPlus,
  Footprints,
  Baby,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { GymSwitcher } from "@/components/shared/gym-switcher";
import type { GymMembership } from "@/lib/auth/current-member";
import { Logo } from "@/components/shared/logo";

type NavItem = { label: string; href: string; icon: LucideIcon };

// Defined here, not passed in as a prop from the server layouts: a Server
// Component can't hand a Client Component a prop containing function
// references (icon components), only serializable data — found via live
// testing ("Functions cannot be passed directly to Client Components...").
// The layouts pass plain, serializable `variant`/`isOwner` instead.
const COACH_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Members", href: "/members", icon: Users },
  { label: "Attendance", href: "/attendance", icon: CalendarCheck },
  { label: "Promotions", href: "/promotions", icon: Award },
  { label: "Classes", href: "/classes", icon: CalendarDays },
  { label: "Announcements", href: "/announcements", icon: Megaphone },
  { label: "Trials", href: "/trials", icon: UserPlus },
  { label: "Visitors", href: "/drop-ins", icon: Footprints },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Analysis", href: "/analysis", icon: Swords },
  { label: "Audit Log", href: "/audit-log", icon: ScrollText },
];

const OWNER_NAV_ITEM: NavItem = { label: "Settings", href: "/settings", icon: Settings };

const ATHLETE_NAV: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Check In", href: "/check-in", icon: CalendarCheck },
  { label: "Timetable", href: "/timetable", icon: CalendarDays },
  { label: "My Progress", href: "/progress", icon: TrendingUp },
  { label: "Analysis", href: "/analysis", icon: Swords },
  { label: "Account", href: "/account", icon: UserCog },
];

// Personal-workspace users (matos_mobile_plan.md §3.2: "Coach experience
// stays on web for v1" — mobile is the primary solo product; web stays
// minimal). No Home/Check-In/Attendance/Progress — none of those apply
// without a real gym to check into or a class schedule to attend.
// Flow audit 8.2: parent accounts (guardian role) — their children, and
// their own account. Athletes who are also parents get FAMILY_ITEM added.
const FAMILY_ITEM: NavItem = { label: "Family", href: "/family", icon: Baby };
const FAMILY_NAV: NavItem[] = [FAMILY_ITEM, { label: "Account", href: "/account", icon: UserCog }];

const SOLO_NAV: NavItem[] = [
  { label: "Analysis", href: "/analysis", icon: Swords },
  { label: "Account", href: "/account", icon: UserCog },
];

type AppShellProps = {
  variant: "coach" | "athlete" | "solo" | "family";
  /** A member (athlete or staff) who is also a linked parent: show Family. */
  hasFamily?: boolean;
  isOwner?: boolean;
  memberName: string;
  roleLabel: string;
  memberships?: GymMembership[];
  children: React.ReactNode;
};

/**
 * Shared responsive nav shell for both (coach) and (athlete) layouts —
 * persistent sidebar on desktop, slide-out drawer on mobile. Mobile-first
 * per CLAUDE.md UI Standards: works at 390px, no horizontal scroll, every
 * interactive target here is at least 44px.
 */
export function AppShell({
  variant,
  isOwner,
  memberName,
  roleLabel,
  memberships,
  hasFamily,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navItems =
    variant === "coach"
      ? [...COACH_NAV, ...(hasFamily ? [FAMILY_ITEM] : []), ...(isOwner ? [OWNER_NAV_ITEM] : [])]
      : variant === "solo"
        ? SOLO_NAV
        : variant === "family"
          ? FAMILY_NAV
          : hasFamily
            ? [...ATHLETE_NAV.slice(0, 1), FAMILY_ITEM, ...ATHLETE_NAV.slice(1)]
            : ATHLETE_NAV;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function NavLinks({ onDark = false }: { onDark?: boolean }) {
    return (
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
              onDark &&
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              isActive(item.href)
                ? onDark
                  ? "bg-white/10 text-white shadow-[inset_3px_0_0_hsl(var(--brand-blue))]"
                  : "bg-primary text-primary-foreground"
                : onDark
                  ? "text-white/80 hover:bg-white/10 hover:text-white"
                  : "text-foreground hover:bg-accent",
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  function MemberFooter({ onDark = false }: { onDark?: boolean }) {
    return (
      <div className={cn("mt-auto flex flex-col gap-2 border-t pt-4", onDark && "border-white/15")}>
        {memberships && memberships.length > 1 ? (
          <div className="px-3">
            <GymSwitcher
              memberships={memberships}
              triggerClassName={
                onDark
                  ? "border-white/30 text-white focus:ring-brand-blue focus:ring-offset-0 [&>svg]:text-white [&>svg]:opacity-100"
                  : undefined
              }
            />
          </div>
        ) : null}
        <div className="px-3">
          <p className="text-sm font-medium">{memberName}</p>
          <p className={cn("text-xs", onDark ? "text-white/70" : "text-muted-foreground")}>
            {roleLabel}
          </p>
        </div>
        <SignOutButton
          className={cn(
            "h-11 justify-start",
            onDark &&
              "text-white/80 hover:bg-white/10 hover:text-white focus-visible:ring-brand-blue focus-visible:ring-offset-0",
          )}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden bg-primary text-primary-foreground md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:flex-col md:overflow-y-auto md:p-4">
        <div className="mb-6 px-3 pt-1">
          <Logo tone="reversed" />
        </div>
        <NavLinks onDark />
        <MemberFooter onDark />
      </aside>

      <header className="flex items-center justify-between bg-primary px-4 py-2 md:hidden">
        <Logo tone="reversed" />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col">
            <SheetHeader>
              <SheetTitle>
                <Logo />
              </SheetTitle>
            </SheetHeader>
            <NavLinks />
            <MemberFooter />
          </SheetContent>
        </Sheet>
      </header>

      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

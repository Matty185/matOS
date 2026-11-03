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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { GymSwitcher } from "@/components/shared/gym-switcher";
import type { GymMembership } from "@/lib/auth/current-member";

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
  { label: "Payments", href: "/payments", icon: CreditCard },
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
const SOLO_NAV: NavItem[] = [
  { label: "Analysis", href: "/analysis", icon: Swords },
  { label: "Account", href: "/account", icon: UserCog },
];

type AppShellProps = {
  variant: "coach" | "athlete" | "solo";
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
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navItems =
    variant === "coach"
      ? isOwner
        ? [...COACH_NAV, OWNER_NAV_ITEM]
        : COACH_NAV
      : variant === "solo"
        ? SOLO_NAV
        : ATHLETE_NAV;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function NavLinks() {
    return (
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-primary text-primary-foreground"
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

  function MemberFooter() {
    return (
      <div className="mt-auto flex flex-col gap-2 border-t pt-4">
        {memberships && memberships.length > 1 ? (
          <div className="px-3">
            <GymSwitcher memberships={memberships} />
          </div>
        ) : null}
        <div className="px-3">
          <p className="text-sm font-medium">{memberName}</p>
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
        </div>
        <SignOutButton className="h-11 justify-start" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:p-4">
        <p className="mb-6 px-2 font-heading text-2xl tracking-wide text-primary">MatOS</p>
        <NavLinks />
        <MemberFooter />
      </aside>

      <header className="flex items-center justify-between border-b p-4 md:hidden">
        <p className="font-heading text-2xl tracking-wide text-primary">MatOS</p>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col">
            <SheetHeader>
              <SheetTitle className="font-heading text-2xl tracking-wide text-primary">
                MatOS
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

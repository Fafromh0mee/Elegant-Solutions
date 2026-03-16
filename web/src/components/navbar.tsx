"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { Menu, X, LogOut, User, LayoutDashboard, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/permissions";

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            {/* <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--color-primary) text-white font-bold text-sm">
              ES
            </div> */}
            <span className="text-lg font-bold text-gray-900">
              Elegant Solutions
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/" active={isActive("/")}>
              หน้าหลัก
            </NavLink>
            <NavLink href="/#contact" active={false}>
              ติดต่อเรา
            </NavLink>

            {session?.user ? (
              <>
                {isAdminRole(session.user.role) ? (
                  <NavLink
                    href="/admin/dashboard"
                    active={pathname.startsWith("/admin")}
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </NavLink>
                ) : (
                  <NavLink href="/dashboard" active={isActive("/dashboard")}>
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </NavLink>
                )}
                <NavLink href="/profile" active={isActive("/profile")}>
                  <User className="h-4 w-4" />
                  โปรไฟล์
                </NavLink>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="btn-secondary ml-2 text-sm"
                >
                  <LogOut className="h-4 w-4" />
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn-secondary ml-2">
                  เข้าสู่ระบบ
                </Link>
                <Link href="/register" className="btn-primary ml-1">
                  สมัครสมาชิก
                </Link>
              </>
            )}
          </nav>

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden border-t py-4 space-y-2">
            <MobileLink href="/" onClick={() => setMobileOpen(false)}>
              หน้าหลัก
            </MobileLink>
            <MobileLink href="/#contact" onClick={() => setMobileOpen(false)}>
              ติดต่อเรา
            </MobileLink>
            {session?.user ? (
              <>
                {isAdminRole(session.user.role) ? (
                  <MobileLink
                    href="/admin/dashboard"
                    onClick={() => setMobileOpen(false)}
                  >
                    Admin Dashboard
                  </MobileLink>
                ) : (
                  <MobileLink
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                  >
                    Dashboard
                  </MobileLink>
                )}
                <MobileLink
                  href="/profile"
                  onClick={() => setMobileOpen(false)}
                >
                  โปรไฟล์
                </MobileLink>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    signOut({ callbackUrl: "/" });
                  }}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <div className="flex gap-2 px-4 pt-2">
                <Link
                  href="/login"
                  className="btn-secondary flex-1"
                  onClick={() => setMobileOpen(false)}
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  href="/register"
                  className="btn-primary flex-1"
                  onClick={() => setMobileOpen(false)}
                >
                  สมัครสมาชิก
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
        active
          ? "bg-(--color-primary-light) text-(--color-primary)"
          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
      )}
    >
      {children}
    </Link>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg"
    >
      {children}
    </Link>
  );
}

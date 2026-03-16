import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

const publicRoutes = ["/", "/login", "/register", "/pending-approval", "/maintenance"];
const authRoutes = ["/login", "/register"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const userRole = req.auth?.user?.role;
  const userStatus = req.auth?.user?.status;

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    // If logged in and trying to access auth pages, redirect
    if (isLoggedIn && authRoutes.includes(pathname)) {
      if (userRole && isAdminRole(userRole)) {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      }
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (isLoggedIn && pathname === "/pending-approval" && userStatus === "APPROVED") {
      if (userRole && isAdminRole(userRole)) {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      }
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  }

  // Allow gate routes (kiosk mode, no auth required)
  if (pathname.startsWith("/gate")) {
    return NextResponse.next();
  }

  // API routes - let them handle their own auth
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Not logged in → redirect to login
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Guests must be approved before using internal areas.
  if (userRole === "GUEST" && userStatus && userStatus !== "APPROVED") {
    return NextResponse.redirect(new URL("/pending-approval", req.url));
  }

  // Admin routes → ADMIN / SUPER_ADMIN
  if (pathname.startsWith("/admin") && (!userRole || !isAdminRole(userRole))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
  runtime: "nodejs",
};

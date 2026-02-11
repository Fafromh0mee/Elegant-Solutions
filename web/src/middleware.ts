import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const publicRoutes = ["/", "/login", "/register"];
const authRoutes = ["/login", "/register"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const userRole = req.auth?.user?.role;

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    // If logged in and trying to access auth pages, redirect
    if (isLoggedIn && authRoutes.includes(pathname)) {
      if (userRole === "ADMIN") {
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

  // Admin routes → only ADMIN role
  if (pathname.startsWith("/admin") && userRole !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
  runtime: "nodejs",
};

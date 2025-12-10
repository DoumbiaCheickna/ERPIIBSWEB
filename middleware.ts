// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/api", "/_next", "/public", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = req.cookies.get("session")?.value; // à poser au login
  const role = req.cookies.get("role")?.value as "admin" | "directeur" | "prof" | "etudiant" | undefined;
  const lastPath = req.cookies.get("lastPath")?.value;

  // Non connecté → page de login
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(url);
  }

  // Page d'accueil/racine → renvoyer où l'utilisateur était
  if (pathname === "/" || pathname === "/admin" || pathname === "/admin/pages/Home") {
    if (lastPath && lastPath !== pathname) {
      return NextResponse.redirect(new URL(lastPath, req.url));
    }
    // Sinon, fallback par rôle
    if (role === "admin") return NextResponse.redirect(new URL("/admin/pages/Home", req.url));
    if (role === "directeur") return NextResponse.redirect(new URL("/directeur-des-etudes", req.url));
    if (role === "prof") return NextResponse.redirect(new URL("/prof", req.url));
    if (role === "etudiant") return NextResponse.redirect(new URL("/etudiant", req.url));
  }

  // RBAC minimal (empêche les accès croisés)
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/403", req.url));
  }
  if (pathname.startsWith("/directeur-des-etudes") && !["directeur", "admin"].includes(role || "")) {
    return NextResponse.redirect(new URL("/403", req.url));
  }
  if (pathname.startsWith("/prof") && !["prof", "admin"].includes(role || "")) {
    return NextResponse.redirect(new URL("/403", req.url));
  }
  if (pathname.startsWith("/etudiant") && !["etudiant", "admin"].includes(role || "")) {
    return NextResponse.redirect(new URL("/403", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

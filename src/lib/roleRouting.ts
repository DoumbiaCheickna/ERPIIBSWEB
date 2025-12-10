// src/lib/roleRouting.ts
export function normalize(str: string) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function routeForRole(roleLabel: string): string {
  const n = normalize(roleLabel);

  const isDirector =
    n.includes("directeur des etudes") ||
    n.includes("directeur") ||
    n.includes("director");

  const isAssistantDirector =
    n.includes("assistant directeur des etudes") ||
    n.includes("assistant-directeur") ||
    n.includes("assistant director");

  if (isDirector || isAssistantDirector) return "/directeur-des-etudes";
  if (n === "admin" || n.includes("administrateur")) return "/admin/home";

  return "/admin/home";
}


export type RoleName = "Admin" | "Directeur des études" | "Professeur" | "Etudiant" | string;

export function isPathAllowedForRole(role: RoleName, path: string): boolean {
  const p = (path || "").toLowerCase();
  const r = (role || "").toLowerCase();

  if (r.includes("admin")) return true; // admin partout

  const isDirector = r.includes("directeur");
  const isAssistantDirector = r.includes("assistant") && r.includes("directeur");

  if (isDirector || isAssistantDirector) {
    return p.startsWith("/directeur-des-etudes") || p.startsWith("/admin/auth");
  }
  if (r.includes("prof")) {
    return p.startsWith("/prof") || p.startsWith("/admin/auth");
  }
  if (r.includes("etudiant")) {
    return p.startsWith("/etudiant") || p.startsWith("/admin/auth");
  }
  // par défaut: seulement l’auth
  return p.startsWith("/admin/auth");
}

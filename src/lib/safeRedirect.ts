// src/lib/safeRedirect.ts
import { isPathAllowedForRole, routeForRole } from './roleRouting';

/** Lit le lastPath propre à l’utilisateur et le re-valide par rôle */
export function getSafeLastPath(uid: string, roleLabel: string): string | null {
  try {
    const key = `lastPath::${uid}`;
    const lp = localStorage.getItem(key) || '';
    if (!lp) return null;
    return isPathAllowedForRole(roleLabel, lp) ? lp : null;
  } catch {
    return null;
  }
}

/** Choisit la page d’atterrissage: lastPath valide sinon route par rôle */
export function chooseLanding(uid: string, roleLabel: string): string {
  const lp = getSafeLastPath(uid, roleLabel);
  return lp || routeForRole(roleLabel);
}

//src/lib/permissions.ts
export type TabKey =
  | "Accueil"
  | "EmargementsEtudiants"
  | "EmargementsProfesseurs"
  | "Etudiants"
  | "Professeurs"
  | "Filières"
  | "Personnel"
  | "Evaluations"
  | "CahierDeTexte";

export const ALL_TABS: TabKey[] = [
  "Accueil","EmargementsEtudiants","EmargementsProfesseurs","Etudiants",
  "Professeurs","Filières","Personnel","Evaluations", "CahierDeTexte"
];

// Normalise le rôle depuis localStorage (ex: "Assistant Directeur des Etudes")
export const roleKey = (raw: string) =>
  (raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const DEFAULT_VISIBILITY: Partial<Record<TabKey, boolean>> = {}; // vide = tout visible

// Par défaut: Assistant = tout visible (même interface). Tu pourras passer à false quand tu voudras masquer.
const ASSISTANT_VISIBILITY: Partial<Record<TabKey, boolean>> = {
  // Exemple (plus tard) :
  // "Personnel": false,
  // "Evaluations": false,
};

export function visibleTabsForRole(rawRole: string): TabKey[] {
  const rk = roleKey(rawRole);
  let conf = DEFAULT_VISIBILITY;
  if (rk.includes("assistant") && rk.includes("directeur")) conf = ASSISTANT_VISIBILITY;

  return ALL_TABS.filter(tab => conf[tab] !== false);
}

// src/app/directeur-des-etudes/components/SecondaryMenu.tsx
"use client";

import React from "react";

type MainItem =
  | "Accueil"
  | "Emargements"
  | "Etudiants"
  | "Professeurs"
  | "Filières"
  | "Evaluations";

type Item = { key: string; label: string };

const DEFAULT_BY_MAIN: Partial<Record<MainItem, Item[]>> = {
  Accueil: [
    { key: "stats", label: "Statistiques" },
    { key: "rapports", label: "Rapports" },
  ],
  Etudiants: [
    { key: "liste", label: "Liste" },
    { key: "import", label: "Import" },
  ],
  Emargements: [
    { key: "liste", label: "Feuilles" },
    { key: "historique", label: "Historique" },
  ],
  Evaluations: [
    { key: "examens", label: "Examens" },
    { key: "notes", label: "Notes" },
  ],
  // "Professeurs" et "Filières" gérés ailleurs
};

export default function SecondaryMenu({
  active,
  items,
  onChange,
  layout = "vertical",
  selectedKey,
}: {
  /** Vue principale (optionnel si vous passez items) */
  active?: MainItem | string | null;
  /** Liste d’items explicite (ex: pour la page Classe) */
  items?: Item[];
  /** Item actuellement sélectionné (ex: "matieres") */
  selectedKey?: string;
  /** Callback au clic */
  onChange?: (key: string) => void;
  /** Disposition: "vertical" (par défaut) ou "horizontal" */
  layout?: "vertical" | "horizontal";
}) {
  const list: Item[] =
    items ??
    (active && DEFAULT_BY_MAIN[active as MainItem]
      ? DEFAULT_BY_MAIN[active as MainItem]!
      : []);

  if (!list.length) return null;

  if (layout === "horizontal") {
    // Barre horizontale (nav pills)
    return (
      <nav className="border-bottom mb-2">
        <ul className="nav nav-pills gap-2 py-2 flex-row">
          {list.map((it) => {
            const isActive = selectedKey === it.key;
            return (
              <li key={it.key} className="nav-item">
                <button
                  className={`btn ${isActive ? "btn-primary" : "btn-light"}`}
                  onClick={() => onChange?.(it.key)}
                >
                  {it.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  // Menu vertical (par défaut)
  return (
    <aside className="border-end pe-3 me-3" style={{ width: 260, minWidth: 260 }}>
      <ul className="nav flex-column gap-1 py-3">
        {list.map((it) => {
          const isActive = selectedKey === it.key;
          return (
            <li key={it.key}>
              <button
                className={`btn w-100 text-start ${isActive ? "btn-primary" : "btn-light"}`}
                onClick={() => onChange?.(it.key)}
              >
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

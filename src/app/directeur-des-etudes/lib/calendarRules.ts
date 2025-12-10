// src/app/directeur-des-etudes/lib/calendarRules.ts
export type TClosureRule = {
  id: string;
  scope: "global" | "filiere" | "classe" | "matiere";
  filiere_id?: string;
  class_id?: string;
  matiere_id?: string;
  start: Date;
  end: Date;
  start_time?: string; // "HH:MM" optionnel
  end_time?: string;   // "HH:MM"
  label?: string;
};

// src/app/directeur-des-etudes/lib/calendarRules.ts
export type TSessionOverride =
  | {
      id: string;
      type: "cancel";
      class_id: string;
      matiere_id: string;
      date: Date;
      start: string;
      end: string;
      reason?: string;
    }
  | {
      id: string;
      type: "reschedule";
      class_id: string;
      matiere_id: string;
      date: Date;        // original
      start: string;     // original
      end: string;       // original
      new_date: Date;
      new_start: string;
      new_end: string;
      reason?: string;
    }
  | {
      id: string;
      type: "makeup";    // ✅ NOUVEAU : séance ponctuelle “rattrapage”
      class_id: string;
      matiere_id: string;
      date: Date;        // date du rattrapage
      start: string;
      end: string;
      salle?: string;
      enseignant?: string;
      matiere_libelle?: string;
      reason?: string;
    };


export const TIMEZONE = "Africa/Dakar"; // Dakar = UTC+0 (pas de DST)

// --- Jours fériés fixes (Sénégal) : même date chaque année ---
type FixedHoliday = { month: number; day: number; label: string };
export const FIXED_HOLIDAYS_SN: FixedHoliday[] = [
  { month: 1, day: 1, label: "Jour de l’An" },
  { month: 5, day: 1, label: "Fête du Travail" },
  { month: 4, day: 4, label: "Indépendance" },
  { month: 8, day: 15, label: "Assomption" },
  { month: 11, day: 1, label: "Toussaint" },
  { month: 12, day: 25, label: "Noël" },
  { month: 12, day: 31, label: "Fin d’année" },
];

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay   = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const parseHHMMtoMinutes = (s?: string) => {
  if (!s) return 0;
  const [h, m] = s.split(":").map((x) => parseInt(x || "0", 10));
  return (h || 0) * 60 + (m || 0);
};

export const rangesIntersect = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart <= bEnd && bStart <= aEnd;

// Crée la liste de fériés fixes entre deux dates (année scolaire croisant 2 années civiles)
export function fixedHolidaysInRange(rangeStart: Date, rangeEnd: Date) {
  const set: { date: Date; label: string }[] = [];
  for (let y = rangeStart.getFullYear(); y <= rangeEnd.getFullYear(); y++) {
    for (const h of FIXED_HOLIDAYS_SN) {
      const d = new Date(y, h.month - 1, h.day);
      if (d >= startOfDay(rangeStart) && d <= endOfDay(rangeEnd)) {
        set.push({ date: d, label: h.label });
      }
    }
  }
  return set;
}

export function isFixedHoliday(d: Date, yearStart?: Date, yearEnd?: Date) {
  const list = fixedHolidaysInRange(yearStart ?? d, yearEnd ?? d);
  return list.find((x) => toISODate(x.date) === toISODate(d))?.label || null;
}

// Applique overrides + fermetures + férié pour déterminer si une séance est neutralisée.
// Retourne { neutralized: boolean, reason?: string, replaced?: {date, start, end} }
export function evaluateNeutralization({
  date,             // Date (début de la journée)
  class_id,
  matiere_id,
  start,            // "HH:MM"
  end,              // "HH:MM"
  closures,
  overrides,
  yearStart,
  yearEnd,
}: {
  date: Date;
  class_id: string;
  matiere_id: string;
  start: string;
  end: string;
  closures: TClosureRule[];
  overrides: TSessionOverride[];
  yearStart?: Date;
  yearEnd?: Date;
}): { neutralized: boolean; reason?: string; replaced?: { date: Date; start: string; end: string } } {
  // 1) Overrides par séance
  const ov = overrides.find(
    (o) =>
      o.class_id === class_id &&
      o.matiere_id === matiere_id &&
      toISODate(o.date) === toISODate(date) &&
      o.start === start &&
      o.end === end
  );
  if (ov) {
    if (ov.type === "cancel") {
      return { neutralized: true, reason: ov.reason || "Annulé (prof absent)" };
    }
    if (ov.type === "reschedule" && ov.new_date && ov.new_start && ov.new_end) {
      // Cette occurrence est neutralisée ici (car déplacée ailleurs)
      return {
        neutralized: true,
        reason: "Déplacé",
        replaced: { date: ov.new_date, start: ov.new_start, end: ov.new_end },
      };
    }
  }

  // 2) Fermetures (global/filière/classe/matière)
  for (const c of closures) {
    // portées : la “classe” couvre implicitement la matière
    const scopeMatch =
      c.scope === "global" ||
      (c.scope === "classe" && c.class_id === class_id) ||
      (c.scope === "matiere" && c.matiere_id === matiere_id);
    if (!scopeMatch) continue;

    // intersection de date (jour)
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    if (!rangesIntersect(dayStart, dayEnd, c.start, c.end)) continue;

    // si pas d'horaires dans la fermeture -> journée entière
    if (!c.start_time || !c.end_time) {
      return { neutralized: true, reason: c.label || "Fermeture" };
    }

    // sinon, vérifier chevauchement des créneaux
    const s1 = parseHHMMtoMinutes(start);
    const e1 = parseHHMMtoMinutes(end);
    const s2 = parseHHMMtoMinutes(c.start_time);
    const e2 = parseHHMMtoMinutes(c.end_time);
    const overlap = s1 < e2 && s2 < e1;
    if (overlap) {
      return { neutralized: true, reason: c.label || "Fermeture (créneau)" };
    }
  }

  // 3) Férié
  const feast = isFixedHoliday(date, yearStart, yearEnd);
  if (feast) return { neutralized: true, reason: `Férié (${feast})` };

  return { neutralized: false };
}

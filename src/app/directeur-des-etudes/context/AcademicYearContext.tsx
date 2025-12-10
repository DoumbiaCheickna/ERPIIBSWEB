//src/app/directeur-des-etudes/context/AcademicYearContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, orderBy, query, doc, getDoc, setDoc, Timestamp,
} from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

export type TAcademicYear = {
  id: string;
  label: string;
  date_debut?: string;   // "YYYY-MM-DD" pour l’UI
  date_fin?: string;     // "YYYY-MM-DD" pour l’UI
  timezone?: string;     // ex: "Africa/Dakar"
  active?: boolean;
};

type CreateYearInput = {
  label: string;
  date_debut: string;       // "YYYY-MM-DD"
  date_fin: string;         // "YYYY-MM-DD"
  timezone?: string;        // défaut: "Africa/Dakar"
  active?: boolean;         // défaut: false
};

type UpdateYearInput = Partial<Omit<CreateYearInput, 'label'>>;

type Ctx = {
  years: TAcademicYear[];
  selected: TAcademicYear | null;
  setSelected: (y: TAcademicYear | null) => void;
  setSelectedById: (id: string) => void;
  createYear: (input: CreateYearInput) => Promise<void>;
  updateYear: (id: string, patch: UpdateYearInput) => Promise<void>;
  loading: boolean;
  reload: () => Promise<void>;
};

const AcademicYearContext = createContext<Ctx>({
  years: [],
  selected: null,
  setSelected: () => {},
  setSelectedById: () => {},
  createYear: async () => {},
  updateYear: async () => {},
  loading: true,
  reload: async () => {},
});

const YEAR_RE = /^\d{4}-\d{4}$/;
const sanitize = (s: string) => s.replace(/[<>]/g, '').trim();

const toYMD = (d?: Date | null) => {
  if (!d) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const fromYMD = (s: string) => {
  // stocké en Timestamp Firestore (date pure, 00:00 local)
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
};

export function AcademicYearProvider({ children }: { children: React.ReactNode }) {
  const [years, setYears] = useState<TAcademicYear[]>([]);
  const [selected, setSelectedState] = useState<TAcademicYear | null>(null);
  const [loading, setLoading] = useState(true);

  const setSelectedAndPersist = (y: TAcademicYear | null) => {
    setSelectedState(y);
    if (typeof window !== 'undefined') {
      if (y) localStorage.setItem('academicYearId', y.id);
      else localStorage.removeItem('academicYearId');
    }
  };

  const reload = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'annees_scolaires'), orderBy('label', 'desc')));
      const list: TAcademicYear[] = [];
      snap.forEach(d => {
        const v = d.data() as any;
        const dd = v?.date_debut?.toDate?.() ? v.date_debut.toDate() as Date : undefined;
        const df = v?.date_fin?.toDate?.() ? v.date_fin.toDate() as Date : undefined;
        list.push({
          id: d.id,
          label: String(v.label || d.id),
          date_debut: toYMD(dd),
          date_fin: toYMD(df),
          timezone: v.timezone || 'Africa/Dakar',
          active: !!v.active,
        });
      });

      const base = list.length ? list : [{ id: '2024-2025', label: '2024-2025' }];
      setYears(base);

      const ls = typeof window !== 'undefined' ? localStorage.getItem('academicYearId') : null;
      const fromLS = ls ? base.find(y => y.id === ls) || null : null;
      setSelectedAndPersist(fromLS ?? base[0] ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const setSelected = (y: TAcademicYear | null) => setSelectedAndPersist(y);
  const setSelectedById = (id: string) => {
    const y = years.find(y => y.id === id) || null;
    setSelectedAndPersist(y);
  };

  const createYear = async (input: CreateYearInput) => {
    const label = sanitize(input.label);
    if (!label) throw new Error("Saisissez un libellé (ex: 2025-2026).");
    if (!YEAR_RE.test(label)) throw new Error("Format invalide. Utilisez YYYY-YYYY (ex: 2025-2026).");

    const [y1s, y2s] = label.split('-');
    const y1 = Number(y1s), y2 = Number(y2s);
    if (y2 !== y1 + 1) throw new Error("L'année de droite doit être égale à l'année de gauche + 1.");

    if (!input.date_debut || !input.date_fin) throw new Error("Renseignez début et fin d'année.");
    const start = fromYMD(input.date_debut);
    const end = fromYMD(input.date_fin);
    if (end < start) throw new Error("La date de fin doit être postérieure à la date de début.");

    const ref = doc(db, 'annees_scolaires', label);
    const exists = await getDoc(ref);
    if (exists.exists()) throw new Error('Cette année académique existe déjà.');

    await setDoc(ref, {
      label,
      date_debut: Timestamp.fromDate(start),
      date_fin: Timestamp.fromDate(end),
      timezone: input.timezone || 'Africa/Dakar',
      active: !!input.active,
      created_at: Date.now(),
    });

    setYears(prev => {
      const map = new Map(prev.map(y => [y.id, y]));
      map.set(label, {
        id: label,
        label,
        date_debut: toYMD(start),
        date_fin: toYMD(end),
        timezone: input.timezone || 'Africa/Dakar',
        active: !!input.active,
      });
      const next = Array.from(map.values()).sort((a, b) => b.label.localeCompare(a.label));
      return next;
    });
    setSelectedAndPersist({
      id: label,
      label,
      date_debut: toYMD(start),
      date_fin: toYMD(end),
      timezone: input.timezone || 'Africa/Dakar',
      active: !!input.active,
    });
  };

  const updateYear = async (id: string, patch: UpdateYearInput) => {
    const ref = doc(db, 'annees_scolaires', id);
    const payload: any = {};

    if (typeof patch.timezone === 'string') payload.timezone = patch.timezone;
    if (typeof patch.active === 'boolean') payload.active = patch.active;
    if (patch.date_debut) payload.date_debut = Timestamp.fromDate(fromYMD(patch.date_debut));
    if (patch.date_fin)   payload.date_fin   = Timestamp.fromDate(fromYMD(patch.date_fin));

    if (Object.keys(payload).length === 0) return;

    await setDoc(ref, payload, { merge: true });

    setYears(prev =>
      prev.map(y => y.id === id
        ? {
            ...y,
            ...('timezone' in payload ? { timezone: payload.timezone } : {}), // <= {} au lieu de null
            ...('active' in payload ? { active: payload.active } : {}),
            ...('date_debut' in payload ? { date_debut: patch.date_debut } : {}),
            ...('date_fin' in payload ? { date_fin: patch.date_fin } : {}),
          }
        : y
      )
    );

    setSelectedState(prev => {
      const next =
        prev && prev.id === id
          ? {
              ...prev,
              ...('timezone' in payload ? { timezone: payload.timezone } : {}),
              ...('active' in payload ? { active: payload.active } : {}),
              ...('date_debut' in payload ? { date_debut: patch.date_debut } : {}),
              ...('date_fin' in payload ? { date_fin: patch.date_fin } : {}),
            }
          : prev;

      // persistance locale (garde le même comportement que setSelectedAndPersist)
      if (typeof window !== 'undefined') {
        if (next) localStorage.setItem('academicYearId', next.id);
        else localStorage.removeItem('academicYearId');
      }
      return next;
    });

  };

  const value = useMemo(
    () => ({ years, selected, setSelected, setSelectedById, createYear, updateYear, loading, reload }),
    [years, selected, loading]
  );

  return <AcademicYearContext.Provider value={value}>{children}</AcademicYearContext.Provider>;
}

export function useAcademicYear() {
  return useContext(AcademicYearContext);
}

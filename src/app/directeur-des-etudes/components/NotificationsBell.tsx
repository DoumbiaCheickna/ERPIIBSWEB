//src/app/directeur-des-etudes/components/NotificationsBell.tsx
"use client";

import React from "react";
import {
  collection, query, where, onSnapshot,
  addDoc, getDocs, setDoc, doc, deleteDoc, limit,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import { useAcademicYear } from "../context/AcademicYearContext";
import ModalPortal from "./ModalPortal";

// ---- Types ----
type TSemestre = "S1"|"S2"|"S3"|"S4"|"S5"|"S6";
type NotificationDoc = {
  id?: string;
  type: "birthday" | "absence_alert" | "prof_emargement";
  title: string;
  body?: string;
  created_at: any; // Firestore Timestamp ou Date
  read: boolean;
  audience_role: "directeur";
  dedup_key: string;
  meta?: Record<string, any>;
};

type TUser = {
  id: string;
  role_key?: string;
  prenom?: string;
  nom?: string;
  birthdate?: any; // Timestamp ou string "YYYY-MM-DD"
  matricule?: string;
  classe_id?: string;
  academic_year_id?: string;
};

type SeanceDoc = {
  annee: string;
  class_id: string;
  semestre: TSemestre;
  date: any; // Timestamp
  start: string;
  end: string;
  matiere_id: string;
  matiere_libelle?: string;
  // absent arrays: "<matricule>": AbsenceEntry[]
};

// ---- Utils date ----
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function startOfWeek(d=new Date()) { // Lundi
  const x = new Date(d);
  const day = (x.getDay()+6)%7; // Lundi=0
  x.setDate(x.getDate()-day);
  x.setHours(0,0,0,0);
  return x;
}
function endOfWeek(d=new Date()) { // Dimanche 23:59
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate()+6);
  e.setHours(23,59,59,999);
  return e;
}
function weekKeyISO(d=new Date()) {
  // clé style "2025-W37"
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay()||7)); // jeudi de la semaine
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((tmp as any)-(yearStart as any))/86400000 + 1)/7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
}

// ---- Composant ----
export default function NotificationsBell() {
  const { selected } = useAcademicYear();
  const yearId = selected?.id || "";

  const [open, setOpen] = React.useState(false);
  const [loadingGen, setLoadingGen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationDoc[]>([]);
  const [unread, setUnread] = React.useState(0);
  const menuRef = React.useRef<HTMLDivElement|null>(null);

  // Garde-fous de génération (évite scans répétés la même session)
  const genInFlightRef = React.useRef(false);
  const lastBirthdayISORef = React.useRef<string | null>(null); // e.g. "2025-09-11"
  const lastAbsWeekRef = React.useRef<string | null>(null);     // e.g. "2025-W37"

  // Live subscribe sans index composite (pas d'orderBy serveur)
  React.useEffect(() => {
    const qy = query(
      collection(db, "notifications"),
      where("audience_role", "==", "directeur")
    );
    const unsub = onSnapshot(qy, snap => {
      const arr: NotificationDoc[] = [];
      snap.forEach(d => arr.push({ id: d.id, ...(d.data() as any) }));

      // Tri côté client sur created_at DESC
      arr.sort((a, b) => {
        const da = (a.created_at?.toDate?.() ?? a.created_at) as Date | undefined;
        const dbb = (b.created_at?.toDate?.() ?? b.created_at) as Date | undefined;
        return (dbb?.getTime?.() || 0) - (da?.getTime?.() || 0);
      });

      setItems(arr);
      setUnread(arr.filter(n => !n.read).length);
    });
    return () => unsub();
  }, []);

  // click outside
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // Génération (à l’ouverture du menu)
  const ensureTodayNotifications = async () => {
    // ouvre toujours instantanément, mais lance la génération en arrière-plan contrôlé
    setOpen(true);

    if (!yearId) return;
    if (genInFlightRef.current) return;

    const todayISO = toISODate(new Date());
    const wk = weekKeyISO(new Date());
    const needBirth = lastBirthdayISORef.current !== todayISO;
    const needAbs = lastAbsWeekRef.current !== wk;

    if (!needBirth && !needAbs) return;

    genInFlightRef.current = true;
    setLoadingGen(true);
    try {
      await Promise.all([
        needBirth ? generateBirthdayToday() : Promise.resolve(),
        needAbs ? generateAbsenceAlertsThisWeek(yearId) : Promise.resolve(),
      ]);
      if (needBirth) lastBirthdayISORef.current = todayISO;
      if (needAbs) lastAbsWeekRef.current = wk;
    } finally {
      setLoadingGen(false);
      genInFlightRef.current = false;
    }
  };

  // 2.1 Anniversaires du jour
  const generateBirthdayToday = async () => {
    const today = new Date();
    const mmdd = `-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

    const usersSnap = await getDocs(collection(db, "users"));
    const list: TUser[] = [];
    usersSnap.forEach(d => {
      const v = d.data() as any;
      const raw = v.birthdate || v.date_naissance || null;
      let iso: string|undefined;
      if (typeof raw === "string") iso = raw;
      else if (raw?.toDate) iso = toISODate(raw.toDate());
      if (iso && iso.endsWith(mmdd)) {
        list.push({ id: d.id, role_key: v.role_key, prenom: v.prenom, nom: v.nom });
      }
    });

    for (const u of list) {
      const who = `${u?.prenom||""} ${u?.nom||""}`.trim();
      const dedup_key = `birthday::${toISODate(today)}::${u.id}`;
      const exists = await getDocs(query(
        collection(db, "notifications"),
        where("dedup_key", "==", dedup_key),
        limit(1)
      ));
      if (!exists.empty) continue; // déjà créé

      await addDoc(collection(db, "notifications"), {
        type: "birthday",
        title: `🎂 Anniversaire — ${who || "Utilisateur"}`,
        body: `Souhaitez un joyeux anniversaire à ${who || "l’intéressé"} !`,
        created_at: new Date(),
        read: false,
        audience_role: "directeur",
        dedup_key,
        meta: { user_id: u.id },
      } as NotificationDoc);
    }
  };

  // 2.2 Absences: alerte si ≥ 8 cours d’affilée cette semaine
  const generateAbsenceAlertsThisWeek = async (yearId: string) => {
    const s = startOfWeek(new Date());
    const e = endOfWeek(new Date());
    const weekKey = weekKeyISO(new Date());

    // Pas d'index composite: on lit puis on filtre côté client
    const snap = await getDocs(collection(db, "emargements"));
    const docs: (SeanceDoc & Record<string, any>)[] = [];
    snap.forEach(d => {
      const v = d.data() as any;
      const dt: Date = v.date?.toDate?.() ?? v.date;
      if (!dt) return;
      if (dt >= s && dt <= e && String(v.annee) === yearId) {
        docs.push(v);
      }
    });

    type Seq = { date: Date; start: string; end: string; class_id: string; absent: boolean; };
    const byStudent = new Map<string, Seq[]>();

    // index rapide par créneau
    const index = new Map<string, Set<string>>();
    for (const d0 of docs) {
      const dt: Date = d0.date?.toDate?.() ?? d0.date;
      const key = `${d0.class_id}__${toISODate(dt)}__${d0.start}__${d0.end}`;
      const set = (index.get(key) ?? new Set<string>());
      for (const k of Object.keys(d0)) {
        if (Array.isArray((d0 as any)[k])) set.add(k);
      }
      index.set(key, set);
    }

    // séquences absents
    for (const d0 of docs) {
      const dt: Date = d0.date?.toDate?.() ?? d0.date;
      for (const k of Object.keys(d0)) {
        const val = (d0 as any)[k];
        if (Array.isArray(val)) {
          const arr = byStudent.get(k) ?? [];
          arr.push({ date: dt, start: d0.start, end: d0.end, class_id: d0.class_id, absent: true });
          byStudent.set(k, arr);
        }
      }
    }

    // calcul maxRun
    for (const [matricule, seq0] of byStudent.entries()) {
      const seq = seq0.slice().sort((a, b) =>
        (a.date.getTime() - b.date.getTime()) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end)
      );

      let maxRun = 0, run = 0, lastKey = "";
      for (const s1 of seq) {
        const key = `${s1.class_id}__${toISODate(s1.date)}__${s1.start}__${s1.end}`;
        const absSet = index.get(key);
        const isAbsent = absSet?.has(matricule) ?? false;
        if (!isAbsent) {
          run = 0;
        } else {
          if (lastKey !== key) run += 1;
          maxRun = Math.max(maxRun, run);
        }
        lastKey = key;
      }

      if (maxRun >= 8) {
        const dedup_key = `absence::${weekKey}::${matricule}`;
        const exists = await getDocs(query(
          collection(db, "notifications"),
          where("dedup_key", "==", dedup_key),
          limit(1)
        ));
        if (exists.empty) {
          await addDoc(collection(db, "notifications"), {
            type: "absence_alert",
            title: `🚩 Alerte absences — ${matricule}`,
            body: `Au moins ${maxRun} cours d’affilée manqués cette semaine.`,
            created_at: new Date(),
            read: false,
            audience_role: "directeur",
            dedup_key,
            meta: { matricule, semaine_iso: weekKey },
          } as NotificationDoc);
        }
      }
    }
  };

  // actions (optimistes)
  const markRead = async (id?: string) => {
    if (!id) return;
    // optimiste
    const prev = items;
    setItems(prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    setUnread(u => Math.max(0, u - 1));

    try {
      await setDoc(doc(db, "notifications", id), { read: true }, { merge: true });
    } catch (e) {
      // rollback si erreur
      setItems(prev);
      setUnread(prev.filter(n => !n.read).length);
    }
  };

  const removeOne = async (id?: string) => {
    if (!id) return;
    // optimiste
    const prev = items;
    const next = prev.filter(n => n.id !== id);
    setItems(next);
    setUnread(next.filter(n => !n.read).length);

    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (e) {
      // rollback si erreur
      setItems(prev);
      setUnread(prev.filter(n => !n.read).length);
    }
  };

  return (
    <div className="position-relative" ref={menuRef}>
      <button
        className="btn btn-icon position-relative"
        title="Notifications"
        onClick={ensureTodayNotifications}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <i className="bi bi-bell" />
        {unread > 0 && (
          <span className="notif-dot">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div
          className="dropdown-menu dropdown-menu-end show shadow"
          style={{ position: "absolute", right: 0, top: "100%", zIndex: 1060, minWidth: 360, maxWidth: 420 }}
          role="menu"
        >
          <div className="px-3 py-2 d-flex align-items-center justify-content-between">
            <div className="fw-semibold">Notifications</div>
            {loadingGen && <span className="spinner-border spinner-border-sm" />}
          </div>
          <div className="dropdown-divider" />

          {items.length === 0 ? (
            <div className="px-3 py-3 text-muted small">Aucune notification.</div>
          ) : (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {items.map(n => (
                <div key={n.id} className={`px-3 py-2 notif-item ${n.read ? "is-read": ""}`}>
                  <div className="d-flex align-items-start gap-2">
                    <div className="pt-1">
                      {n.type === "birthday" ? <i className="bi bi-gift" /> :
                      n.type === "absence_alert" ? <i className="bi bi-flag" /> :
                      <i className="bi bi-journal-check" /> /* prof_emargement */}
                    </div>
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{n.title}</div>
                      {n.body && <div className="small text-muted">{n.body}</div>}
                    </div>
                    <div className="d-flex gap-1">
                      {!n.read && (
                        <button className="btn btn-sm btn-outline-primary" onClick={() => markRead(n.id)} title="Marquer comme lu">
                          Lu
                        </button>
                      )}
                      <button className="btn btn-sm btn-outline-danger" onClick={() => removeOne(n.id)} title="Supprimer">
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .notif-dot{
          position:absolute;
          top:-4px; right:-2px;
          background:#dc3545; color:#fff;
          border-radius:9999px;
          font-size:.65rem; line-height:1;
          padding:.25rem .35rem;
          min-width:18px; text-align:center;
          border:2px solid #fff;
        }
        .notif-item{ border-bottom:1px solid #f1f3f6; }
        .notif-item:last-child{ border-bottom:0; }
        .notif-item.is-read{ opacity:.7; }

        /* 🔁 Réplique le style du bouton inline */
        :global(.btn-icon){
          background:#fff;
          border:1px solid #e6ebf3;
          border-radius:12px;
          padding:.5rem .65rem;
        }
        :global(.btn-icon:hover){
          background:#f3f6fb;
        }
      `}</style>
    </div>
  );
}

// src/app/directeur-des-etudes/components/HomeDashboard.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { auth, db } from '../../../../firebaseConfig';
import {
  collection, getDocs, getCountFromServer, query, where, limit, orderBy,
} from 'firebase/firestore';
import { useAcademicYear } from '../context/AcademicYearContext';
import Toast from '../../admin/components/ui/Toast';
import ModalPortal from "./ModalPortal";

const BRAND = "#029DFC";

/* ------------------------- Types utiles ------------------------- */
type TUser = {
  docId?: string;
  prenom?: string;
  nom?: string;
  role_libelle?: string;
  role_key?: string;
  academic_year_id?: string | null;   // ID d'année (préféré)
  annee_academique?: string | null;   // label "YYYY-YYYY" (legacy)
  date_naissance?: string;            // 'YYYY-MM-DD' ou 'DD/MM/YYYY'
  classe?: string;
  niveau_id?: 'L1'|'L2'|'L3'|'M1'|'M2'|string;
};

/* ------------------------- Helpers ------------------------- */
const STUDENT_ROLE_LABELS = ['Etudiant','Étudiant','Student'];
const STUDENT_ROLE_KEYS   = ['etudiant','étudiant','student'];
const PROF_ROLE_LABELS    = ['Professeur','Enseignant','Teacher'];
const PROF_ROLE_KEYS      = ['prof','enseignant','teacher'];

/** vrai si l’utilisateur appartient à l’année sélectionnée */
function userMatchesSelectedYear(u: TUser, yearId: string, yearLabel: string) {
  // priorité à l'id (recommended)
  if (u.academic_year_id && yearId && u.academic_year_id === yearId) return true;
  // compat par libellé (legacy)
  if (u.annee_academique && yearLabel && u.annee_academique === yearLabel) return true;
  return false;
}
/** test rapide “est étudiant” */
function isStudent(u: TUser) {
  const l = (u.role_libelle || '').toLowerCase();
  const k = (u.role_key || '').toLowerCase();
  return STUDENT_ROLE_LABELS.some(x=>l.includes(x.toLowerCase())) || STUDENT_ROLE_KEYS.includes(k);
}
/** test rapide “est prof” */
function isProf(u: TUser) {
  const l = (u.role_libelle || '').toLowerCase();
  const k = (u.role_key || '').toLowerCase();
  return PROF_ROLE_LABELS.some(x=>l.includes(x.toLowerCase())) || PROF_ROLE_KEYS.includes(k);
}

export default function HomeDashboard({
  onOpenEtudiants,
  onChangeMainTab,
}: {
  onOpenEtudiants?: () => void;
  onChangeMainTab?: (item: 'Etudiants'|'Professeurs'|'Filières') => void;
}) {
  const { years, selected, setSelectedById, createYear, updateYear, loading } = useAcademicYear();
  const selectedLabel = selected?.label || '';
  const selectedId    = selected?.id || '';

  /* ------------------------- UI Année ------------------------- */
  const [showNewYear, setShowNewYear] = React.useState(false);
  const [newYear, setNewYear] = React.useState('');
  const [newStart, setNewStart] = React.useState('');
  const [newEnd, setNewEnd] = React.useState('');
  const [newTz, setNewTz] = React.useState('Africa/Dakar');
  const [newActive, setNewActive] = React.useState(false);

  const [showEdit, setShowEdit] = React.useState(false);
  const [editStart, setEditStart] = React.useState('');
  const [editEnd, setEditEnd] = React.useState('');
  const [editTz, setEditTz] = React.useState('Africa/Dakar');
  const [editActive, setEditActive] = React.useState(false);

  const [toastMsg, setToastMsg] = React.useState('');
  const [okShow, setOkShow] = React.useState(false);
  const [errShow, setErrShow] = React.useState(false);
  const ok = (m: string) => { setToastMsg(m); setOkShow(true); };
  const ko = (m: string) => { setToastMsg(m); setErrShow(true); };

  const onOpenCreate = () => {
    setNewYear(''); setNewStart(''); setNewEnd(''); setNewTz('Africa/Dakar'); setNewActive(false);
    setShowNewYear(true);
  };
  const onCreateYear = async () => {
    try {
      await createYear({
        label: newYear,
        date_debut: newStart,
        date_fin: newEnd,
        timezone: newTz || 'Africa/Dakar',
        active: newActive,
      });
      setShowNewYear(false);
      ok('Année académique créée et sélectionnée.');
    } catch (e: any) {
      console.error(e); ko(e?.message || "Impossible de créer l'année académique.");
    }
  };
  const onOpenEdit = () => {
    if (!selected) return;
    setEditStart((selected as any).date_debut || '');
    setEditEnd((selected as any).date_fin || '');
    setEditTz((selected as any).timezone || 'Africa/Dakar');
    setEditActive(!!(selected as any).active);
    setShowEdit(true);
  };
  const onSaveEdit = async () => {
    if (!selected) return;
    try {
      await updateYear(selected.id, {
        date_debut: editStart,
        date_fin: editEnd,
        timezone: editTz || 'Africa/Dakar',
        active: editActive,
      });
      setShowEdit(false);
      ok('Année académique mise à jour.');
    } catch (e: any) {
      console.error(e); ko(e?.message || "Impossible de modifier l'année académique.");
    }
  };

  React.useEffect(() => {
    if (selected?.label) {
      try { localStorage.setItem('app.selectedAnnee', selected.label); } catch {}
    }
  }, [selected?.label]);

  /* ------------------------- Bienvenue {prenom} ------------------------- */
  const [prenom, setPrenom] = React.useState<string>('');
  React.useEffect(() => {
    (async () => {
      try {
        const login = typeof window !== 'undefined' ? localStorage.getItem('userLogin') : null;
        const email = auth.currentUser?.email || null;
        if (!login && !email) return;
        const q1 = login
          ? query(collection(db, 'users'), where('login', '==', login))
          : query(collection(db, 'users'), where('email', '==', email));
        const snap = await getDocs(q1);
        if (!snap.empty) {
          const d: any = snap.docs[0].data();
          setPrenom(d?.prenom || '');
        }
      } catch {/* ignore */ }
    })();
  }, []);

  /* ------------------------- Stats Firestore ------------------------- */
  const [loadingStats, setLoadingStats] = React.useState(false);
  const [nbEtudiants, setNbEtudiants] = React.useState<number>(0);
  const [nbProfs, setNbProfs] = React.useState<number>(0);
  const [nbFilieres, setNbFilieres] = React.useState<number>(0);
  const [nbClasses, setNbClasses] = React.useState<number>(0);

  // pour la répartition et les anniversaires
  const [students, setStudents] = React.useState<TUser[]>([]);

  type KpiKey = 'etudiants' | 'professeurs' | 'filieres' | 'classes';

  const openFromKpi = (key: 'etudiants'|'professeurs'|'filieres'|'classes') => {
    const tab: 'Etudiants'|'Professeurs'|'Filières' =
      key === 'etudiants'   ? 'Etudiants'   :
      key === 'professeurs' ? 'Professeurs' : 'Filières'; // 'filieres' et 'classes' => Filières

    if (tab === 'Etudiants' && onOpenEtudiants) {
      onOpenEtudiants();
      return;
    }

    if (onChangeMainTab) {
      onChangeMainTab(tab);
    } else {
      // 👇 Fallback : demander au navbar de changer d’onglet
      window.dispatchEvent(new CustomEvent('iibs:navigate-main-tab', { detail: tab }));
    }
  };

  const fetchCounts = React.useCallback(async () => {
    if (!selectedId && !selectedLabel) return;
    setLoadingStats(true);
    try {
      // --- Étudiants (dataset + count)
      // large échantillon, on filtre côté client par année (id ou label legacy)
      const stuSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('role_libelle', 'in', STUDENT_ROLE_LABELS), // <= 10 values ok
          limit(500)
        )
      );
      let stu = stuSnap.docs.map(d => ({ docId: d.id, ...(d.data() as any) })) as TUser[];

      // Ajoute un 2e lot basé sur role_key (au cas où role_libelle n'est pas uniforme)
      if (STUDENT_ROLE_KEYS.length) {
        const keySnap = await getDocs(
          query(
            collection(db, 'users'),
            where('role_key', 'in', STUDENT_ROLE_KEYS),
            limit(500)
          )
        );
        const more = keySnap.docs.map(d => ({ docId: d.id, ...(d.data() as any) })) as TUser[];
        // merge par docId
        const seen = new Set(stu.map(s=>s.docId));
        for (const x of more) if (!seen.has(x.docId)) stu.push(x);
      }

      stu = stu.filter(s => userMatchesSelectedYear(s, selectedId, selectedLabel));
      setStudents(stu);
      setNbEtudiants(stu.length);

      // --- Profs
      // --- Profs (UNION users ∪ affectations)
      const profByLabelSnap = await getDocs(
        query(collection(db, 'users'), where('role_libelle', 'in', PROF_ROLE_LABELS), limit(500))
      );
      let profs: TUser[] = profByLabelSnap.docs.map(d => ({ ...(d.data() as any), docId: d.id })) as any;

      if (PROF_ROLE_KEYS.length) {
        const profByKeySnap = await getDocs(
          query(collection(db, 'users'), where('role_key', 'in', PROF_ROLE_KEYS), limit(500))
        );
        const more = profByKeySnap.docs.map(d => ({ ...(d.data() as any), docId: d.id })) as any;
        const seen = new Set(profs.map(p => p.docId));
        for (const x of more) if (!seen.has(x.docId)) profs.push(x);
      }

      // 1) Profs qui appartiennent à l'année (via métadonnées sur users)
      profs = profs.filter(p => userMatchesSelectedYear(p, selectedId, selectedLabel));
      const profIds = new Set<string>(profs.map(p => p.docId!).filter(Boolean));

      // 2) + Profs présents dans les affectations de l’année (prennent/transférés)
      if (selectedId) {
        const affQ = query(collection(db, 'affectations_professeurs'), where('annee_id', '==', selectedId));
        const affSnap = await getDocs(affQ);
        affSnap.forEach(d => {
          const v: any = d.data();
          const fromField = v?.prof_doc_id ? String(v.prof_doc_id) : "";
          const fromKey   = d.id.includes("__") ? d.id.split("__")[1] : "";
          const pid = fromField || fromKey;
          if (pid) profIds.add(pid);
        });
      }

      // ⇒ nombre final cohérent avec ProfessorsPage (users ∪ affectations)
      setNbProfs(profIds.size);

      // --- Filières (compte serveur)
      let fCount = 0;
      try {
        // privilégie l'ID d'année s'il existe dans les docs
        const qId = query(collection(db, 'filieres'), where('academic_year_id','==', selectedId || '__none__'));
        fCount = (await getCountFromServer(qId)).data().count;
      } catch { /* peut ne pas exister */ }
      if (fCount === 0) {
        try {
          const qLbl = query(collection(db, 'filieres'), where('annee_academique','==', selectedLabel || '__none__'));
          fCount = (await getCountFromServer(qLbl)).data().count;
        } catch {}
      }
      setNbFilieres(fCount);

      // --- Classes (compte serveur)
      let clCount = 0;
      try {
        const qId = query(collection(db, 'classes'), where('academic_year_id','==', selectedId || '__none__'));
        clCount = (await getCountFromServer(qId)).data().count;
      } catch {}
      if (clCount === 0) {
        try {
          const qLbl = query(collection(db, 'classes'), where('annee_academique','==', selectedLabel || '__none__'));
          clCount = (await getCountFromServer(qLbl)).data().count;
        } catch {}
      }
      setNbClasses(clCount);
    } catch (e) {
      console.error(e);
      // on ne bloque pas l’UI
    } finally {
      setLoadingStats(false);
    }
  }, [selectedId, selectedLabel]);

  React.useEffect(() => { fetchCounts(); }, [fetchCounts]);

  /* ------------------------- Filtre étudiants par niveau ------------------------- */
  const [niveauFilter, setNiveauFilter] = React.useState<'ALL'|'L1'|'L2'|'L3'|'M1'|'M2'>('ALL');
  const niveauxList: Array<'L1'|'L2'|'L3'|'M1'|'M2'> = ['L1','L2','L3','M1','M2'];
  const repartition = React.useMemo(() => {
    const base = new Map(niveauxList.map(n => [n, 0]));
    for (const s of students) {
      const n = (s.niveau_id || '').toUpperCase() as any;
      if (base.has(n)) base.set(n, (base.get(n) || 0) + 1);
    }
    const rows = niveauxList.map(k => ({ k, v: base.get(k) || 0 }));
    if (niveauFilter !== 'ALL') {
      return rows.map(r => ({ ...r, v: r.k === niveauFilter ? r.v : 0 }));
    }
    return rows;
  }, [students, niveauFilter]);

  /* ------------------------- Mini calendrier (anniversaires) ------------------------- */
  const today = new Date();
  const [calRefDate, setCalRefDate] = React.useState<Date>(today);
  const [selectedDay, setSelectedDay] = React.useState<Date>(today);

  // birthdays pour l’année sélectionnée (on récupère ~300 users et on filtre côté client)
  const [birthdays, setBirthdays] = React.useState<TUser[]>([]);
  React.useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), orderBy('created_at', 'desc'), limit(300))
        );
        const all = snap.docs.map(d => ({ docId: d.id, ...(d.data() as any) })) as TUser[];
        // Filtre année (id prioritaire, puis label legacy si présent)
        const inYear = all.filter(u =>
          !selectedId && !selectedLabel
            ? true
            : userMatchesSelectedYear(u, selectedId, selectedLabel)
        );
        setBirthdays(inYear);
      } catch {/* ignore */}
    })();
  }, [selectedId, selectedLabel]);

  const yyyy_mm_dd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };
  const mm_dd = (d: Date) => yyyy_mm_dd(d).slice(5); // 'MM-DD'

  const dayBirths = React.useMemo(() => {
    const key = mm_dd(selectedDay);
    return birthdays.filter(b => {
      if (!b.date_naissance) return false;
      const v = b.date_naissance.includes('-')
        ? b.date_naissance.slice(5)
        : b.date_naissance.slice(3,5) + '-' + b.date_naissance.slice(0,2);
      return v === key;
    });
  }, [birthdays, selectedDay]);

  const buildMonthMatrix = (ref: Date) => {
    const y = ref.getFullYear(), m = ref.getMonth();
    const first = new Date(y, m, 1);
    const startIdx = (first.getDay() + 6) % 7; // lundi=0
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const cells: Date[] = [];
    // jours avant
    for (let i=0; i<startIdx; i++) cells.push(new Date(y, m, -i));
    cells.reverse();
    // mois courant
    for (let d=1; d<=daysInMonth; d++) cells.push(new Date(y, m, d));
    // compléter 6 lignes * 7 = 42
    while (cells.length < 42) cells.push(new Date(y, m, daysInMonth + (cells.length - startIdx - daysInMonth) + 1));
    return cells;
  };
  const matrix = buildMonthMatrix(calRefDate);

  /* ------------------------- Sparkline (barres) ------------------------- */
  const totalFiltre = React.useMemo(() => repartition.reduce((a,b)=>a+b.v,0), [repartition]);

  /* ------------------------- UI ------------------------- */
  return (
    <div className="container-fluid px-0 mt-2">

      {/* En-tête + actions année */}
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-3">
        <div className="pe-3">
          <h2 className="fw-bold mb-1">
            Bienvenue{prenom ? ` ${prenom}` : ''} <span className="ms-1">!</span>
          </h2>
          <div className="text-muted">
            Tableau de bord de <span className="fw-semibold">gestion scolaire</span> — suivez d’un coup d’œil vos effectifs,
            vos enseignants, vos filières et vos classes.
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <label className="text-muted me-1">Année</label>
          <select
            className="form-select form-select-sm"
            style={{ width: 200 }}
            disabled={loading || !selected}
            value={selected?.id ?? ''}
            onChange={(e) => setSelectedById(e.target.value)}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.label}</option>
            ))}
          </select>

          <button className="btn btn-outline-secondary btn-sm" disabled={!selected} onClick={onOpenEdit}>
            <i className="bi bi-pencil me-1" /> Modifier
          </button>

          <button className="btn btn-dark btn-sm" onClick={onOpenCreate}>
            <i className="bi bi-plus-lg me-1" /> Créer une année
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (selectedLabel) {
                try { localStorage.setItem('app.selectedAnnee', selectedLabel); } catch {}
              }
              if (onOpenEtudiants) {
                onOpenEtudiants();
              } else {
                window.location.href = selectedLabel
                  ? `/directeur-des-etudes/etudiants?annee=${encodeURIComponent(selectedLabel)}`
                  : `/directeur-des-etudes/etudiants`;
              }
            }}
          >
            <i className="bi bi-people me-1" /> Ouvrir Étudiants
          </button>
        </div>
      </div>

      {/* Bandeau info année */}
      <div className="card border-0 shadow-sm mb-3 rounded-4">
        <div className="card-body">
          <div className="text-muted">
            Année académique active : <strong>{selected?.label || '—'}</strong>
            {(selected as any)?.active ? (
              <span className="badge bg-success-subtle text-success ms-2">active</span>
            ) : null}
          </div>
          <div className="small text-muted mt-1">
            Période : <strong>{(selected as any)?.date_debut || '—'}</strong> →{' '}
            <strong>{(selected as any)?.date_fin || '—'}</strong>
            {(selected as any)?.timezone ? (
              <span> • TZ <code>{(selected as any).timezone}</code></span>
            ) : null}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="row g-3 mb-3">
        {[
          { key: 'etudiants',   label: 'Étudiants',   icon: 'bi-mortarboard',  value: nbEtudiants },
          { key: 'professeurs', label: 'Professeurs', icon: 'bi-person-badge', value: nbProfs },
          { key: 'filieres',    label: 'Filières',    icon: 'bi-diagram-3',    value: nbFilieres },
          { key: 'classes',     label: 'Classes',     icon: 'bi-columns-gap',  value: nbClasses },
        ].map((kpi) => (
          <div key={kpi.key} className="col-12 col-sm-6 col-lg-3">
            <div
              className="card border-0 shadow-sm h-100 rounded-4 clickable"
              role="button"
              tabIndex={0}
              onClick={() => openFromKpi(kpi.key as any)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openFromKpi(kpi.key as any); }}
              aria-label={`Ouvrir ${kpi.label}`}
              title={`Ouvrir ${kpi.label}`}
            >
              <div className="card-body">
                <div className="d-flex align-items-center justify-content-between">
                  <span className="text-muted small">{kpi.label}</span>
                  <i className={`text-primary fs-5 ${kpi.icon}`} />
                </div>
                <div className="fs-2 fw-semibold mt-1">{loadingStats ? '—' : kpi.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Répartition + mini calendrier */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-xl-8">
          <div className="card border-0 shadow-sm rounded-4 h-100">
            <div className="card-header bg-white border-0 d-flex align-items-center justify-content-between">
              <div className="fw-semibold"><i className="bi bi-bar-chart me-2" />Répartition par niveau</div>
              <div className="d-flex align-items-center gap-2">
                <span className="small text-muted">Filtre étudiants</span>
                <select className="form-select form-select-sm" value={niveauFilter} onChange={e => setNiveauFilter(e.target.value as any)}>
                  <option value="ALL">Tous</option>
                  {['L1','L2','L3','M1','M2'].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="card-body">
              {repartition.map(n => (
                <div key={n.k} className="mb-3">
                  <div className="d-flex justify-content-between">
                    <span className="small text-muted">{n.k}</span>
                    <span className="small">{n.v}</span>
                  </div>
                  <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="progress-bar"
                      style={{
                        width: `${nbEtudiants ? Math.round((n.v / Math.max(1, nbEtudiants)) * 100) : 0}%`
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* mini bar chart */}
              <div className="mt-3 d-flex align-items-end gap-2" aria-hidden="true">
                {repartition.map((r, i) => {
                  const h = Math.max(6, Math.round((r.v / Math.max(1, nbEtudiants)) * 48));
                  return (
                    <div
                      key={i}
                      title={`${r.k}: ${r.v}`}
                      style={{
                        height: h,
                        width: '18%',
                        background: '#029DFC',
                        borderRadius: 6,
                        opacity: r.v ? 1 : .25,
                        boxShadow: '0 2px 8px rgba(40, 124, 250, 0.25)',
                      }}
                    />
                  );
                })}
              </div>
              <div className="small text-muted mt-1">
                Total filtré : <strong>{totalFiltre}</strong> / {nbEtudiants}
              </div>
            </div>
          </div>
        </div>

        {/* Mini calendrier à droite */}
        <div className="col-12 col-xl-4">
          <div className="card border-0 shadow-sm rounded-4 h-100">
            <div className="card-header bg-white border-0 d-flex align-items-center justify-content-between">
              <div className="fw-semibold"><i className="bi bi-calendar3 me-2" />Anniversaires</div>
              <div className="btn-group btn-group-sm">
                <button className="btn btn-outline-secondary" onClick={() => setCalRefDate(new Date(calRefDate.getFullYear(), calRefDate.getMonth()-1, 1))}>
                  <i className="bi bi-chevron-left" />
                </button>
                <button className="btn btn-outline-secondary" onClick={() => setCalRefDate(new Date())}>
                  Aujourd’hui
                </button>
                <button className="btn btn-outline-secondary" onClick={() => setCalRefDate(new Date(calRefDate.getFullYear(), calRefDate.getMonth()+1, 1))}>
                  <i className="bi bi-chevron-right" />
                </button>
              </div>
            </div>
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className="fw-semibold">
                  {calRefDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </div>
              </div>
              <div className="mini-cal grid">
                {['L','M','M','J','V','S','D'].map((d,i)=>
                  <div key={i} className="mini-cal-cell mini-cal-head">{d}</div>
                )}
                {buildMonthMatrix(calRefDate).map((d, idx) => {
                  const inMonth = d.getMonth() === calRefDate.getMonth();
                  const isSel = yyyy_mm_dd(d) === yyyy_mm_dd(selectedDay);
                  const hasBirth = birthdays.some(b => {
                    if (!b.date_naissance) return false;
                    const v = b.date_naissance.includes('-')
                      ? b.date_naissance.slice(5)
                      : b.date_naissance.slice(3,5) + '-' + b.date_naissance.slice(0,2);
                    return v === mm_dd(d);
                  });
                  return (
                    <button
                      key={idx}
                      className={`mini-cal-cell btn ${isSel ? 'sel' : ''} ${!inMonth ? 'muted' : ''}`}
                      onClick={() => setSelectedDay(d)}
                      aria-label={yyyy_mm_dd(d)}
                    >
                      <span>{d.getDate()}</span>
                      {hasBirth && <span className="dot" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                <div className="small text-muted mb-1">
                  {selectedDay.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' })}
                </div>
                {dayBirths.length === 0 && <div className="text-muted small">Aucun anniversaire.</div>}
                <ul className="list-unstyled mb-0">
                  {dayBirths.map((p, i) => (
                    <li key={i} className="py-1 d-flex align-items-center">
                      <i className="bi bi-gift text-primary me-2" />
                      <span className="me-2">{p.prenom} {p.nom}</span>
                      {p.role_libelle?.toLowerCase().includes('etud') && p.classe && (
                        <small className="text-muted">({p.classe})</small>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ---------------------- Modals année ---------------------- */}
      {showNewYear && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title"><i className="bi bi-calendar2-plus me-2" />Nouvelle année académique</h5>
                  <button type="button" className="btn-close" onClick={() => setShowNewYear(false)} aria-label="Close" />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Libellé (format YYYY-YYYY)</label>
                    <input className="form-control" value={newYear} onChange={(e)=>setNewYear(e.target.value)} placeholder="ex: 2025-2026" />
                    <small className="text-muted">Exemple : 2025-2026.</small>
                  </div>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Début d’année</label>
                      <input type="date" className="form-control" value={newStart} onChange={(e)=>setNewStart(e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Fin d’année</label>
                      <input type="date" className="form-control" value={newEnd} onChange={(e)=>setNewEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="row g-3 mt-1">
                    <div className="col-md-8">
                      <label className="form-label">Timezone</label>
                      <input className="form-control" value={newTz} onChange={(e)=>setNewTz(e.target.value)} placeholder="Africa/Dakar" />
                    </div>
                    <div className="col-md-4 d-flex align-items-end">
                      <div className="form-check">
                        <input id="new-active" type="checkbox" className="form-check-input" checked={newActive} onChange={(e)=>setNewActive(e.target.checked)} />
                        <label className="form-check-label" htmlFor="new-active">Active</label>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setShowNewYear(false)}>Annuler</button>
                  <button className="btn btn-primary" onClick={onCreateYear}>Enregistrer</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowNewYear(false)} />
        </>
        </ModalPortal>
      )}

      {showEdit && selected && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title"><i className="bi bi-pencil-square me-2" />Modifier {selected.label}</h5>
                  <button type="button" className="btn-close" onClick={() => setShowEdit(false)} aria-label="Close" />
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Début d’année</label>
                      <input type="date" className="form-control" value={editStart} onChange={(e)=>setEditStart(e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Fin d’année</label>
                      <input type="date" className="form-control" value={editEnd} onChange={(e)=>setEditEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="row g-3 mt-1">
                    <div className="col-md-8">
                      <label className="form-label">Timezone</label>
                      <input className="form-control" value={editTz} onChange={(e)=>setEditTz(e.target.value)} />
                    </div>
                    <div className="col-md-4 d-flex align-items-end">
                      <div className="form-check">
                        <input id="edit-active" type="checkbox" className="form-check-input" checked={editActive} onChange={(e)=>setEditActive(e.target.checked)} />
                        <label className="form-check-label" htmlFor="edit-active">Active</label>
                      </div>
                    </div>
                  </div>
                  <div className="form-text mt-2">
                    Astuce : marquez comme <b>Active</b> l’année en cours pour vos filtres et écrans par défaut.
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setShowEdit(false)}>Annuler</button>
                  <button className="btn btn-primary" onClick={onSaveEdit}>Enregistrer</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowEdit(false)} />
        </>
        </ModalPortal>
      )}

      {/* Toasts */}
      <Toast message={toastMsg} type="success" show={okShow} onClose={() => setOkShow(false)} />
      <Toast message={toastMsg} type="error" show={errShow} onClose={() => setErrShow(false)} />

      {/* Styles locaux */}
      <style jsx>{`
        .mini-cal.grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
        }

        .home-dashboard :global(.btn-primary),
        .home-dashboard :global(.btn-primary:focus),
        .home-dashboard :global(.btn-primary:active) {
          background-color: ${BRAND} !important;
          border-color: ${BRAND} !important;
        }
        .home-dashboard :global(.btn-outline-primary) {
          color: ${BRAND} !important;
          border-color: ${BRAND} !important;
        }
        .home-dashboard :global(.btn-outline-primary:hover),
        .home-dashboard :global(.btn-outline-primary:focus) {
          background-color: ${BRAND} !important;
          border-color: ${BRAND} !important;
          color: #fff !important;
        }
        /* liens bleus éventuels */
        .home-dashboard :global(a) {
          color: ${BRAND};
        }
        .home-dashboard :global(a:hover) {
          color: #0186d8;
        }
        .mini-cal-cell {
          border: 1px solid #e6ebf3;
          background: #fff;
          border-radius: 10px;
          padding: .35rem .2rem;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .mini-cal-cell.muted { opacity: .5; }
        .mini-cal-head {
          font-size: .75rem;
          font-weight: 600;
          color: #6c7a90;
          background: #f7f9fc;
        }
        .mini-cal-cell.btn { cursor: pointer; }
        .mini-cal-cell.sel { outline: 2px solid #029DFC; }
        .mini-cal-cell .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #029DFC; position: absolute; bottom: 4px;
        }
        .card.clickable { cursor: pointer; transition: transform .05s ease, box-shadow .15s ease; }
        .card.clickable:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,.08); }
        .card.clickable:active { transform: translateY(0); }

        /* Garantit que les modales passent devant tout */
        .modal-backdrop { z-index: 1990 !important; }
        .modal          { z-index: 2000 !important; }
      `}</style>
    </div>
  );
}

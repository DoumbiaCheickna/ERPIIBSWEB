// src/app/directeur-des-etudes/components/ProfessorsPage.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  DocumentData,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import Toast from "../../admin/components/ui/Toast";

// ✅ formulaire modale (création & édition)
import ProfesseurForm from "../../admin/pages/users/professeurForm";
import { useAcademicYear } from "../context/AcademicYearContext";
import ModalPortal from "./ModalPortal";

// NEW: petit cache mémoire process-local (reste le temps du rafraîchissement de page)
const memoryCache = new Map<string, TUserRow[]>();

/* ------------------------------------------------------------------ */
const ROLE_PROF_KEY = "prof";
const PER_PAGE = 10;

type SectionKey = "Gestion" | "Informatique";

/* ------------------------------------------------------------------ */
// Référentiels
type TRole = { id: string | number; libelle: string };

type TFiliere = {
  id: string;
  libelle: string;
  section?: SectionKey;
  academic_year_id?: string;
};

type TClasse = {
  id: string;
  libelle: string;
  filiere_id?: string;
  filiere_libelle?: string;
  academic_year_id?: string;
};

type TMatiere = { id: string; libelle: string; class_id?: string };

// Années
type TAnnee = { id: string; libelle: string; active?: boolean };

/* -------------------- Professeur: champs complets ------------------- */
type TProfessor = {
  docId: string;
  id?: number;
  // base
  nom: string;
  prenom: string;
  email?: string;
  login?: string;
  specialite?: string;
  role_id?: string;
  role_libelle?: string;
  role_key?: string;
  telephone?: string;
  adresse?: string;
  specialite_detaillee?: string;

  // identité / état civil
  date_naissance?: string;
  lieu_naissance?: string;
  nationalite?: string;
  sexe?: string;
  situation_matrimoniale?: string;
  cni_passeport?: string;

  // statut / fonction
  statut?: string;
  fonction_principale?: string;

  // disponibilités
  disponibilites?: { jour: string; debut: string; fin: string }[];

  // éléments constitutifs / expériences
  elements_constitutifs?: string[];
  experience_enseignement?: { annees: number; etablissements: string[] };

  // diplômes / niveaux / compétences
  diplomes?: { intitule: string; niveau: string; annee: string; etablissement: string }[];
  niveaux_enseignement?: string[];
  competences?: { outils: string[]; langues: string[]; publications: string[] };

  // RIB / documents
  rib?: string | null;
  documents?: {
    cv?: string | null;
    diplomes?: string | null;
    piece_identite?: string | null;
    rib?: string | null;
  };

  // compat
  auth_uid?: string;
};

type TUserRow = {
  id?: number;
  docId: string;
  nom: string;
  prenom: string;
  specialite?: string;
  role_id?: string;
  role_libelle?: string;
  role_key?: string;
};


// ➕ ajoute
type TEdtSlot = {
  day: number;           // 1..7
  start: string;         // "08:00"
  end: string;           // "10:00"
  matiere_id?: string;
  matiere_libelle?: string;
  enseignant?: string;
  salle?: string;
};
type TEdtDoc = {
  annee: string;
  class_id: string;
  class_libelle: string;
  slots: TEdtSlot[];
};

// ➕ pour l'affichage
type TSchedRow = {
  day: number;
  class_id: string;
  class_libelle: string;
  matiere_libelle: string;
  start: string;
  end: string;
  salle?: string;
};

/* ------------------------------------------------------------------ */
// ✅ Types locaux pour caster le composant externe ProfesseurForm
type ProfesseurFormMode = "create" | "edit";
type ProfesseurFormProps = {
  mode: ProfesseurFormMode;
  docId?: string;
  roles?: TRole[];
  onClose: () => void;
  onSaved?: () => void;
};
const ProfesseurFormTyped = ProfesseurForm as unknown as React.ComponentType<ProfesseurFormProps>;
// NEW: clé de cache par année (utilise id sinon label sinon 'all')
const cacheKeyForYear = (yearId: string, yearLabel: string) =>
  `professeurs:${yearId || yearLabel || 'all'}`;


/* ------------------------------------------------------------------ */

export default function ProfessorsPage() {
  const { selected } = useAcademicYear();
  const selectedYearId = selected?.id || "";
  const selectedYearLabel = selected?.label || "";

  const lastLoadKeyRef = React.useRef<string>("");


  /* === Référentiels === */
  const [roles, setRoles] = useState<TRole[]>([]);
  const [filieres, setFilieres] = useState<TFiliere[]>([]);
  const [classes, setClasses] = useState<TClasse[]>([]);
  const [matieres, setMatieres] = useState<TMatiere[]>([]);
  const [annees, setAnnees] = useState<TAnnee[]>([]);

  const filiereById = useMemo(() => Object.fromEntries(filieres.map((f) => [f.id, f])), [filieres]);
  const classesByFiliere = useMemo(() => {
    const m: Record<string, TClasse[]> = {};
    classes.forEach((c) => {
      const fid = c.filiere_id || "";
      if (!m[fid]) m[fid] = [];
      m[fid].push(c);
    });
    return m;
  }, [classes]);
  const matieresByClass = useMemo(() => {
    const m: Record<string, TMatiere[]> = {};
    matieres.forEach((x) => {
      const cid = x.class_id || "";
      if (!m[cid]) m[cid] = [];
      m[cid].push(x);
    });
    return m;
  }, [matieres]);

  /* === Liste (client) === */
  const [all, setAll] = useState<TUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Transfert
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferDocId, setTransferDocId] = useState<string | null>(null);
  const [transferYearId, setTransferYearId] = useState<string>("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferErr, setTransferErr] = useState("");

  // état + ref pour le menu "Ajouter"
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!addMenuRef.current) return;
      if (!addMenuRef.current.contains(e.target as Node)) setShowAddMenu(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // recherche / tri / pagination (côté client)
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const sortRows = (rows: TUserRow[]) =>
    [...rows].sort((a, b) => {
      const n = (a.nom || "").localeCompare(b.nom || "", "fr", { sensitivity: "base" });
      if (n !== 0) return n;
      return (a.prenom || "").localeCompare(b.prenom || "", "fr", { sensitivity: "base" });
    });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortRows(all);
    return sortRows(
      all.filter((u) => `${u.nom} ${u.prenom} ${u.specialite || ""}`.toLowerCase().includes(q))
    );
  }, [all, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1); // reset page quand la recherche change
  }, [search]);

  /* === Toasts === */
  const [toast, setToast] = useState("");
  const [okShow, setOkShow] = useState(false);
  const [errShow, setErrShow] = useState(false);
  const ok = (m: string) => {
    setToast(m);
    setOkShow(true);
  };
  const ko = (m: string) => {
    setToast(m);
    setErrShow(true);
  };

  /* === Modales === */
  const [showCreate, setShowCreate] = useState(false);
  const [editDocId, setEditDocId] = useState<string | null>(null);

  const [showDetails, setShowDetails] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<TProfessor | null>(null);

  const [showDelete, setShowDelete] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // (nouveau) état pour "Retirer (année sélectionnée)"
  const [removingFromYear, setRemovingFromYear] = useState(false);

  // Affichage prénom/nom dans la modale de suppression
  const deleteTarget = useMemo(
    () => all.find((u) => u.docId === deleteDocId) || null,
    [all, deleteDocId]
  );

  // === Assignation (Section -> Filière -> Classe -> Matières) ===
  type TDraft = {
    section?: SectionKey;
    filiere_id?: string;
    classe_id?: string;
    matieres_ids: string[];
  };

  const [showAssign, setShowAssign] = useState(false);
  const [assignForDocId, setAssignForDocId] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignErr, setAssignErr] = useState("");
  const [assignOk, setAssignOk] = useState("");

  const [anneeId, setAnneeId] = useState<string>("");
  // ➕ ajoute ces états
  const [edtLoading, setEdtLoading] = useState(false);
  const [edtRows, setEdtRows] = useState<TSchedRow[]>([]);


  // building block sélection
  const [draft, setDraft] = useState<TDraft>({ matieres_ids: [] });
  // liste d’affectations en mémoire avant Save
  const [draftList, setDraftList] = useState<
    { section: SectionKey; filiere_id: string; classe_id: string; matieres_ids: string[] }[]
  >([]);

  // mode édition d'une affectation
  const [editingClasseId, setEditingClasseId] = useState<string | null>(null);

  /* ---------------------- fetch référentiels ------------------------ */
  const fetchRoles = async () => {
    const snap = await getDocs(collection(db, "roles"));
    const rs: TRole[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      rs.push({ id: data.id ?? d.id, libelle: data.libelle });
    });
    setRoles(rs);
  };

  const fetchFilieres = async () => {
    const snap = await getDocs(collection(db, "filieres"));
    const rows: TFiliere[] = [];
    snap.forEach((d) => {
      const v = d.data() as any;
      rows.push({
        id: d.id,
        libelle: String(v.libelle || d.id),
        section: v.section === "Gestion" || v.section === "Informatique" ? v.section : undefined,
        academic_year_id: String(v.academic_year_id || ""),
      });
    });
    rows.sort((a, b) => a.libelle.localeCompare(b.libelle));
    setFilieres(rows);
  };

  const fetchClasses = async () => {
    const snap = await getDocs(collection(db, "classes"));
    const cs: TClasse[] = [];
    snap.forEach((d) => {
      const v = d.data() as any;
      cs.push({
        id: d.id,
        libelle: String(v.libelle || d.id),
        filiere_id: String(v.filiere_id || ""),
        filiere_libelle: String(v.filiere_libelle || ""),
        academic_year_id: String(v.academic_year_id || ""),
      });
    });
    cs.sort((a, b) => a.libelle.localeCompare(b.libelle));
    setClasses(cs);
  };

  const fetchMatieres = async () => {
    const snap = await getDocs(collection(db, "matieres"));
    const ms: TMatiere[] = [];
    snap.forEach((d) => {
      const v = d.data() as any;
      ms.push({ id: d.id, libelle: String(v.libelle || d.id), class_id: String(v.class_id || "") });
    });
    ms.sort((a, b) => a.libelle.localeCompare(b.libelle));
    setMatieres(ms);
  };

  const fetchAnnees = async () => {
    const snap = await getDocs(collection(db, "annees_scolaires"));
    const ys: TAnnee[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      ys.push({ id: d.id, libelle: data.libelle ?? d.id, active: !!data.active });
    });
    setAnnees(ys);
  };

  /* ---------------------- Helpers robustes -------------------------- */
  const toDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val === "object" && typeof (val as any).toDate === "function") return (val as any).toDate(); // Firestore Timestamp
    if (typeof val === "number") return new Date(val); // epoch millis
    if (typeof val === "string") return new Date(val); // ISO string
    if (val instanceof Date) return val;
    return null;
  };

  const parseYearLabelToBounds = (label: string) => {
    // Année académique: 1er août N -> 31 juillet N+1
    // label attendu: "YYYY-YYYY"
    const [l, r] = (label || "").split("-").map((x) => parseInt(x, 10));
    if (!Number.isFinite(l) || !Number.isFinite(r)) return null;
    const start = new Date(l, 7, 1, 0, 0, 0, 0); // 1 août (mois 7)
    const end = new Date(r, 6, 31, 23, 59, 59, 999); // 31 juillet
    return { start, end };
  };

  /**
   * Vrai si le document "v" appartient à l'année sélectionnée.
   * - par id: academic_year_id / academicYearId / annee_id / annee / year_id
   * - par label: academic_year_label / annee_label / annee_scolaire_label / year_label
   * - par date: createdAt / created_at / created / created_on / date_creation / updatedAt / updated_at
   */
  const matchesSelectedYear = (v: any, yearId: string, yearLabel: string): boolean => {
    if (!yearId && !yearLabel) return false;

    // 1) Candidats "id"
    const idCandidates = [
      v?.academic_year_id,
      v?.academicYearId,
      v?.annee_id,
      v?.annee,
      v?.year_id,
    ].filter(Boolean).map(String);

    // 2) Candidats "label"
    const labelCandidates = [
      v?.academic_year_label,
      v?.annee_label,
      v?.annee_scolaire_label,
      v?.year_label,
    ].filter(Boolean).map(String);

    const hasYearMeta = idCandidates.length > 0 || labelCandidates.length > 0;

    // Si métadonnées présentes → elles font autorité (pas de fallback par date)
    if (yearId && idCandidates.some((x) => x === yearId)) return true;
    if (yearLabel && labelCandidates.some((x) => x === yearLabel)) return true;
    if (hasYearMeta) return false;

    // 3) Fallback par date UNIQUEMENT si aucune métadonnée d’année
    const bounds = yearLabel ? parseYearLabelToBounds(yearLabel) : null;
    if (!bounds) return false;

    // Utiliser seulement des dates de création (pas updatedAt)
    const dateCandidates = [v?.createdAt, v?.created_at, v?.created, v?.created_on, v?.date_creation];
    for (const dc of dateCandidates) {
      const d = toDate(dc);
      if (d && d >= bounds.start && d <= bounds.end) return true;
    }
    return false;
  };

  const getYearLabel = (id: string) =>
  annees.find(a => a.id === id)?.libelle || "";

    // Tous les profs (peu importe l’année) – triés Nom/Prénom
const loadAllProfs = async (): Promise<TUserRow[]> => {
  const qref = query(collection(db, "users"), where("role_key", "==", ROLE_PROF_KEY));
  const snap = await getDocs(qref);
  const arr: TUserRow[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    arr.push({
      docId: d.id,
      id: v.id,
      nom: v.nom || "",
      prenom: v.prenom || "",
      specialite: v.specialite || v.specialty || "",
      role_id: v.role_id !== undefined && v.role_id !== null ? String(v.role_id) : undefined,
      role_libelle: v.role_libelle,
      role_key: v.role_key,
    });
  });
  return arr.sort((a, b) =>
    (a.nom || "").localeCompare(b.nom || "", "fr", { sensitivity: "base" }) ||
    (a.prenom || "").localeCompare(b.prenom || "", "fr", { sensitivity: "base" })
  );
};

// renvoie l'ensemble des prof_doc_id qui apparaissent DEJA dans la LISTE de l'année,
// en suivant la même logique que fetchProfsForYear (métadonnées OU affectations)
  const loadTakenSetForYear = async (yearId: string, yearLabel: string): Promise<Set<string>> => {
    const s = new Set<string>();

    // A) Profs dont le doc "users" matche l'année (métadonnées / fallback)
    try {
      const uq = query(collection(db, "users"), where("role_key", "==", ROLE_PROF_KEY));
      const usnap = await getDocs(uq);
      usnap.forEach((d) => {
        const v = d.data() as any;
        if (matchesSelectedYear(v, yearId, yearLabel)) s.add(d.id);
      });
    } catch (e) {
      console.warn("users query failed in loadTakenSetForYear", e);
    }

    // B) Profs présents dans les affectations de l’année
    if (yearId) {
      const affQ = query(collection(db, "affectations_professeurs"), where("annee_id", "==", yearId));
      const affSnap = await getDocs(affQ);
      affSnap.forEach((d) => {
        const v = d.data() as any;
        const fromField = v?.prof_doc_id ? String(v.prof_doc_id) : "";
        const fromKey = d.id.includes("__") ? d.id.split("__")[1] : "";
        const id = fromField || fromKey;
        if (id) s.add(id);
      });
    }

    return s;
  };

  /* ---------------------- Liste des profs (année) ------------------- */
  const fetchProfsForYear = async (yearId: string, yearLabel: string) => {
  const CK = cacheKeyForYear(yearId, yearLabel);
  lastLoadKeyRef.current = CK;   // marque cette requête comme la plus récente
  setLoading(true);

  try {
    // 1) Cache hit → rendu immédiat (et stop)
    if (memoryCache.has(CK)) {
      if (lastLoadKeyRef.current === CK) {
        setAll(memoryCache.get(CK)!);
        setLoading(false);
      }
      return;
    }

    // 2) Aucune année → liste vide + cache vide
    if (!yearId && !yearLabel) {
      memoryCache.set(CK, []);
      if (lastLoadKeyRef.current === CK) {
        setAll([]);
        setLoading(false);
      }
      return;
    }

    // 3) Construction de la liste
    const rowsMap = new Map<string, TUserRow>();

    // --- A) users (role_key == "prof") + filtre année côté client
    try {
      const uq = query(collection(db, "users"), where("role_key", "==", ROLE_PROF_KEY));
      const usnap = await getDocs(uq);
      usnap.forEach((d) => {
        const v = d.data() as DocumentData;
        if (matchesSelectedYear(v, yearId, yearLabel)) {
          rowsMap.set(d.id, {
            docId: d.id,
            id: v.id,
            nom: v.nom || "",
            prenom: v.prenom || "",
            specialite: v.specialite || v.specialty || "",
            role_id: v.role_id !== undefined && v.role_id !== null ? String(v.role_id) : undefined,
            role_libelle: v.role_libelle,
            role_key: v.role_key,
          });
        }
      });
    } catch (e) {
      console.warn("users query failed", e);
    }

    // --- B) union avec profs présents dans les affectations de l’année
    if (yearId) {
      const affQ = query(collection(db, "affectations_professeurs"), where("annee_id", "==", yearId));
      const affSnap = await getDocs(affQ);

      const profIds = new Set<string>();
      affSnap.forEach((d) => {
        const v = d.data() as any;
        const fromField = v?.prof_doc_id ? String(v.prof_doc_id) : "";
        const fromKey = d.id.includes("__") ? d.id.split("__")[1] : "";
        const id = fromField || fromKey;
        if (id) profIds.add(id);
      });

      await Promise.all(
        Array.from(profIds).map(async (pid) => {
          if (rowsMap.has(pid)) return;
          const uref = doc(db, "users", pid);
          const usnap = await getDoc(uref);
          if (!usnap.exists()) return;
          const v = usnap.data() as DocumentData;
          if (v.role_key !== ROLE_PROF_KEY) return;
          rowsMap.set(usnap.id, {
            docId: usnap.id,
            id: v.id,
            nom: v.nom || "",
            prenom: v.prenom || "",
            specialite: v.specialite || v.specialty || "",
            role_id: v.role_id !== undefined && v.role_id !== null ? String(v.role_id) : undefined,
            role_libelle: v.role_libelle,
            role_key: v.role_key,
          });
        })
      );
    }

    // 4) Finalisation + cache
    const rows = Array.from(rowsMap.values());
    memoryCache.set(CK, rows);

    // N’applique l’état que si cette requête est toujours la dernière déclenchée
    if (lastLoadKeyRef.current === CK) {
      setAll(rows);
    }
  } catch (e) {
    console.error(e);
    ko("Erreur lors du chargement des professeurs.");
  } finally {
    if (lastLoadKeyRef.current === CK) {
      setLoading(false);
    }
  }
};

  const bootstrap = async () => {
    await Promise.all([fetchRoles(), fetchFilieres(), fetchClasses(), fetchMatieres(), fetchAnnees()]);
  };

  useEffect(() => {
    bootstrap();
  }, []);

  // Quand l’année sélectionnée change → recharge la liste des profs
  useEffect(() => {
    const CK = cacheKeyForYear(selectedYearId, selectedYearLabel); // NEW
    if (memoryCache.has(CK)) {                                     // NEW
      setAll(memoryCache.get(CK)!);                                // NEW
      setLoading(false);                                           // NEW
    } else {
      fetchProfsForYear(selectedYearId, selectedYearLabel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId, selectedYearLabel]);

  const activeAnneeId = useMemo(() => {
    const a = annees.find((x) => x.active);
    return a?.id || annees[0]?.id || "";
  }, [annees]);

  /* ---------------------- Détails: open / load ---------------------- */
  const openDetails = async (docId: string) => {
    setShowDetails(true);
    setDetailsLoading(true);
    try {
      const ref = doc(db, "users", docId);
      const d = await getDoc(ref);
      if (!d.exists()) {
        setDetails(null);
        return;
      }
      const v = d.data() as any;
      const prof: TProfessor = {
        docId: d.id,
        id: v.id,
        // base
        nom: v.nom ?? "",
        prenom: v.prenom ?? "",
        email: v.email ?? "",
        login: v.login ?? "",
        specialite: v.specialite ?? v.specialty ?? "",
        role_id: v.role_id !== undefined && v.role_id !== null ? String(v.role_id) : undefined,
        role_libelle: v.role_libelle,
        role_key: v.role_key,
        telephone: v.telephone ?? "",
        adresse: v.adresse ?? "",
        specialite_detaillee: v.specialite_detaillee ?? "",
        // identité
        date_naissance: v.date_naissance ?? "",
        lieu_naissance: v.lieu_naissance ?? "",
        nationalite: v.nationalite ?? "",
        sexe: v.sexe ?? "",
        situation_matrimoniale: v.situation_matrimoniale ?? "",
        cni_passeport: v.cni_passeport ?? "",
        // statut/fonction
        statut: v.statut ?? "",
        fonction_principale: v.fonction_principale ?? "",
        // dispo / éléments / expériences
        disponibilites: Array.isArray(v.disponibilites) ? v.disponibilites : [],
        elements_constitutifs: Array.isArray(v.elements_constitutifs) ? v.elements_constitutifs : [],
        experience_enseignement: v.experience_enseignement ?? { annees: 0, etablissements: [] },
        // diplômes / niveaux / compétences
        diplomes: Array.isArray(v.diplomes) ? v.diplomes : [],
        niveaux_enseignement: Array.isArray(v.niveaux_enseignement) ? v.niveaux_enseignement : [],
        competences: v.competences ?? { outils: [], langues: [], publications: [] },
        // rib / docs
        rib: v.rib ?? null,
        documents: v.documents ?? {},
        // compat
        auth_uid: v.auth_uid,
      };
      setDetails(prof);
    } catch (e) {
      console.error(e);
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  /* ---------------------- Supprimer (modale danger) ----------------- */
  const askDelete = (docId: string) => {
    setDeleteDocId(docId);
    setDeleteError("");
    setShowDelete(true);
  };

  const doDelete = async () => {
    if (!deleteDocId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteDoc(doc(db, "users", deleteDocId));
      setShowDelete(false);
      setDeleteDocId(null);
      memoryCache.delete(cacheKeyForYear(selectedYearId, selectedYearLabel)); // NEW
      await fetchProfsForYear(selectedYearId, selectedYearLabel);
      ok("Professeur supprimé.");
    } catch (e: any) {
      console.error(e);
      setDeleteError("Suppression impossible. Réessayez.");
    } finally {
      setDeleting(false);
    }
  };

  /* ---------------------- Helpers: ressources par année -------------- */
  // Mémos pour l'UI (se recalculent quand anneeId change)
  const filieresYear = useMemo(
    () => filieres.filter((f) => (anneeId ? f.academic_year_id === anneeId : true)),
    [filieres, anneeId]
  );
  const classesYear = useMemo(
    () => classes.filter((c) => (anneeId ? c.academic_year_id === anneeId : true)),
    [classes, anneeId]
  );
  const classesByFiliereYear = useMemo(() => {
    const m: Record<string, TClasse[]> = {};
    classesYear.forEach((c) => {
      const fid = c.filiere_id || "";
      if (!m[fid]) m[fid] = [];
      m[fid].push(c);
    });
    return m;
  }, [classesYear]);

  const matieresYear = useMemo(
    () =>
      matieres.filter((m) => {
        if (!m.class_id) return false;
        return classesYear.some((c) => c.id === m.class_id);
      }),
    [matieres, classesYear]
  );
  const matieresByClassYear = useMemo(() => {
    const m: Record<string, TMatiere[]> = {};
    matieresYear.forEach((x) => {
      const cid = x.class_id || "";
      if (!m[cid]) m[cid] = [];
      m[cid].push(x);
    });
    return m;
  }, [matieresYear]);

  const filiereByIdYear = useMemo(
    () => Object.fromEntries(filieresYear.map((f) => [f.id, f])),
    [filieresYear]
  );

  // Helper pur
  const computeYearScopedMaps = (year: string) => {
    const filieresY = filieres.filter((f) => f.academic_year_id === year);
    const classesY = classes.filter((c) => c.academic_year_id === year);
    const matieresY = matieres.filter((m) => m.class_id && classesY.some((c) => c.id === m.class_id));
    const classesByFiliereY: Record<string, TClasse[]> = {};
    classesY.forEach((c) => {
      const fid = c.filiere_id || "";
      if (!classesByFiliereY[fid]) classesByFiliereY[fid] = [];
      classesByFiliereY[fid].push(c);
    });
    const matieresByClassY: Record<string, TMatiere[]> = {};
    matieresY.forEach((x) => {
      const cid = x.class_id || "";
      if (!matieresByClassY[cid]) matieresByClassY[cid] = [];
      matieresByClassY[cid].push(x);
    });
    const filiereByIdY = Object.fromEntries(filieresY.map((f) => [f.id, f]));
    return { filieresY, classesY, classesByFiliereY, matieresY, matieresByClassY, filiereByIdY };
  };

  /* ---------------------- Assignation ------------------------------- */

    // ➕ nom complet du prof à partir de la liste 'all' (déjà chargée)
  const getProfFullName = (pid: string) => {
    const p = all.find(u => u.docId === pid);
    return p ? `${p.prenom} ${p.nom}` : "";
  };

  // ➕ petits helpers
  const dayLabel = (d: number) =>
    ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"][d % 7];

  // Firestore 'in' max 10
  const chunk = <T,>(arr: T[], size = 10) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i*size, (i+1)*size));

  const timeToMinutes = (hhmm: string) => {
    const [h, m] = (hhmm || "0:0").split(":").map(Number);
    return (h||0)*60 + (m||0);
  };

  // ➕ ajoute cette fonction
  const loadProfessorSchedule = async (year: string, profId: string) => {
    setEdtLoading(true);
    setEdtRows([]);
    try {
      // 1) Récupère les affectations de l’année
      const affRef = doc(db, "affectations_professeurs", `${year}__${profId}`);
      const affSnap = await getDoc(affRef);
      if (!affSnap.exists()) { setEdtLoading(false); return; }
      const aff = affSnap.data() as any;
      const classes: any[] = Array.isArray(aff.classes) ? aff.classes : [];

      // Map classe -> set de matières affectées (pour filtrer)
      const allowedByClass = new Map<string, Set<string>>();
      const classIds: string[] = [];
      classes.forEach((c) => {
        const cid = String(c.classe_id || "");
        if (!cid) return;
        classIds.push(cid);
        const mids = new Set<string>((c.matieres_ids || []).map((x: any) => String(x)));
        allowedByClass.set(cid, mids);
      });
      if (classIds.length === 0) { setEdtLoading(false); return; }

      const fullName = getProfFullName(profId).trim();

      // 2) Récupère les documents EDT des classes (par chunks de 10)
      const rows: TSchedRow[] = [];
      for (const ids of chunk(classIds, 10)) {
        const qref = query(
          collection(db, "edts"),
          where("annee", "==", year),
          where("class_id", "in", ids)
        );
        const snap = await getDocs(qref);
        snap.forEach((d) => {
          const v = d.data() as TEdtDoc;
          const cid = v.class_id;
          const clabel = v.class_libelle;
          const allowed = allowedByClass.get(cid) || new Set<string>();
          (v.slots || []).forEach((s) => {
            // On garde le slot si :
            //  - l’enseignant est bien ce prof (prioritaire)
            //  - sinon, si la matière du slot fait partie des matières affectées à ce prof dans cette classe
            const isHisByName = fullName && s.enseignant && s.enseignant.trim() === fullName;
            const isHisByMat  = s.matiere_id && allowed.has(s.matiere_id);
            if (isHisByName || isHisByMat) {
              rows.push({
                day: Number(s.day ?? 0),
                class_id: cid,
                class_libelle: clabel,
                matiere_libelle: s.matiere_libelle || "",
                start: s.start || "",
                end: s.end || "",
                salle: s.salle || "",
              });
            }
          });
        });
      }

      // 3) Tri : jour puis heure
      rows.sort((a,b) => (a.day - b.day) || (timeToMinutes(a.start) - timeToMinutes(b.start)));
      setEdtRows(rows);
    } catch (e) {
      console.error(e);
      setEdtRows([]);
    } finally {
      setEdtLoading(false);
    }
  };

  // charge les affectations pour une année donnée
  const loadAssignFor = async (year: string, profId: string) => {
    setDraft({ matieres_ids: [] });
    setDraftList([]);
    try {
      const { classesY, matieresByClassY, filiereByIdY } = computeYearScopedMaps(year);
      const ref = doc(db, "affectations_professeurs", `${year}__${profId}`);
      const d = await getDoc(ref);
      if (d.exists()) {
        const data = d.data() as any;
        const existing: typeof draftList = [];
        (data.classes || []).forEach((c: any) => {
          const cls = classesY.find((x) => x.id === c.classe_id);
          const filiereId = c.filiere_id || cls?.filiere_id || "";
          const filiere = filiereByIdY[filiereId];
          const sec =
            filiere?.section === "Gestion" || filiere?.section === "Informatique"
              ? filiere.section
              : undefined;
          if (!filiereId || !sec || !c.classe_id) return;
          const mats = (Array.isArray(c.matieres_ids) ? c.matieres_ids : []).filter((mid: string) =>
            (matieresByClassY[c.classe_id] || []).some((mm) => mm.id === mid)
          );
          existing.push({
            section: sec,
            filiere_id: filiereId,
            classe_id: c.classe_id,
            matieres_ids: mats,
          });
        });
        setDraftList(existing);
      } else {
        setDraftList([]);
      }
    } catch (e) {
      console.error(e);
      setDraftList([]);
    }
  };

  const openAssign = async (docId: string) => {
    setAssignForDocId(docId);
    setAssignErr("");
    setAssignOk("");
    setEditingClasseId(null);

    const startYear = selectedYearId || activeAnneeId;
    setAnneeId(startYear);

    await loadAssignFor(startYear, docId);
    await loadProfessorSchedule(startYear, docId);   // ➕ AJOUT

    setShowAssign(true);
  };

  const openAddExisting = async () => {
    if (!selectedYearId) return ko("Sélectionnez d’abord une année scolaire.");
    setPickYearId(selectedYearId);
    setPickErr("");
    setPickSearch("");
    setPickSelected(new Set());
    setShowAddExisting(true);
    const [allProfs, taken] = await Promise.all([
      loadAllProfs(),
      loadTakenSetForYear(selectedYearId, selectedYearLabel), // ← ajoute selectedYearLabel
    ]);
    setPickAllProfs(allProfs);
    setPickTakenSet(taken);
  };

  const openGlobalTake = async () => {
    const dest = selectedYearId || activeAnneeId || "";
    if (!dest) return ko("Aucune année disponible.");
    const destLabel = getYearLabel(dest);

    const [allProfs, taken] = await Promise.all([
      loadAllProfs(),
      loadTakenSetForYear(dest, destLabel),
    ]);
    setPickAllProfs(allProfs);
    setPickTakenSet(taken);
  };

  const changePickYear = async (y: string) => {
    setPickYearId(y);
    setPickSelected(new Set());
    const yLabel = getYearLabel(y);
    setPickTakenSet(await loadTakenSetForYear(y, yLabel));
  };


  const togglePick = (id: string) => {
    setPickSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const next = new Set(pickSelected);
    pickFiltered.forEach((u) => { if (!pickTakenSet.has(u.docId)) next.add(u.docId); });
    setPickSelected(next);
  };
  const clearSelection = () => setPickSelected(new Set());

  const doTakeSelectedToYear = async () => {
    if (!pickYearId) return setPickErr("Choisissez une année scolaire.");
    if (pickSelected.size === 0) return setPickErr("Sélectionnez au moins un professeur.");
    setPickBusy(true);
    setPickErr("");
    try {
      const dest = pickYearId;
      await Promise.all(
        Array.from(pickSelected).map(async (pid) => {
          const ref = doc(db, "affectations_professeurs", `${dest}__${pid}`);
          const old = await getDoc(ref);
          await setDoc(
            ref,
            {
              annee_id: dest,
              prof_doc_id: pid,
              classes: old.exists() ? (old.data()?.classes || []) : [],
              updatedAt: serverTimestamp(),
              ...(old.exists() ? {} : { createdAt: serverTimestamp() }),
            },
            { merge: true }
          );
        })
      );
      ok("Professeur(s) pris pour l’année.");
      if (selectedYearId === dest) {
        memoryCache.delete(cacheKeyForYear(selectedYearId, selectedYearLabel));
        await fetchProfsForYear(selectedYearId, selectedYearLabel);
      }
      setShowAddExisting(false);
      setShowGlobalTake(false);
    } catch (e) {
      console.error(e);
      setPickErr("Action impossible.");
    } finally {
      setPickBusy(false);
    }
  };

  const addDraft = () => {
    setAssignErr("");
    if (!draft.section) return setAssignErr("Sélectionnez une section.");
    if (!draft.filiere_id) return setAssignErr("Sélectionnez une filière.");
    if (!draft.classe_id) return setAssignErr("Sélectionnez une classe.");
    const matList = draft.matieres_ids || [];
    if (matList.length === 0) return setAssignErr("Cochez au moins une matière.");

    if (draftList.some((d) => d.classe_id === draft.classe_id)) {
      return setAssignErr("Cette classe est déjà dans la liste d’affectations.");
    }

    setDraftList((prev) => [
      ...prev,
      {
        section: draft.section!,
        filiere_id: draft.filiere_id!,
        classe_id: draft.classe_id!,
        matieres_ids: [...matList],
      },
    ]);

    setDraft({ matieres_ids: [] });
  };

  const removeDraft = (classe_id: string) => {
    setDraftList((prev) => prev.filter((d) => d.classe_id !== classe_id));
  };

  const saveAssign = async () => {
    setAssignBusy(true);
    setAssignErr("");
    setAssignOk("");

    try {
      const year = anneeId || selectedYearId || activeAnneeId;
      if (!year) {
        setAssignBusy(false);
        return setAssignErr("Choisissez une année scolaire.");
      }

      if (editingClasseId) {
        setAssignBusy(false);
        return setAssignErr("Terminez l’édition de l’affectation en cours ou annulez-la.");
      }

      if (draftList.length === 0) {
        setAssignBusy(false);
        return setAssignErr("Ajoutez au moins une affectation.");
      }

      const map = new Map<
        string,
        { section: SectionKey; filiere_id: string; classe_id: string; matieres_ids: string[] }
      >();
      draftList.forEach((it) => map.set(it.classe_id, it));
      const dedup = Array.from(map.values());

      const classesPayload = dedup.map((it) => {
        const c = classesYear.find((x) => x.id === it.classe_id);
        const mats = (matieresByClassYear[it.classe_id] || []) as TMatiere[];
        const labels = it.matieres_ids
          .map((id) => mats.find((m) => m.id === id)?.libelle)
          .filter(Boolean) as string[];
        return {
          filiere_id: it.filiere_id,
          filiere_libelle: filiereByIdYear[it.filiere_id]?.libelle || "",
          classe_id: it.classe_id,
          classe_libelle: c?.libelle || it.classe_id,
          matieres_ids: it.matieres_ids,
          matieres_libelles: labels,
        };
      });

      const ref = doc(db, "affectations_professeurs", `${year}__${assignForDocId}`);
      const old = await getDoc(ref);
      await setDoc(
        ref,
        {
          annee_id: year,
          prof_doc_id: assignForDocId,
          classes: classesPayload,
          updatedAt: serverTimestamp(),
          ...(old.exists() ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );

      setAssignOk("Affectations enregistrées.");

      if (selectedYearId === year) {
        memoryCache.delete(cacheKeyForYear(selectedYearId, selectedYearLabel)); 
        await fetchProfsForYear(selectedYearId, selectedYearLabel);
      }
      if (assignForDocId) await loadAssignFor(year, assignForDocId);
    } catch (e) {
      console.error(e);
      setAssignErr("Enregistrement impossible.");
    } finally {
      setAssignBusy(false);
    }
  };

  /* ---------------------- Transfert (bouton par ligne) -------------- */
  const transferProfessorToSelectedYear = async (profId: string) => {
    if (!selectedYearId) return ko("Aucune année sélectionnée.");
    try {
      const ref = doc(db, "affectations_professeurs", `${selectedYearId}__${profId}`);
      const old = await getDoc(ref);
      await setDoc(
        ref,
        {
          annee_id: selectedYearId,
          prof_doc_id: profId,
          classes: [], // transfert → vide initialement
          updatedAt: serverTimestamp(),
          ...(old.exists() ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );
      ok("Professeur transféré sur l’année sélectionnée.");
      memoryCache.delete(cacheKeyForYear(selectedYearId, selectedYearLabel));
      await fetchProfsForYear(selectedYearId, selectedYearLabel);
    } catch (e) {
      console.error(e);
      ko("Transfert impossible.");
    }
  };

  /* ------------------- Retirer (année sélectionnée) ------------------ */
  const removeProfessorFromSelectedYear = async (profId: string) => {
    if (!selectedYearId) return ko("Aucune année sélectionnée.");
    setRemovingFromYear(true);
    try {
      // 1) Supprimer l’affectation de l’année sélectionnée
      await deleteDoc(doc(db, "affectations_professeurs", `${selectedYearId}__${profId}`));

      // 2) Neutraliser l’appartenance par métadonnées si elles pointent sur cette année
      const uref = doc(db, "users", profId);
      const usnap = await getDoc(uref);
      if (usnap.exists()) {
        const v = usnap.data() as any;
        const idMatches = String(v?.academic_year_id || "") === selectedYearId;
        const labelMatches = String(v?.academic_year_label || "") === selectedYearLabel;
        if (idMatches || labelMatches) {
          await setDoc(
            uref,
            {
              academic_year_id: "__none__",
              academic_year_label: "__none__",
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      ok("Professeur retiré de l’année sélectionnée.");
      memoryCache.delete(cacheKeyForYear(selectedYearId, selectedYearLabel)); // NEW
      await fetchProfsForYear(selectedYearId, selectedYearLabel);
    } catch (e) {
      console.error(e);
      ko("Retrait impossible.");
    } finally {
      setRemovingFromYear(false);
    }
  };

  const openTransfer = (profId: string) => {
    setTransferDocId(profId);
    // pré-sélectionne l'année actuellement sélectionnée (sinon l'année active)
    setTransferYearId(selectedYearId || activeAnneeId || "");
    setTransferErr("");
    setShowTransfer(true);
  };

  const doTransfer = async () => {
    if (!transferDocId) return;
    if (!transferYearId) {
      setTransferErr("Choisissez une année scolaire.");
      return;
    }
    setTransferBusy(true);
    setTransferErr("");
    try {
      const ref = doc(db, "affectations_professeurs", `${transferYearId}__${transferDocId}`);
      const old = await getDoc(ref);

      // ⚠️ Par défaut on crée l’affectation vide (même logique qu’avant)
      await setDoc(
        ref,
        {
          annee_id: transferYearId,
          prof_doc_id: transferDocId,
          classes: [], // si tu veux copier les classes d'une année source, voir le commentaire ci-dessous
          updatedAt: serverTimestamp(),
          ...(old.exists() ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true }
      );

      /* 
      // 👉 Variante si tu veux COPIER les classes depuis l'année actuellement sélectionnée :
      // const src = await getDoc(doc(db, "affectations_professeurs", `${selectedYearId}__${transferDocId}`));
      // const classesToCopy = src.exists() ? (src.data()?.classes || []) : [];
      // await setDoc(ref, { ...ci-dessus, classes: classesToCopy }, { merge: true });
      */

      setShowTransfer(false);
      setTransferDocId(null);
      ok("Professeur transféré.");
      memoryCache.delete(cacheKeyForYear(selectedYearId, selectedYearLabel)); // NEW
      await fetchProfsForYear(selectedYearId, selectedYearLabel);
    } catch (e) {
      console.error(e);
      setTransferErr("Transfert impossible.");
    } finally {
      setTransferBusy(false);
    }
  };

  // --- Picker (prendre des profs) : commun aux 2 modales ---
  const [showAddExisting, setShowAddExisting] = useState(false);   // ajouter existants -> année sélectionnée
  const [showGlobalTake, setShowGlobalTake] = useState(false);     // prendre global -> année choisie
  const [pickYearId, setPickYearId] = useState<string>("");        // année destination
  const [pickSearch, setPickSearch] = useState("");
  const [pickBusy, setPickBusy] = useState(false);
  const [pickErr, setPickErr] = useState("");
  const [pickAllProfs, setPickAllProfs] = useState<TUserRow[]>([]);           // tous les profs (global)
  const [pickTakenSet, setPickTakenSet] = useState<Set<string>>(new Set());   // prof_doc_id déjà pris pour l’année
  const [pickSelected, setPickSelected] = useState<Set<string>>(new Set());   // sélection courante

  const pickFiltered = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    const rows = q
      ? pickAllProfs.filter(u =>
          `${u.nom} ${u.prenom} ${u.specialite || ""}`.toLowerCase().includes(q)
        )
      : pickAllProfs;
    return rows;
  }, [pickAllProfs, pickSearch]);



  /* ---------------------- Render ----------------------------------- */
  return (
    <div className="container-fluid py-3">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 className="mb-1">Professeurs</h3>
          <div className="text-muted">
            Gestion des comptes et affectations —{" "}
            <span className="badge bg-light text-dark">Année : {selectedYearLabel || "—"}</span>
          </div>
        </div>
        <div className="position-relative" ref={addMenuRef}>
          <button
            className="btn btn-primary"
            style={{ minWidth: 220 }}
            onClick={() => setShowAddMenu(s => !s)}
            aria-expanded={showAddMenu}
            aria-haspopup="true"
          >
            <i className="bi bi-plus-lg me-2" />
            Ajouter
          </button>

          {/* Panneau vertical */}
          {showAddMenu && (
            <div
              className="card shadow-lg position-absolute end-0 mt-2"
              style={{ width: 360, zIndex: 10 }}
              role="menu"
            >
              <div className="card-header bg-white py-2">
                <div className="d-flex align-items-center justify-content-between">
                  <strong>Ajouter</strong>
                  <span className="badge bg-light text-dark">
                    Année : {selectedYearLabel || "—"}
                  </span>
                </div>
              </div>

              <div className="list-group list-group-flush">
                {/* Créer un nouveau professeur */}
                <button
                  className="list-group-item list-group-item-action py-3"
                  onClick={() => { setShowCreate(true); setShowAddMenu(false); }}
                  role="menuitem"
                >
                  <div className="d-flex">
                    <div className="me-3">
                      <i className="bi bi-person-plus fs-5" />
                    </div>
                    <div>
                      <div className="fw-semibold">Créer un professeur</div>
                      <div className="small text-muted">Ouvrir le formulaire de création</div>
                    </div>
                  </div>
                </button>

                {/* Ajouter des existants (année courante) */}
                <button
                  className="list-group-item list-group-item-action py-3"
                  onClick={() => { openAddExisting(); setShowAddMenu(false); }}
                  disabled={!selectedYearId}
                  role="menuitem"
                >
                  <div className="d-flex">
                    <div className="me-3">
                      <i className="bi bi-people fs-5" />
                    </div>
                    <div>
                      <div className="fw-semibold">
                        Ajouter des professeurs existants
                        {selectedYearLabel ? (
                          <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2">
                            {selectedYearLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="small text-muted">
                        Sélection depuis la base puis ajout à l’année courante
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white border-0 position-sticky top-0" style={{ zIndex: 5 }}>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 className="mb-0 fw-semibold">
              <i className="bi bi-people me-2" />
              Liste des professeurs {selectedYearLabel ? `— ${selectedYearLabel}` : ""}
            </h5>
            <div className="d-flex gap-2 align-items-center">
              <div className="input-group input-group-sm" style={{ minWidth: 320 }}>
                <span className="input-group-text bg-light border-0">
                  <i className="bi bi-search" />
                </span>
                <input
                  className="form-control border-0"
                  placeholder="Rechercher"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <button className="btn btn-primary" type="button" title="Rechercher">
                  <i className="bi bi-search me-1" /> Rechercher
                </button>
              </div>
              <span className="badge bg-light text-dark">
                {loading && all.length === 0 ? "Chargement…" : `${filtered.length} résultat(s)`}
              </span>
            </div>
          </div>
        </div>
        <div className="card-body p-0">
          {loading && all.length === 0 ? (
            <div className="text-center py-5">
              <div className="spinner-border" role="status" />
              <div className="text-muted mt-2">Chargement…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-person-exclamation" style={{ fontSize: 32 }} />
              <div className="mt-2">Aucun professeur pour l’année {selectedYearLabel || "—"}.</div>
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 4 }}>
                    <tr>
                      <th className="text-nowrap">Nom</th>
                      <th className="text-nowrap">Prénom</th>
                      <th className="text-nowrap">Spécialité</th>
                      <th className="text-end text-nowrap" style={{ width: 520 }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((u) => (
                      <tr key={u.docId}>
                        <td className="fw-semibold">{u.nom}</td>
                        <td>{u.prenom}</td>
                        <td>
                          {u.specialite ? (
                            <span className="badge bg-secondary-subtle text-secondary-emphasis">
                              {u.specialite}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="text-end">
                          <div className="btn-toolbar justify-content-end" role="toolbar">
                            <div className="btn-group me-2" role="group">
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                title="Détails"
                                onClick={() => openDetails(u.docId)}
                              >
                                <i className="bi bi-eye" />
                              </button>
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                title="Modifier"
                                onClick={() => setEditDocId(u.docId)}
                              >
                                <i className="bi bi-pencil" />
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                title="Supprimer (définitif)"
                                onClick={() => askDelete(u.docId)}
                              >
                                <i className="bi bi-trash" />
                              </button>
                            </div>
                            {/* ➖ Retirer de l’année sélectionnée */}
                            <button
                              className="btn btn-sm btn-outline-danger me-2"
                              title={`Retirer de ${selectedYearLabel || "l’année sélectionnée"}`}
                              onClick={() => removeProfessorFromSelectedYear(u.docId)}
                              disabled={!selectedYearId || removingFromYear}
                            >
                              <i className="bi bi-person-dash me-1" />
                              Retirer (année)
                            </button>

                            {/* Assigner */}
                            <button className="btn btn-sm btn-primary" onClick={() => openAssign(u.docId)}>
                              <i className="bi bi-diagram-3 me-1" />
                              Assigner
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination (client) */}
              <div className="p-3 d-flex justify-content-between align-items-center">
                <div className="small text-muted">
                  Page {page} / {totalPages} — {filtered.length} prof(s), {PER_PAGE} par page
                </div>
                <div className="btn-group">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <i className="bi bi-chevron-left" /> Précédent
                  </button>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Suivant <i className="bi bi-chevron-right" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Modales ---------- */}

      {/* Créer */}
      {showCreate && (
        <ModalPortal>
        <>
          <ProfesseurFormTyped
            mode="create"
            roles={roles}
            onClose={() => setShowCreate(false)}
            onSaved={async () => {
              setShowCreate(false);
              // NEW: invalide le cache de l'année courante
              memoryCache.delete(cacheKeyForYear(selectedYearId, selectedYearLabel)); // NEW
              await fetchProfsForYear(selectedYearId, selectedYearLabel);
            }}

          />
          <div className="modal-backdrop fade show" onClick={() => setShowCreate(false)} />
        </>
        </ModalPortal>
      )}

      {/* Modifier */}
      {editDocId && (
        <ModalPortal>
        <>
          <ProfesseurFormTyped
            mode="edit"
            docId={editDocId}
            roles={roles}
            onClose={() => setEditDocId(null)}
            onSaved={async () => {
              setEditDocId(null);
              // NEW
              memoryCache.delete(cacheKeyForYear(selectedYearId, selectedYearLabel)); // NEW
              await fetchProfsForYear(selectedYearId, selectedYearLabel);
            }}

          />
          <div className="modal-backdrop fade show" onClick={() => setEditDocId(null)} />
        </>
        </ModalPortal>
      )}

      {/* Détails — affiche TOUT */}
      {showDetails && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-eye me-2" />
                    Détails du professeur
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowDetails(false)} />
                </div>
                <div className="modal-body">
                  {detailsLoading ? (
                    <div className="text-center py-4">
                      <div className="spinner-border" role="status" />
                      <div className="text-muted mt-2">Chargement…</div>
                    </div>
                  ) : !details ? (
                    <div className="alert alert-warning">Professeur introuvable.</div>
                  ) : (
                    <>
                      <h6 className="fw-bold">Informations de base</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-3">
                          <strong>Nom & Prénom</strong>
                          <div>
                            {details.nom} {details.prenom}
                          </div>
                        </div>
                        <div className="col-md-3">
                          <strong>Email</strong>
                          <div>{details.email || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Téléphone</strong>
                          <div>{details.telephone || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Login</strong>
                          <div>{details.login || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Rôle</strong>
                          <div>{details.role_libelle || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Spécialité</strong>
                          <div>{details.specialite || "—"}</div>
                        </div>
                        <div className="col-md-6">
                          <strong>Adresse</strong>
                          <div>{details.adresse || "—"}</div>
                        </div>
                        {details.specialite_detaillee && (
                          <div className="col-12">
                            <strong>Spécialité détaillée</strong>
                            <div>{details.specialite_detaillee}</div>
                          </div>
                        )}
                      </div>

                      <h6 className="fw-bold mt-3">Identité</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-3">
                          <strong>Sexe</strong>
                          <div>{details.sexe || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Date de naissance</strong>
                          <div>{details.date_naissance || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Lieu de naissance</strong>
                          <div>{details.lieu_naissance || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Nationalité</strong>
                          <div>{details.nationalite || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Situation matrimoniale</strong>
                          <div>{details.situation_matrimoniale || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>CNI / Passeport</strong>
                          <div>{details.cni_passeport || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Statut & Fonction</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-3">
                          <strong>Statut</strong>
                          <div>{details.statut || "—"}</div>
                        </div>
                        <div className="col-md-9">
                          <strong>Fonction principale</strong>
                          <div>{details.fonction_principale || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Disponibilités</h6>
                      <hr className="mt-1" />
                      <div className="small">
                        {details.disponibilites?.length ? (
                          <ul className="mb-2">
                            {details.disponibilites.map((d, i) => (
                              <li key={i}>
                                {d.jour} — {d.debut} → {d.fin}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </div>

                      <h6 className="fw-bold mt-3">Éléments constitutifs & Expérience</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-6">
                          <strong>Éléments constitutifs</strong>
                          <div>
                            {details.elements_constitutifs?.length
                              ? details.elements_constitutifs.join(", ")
                              : "—"}
                          </div>
                        </div>
                        <div className="col-md-6">
                          <strong>Exp. enseignement</strong>
                          <div>{details.experience_enseignement?.annees ?? 0} année(s)</div>
                          <div className="small text-muted">
                            {(details.experience_enseignement?.etablissements || []).join(", ") || "—"}
                          </div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Diplômes</h6>
                      <hr className="mt-1" />
                      <div className="small">
                        {details.diplomes?.length ? (
                          <ul className="mb-2">
                            {details.diplomes.map((d, i) => (
                              <li key={i}>
                                <b>{d.intitule}</b> — {d.niveau} — {d.annee} — {d.etablissement}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </div>

                      <h6 className="fw-bold mt-3">Niveaux & Compétences</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-4">
                          <strong>Niveaux enseignement</strong>
                          <div>
                            {details.niveaux_enseignement?.length
                              ? details.niveaux_enseignement.join(", ")
                              : "—"}
                          </div>
                        </div>
                        <div className="col-md-4">
                          <strong>Outils</strong>
                          <div>
                            {details.competences?.outils?.length ? details.competences.outils.join(", ") : "—"}
                          </div>
                        </div>
                        <div className="col-md-4">
                          <strong>Langues</strong>
                          <div>
                            {details.competences?.langues?.length ? details.competences.langues.join(", ") : "—"}
                          </div>
                        </div>
                        <div className="col-12 mt-2">
                          <strong>Publications</strong>
                          <div className="small">
                            {details.competences?.publications?.length
                              ? details.competences.publications.join(", ")
                              : "—"}
                          </div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Documents & RIB</h6>
                      <hr className="mt-1" />
                      <div className="small">
                        <div>
                          CV :{" "}
                          {details.documents?.cv ? (
                            <a href={details.documents.cv} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div>
                          Diplômes :{" "}
                          {details.documents?.diplomes ? (
                            <a href={details.documents.diplomes} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div>
                          Pièce d’identité :{" "}
                          {details.documents?.piece_identite ? (
                            <a href={details.documents.piece_identite} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div>
                          RIB :{" "}
                          {details.documents?.rib ? (
                            <a href={details.documents.rib} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div className="mt-2">
                          <strong>RIB (texte)</strong> : {details.rib || "—"}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setShowDetails(false)}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowDetails(false)} />
        </>
        </ModalPortal>
      )}

      {/* Assigner (Section → Filière → Classe → Matières) */}
      {showAssign && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-diagram-3 me-2" />
                    Assigner classes & matières (par année)
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowAssign(false)} />
                </div>
                <div className="modal-body">
                  {assignErr && <div className="alert alert-danger">{assignErr}</div>}
                  {assignOk && <div className="alert alert-success">{assignOk}</div>}

                  {/* Année de travail de la modale */}
                  <div className="mb-3">
                    <label className="form-label">Année scolaire</label>
                    <div className="d-flex gap-2">
                      <select
                        className="form-select"
                        style={{ maxWidth: 360 }}
                        value={anneeId}
                        onChange={async (e) => {
                          const y = e.target.value;
                          setAnneeId(y);
                          if (assignForDocId) {
                            await loadAssignFor(y, assignForDocId);
                            await loadProfessorSchedule(y, assignForDocId);
                          }
                          setEditingClasseId(null);
                          setDraft({ matieres_ids: [] });
                        }}
                      >
                        {annees.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.libelle} {a.active ? "(en cours)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Sélecteurs en cascade */}
                  <div className="row g-3">
                    <div className="col-md-3">
                      <label className="form-label">Section</label>
                      <select
                        className="form-select"
                        value={draft.section || ""}
                        onChange={(e) => {
                          const s = (e.target.value || "") as SectionKey | "";
                          setDraft({
                            section: (s || undefined) as SectionKey | undefined,
                            filiere_id: undefined,
                            classe_id: undefined,
                            matieres_ids: [],
                          });
                        }}
                      >
                        <option value="">—</option>
                        <option value="Gestion">Gestion</option>
                        <option value="Informatique">Informatique</option>
                      </select>
                    </div>

                    <div className="col-md-5">
                      <label className="form-label">Filière</label>
                      <select
                        className="form-select"
                        value={draft.filiere_id || ""}
                        onChange={(e) => {
                          const fid = e.target.value || "";
                          setDraft((d) => ({
                            ...d,
                            filiere_id: fid || undefined,
                            classe_id: undefined,
                            matieres_ids: [],
                          }));
                        }}
                        disabled={!draft.section}
                      >
                        <option value="">—</option>
                        {filieresYear
                          .filter((f) => f.section === draft.section)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.libelle}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label">Classe</label>
                      <select
                        className="form-select"
                        value={draft.classe_id || ""}
                        onChange={(e) => {
                          const cid = e.target.value || "";
                          setDraft((d) => ({ ...d, classe_id: cid || undefined, matieres_ids: [] }));
                        }}
                        disabled={!draft.filiere_id}
                      >
                        <option value="">—</option>
                        {(draft.filiere_id ? classesByFiliereYear[draft.filiere_id] || [] : []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.libelle}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Matières de la classe */}
                  {draft.classe_id && (
                    <div className="mt-3">
                      <div className="text-muted small mb-1">Matières de la classe</div>
                      <div className="row">
                        {(matieresByClassYear[draft.classe_id] || []).map((m) => {
                          const checked = draft.matieres_ids.includes(m.id);
                          return (
                            <div key={m.id} className="col-6 col-lg-4">
                              <div className="form-check">
                                <input
                                  id={`mat-${m.id}`}
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const on = e.target.checked;
                                    setDraft((d) => {
                                      const set = new Set(d.matieres_ids);
                                      if (on) set.add(m.id);
                                      else set.delete(m.id);
                                      return { ...d, matieres_ids: Array.from(set) };
                                    });
                                  }}
                                />
                                <label className="form-check-label" htmlFor={`mat-${m.id}`}>
                                  {m.libelle}
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-3 d-flex gap-2">
                        {!editingClasseId ? (
                          <button className="btn btn-outline-primary" onClick={addDraft}>
                            <i className="bi bi-plus-lg me-1" />
                            Ajouter cette affectation à la liste
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn btn-primary"
                              onClick={() => {
                                setAssignErr("");
                                if (!draft.section || !draft.filiere_id || !draft.classe_id) {
                                  return setAssignErr("Section, filière et classe sont requis.");
                                }
                                setDraftList((prev) =>
                                  prev.map((x) =>
                                    x.classe_id === editingClasseId
                                      ? {
                                          section: draft.section!,
                                          filiere_id: draft.filiere_id!,
                                          classe_id: draft.classe_id!,
                                          matieres_ids: [...(draft.matieres_ids || [])],
                                        }
                                      : x
                                  )
                                );
                                setEditingClasseId(null);
                                setDraft({ matieres_ids: [] });
                              }}
                            >
                              <i className="bi bi-check2 me-1" /> Mettre à jour
                            </button>
                            <button
                              className="btn btn-outline-secondary"
                              onClick={() => {
                                setEditingClasseId(null);
                                setDraft({ matieres_ids: [] });
                              }}
                            >
                              Annuler
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Liste des affectations en cours */}
                  <hr className="my-3" />
                  <h6 className="fw-semibold">Affectations en attente d’enregistrement</h6>
                  {draftList.length === 0 ? (
                    <div className="text-muted">Aucune affectation pour l’instant.</div>
                  ) : (
                    <div className="table-responsive mt-2">
                      <table className="table table-sm align-middle">
                        <thead className="table-light">
                          <tr>
                            <th>Section</th>
                            <th>Filière</th>
                            <th>Classe</th>
                            <th>Matières</th>
                            <th className="text-end" style={{ width: 140 }}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {draftList.map((it) => {
                            const f = filiereByIdYear[it.filiere_id];
                            const c = classesYear.find((x) => x.id === it.classe_id);
                            const mats = (matieresByClassYear[it.classe_id] || []) as TMatiere[];
                            const labels = it.matieres_ids
                              .map((id) => mats.find((m) => m.id === id)?.libelle)
                              .filter(Boolean)
                              .join(", ");
                            return (
                              <tr key={it.classe_id}>
                                <td>{it.section}</td>
                                <td>{f?.libelle || it.filiere_id}</td>
                                <td>{c?.libelle || it.classe_id}</td>
                                <td>{labels || <span className="text-muted">—</span>}</td>
                                <td className="text-end">
                                  <div className="btn-group btn-group-sm">
                                    <button
                                      className="btn btn-outline-secondary"
                                      title="Modifier"
                                      onClick={() => {
                                        setAssignErr("");
                                        setEditingClasseId(it.classe_id);
                                        setDraft({
                                          section: it.section,
                                          filiere_id: it.filiere_id,
                                          classe_id: it.classe_id,
                                          matieres_ids: [...it.matieres_ids],
                                        });
                                      }}
                                    >
                                      <i className="bi bi-pencil" />
                                    </button>
                                    <button
                                      className="btn btn-outline-danger"
                                      title="Supprimer"
                                      onClick={() => {
                                        if (editingClasseId === it.classe_id) {
                                          setEditingClasseId(null);
                                          setDraft({ matieres_ids: [] });
                                        }
                                        removeDraft(it.classe_id);
                                      }}
                                    >
                                      <i className="bi bi-x-lg" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* ------- Emploi du temps du professeur ------- */}
                  <hr className="my-3" />
                  <h6 className="fw-semibold">
                    Emploi du temps du professeur — {annees.find(a => a.id === anneeId)?.libelle || ""}
                  </h6>

                  {edtLoading ? (
                    <div className="text-muted">
                      <span className="spinner-border spinner-border-sm me-2" />
                      Chargement de l’emploi du temps…
                    </div>
                  ) : edtRows.length === 0 ? (
                    <div className="text-muted">Aucun créneau trouvé pour ce professeur sur cette année.</div>
                  ) : (
                    <div className="table-responsive mt-2">
                      <table className="table table-sm align-middle">
                        <thead className="table-light">
                          <tr>
                            <th>Jour</th>
                            <th>Classe</th>
                            <th>Matière</th>
                            <th>Salle</th>
                            <th>Créneau</th>
                          </tr>
                        </thead>
                        <tbody>
                          {edtRows.map((r, i) => (
                            <tr key={i}>
                              <td>{dayLabel(r.day)}</td>
                              <td>{r.class_libelle}</td>
                              <td>{r.matiere_libelle || <span className="text-muted">—</span>}</td>
                              <td>{r.salle || <span className="text-muted">—</span>}</td>
                              <td>{r.start} – {r.end}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setShowAssign(false)} disabled={assignBusy}>
                    Fermer
                  </button>
                  <button className="btn btn-primary" onClick={saveAssign} disabled={assignBusy}>
                    {assignBusy ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Enregistrement…
                      </>
                    ) : (
                      "Enregistrer l’affectation"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowAssign(false)} />
        </>
        </ModalPortal>
      )}

      {/* Supprimer — modale DANGER (définitif, toutes années) */}
      {showDelete && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-danger">
                <div className="modal-header bg-danger text-white">
                  <h5 className="modal-title">
                    <i className="bi bi-exclamation-triangle me-2" />
                    Supprimer le compte professeur
                  </h5>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    aria-label="Close"
                    onClick={() => setShowDelete(false)}
                  />
                </div>

                <div className="modal-body">
                  {deleteError && <div className="alert alert-danger mb-3">{deleteError}</div>}
                  <p className="mb-2">
                    Vous êtes sur le point de <strong>supprimer définitivement</strong> le compte du professeur{" "}
                    <strong>{deleteTarget?.prenom} {deleteTarget?.nom}</strong>.
                  </p>
                  <p className="mb-0">Cette action est irréversible et le retirera de <em>toutes</em> les années.</p>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setShowDelete(false)} disabled={deleting}>
                    Annuler
                  </button>
                  <button className="btn btn-danger" onClick={doDelete} disabled={deleting}>
                    {deleting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Suppression…
                      </>
                    ) : (
                      "Supprimer définitivement"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowDelete(false)} />
        </>
        </ModalPortal>
      )}

      {showTransfer && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-arrow-left-right me-2" />
                    Transférer le professeur vers une année
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowTransfer(false)} />
                </div>

                <div className="modal-body">
                  {transferErr && <div className="alert alert-danger">{transferErr}</div>}

                  <label className="form-label">Année scolaire destination</label>
                  <select
                    className="form-select"
                    value={transferYearId}
                    onChange={(e) => setTransferYearId(e.target.value)}
                  >
                    <option value="">— choisir —</option>
                    {annees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.libelle} {a.active ? "(en cours)" : ""}
                      </option>
                    ))}
                  </select>

                  <div className="form-text mt-2">
                    Le transfert crée (ou met à jour) l’affectation du professeur sur l’année choisie.
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setShowTransfer(false)} disabled={transferBusy}>
                    Annuler
                  </button>
                  <button className="btn btn-primary" onClick={doTransfer} disabled={transferBusy || !transferYearId}>
                    {transferBusy ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Transfert…
                      </>
                    ) : (
                      "Transférer"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowTransfer(false)} />
        </>
        </ModalPortal>
      )}

      {showAddExisting && (
        <ModalPortal>
          <>
            <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
              <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">
                      <i className="bi bi-person-check me-2" />
                      Ajouter des professeurs existants — {selectedYearLabel || "année en cours"}
                    </h5>
                    <button type="button" className="btn-close" onClick={() => setShowAddExisting(false)} />
                  </div>
                  <div className="modal-body">
                    {pickErr && <div className="alert alert-danger">{pickErr}</div>}

                    {/* Recherche */}
                    <div className="input-group mb-3">
                      <span className="input-group-text bg-light border-0"><i className="bi bi-search" /></span>
                      <input
                        className="form-control border-0"
                        placeholder="Rechercher un professeur…"
                        value={pickSearch}
                        onChange={(e) => setPickSearch(e.target.value)}
                      />
                      <button className="btn btn-outline-secondary" onClick={selectAllVisible}>
                        Tout sélectionner (liste)
                      </button>
                      <button className="btn btn-outline-secondary" onClick={clearSelection}>
                        Vider la sélection
                      </button>
                    </div>

                    {/* Liste */}
                    <div className="table-responsive" style={{ maxHeight: 420 }}>
                      <table className="table table-sm align-middle">
                        <thead className="table-light">
                          <tr>
                            <th style={{width: 40}}></th>
                            <th>Nom</th>
                            <th>Prénom</th>
                            <th>Spécialité</th>
                            <th style={{width: 120}}>Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pickFiltered.map((u) => {
                            const taken = pickTakenSet.has(u.docId);
                            const checked = pickSelected.has(u.docId);
                            return (
                              <tr key={u.docId} className={taken ? "text-muted" : ""} style={taken ? {opacity: 0.6} : {}}>
                                <td>
                                  <input
                                    type="checkbox"
                                    className="form-check-input"
                                    disabled={taken}
                                    checked={checked}
                                    onChange={() => togglePick(u.docId)}
                                  />
                                </td>
                                <td className="fw-semibold">{u.nom}</td>
                                <td>{u.prenom}</td>
                                <td>{u.specialite || "—"}</td>
                                <td>
                                  {taken ? <span className="badge bg-secondary">Pris</span> : <span className="text-success">Disponible</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="form-text mt-2">
                      Les lignes “<b>Pris</b>” sont désactivées : le professeur fait déjà partie de la liste de cette année.
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-outline-secondary" onClick={() => setShowAddExisting(false)} disabled={pickBusy}>
                      Annuler
                    </button>
                    <button className="btn btn-primary" onClick={doTakeSelectedToYear} disabled={pickBusy}>
                      {pickBusy ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" />
                          Traitement…
                        </>
                      ) : (
                        "Prendre pour l’année"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={() => setShowAddExisting(false)} />
          </>
        </ModalPortal>
      )}

      {showGlobalTake && (
        <ModalPortal>
          <>
            <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
              <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">
                      <i className="bi bi-people me-2" />
                      Prendre des professeurs (toutes années)
                    </h5>
                    <button type="button" className="btn-close" onClick={() => setShowGlobalTake(false)} />
                  </div>
                  <div className="modal-body">
                    {pickErr && <div className="alert alert-danger">{pickErr}</div>}

                    {/* Destination */}
                    <div className="row g-2 align-items-end mb-3">
                      <div className="col-md-6">
                        <label className="form-label">Année scolaire de destination</label>
                        <select
                          className="form-select"
                          value={pickYearId}
                          onChange={(e) => changePickYear(e.target.value)}
                        >
                          {annees.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.libelle} {a.active ? "(en cours)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Recherche</label>
                        <div className="input-group">
                          <span className="input-group-text bg-light border-0"><i className="bi bi-search" /></span>
                          <input
                            className="form-control border-0"
                            placeholder="Rechercher un professeur…"
                            value={pickSearch}
                            onChange={(e) => setPickSearch(e.target.value)}
                          />
                          <button className="btn btn-outline-secondary" onClick={selectAllVisible}>
                            Tout sélectionner (liste)
                          </button>
                          <button className="btn btn-outline-secondary" onClick={clearSelection}>
                            Vider
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Liste */}
                    <div className="table-responsive" style={{ maxHeight: 420 }}>
                      <table className="table table-sm align-middle">
                        <thead className="table-light">
                          <tr>
                            <th style={{width: 40}}></th>
                            <th>Nom</th>
                            <th>Prénom</th>
                            <th>Spécialité</th>
                            <th style={{width: 120}}>Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pickFiltered.map((u) => {
                            const taken = pickTakenSet.has(u.docId);
                            const checked = pickSelected.has(u.docId);
                            return (
                              <tr key={u.docId} className={taken ? "text-muted" : ""} style={taken ? {opacity: 0.6} : {}}>
                                <td>
                                  <input
                                    type="checkbox"
                                    className="form-check-input"
                                    disabled={taken}
                                    checked={checked}
                                    onChange={() => togglePick(u.docId)}
                                  />
                                </td>
                                <td className="fw-semibold">{u.nom}</td>
                                <td>{u.prenom}</td>
                                <td>{u.specialite || "—"}</td>
                                <td>
                                  {taken ? <span className="badge bg-secondary">Pris</span> : <span className="text-success">Disponible</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="form-text mt-2">
                      Les lignes “<b>Pris</b>” sont désactivées pour l’année de destination choisie.
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-outline-secondary" onClick={() => setShowGlobalTake(false)} disabled={pickBusy}>
                      Fermer
                    </button>
                    <button className="btn btn-primary" onClick={doTakeSelectedToYear} disabled={pickBusy}>
                      {pickBusy ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" />
                          Traitement…
                        </>
                      ) : (
                        "Prendre pour l’année"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={() => setShowGlobalTake(false)} />
          </>
        </ModalPortal>
      )}

      {/* Toasts */}
      <Toast message={toast} type="success" show={okShow} onClose={() => setOkShow(false)} />
      <Toast message={toast} type="error" show={errShow} onClose={() => setErrShow(false)} />
      <style jsx global>{`
        .modal-backdrop { z-index: 1990 !important; }
        .modal          { z-index: 2000 !important; }
        .list-group-item:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

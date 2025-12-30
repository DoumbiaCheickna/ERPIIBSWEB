//src/app/directeur-des-etudes/components/EtudiantsPage.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, query, where, orderBy as fbOrderBy,
  addDoc, doc, updateDoc, deleteDoc, getDoc
} from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useAcademicYear } from '../context/AcademicYearContext';
import Toast from '../../admin/components/ui/Toast';
import StudentForm from '../../admin/pages/users/etudiantForm';
import styles from "./Filiere.module.css";
import ModalPortal from "./ModalPortal";

/* ========================= Types ========================= */

type SectionKey = 'Gestion' | 'Informatique';

type TFiliere = {
  id: string;
  libelle: string;
  section: SectionKey;
  academic_year_id: string;
};

type TClasse = {
  id: string;
  filiere_id: string;
  filiere_libelle: string;
  niveau_id: string;
  niveau_libelle: string;
  libelle: string;
  academic_year_id: string;
};

type TParcoursEntry = { annee: string; classe: string; class_id: string | null };
type TNextAssignment = {
  year_id: string;        // ex: "2025-2026"
  year_label: string;     // ex: "2025-2026"
  class_id: string;
  class_label: string;
  effective_start?: string; // "YYYY-MM-DD" (date_debut de l'année ciblée)
  created_at: number;       // Date.now()
};

type TUser = {
  id: string; // = uid si créé via Auth
  prenom: string;
  nom: string;
  email?: string;
  telephone?: string;
  matricule?: string;
  classe_id?: string | null;
  classe?: string;
  classe2_id?: string | null;
  classe2?: string;
  academic_year_id?: string | null; // ID (clé)
  annee_academique?: string;        // libellé
  parcours?: TParcoursEntry[];
  parcours_keys?: string[]; // ex: ["<yearId>__<classId>"]

  // Tous les autres champs possibles (détails)
  login?: string;
  role_id?: string;
  role_libelle?: string;
  sexe?: string;
  date_naissance?: string;
  lieu_naissance?: string;
  nationalite?: string;
  cni_passeport?: string;
  adresse?: string;
  situation_matrimoniale?: string;
  nombre_enfants?: number;
  programme?: string;
  niveau_id?: string;
  filiere_id?: string;
  type_inscription?: string;
  dernier_etablissement?: string;

  diplome_obtenu?: { serie?: string; annee_obtention?: string; mention?: string };
  boursier?: 'oui' | 'non';
  bourse_fournisseur?: string | null;

  parents?: {
    pere?: { prenom?: string; nom?: string; profession?: string; telephone?: string };
    mere?: { prenom?: string; nom?: string; profession?: string; telephone?: string };
    contact_urgence?: { relation?: string; lien_autre?: string; adresse?: string; telephone?: string };
  };

  dossier_admin?: {
    nouveau_L1?: { bac_legalise?: boolean; piece_identite?: boolean; frais_inscription_ok?: ''|'oui'|'non'; engagement_reglement?: boolean };
    nouveau_L2_L3?: { bac_legalise?: boolean; releves_notes_anterieurs?: boolean; piece_identite?: boolean; frais_inscription_ok?: ''|'oui'|'non'; engagement_reglement?: boolean };
    ancien_L2_L3?: { dernier_releve_notes?: boolean; frais_inscription_ok?: ''|'oui'|'non' };
  };

  medical?: { groupe_sanguin?: string; allergies?: string; maladies?: string; handicap?: string };
  transport?: { moyen?: string; temps_campus?: string };

  documents?: { copie_bac?: string|null; copie_cni?: string|null; releve_notes?: string|null };
  next_assignment?: TNextAssignment | null;
};

type TNiveauDoc = { id: string; libelle: string };
type TRole = { id: string; libelle: string };
type TPart = { id: string; libelle: string };

/* ========================= Helpers ========================= */

const keyForParcours = (yearId: string, classId: string) => `${yearId}__${classId}`;
const clsx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
const onlyDigits = (s: string) => s.replace(/\D/g, '');
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;




// NEW: cache mémoire simple (par page/onglet)
const memoryCache = new Map<string, unknown>();

const cacheGet = <T=any>(key: string): T | undefined =>
  memoryCache.get(key) as T | undefined;

const cacheSet = (key: string, value: unknown) =>
  memoryCache.set(key, value);

const cacheDel = (key: string) => memoryCache.delete(key);

// Optionnel: invalider par préfixe (utile après mutations)
const cacheDelPrefix = (prefix: string) => {
  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(prefix)) memoryCache.delete(k);
  }
};


/* ========================= Composant principal ========================= */

export default function EtudiantsPage() {
  const { selected, years } = useAcademicYear();
  const academicYearId = selected?.id || '';
  const academicYearLabel = selected?.label || '';

    // --- NEW: ajout étudiant global (depuis la barre du haut)
  const [showGlobalAdd, setShowGlobalAdd] = useState(false);
  const [globalFiliereId, setGlobalFiliereId] = useState<string>('');
  const [globalNiveauId, setGlobalNiveauId] = useState<string>('');
  const [globalBusy, setGlobalBusy] = useState(false);
  const [globalErr, setGlobalErr] = useState<string | null>(null);

  // classe(s) candidate(s) trouvée(s) pour (filiere, niveau, année)
  const [globalClassChoices, setGlobalClassChoices] = useState<TClasse[]>([]);
  const [globalClassId, setGlobalClassId] = useState<string>('');

  // Résoudre classes candidates selon filière + niveau + année
  const resolveClassesForFN = async (filiereId: string, niveauId: string, yearId: string) => {
    setGlobalErr(null);
    setGlobalBusy(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'classes'),
          where('academic_year_id', '==', yearId),
          where('filiere_id', '==', filiereId),
          where('niveau_id', '==', niveauId)
        )
      );
      const rows: TClasse[] = [];
      snap.forEach(d => {
        const v = d.data() as any;
        rows.push({
          id: d.id,
          filiere_id: String(v.filiere_id),
          filiere_libelle: String(v.filiere_libelle || ''),
          niveau_id: String(v.niveau_id || ''),
          niveau_libelle: String(v.niveau_libelle || ''),
          libelle: String(v.libelle || ''),
          academic_year_id: String(v.academic_year_id || '')
        });
      });
      rows.sort((a,b)=>a.libelle.localeCompare(b.libelle));
      setGlobalClassChoices(rows);
      setGlobalClassId(rows.length === 1 ? rows[0].id : '');
      if (rows.length === 0) setGlobalErr("Aucune classe trouvée pour ce couple (filière, niveau) dans cette année.");
    } catch(e) {
      console.error(e);
      setGlobalErr("Erreur lors de la résolution de la classe.");
    } finally {
      setGlobalBusy(false);
    }
  };

  // pour invalider les caches concernés après création globale
  const invalidateListsCache = () => {
    cacheDelPrefix(`classes:`); // sécuritaire, invalide les listes de classes
    cacheDelPrefix(`students:`); // sécuritaire, invalide les listes d’étudiants
    cacheDelPrefix(`filieres:`); // au cas où
  };


  // UI : section à gauche
  const [section, setSection] = useState<SectionKey>('Gestion');

  // Toasts (hors modales)
  const [toastMsg, setToastMsg] = useState('');
  const [okShow, setOkShow] = useState(false);
  const [errShow, setErrShow] = useState(false);
  const ok = (m: string) => { setToastMsg(m); setOkShow(true); };
  const ko = (m: string) => { setToastMsg(m); setErrShow(true); };

  // Données
  const [filieres, setFilieres] = useState<TFiliere[]>([]);
  const [selectedFiliere, setSelectedFiliere] = useState<TFiliere | null>(null);

  // Classes de la filière + pagination
  const [classes, setClasses] = useState<TClasse[]>([]);
  const [clsLoading, setClsLoading] = useState(false);
  const [clsPage, setClsPage] = useState(1);
  const PER_PAGE = 15;

  // Quand on ouvre une classe : vue étudiants
  const [openedClasse, setOpenedClasse] = useState<TClasse | null>(null);

  // Helpers de navigation pour le breadcrumb / onglets
  const goRoot = () => { setOpenedClasse(null); setSelectedFiliere(null); };
  const goSection = (s: SectionKey) => { setSection(s); setSelectedFiliere(null); setOpenedClasse(null); };
  const goFiliere = () => { setOpenedClasse(null); };


  // Pour formulaire d’ajout étudiant
  const [roles, setRoles] = useState<TRole[]>([]);
  const [niveaux, setNiveaux] = useState<TNiveauDoc[]>([]);
  const [filieresForForm, setFilieresForForm] = useState<{ id: string; libelle: string }[]>([]);
  const [partenaires, setPartenaires] = useState<TPart[]>([]);
  const [showAddStudent, setShowAddStudent] = useState(false);

  // Chargement filières (section + année)
  useEffect(() => {
    const load = async () => {
      const cacheKey = `filieres:${section}:${academicYearId}`;
      const cached = cacheGet<TFiliere[]>(cacheKey);
      if (cached) {
        setFilieres(cached);
        setSelectedFiliere(prev => (prev && cached.find(r => r.id === prev.id)) ? prev : null);
        setFilieresForForm(cached.map(r => ({ id: r.id, libelle: r.libelle })));
        return; // 👈 instantané si déjà en cache
      }

      try {
        const snap = await getDocs(
          query(
            collection(db, 'filieres'),
            where('section', '==', section),
            where('academic_year_id', '==', academicYearId)
          )
        );
        const rows: TFiliere[] = [];
        snap.forEach(d => {
          const v = d.data() as any;
          rows.push({
            id: d.id,
            libelle: String(v.libelle || ''),
            section: v.section as SectionKey,
            academic_year_id: String(v.academic_year_id || '')
          });
        });
        rows.sort((a,b)=>a.libelle.localeCompare(b.libelle));

        // write cache
        cacheSet(cacheKey, rows);

        setFilieres(rows);
        setSelectedFiliere(prev => (prev && rows.find(r => r.id === prev.id)) ? prev : null);
        setFilieresForForm(rows.map(r => ({ id: r.id, libelle: r.libelle })));
      } catch(e) {
        console.error(e);
        ko('Erreur de chargement des filières.');
      }
    };

    if (academicYearId) load();
    else { setFilieres([]); setSelectedFiliere(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, academicYearId]);


  // Charger classes de la filière sélectionnée
  useEffect(() => {
    const loadClasses = async () => {
      if (!selectedFiliere) { setClasses([]); return; }

      const cacheKey = `classes:${selectedFiliere.id}:${selectedFiliere.academic_year_id}`;
      const cached = cacheGet<TClasse[]>(cacheKey);
      if (cached) {
        setClasses(cached);
        setClsPage(1);
        return; // 👈 instantané si déjà en cache
      }

      setClsLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'classes'),
            where('filiere_id', '==', selectedFiliere.id),
            where('academic_year_id', '==', selectedFiliere.academic_year_id)
          )
        );
        const rows: TClasse[] = [];
        snap.forEach(d => {
          const v = d.data() as any;
          rows.push({
            id: d.id,
            filiere_id: String(v.filiere_id),
            filiere_libelle: String(v.filiere_libelle || ''),
            niveau_id: String(v.niveau_id || ''),
            niveau_libelle: String(v.niveau_libelle || ''),
            libelle: String(v.libelle || ''),
            academic_year_id: String(v.academic_year_id || '')
          });
        });
        rows.sort((a,b)=>a.libelle.localeCompare(b.libelle));

        // write cache
        cacheSet(cacheKey, rows);

        setClasses(rows);
        setClsPage(1);
      } catch (e) {
        console.error(e);
        ko('Erreur de chargement des classes.');
      } finally {
        setClsLoading(false);
      }
    };

    loadClasses();
  }, [selectedFiliere]);


  // Meta pour formulaire (rôles, niveaux, partenaires)
  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [snapRoles, snapNiv, snapPart] = await Promise.all([
          getDocs(collection(db, 'roles')),
          getDocs(query(collection(db, 'niveaux'), fbOrderBy('order', 'asc'))),
          getDocs(collection(db, 'partenaires'))
        ]);
        const r: TRole[] = []; snapRoles.forEach(d => r.push({ id: d.id, libelle: (d.data() as any).libelle || '' }));
        const n: TNiveauDoc[] = []; snapNiv.forEach(d => n.push({ id: d.id, libelle: (d.data() as any).libelle || d.id }));
        const p: TPart[] = []; snapPart.forEach(d => p.push({ id: d.id, libelle: (d.data() as any).libelle || '' }));
        setRoles(r); setNiveaux(n); setPartenaires(p);
      } catch (e) {
        console.error(e);
      }
    };
    loadMeta();
  }, []);

  const paginatedClasses = useMemo(() => {
    const start = (clsPage - 1) * PER_PAGE;
    return classes.slice(start, start + PER_PAGE);
  }, [classes, clsPage]);

  const totalPages = Math.max(1, Math.ceil(classes.length / PER_PAGE));

  /* ========================= Vue étudiants d'une classe ========================= */

  function ClasseStudentsView({ classe, onBack }: { classe: TClasse; onBack: () => void }) {
    const [students, setStudents] = useState<TUser[]>([]);
    const [loading, setLoading] = useState(true);

    // Réinscription
    const [reinscOpen, setReinscOpen] = useState<null | TUser>(null);
    const [reinscYear, setReinscYear] = useState<string>('');
    const [reinscClasses, setReinscClasses] = useState<TClasse[]>([]);
    const [reinscClassId, setReinscClassId] = useState<string>('');
    const [reinscBusy, setReinscBusy] = useState(false);
    const [reinscErr, setReinscErr] = useState<string | null>(null);

    const [dualOpen, setDualOpen] = useState<null | TUser>(null);
    const [dualClassId, setDualClassId] = useState('');
    const [dualErr, setDualErr] = useState<string|null>(null);
    const [dualBusy, setDualBusy] = useState(false);
    const [dualChoices, setDualChoices] = useState<TClasse[]>([]);


    // Modales Voir / Modifier / Supprimer
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<TUser | null>(null);

    // === Sélection multiple ===
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const toggleSelect = (id: string) =>
      setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const clearSelect = () => setSelectedIds(new Set());

    // === Réinscription groupée ===
    const [bulkReinscOpen, setBulkReinscOpen] = useState(false);
    const [bulkYear, setBulkYear] = useState('');
    const [bulkClasses, setBulkClasses] = useState<TClasse[]>([]);
    const [bulkClassId, setBulkClassId] = useState('');
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkErr, setBulkErr] = useState<string|null>(null);

    // === Changement de classe groupé (même année) ===
    const [bulkChangeOpen, setBulkChangeOpen] = useState(false);
    const [ccFiliereId, setCcFiliereId] = useState('');
    const [ccNiveauId, setCcNiveauId] = useState('');
    const [ccChoices, setCcChoices] = useState<TClasse[]>([]);
    const [ccClassId, setCcClassId] = useState('');
    const [ccBusy, setCcBusy] = useState(false);
    const [ccErr, setCcErr] = useState<string|null>(null);


    // Ajouter étudiant (formulaire)
    const openAdd = () => setShowAddStudent(true);
    const closeAdd = () => setShowAddStudent(false);
    const cacheKeyStudents = `students:${classe.id}:${classe.academic_year_id}`;
    const invalidateStudentsCache = () => cacheDel(cacheKeyStudents);


    const fetchStudents = async (force = false) => {
      const cached = !force ? cacheGet<TUser[]>(cacheKeyStudents) : undefined;
      setLoading(!cached); 
      try {

        if (cached) {
          setStudents(cached);
          return;
        }
        // 1) Étudiants inscrits via les champs top-level
        const snapA = await getDocs(
          query(
            collection(db, 'users'),
            where('classe_id', '==', classe.id),
            where('academic_year_id', '==', classe.academic_year_id)
          )
        );

        // 1-bis) 👉 Étudiants affectés via classe2_id (NEW)
        const snapA2 = await getDocs(
          query(
            collection(db, 'users'),
            where('classe2_id', '==', classe.id),
            where('academic_year_id', '==', classe.academic_year_id)
          )
        );
        const a: Map<string, TUser> = new Map();
        [snapA, snapA2].forEach(snap => {
          snap.forEach(d => {
            const v = d.data() as any;
            a.set(d.id, {
              id: d.id,
              prenom: String(v.prenom || ''),
              nom: String(v.nom || ''),
              email: String(v.email || ''),
              telephone: String(v.telephone || ''),
              matricule: String(v.matricule || ''),
              classe_id: v.classe_id ?? null,
              classe: String(v.classe || ''),
              classe2_id: v.classe2_id ?? null,        // 👈 new
              classe2: String(v.classe2 || ''),        // 👈 new
              academic_year_id: String(v.academic_year_id || ''),
              annee_academique: String(v.annee_academique || ''),
              parcours: Array.isArray(v.parcours) ? v.parcours : [],
              parcours_keys: Array.isArray(v.parcours_keys) ? v.parcours_keys : []
            });
          });
        });

        // 2) Étudiants via historique
        const key = keyForParcours(classe.academic_year_id, classe.id);
        const snapB = await getDocs(
          query(
            collection(db, 'users'),
            where('parcours_keys', 'array-contains', key)
          )
        );
        snapB.forEach(d => {
          const v = d.data() as any;
          if (!a.has(d.id)) {
            a.set(d.id, {
              id: d.id,
              prenom: String(v.prenom || ''),
              nom: String(v.nom || ''),
              email: String(v.email || ''),
              telephone: String(v.telephone || ''),
              matricule: String(v.matricule || ''),
              classe_id: v.classe_id ?? null,
              classe: String(v.classe || ''),
              academic_year_id: String(v.academic_year_id || ''),
              annee_academique: String(v.annee_academique || ''),
              parcours: Array.isArray(v.parcours) ? v.parcours : [],
              parcours_keys: Array.isArray(v.parcours_keys) ? v.parcours_keys : []
            });
          }
        });

        const list = Array.from(a.values()).sort((x, y) =>
          (x.nom + ' ' + x.prenom).localeCompare(y.nom + ' ' + y.prenom)
        );
        cacheSet(cacheKeyStudents, list);
        setStudents(list);
      } catch (e) {
        console.error(e);
        ko('Erreur de chargement des étudiants.');
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => { fetchStudents(); /* eslint-disable-next-line */ }, [classe.id, classe.academic_year_id]);

    useEffect(()=>{
      const loadDualChoices = async ()=>{
        if(!dualOpen) return;
        const snap = await getDocs(
          query(collection(db,'classes'), where('academic_year_id','==', classe.academic_year_id))
        );
        const rows: TClasse[] = [];
        snap.forEach(d => {
          const v = d.data() as any;
          rows.push({
            id: d.id,
            filiere_id: String(v.filiere_id),
            filiere_libelle: String(v.filiere_libelle || ''),
            niveau_id: String(v.niveau_id || ''),
            niveau_libelle: String(v.niveau_libelle || ''),
            libelle: String(v.libelle || ''),
            academic_year_id: String(v.academic_year_id || '')
          });
        });
        rows.sort((a,b)=>a.libelle.localeCompare(b.libelle));
        setDualChoices(rows);
      };
      loadDualChoices();
    },[dualOpen, classe.academic_year_id]);

    const loadBulkClassesForYear = async (yearId: string) => {
      setBulkClasses([]);
      if (!yearId) return;
      try {
        const snap = await getDocs(query(collection(db, 'classes'), where('academic_year_id', '==', yearId)));
        const rows: TClasse[] = [];
        snap.forEach(d => {
          const v = d.data() as any;
          rows.push({
            id: d.id,
            filiere_id: String(v.filiere_id),
            filiere_libelle: String(v.filiere_libelle || ''),
            niveau_id: String(v.niveau_id || ''),
            niveau_libelle: String(v.niveau_libelle || ''),
            libelle: String(v.libelle || ''),
            academic_year_id: String(v.academic_year_id || '')
          });
        });
        rows.sort((a,b)=>a.libelle.localeCompare(b.libelle));
        setBulkClasses(rows);
      } catch(e) { console.error(e); }
    };

    const resolveCcChoices = async (filiereId: string, niveauId: string) => {
      setCcErr(null);
      try {
        const snap = await getDocs(query(
          collection(db,'classes'),
          where('academic_year_id','==', classe.academic_year_id),
          where('filiere_id','==', filiereId),
          where('niveau_id','==', niveauId)
        ));
        const rows: TClasse[] = [];
        snap.forEach(d=>{
          const v = d.data() as any;
          rows.push({
            id: d.id,
            filiere_id: String(v.filiere_id),
            filiere_libelle: String(v.filiere_libelle || ''),
            niveau_id: String(v.niveau_id || ''),
            niveau_libelle: String(v.niveau_libelle || ''),
            libelle: String(v.libelle || ''),
            academic_year_id: String(v.academic_year_id || '')
          });
        });
        rows.sort((a,b)=>a.libelle.localeCompare(b.libelle));
        setCcChoices(rows);
        setCcClassId(rows.length === 1 ? rows[0].id : '');
      } catch(e) {
        console.error(e);
        setCcErr("Erreur lors du chargement des classes.");
      }
    };

    // Réinscription — charger classes selon l’année
    const loadClassesForYear = async (yearId: string) => {
      setReinscClasses([]);
      if (!yearId) return;
      try {
        const snap = await getDocs(
          query(collection(db, 'classes'), where('academic_year_id', '==', yearId))
        );
        const rows: TClasse[] = [];
        snap.forEach(d => {
          const v = d.data() as any;
          rows.push({
            id: d.id,
            filiere_id: String(v.filiere_id),
            filiere_libelle: String(v.filiere_libelle || ''),
            niveau_id: String(v.niveau_id || ''),
            niveau_libelle: String(v.niveau_libelle || ''),
            libelle: String(v.libelle || ''),
            academic_year_id: String(v.academic_year_id || '')
          });
        });
        rows.sort((a, b) => a.libelle.localeCompare(b.libelle));
        setReinscClasses(rows);
      } catch (e) {
        console.error(e);
      }
    };

    const saveDual = async ()=>{
      if(!dualOpen) return;
      setDualErr(null);
      if(!dualClassId) return setDualErr("Sélectionnez une classe.");
      if(dualClassId === (dualOpen.classe_id || '')) {
        return setDualErr("La 2e classe doit être différente de la classe principale.");
      }
      if(dualOpen.classe2_id) return setDualErr("Déjà 2 classes.");

      const target = dualChoices.find(c=>c.id===dualClassId);
      if(!target) return setDualErr("Classe introuvable.");

      try{
        setDualBusy(true);
        await updateDoc(doc(db,'users', dualOpen.id), {
          classe2_id: target.id,
          classe2: target.libelle,
        });
        ok("2e classe ajoutée.");
        setDualOpen(null);
        setDualClassId('');
        invalidateStudentsCache();
        await fetchStudents(true);   // 👈 force
      }catch(e){
        console.error(e);
        setDualErr("Échec d’enregistrement.");
      }finally{
        setDualBusy(false);
      }
    };


    const doReinscrire = async () => {
      const targetUser = students.find(s => s.id === reinscOpen?.id);
      if (!reinscOpen || !targetUser) return;
      setReinscErr(null);
      if (!reinscYear) return setReinscErr('Sélectionnez une année scolaire.');
      if (!reinscClassId) return setReinscErr('Sélectionnez une classe.');
      if (reinscYear === classe.academic_year_id && reinscClassId === classe.id) {
        return setReinscErr('Cette réinscription correspond déjà à la classe/année actuelle.');
      }
      const target = reinscClasses.find(c => c.id === reinscClassId);
      if (!target) return setReinscErr('Classe introuvable.');

      try {
        setReinscBusy(true);
        const ref = doc(db, 'users', targetUser.id);
        const newEntry: TParcoursEntry = { annee: years.find(y=>y.id===reinscYear)?.label || '', classe: target.libelle, class_id: target.id };
        const newKey = keyForParcours(reinscYear, target.id);

        const nextParcours = [...(targetUser.parcours ?? [])];
        const exists = nextParcours.some(p => p.annee === newEntry.annee && p.class_id === newEntry.class_id);
        if (!exists) nextParcours.push(newEntry);

        const nextKeys = new Set<string>([...(targetUser.parcours_keys ?? [])]);
        nextKeys.add(newKey);

        // Lire libellé de l'année et sa date_debut
        const yMetaDoc = await getDoc(doc(db, 'annees_scolaires', reinscYear));
        const yearLabel = years.find(y => y.id === reinscYear)?.label || '';
        let effectiveStartISO: string | undefined = undefined;
        if (yMetaDoc.exists()) {
          const yv = yMetaDoc.data() as any;
          const sd = yv.date_debut?.toDate?.() as Date | undefined;
          if (sd) effectiveStartISO = toISODate(sd);
        }

        // Construire la prochaine affectation (marquage d’avenir)
        const nextAssign: TNextAssignment = {
          year_id: reinscYear,
          year_label: yearLabel,
          class_id: target.id,
          class_label: target.libelle,
          effective_start: effectiveStartISO, // facultatif si non renseigné côté année
          created_at: Date.now(),
        };


        await updateDoc(ref, {
          parcours: nextParcours,
          parcours_keys: Array.from(nextKeys),
          next_assignment: nextAssign,
        });

        ok('Réinscription effectuée.');
        setReinscOpen(null);
        setReinscYear('');
        setReinscClassId('');
        setReinscClasses([]);
        invalidateStudentsCache();
        fetchStudents(true);         // 👈 force
      } catch (e) {
        console.error(e);
        setReinscErr('Impossible de réinscrire cet étudiant.');
      } finally {
        setReinscBusy(false);
      }
    };

    return (
      <div className="d-flex flex-column gap-3">
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <button className="btn btn-link px-0 me-2" onClick={onBack}>
              <i className="bi bi-arrow-left" /> Retour aux classes
            </button>
            <h4 className="mb-0">{classe.libelle}</h4>
            <div className="text-muted small">
              {classe.niveau_libelle} • {classe.filiere_libelle} • Année : {academicYearLabel}
            </div>
          </div>

          <div className="d-flex gap-2">
            <button
              className={clsx('btn btn-sm', bulkMode ? 'btn-outline-secondary' : 'btn-outline-primary')}
              onClick={() => { setBulkMode(s=>!s); clearSelect(); }}
            >
              <i className="bi bi-check-square me-1" />
              Sélection multiple
            </button>

            {bulkMode && (
              <>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={selectedIds.size===0}
                  onClick={() => { setBulkReinscOpen(true); setBulkYear(''); setBulkClassId(''); setBulkClasses([]); setBulkErr(null); }}
                >
                  <i className="bi bi-box-arrow-in-right me-1" />
                  Réinscrire la sélection
                </button>

                <button
                  className="btn btn-warning btn-sm"
                  disabled={selectedIds.size===0}
                  onClick={() => { setBulkChangeOpen(true); setCcFiliereId(''); setCcNiveauId(''); setCcChoices([]); setCcClassId(''); setCcErr(null); }}
                >
                  <i className="bi bi-arrow-left-right me-1" />
                  Changer de classe (sélection)
                </button>
              </>
            )}

            {/* existant */}
            <button className="btn btn-primary" onClick={openAdd}>
              <i className="bi bi-person-plus me-2" /> Ajouter un étudiant
            </button>
          </div>
        </div>

        <div className="card border-0 shadow-sm">
          <div className="card-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border" />
              </div>
            ) : students.length === 0 ? (
              <div className="text-muted text-center py-4">
                Aucun étudiant pour cette classe et cette année.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle">
                  <thead className="table-light">
                    <tr>
                      {bulkMode && (
                        <th style={{width: 36}}>
                          <input
                            type="checkbox"
                            checked={selectedIds.size>0 && selectedIds.size===students.length}
                            onChange={(e)=>{
                              if(e.target.checked) setSelectedIds(new Set(students.map(s=>s.id)));
                              else clearSelect();
                            }}
                          />
                        </th>
                      )}
                      <th>Matricule</th>
                      <th>Nom & Prénom</th>
                      <th>Email</th>
                      <th>Téléphone</th>
                      <th style={{width: 220}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => (
                      <tr key={s.id}>
                         {bulkMode && (
                            <td>
                              <input type="checkbox" checked={selectedIds.has(s.id)} onChange={()=>toggleSelect(s.id)} />
                            </td>
                          )}
                        <td className="text-muted">{s.matricule || '—'}</td>
                        <td className="fw-semibold">
                          {s.nom} {s.prenom}
                        </td>
                        <td className="text-muted">{s.email || '—'}</td>
                        <td className="text-muted">{s.telephone ? `+221 ${s.telephone}` : '—'}</td>
                        <td className="d-flex gap-1">
                          <button className="btn btn-outline-info btn-sm" title="Voir" onClick={()=>setViewingId(s.id)}>
                            <i className="bi bi-eye" />
                          </button>
                          <button className="btn btn-outline-primary btn-sm" title="Modifier (inscription)" onClick={()=>setEditingId(s.id)}>
                            <i className="bi bi-pencil" />
                          </button>
                          <button className="btn btn-outline-danger btn-sm" title="Supprimer" onClick={()=>setDeleting(s)}>
                            <i className="bi bi-trash" />
                          </button>
                          <button className="btn btn-outline-secondary btn-sm" onClick={()=>setReinscOpen(s)} title="Réinscrire">
                            <i className="bi bi-box-arrow-in-right" />
                          </button>
                          <button
                            className="btn btn-outline-warning btn-sm"
                            title="Ajouter une 2e classe"
                            onClick={()=>{
                              if (s.classe2_id) { ok("Cet étudiant a déjà une 2e classe."); return; }
                              setDualOpen(s); setDualErr(null); setDualClassId('');
                            }}
                          >
                            <i className="bi bi-plus-circle" />
                          </button>

                          {/* ❌ Retirer la 2e classe (si présente) */}
                          {s.classe2_id && (
                            <button
                              className="btn btn-outline-dark btn-sm"
                              title="Retirer la 2e classe"
                              onClick={async ()=>{
                                try{
                                  await updateDoc(doc(db,'users', s.id), { classe2_id: null, classe2: '' });
                                  ok("2e classe retirée.");
                                  invalidateStudentsCache();      // 👈
                                  await fetchStudents(true);      // 👈 force
                                }catch(e){ console.error(e); ko("Échec de suppression de la 2e classe."); }
                              }}
                              >
                              <i className="bi bi-x-circle" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        {/* Modal AJOUT étudiant */}
        {showAddStudent && (
           <ModalPortal>
          <>
            <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
              <div className="modal-dialog modal-xl modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">
                      <i className="bi bi-person-plus me-2" />
                      Ajouter un étudiant — {classe.libelle}
                    </h5>
                    <button className="btn-close" onClick={closeAdd} />
                  </div>
                  <div className="modal-body">
                    <StudentForm
                      roles={roles}
                      niveaux={niveaux}
                      filieres={filieresForForm}
                      partenaires={partenaires}
                      showSuccessToast={ok}
                      showErrorToast={ko}
                      fetchData={fetchStudents}
                      defaultAnnee={academicYearLabel}
                      defaultYearId={classe.academic_year_id}
                      defaultNiveauId={classe.niveau_id}
                      defaultFiliereId={classe.filiere_id}
                      defaultClasse={{ id: classe.id, libelle: classe.libelle }}
                      onCreated={() => {
                        invalidateStudentsCache();
                        closeAdd();
                        fetchStudents(true);       // 👈 force un refetch
                      }}

                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={closeAdd} />
          </>
          </ModalPortal>
        )}

        {/* Modal REINSCRIPTION */}
        {reinscOpen && (
          <ModalPortal>
          <>
            <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">
                      Réinscrire — {reinscOpen.nom} {reinscOpen.prenom}
                    </h5>
                    <button className="btn-close" onClick={() => { setReinscOpen(null); setReinscErr(null); }} />
                  </div>
                  <div className="modal-body">
                    {reinscErr ? <div className="alert alert-danger">{reinscErr}</div> : null}
                    <div className="mb-3">
                      <label className="form-label">Année scolaire</label>
                      <select
                        className="form-select"
                        value={reinscYear}
                        onChange={(e) => {
                          const v = e.target.value;
                          setReinscYear(v);
                          setReinscClassId('');
                          loadClassesForYear(v);
                        }}
                      >
                        <option value="">— Sélectionner —</option>
                        {years.map(y => (
                          <option key={y.id} value={y.id}>{y.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Classe</label>
                      <select
                        className="form-select"
                        value={reinscClassId}
                        onChange={(e) => setReinscClassId(e.target.value)}
                        disabled={!reinscYear}
                      >
                        <option value="">— Sélectionner —</option>
                        {reinscClasses.map(c => (
                          <option key={c.id} value={c.id}>{c.libelle}</option>
                        ))}
                      </select>
                      <div className="form-text">
                        Choisissez d’abord l’année scolaire pour charger les classes correspondantes.
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-outline-secondary" onClick={() => setReinscOpen(null)}>
                      Annuler
                    </button>
                    <button className="btn btn-primary" onClick={doReinscrire} disabled={reinscBusy}>
                      {reinscBusy ? (<><span className="spinner-border spinner-border-sm me-2" /> Enregistrement…</>) : 'Réinscrire'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={() => setReinscOpen(null)} />
          </>
          </ModalPortal>
        )}

        {dualOpen && (
          <ModalPortal>
          <>
            <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">
                      Ajouter une 2e classe — {dualOpen.nom} {dualOpen.prenom}
                    </h5>
                    <button className="btn-close" onClick={()=>setDualOpen(null)} />
                  </div>
                  <div className="modal-body">
                    {dualErr && <div className="alert alert-danger">{dualErr}</div>}
                    <div className="mb-3">
                      <label className="form-label">Classe (même année)</label>
                      <select className="form-select" value={dualClassId} onChange={e=>setDualClassId(e.target.value)}>
                        <option value="">— Sélectionner —</option>
                        {dualChoices.map(c=>(
                          <option key={c.id} value={c.id} disabled={c.id===dualOpen.classe_id}>
                            {c.libelle}
                          </option>
                        ))}
                      </select>
                      <div className="form-text">Max 2 classes : la principale + cette 2e classe.</div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-outline-secondary" onClick={()=>setDualOpen(null)}>Annuler</button>
                    <button className="btn btn-primary" onClick={saveDual} disabled={dualBusy}>
                      {dualBusy ? (<><span className="spinner-border spinner-border-sm me-2"/>Enregistrement…</>) : "Enregistrer"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-backdrop fade show" onClick={()=>setDualOpen(null)} />
          </>
          </ModalPortal>
        )}

        {/* Modal VOIR — affiche TOUT */}
        {viewingId && (
          <StudentViewModal
            userId={viewingId}
            onClose={()=>setViewingId(null)}
          />
        )}

        {/* Modal MODIFIER — modal “d’inscription” complet */}
        {editingId && (
          <StudentEditInscriptionModal
            userId={editingId}
            classeContexte={classe}
            years={years}
            onClose={()=>setEditingId(null)}
            onSaved={async ()=>{
              setEditingId(null);
              invalidateStudentsCache();
              await fetchStudents(true); // 👈 force
              ok('Étudiant modifié.');
            }}
          />
        )}

        {/* Modal SUPPRIMER */}
        {deleting && (
          <StudentDeleteModal
            user={deleting}
            onCancel={()=>setDeleting(null)}
            onConfirm={async ()=>{
              try{
                await deleteDoc(doc(db,'users', deleting.id));
                setDeleting(null);
                invalidateStudentsCache();
                await fetchStudents(true);   // 👈 force
                ok('Étudiant supprimé.');
              }catch(e){
                console.error(e);
              }
            }}
          />
        )}
        {bulkReinscOpen && (
          <ModalPortal>
            <>
              <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content">
                    <div className="modal-header">
                      <h5 className="modal-title">Réinscrire — {selectedIds.size} étudiant(s)</h5>
                      <button className="btn-close" onClick={()=>setBulkReinscOpen(false)} />
                    </div>
                    <div className="modal-body">
                      {bulkErr && <div className="alert alert-danger">{bulkErr}</div>}
                      <div className="mb-3">
                        <label className="form-label">Année scolaire</label>
                        <select
                          className="form-select"
                          value={bulkYear}
                          onChange={(e)=>{ setBulkYear(e.target.value); setBulkClassId(''); loadBulkClassesForYear(e.target.value); }}
                        >
                          <option value="">— Sélectionner —</option>
                          {years.map(y=>(<option key={y.id} value={y.id}>{y.label}</option>))}
                        </select>
                      </div>
                      <div className="mb-0">
                        <label className="form-label">Classe</label>
                        <select className="form-select" value={bulkClassId} onChange={(e)=>setBulkClassId(e.target.value)} disabled={!bulkYear}>
                          <option value="">— Sélectionner —</option>
                          {bulkClasses.map(c=>(<option key={c.id} value={c.id}>{c.libelle}</option>))}
                        </select>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" onClick={()=>setBulkReinscOpen(false)}>Annuler</button>
                      <button className="btn btn-primary" disabled={bulkBusy} onClick={async ()=>{
                        setBulkErr(null);
                        if(!bulkYear) return setBulkErr('Sélectionnez une année.');
                        if(!bulkClassId) return setBulkErr('Sélectionnez une classe.');
                        setBulkBusy(true);
                        try{
                          const target = bulkClasses.find(c=>c.id===bulkClassId)!;
                          const yearLabel = years.find(y=>y.id===bulkYear)?.label || '';
                          const yMetaDoc = await getDoc(doc(db,'annees_scolaires', bulkYear));
                          let effectiveStartISO: string | undefined;
                          if (yMetaDoc.exists()) {
                            const yv = yMetaDoc.data() as any;
                            const sd = yv.date_debut?.toDate?.() as Date | undefined;
                            if (sd) effectiveStartISO = toISODate(sd);
                          }
                          const ops = Array.from(selectedIds).map(async (id)=>{
                            const snap = await getDoc(doc(db,'users', id));
                            if(!snap.exists()) return;
                            const u = { id: snap.id, ...(snap.data() as any) } as TUser;
                            const newEntry: TParcoursEntry = { annee: yearLabel, classe: target.libelle, class_id: target.id };
                            const newKey = keyForParcours(bulkYear, target.id);
                            const nextParcours = Array.isArray(u.parcours)? [...u.parcours]: [];
                            if(!nextParcours.some(p=>p.annee===newEntry.annee && p.class_id===newEntry.class_id)) nextParcours.push(newEntry);
                            const nextKeys = new Set<string>(Array.isArray(u.parcours_keys)? u.parcours_keys : []);
                            nextKeys.add(newKey);
                            const nextAssign: TNextAssignment = {
                              year_id: bulkYear,
                              year_label: yearLabel,
                              class_id: target.id,
                              class_label: target.libelle,
                              effective_start: effectiveStartISO,
                              created_at: Date.now(),
                            };
                            await updateDoc(doc(db,'users', id), {
                              parcours: nextParcours,
                              parcours_keys: Array.from(nextKeys),
                              next_assignment: nextAssign,
                            });
                          });
                          await Promise.allSettled(ops);
                          ok(`Réinscription appliquée à ${selectedIds.size} étudiant(s).`);
                          setBulkReinscOpen(false); clearSelect();
                          setBulkYear(''); setBulkClassId(''); setBulkClasses([]);
                          invalidateStudentsCache(); fetchStudents(true);
                        } catch(e){ console.error(e); setBulkErr('Erreur lors de la réinscription groupée.'); }
                        finally { setBulkBusy(false); }
                      }}>
                        {bulkBusy ? (<><span className="spinner-border spinner-border-sm me-2" />Enregistrement…</>) : 'Réinscrire'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-backdrop fade show" onClick={()=>setBulkReinscOpen(false)} />
            </>
          </ModalPortal>
        )}

        {bulkChangeOpen && (
          <ModalPortal>
            <>
              <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content">
                    <div className="modal-header">
                      <h5 className="modal-title">Changer de classe — {selectedIds.size} étudiant(s)</h5>
                      <button className="btn-close" onClick={()=>setBulkChangeOpen(false)} />
                    </div>
                    <div className="modal-body">
                      {ccErr && <div className="alert alert-danger">{ccErr}</div>}
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label">Filière</label>
                          <select
                            className="form-select"
                            value={ccFiliereId}
                            onChange={async (e)=>{
                              const v = e.target.value;
                              setCcFiliereId(v); setCcChoices([]); setCcClassId('');
                              if (v && ccNiveauId) await resolveCcChoices(v, ccNiveauId);
                            }}
                          >
                            <option value="">— Sélectionner —</option>
                            {filieresForForm.map(f=>(<option key={f.id} value={f.id}>{f.libelle}</option>))}
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label">Niveau</label>
                          <select
                            className="form-select"
                            value={ccNiveauId}
                            onChange={async (e)=>{
                              const v = e.target.value;
                              setCcNiveauId(v); setCcChoices([]); setCcClassId('');
                              if (ccFiliereId && v) await resolveCcChoices(ccFiliereId, v);
                            }}
                          >
                            <option value="">— Sélectionner —</option>
                            {niveaux.map(n=>(<option key={n.id} value={n.id}>{n.libelle}</option>))}
                          </select>
                        </div>

                        {ccChoices.length > 1 && (
                          <div className="col-12">
                            <label className="form-label">Classe</label>
                            <select className="form-select" value={ccClassId} onChange={(e)=>setCcClassId(e.target.value)}>
                              <option value="">— Sélectionner —</option>
                              {ccChoices.map(c=>(<option key={c.id} value={c.id}>{c.libelle}</option>))}
                            </select>
                          </div>
                        )}
                        {ccChoices.length === 1 && (
                          <div className="col-12">
                            <div className="alert alert-info py-2">
                              Classe résolue : <strong>{ccChoices[0].libelle}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-outline-secondary" onClick={()=>setBulkChangeOpen(false)}>Annuler</button>
                      <button className="btn btn-primary" disabled={ccBusy} onClick={async ()=>{
                        setCcErr(null);
                        const chosen = ccChoices.length===1 ? ccChoices[0] : ccChoices.find(c=>c.id===ccClassId);
                        if(!chosen) return setCcErr("Sélectionnez filière, niveau et classe.");
                        setCcBusy(true);
                        try {
                          const yearId = classe.academic_year_id;
                          const yearLabel = academicYearLabel;
                          const ops = Array.from(selectedIds).map(async (id)=>{
                            const ref = doc(db,'users', id);
                            const snap = await getDoc(ref);
                            const u = snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as TUser) : null;
                            const updates:any = { classe_id: chosen.id, classe: chosen.libelle };
                            if (u) {
                              const entry: TParcoursEntry = { annee: yearLabel, classe: chosen.libelle, class_id: chosen.id };
                              const key = keyForParcours(yearId, chosen.id);
                              const prevParcours = Array.isArray(u.parcours) ? u.parcours : [];
                              const nextParcours = prevParcours.some(p=>p.annee===entry.annee && p.class_id===entry.class_id) ? prevParcours : [...prevParcours, entry];
                              const prevKeys = Array.isArray(u.parcours_keys) ? u.parcours_keys : [];
                              const nextKeys = Array.from(new Set([...prevKeys, key]));
                              updates.parcours = nextParcours;
                              updates.parcours_keys = nextKeys;
                            }
                            await updateDoc(ref, updates);
                          });
                          await Promise.allSettled(ops);
                          ok(`Changement de classe appliqué à ${selectedIds.size} étudiant(s).`);
                          setBulkChangeOpen(false); clearSelect();
                          setCcFiliereId(''); setCcNiveauId(''); setCcClassId(''); setCcChoices([]);
                          invalidateStudentsCache(); fetchStudents(true);
                        } catch(e){ console.error(e); setCcErr("Erreur lors du changement de classe."); }
                        finally { setCcBusy(false); }
                      }}>
                        {ccBusy ? (<><span className="spinner-border spinner-border-sm me-2" />Enregistrement…</>) : "Enregistrer"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-backdrop fade show" onClick={()=>setBulkChangeOpen(false)} />
            </>
          </ModalPortal>
        )}

      </div>
    );
  }

  /* ========================= UI (Filières / Classes) ========================= */

  return (
    <div className="container-fluid py-3">
      {/* Fil d’Ariane discret */}
       <nav
          aria-label="breadcrumb"
          className="mb-1"
          style={{ ['--bs-breadcrumb-divider' as any]: "'>'" }}  // chevron
        >
          <ol className="breadcrumb small mb-0">
            <li className="breadcrumb-item">
              <a href="#" className="text-decoration-none"
                onClick={(e)=>{e.preventDefault(); goRoot();}}>Étudiants</a>
            </li>
            <li className="breadcrumb-item">
              <a href="#" className="text-decoration-none"
                onClick={(e)=>{e.preventDefault(); goSection(section);}}>
                {section}
              </a>
            </li>
            {selectedFiliere && (
              <li className="breadcrumb-item">
                <a href="#" className="text-decoration-none"
                  onClick={(e)=>{e.preventDefault(); goFiliere();}}>
                  {selectedFiliere.libelle}
                </a>
              </li>
            )}
            {openedClasse && (
              <li className="breadcrumb-item active" aria-current="page">
                {openedClasse.libelle}
              </li>
            )}
          </ol>
        </nav>


      {/* Titre + année + actions */}
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div>
          <h2 className="mb-0">Étudiants</h2>
          <div className="text-muted small">Année : <strong>{academicYearLabel || '—'}</strong></div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {/* Onglets horizontaux Gestion / Informatique */}
          <div className="btn-group me-2" role="tablist" aria-label="Sections">
            {(['Gestion','Informatique'] as SectionKey[]).map(s => (
              <button
                key={s}
                type="button"
                className={clsx('btn btn-sm', s === section ? 'btn-primary' : 'btn-outline-primary')}
                aria-selected={s === section}
                onClick={() => goSection(s)}
              >
                <i className={clsx('me-2', s === 'Gestion' ? 'bi bi-briefcase' : 'bi bi-pc-display')} />
                {s}
              </button>
            ))}
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setGlobalErr(null);
              setGlobalFiliereId('');
              setGlobalNiveauId('');
              setGlobalClassChoices([]);
              setGlobalClassId('');
              setShowGlobalAdd(true);
            }}
            title="Ajouter un étudiant par (Filière, Niveau) avec classe résolue automatiquement"
          >
            <i className="bi bi-person-plus me-1" /> Ajouter Étudiant
          </button>
        </div>
      </div>

      {/* Si une classe est ouverte : vue étudiants */}
      {/* Si une classe est ouverte : vue étudiants */}
      {openedClasse ? (
        <ClasseStudentsView
          classe={openedClasse}
          onBack={() => setOpenedClasse(null)}
        />
      ) : selectedFiliere ? (
        /* ========= ÉTAPE 2 : CLASSES de la filière sélectionnée ========= */
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="d-flex align-items-center gap-3">
                <button
                  className="btn btn-link px-0"
                  onClick={() => setSelectedFiliere(null)}
                >
                  <i className="bi bi-arrow-left" /> Retour aux filières
                </button>
                <h5 className="mb-0">Classes — {selectedFiliere.libelle}</h5>
              </div>
              {classes.length > 0 && (
                <div className="small text-muted">
                  {classes.length} classe{classes.length > 1 ? 's' : ''} • page {clsPage}/{totalPages}
                </div>
              )}
            </div>

            {clsLoading ? (
              <div className="text-center py-5"><div className="spinner-border" /></div>
            ) : classes.length === 0 ? (
              <div className="text-muted">Aucune classe.</div>
            ) : (
              <>
                <div className="row g-3">
                  {paginatedClasses.map(c => (
                    <div key={c.id} className="col-12 col-md-6 col-lg-4 d-flex align-items-stretch">
                      <div className="card shadow-sm border-0 rounded-3 p-3 h-100 w-100">
                        <div className="card-body d-flex flex-column">
                          <div className="mb-2">
                            <div className="fw-bold text-primary text-truncate" title={c.libelle}>
                              {c.libelle}
                            </div>
                            <div className="text-muted small">{c.niveau_libelle}</div>
                          </div>
                          <div className="mt-auto d-flex flex-column gap-2">
                            <button
                              className="btn btn-outline-secondary w-100"
                              onClick={() => setOpenedClasse(c)}
                            >
                              Ouvrir la liste des étudiants
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* pagination */}
                <div className="d-flex justify-content-end align-items-center gap-2 mt-3">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={clsPage <= 1}
                    onClick={() => setClsPage(p => Math.max(1, p - 1))}
                  >
                    Précédent
                  </button>
                  <span className="small text-muted">Page {clsPage} / {totalPages}</span>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={clsPage >= totalPages}
                    onClick={() => setClsPage(p => Math.min(totalPages, p + 1))}
                  >
                    Suivant
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ========= ÉTAPE 1 : FILIÈRES ========= */
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between">
              <h5 className="mb-3">Filières — {section}</h5>
              {filieres.length > 0 && (
                <span className="small text-muted">{filieres.length} filière{filieres.length>1?'s':''}</span>
              )}
            </div>

            {filieres.length === 0 ? (
              <div className="text-muted">Aucune filière pour cette section et cette année.</div>
            ) : (
              <div className={styles.filiereGrid}>
                {filieres.map(f => {
                  const active = !!selectedFiliere && selectedFiliere.id === f.id;
                  return (
                    <button
                      key={f.id}
                      className={clsx(styles.filiereCard, active && styles.isActive)}
                      onClick={() => {
                        setSelectedFiliere(f);
                        // optionnel : remonter en haut
                        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      title={f.libelle}
                    >
                      <span className={styles.icon}>
                        <i className="bi bi-mortarboard" />
                      </span>
                      <span className={styles.content}>
                        <span className={styles.title}>{f.libelle}</span>
                        <span className={styles.subtitle}>Année {academicYearLabel}</span>
                      </span>
                      {active && (
                        <span className={styles.check}>
                          <i className="bi bi-check2" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showGlobalAdd && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-person-plus me-2" />
                    Ajouter un étudiant — (sélection filière & niveau)
                  </h5>
                  <button className="btn-close" onClick={()=>setShowGlobalAdd(false)} />
                </div>

                <div className="modal-body">
                  {/* Étape A : choisir filière + niveau */}
                  <div className="row g-3">
                    {globalErr && <div className="col-12"><div className="alert alert-danger">{globalErr}</div></div>}

                    <div className="col-md-6">
                      <label className="form-label">Filière</label>
                      <select
                        className="form-select"
                        value={globalFiliereId}
                        onChange={async (e)=>{
                          const v = e.target.value;
                          setGlobalFiliereId(v);
                          setGlobalClassChoices([]);
                          setGlobalClassId('');
                          if (v && globalNiveauId && academicYearId) {
                            await resolveClassesForFN(v, globalNiveauId, academicYearId);
                          }
                        }}
                      >
                        <option value="">— Sélectionner —</option>
                        {filieresForForm.map(f => (
                          <option key={f.id} value={f.id}>{f.libelle}</option>
                        ))}
                      </select>
                      <div className="form-text">Section actuelle : {section} • Année : {academicYearLabel || '—'}</div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Niveau</label>
                      <select
                        className="form-select"
                        value={globalNiveauId}
                        onChange={async (e)=>{
                          const v = e.target.value;
                          setGlobalNiveauId(v);
                          setGlobalClassChoices([]);
                          setGlobalClassId('');
                          if (globalFiliereId && v && academicYearId) {
                            await resolveClassesForFN(globalFiliereId, v, academicYearId);
                          }
                        }}
                      >
                        <option value="">— Sélectionner —</option>
                        {niveaux.map(n => (
                          <option key={n.id} value={n.id}>{n.libelle}</option>
                        ))}
                      </select>
                    </div>

                    {/* Info classes résolues */}
                    {(globalBusy) && (
                      <div className="col-12">
                        <div className="text-muted"><span className="spinner-border spinner-border-sm me-2" />Recherche de la classe…</div>
                      </div>
                    )}

                    {!globalBusy && globalFiliereId && globalNiveauId && (
                      <>
                        {globalClassChoices.length > 1 && (
                          <div className="col-md-6">
                            <label className="form-label">Plusieurs classes trouvées — choisissez</label>
                            <select
                              className="form-select"
                              value={globalClassId}
                              onChange={(e)=>setGlobalClassId(e.target.value)}
                            >
                              <option value="">— Sélectionner —</option>
                              {globalClassChoices.map(c=>(
                                <option key={c.id} value={c.id}>{c.libelle}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {globalClassChoices.length === 1 && (
                          <div className="col-md-12">
                            <div className="alert alert-info py-2">
                              Classe résolue automatiquement : <strong>{globalClassChoices[0].libelle}</strong>
                            </div>
                          </div>
                        )}

                        {globalClassChoices.length === 0 && !globalErr && (
                          <div className="col-12">
                            <div className="alert alert-warning">Aucune classe disponible pour ce couple (filière, niveau).</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <hr className="mt-4 mb-3" />

                  {/* Étape B : Formulaire d’ajout (StudentForm) quand une classe est déterminée */}
                  {(() => {
                    const chosen =
                      globalClassChoices.length === 1
                        ? globalClassChoices[0]
                        : globalClassChoices.find(c => c.id === globalClassId);

                    if (!chosen) {
                      return (
                        <div className="text-muted">
                          Sélectionnez une <strong>filière</strong> et un <strong>niveau</strong> pour résoudre la classe,
                          puis le formulaire d’ajout s’affichera ici.
                        </div>
                      );
                    }

                    return (
                      <StudentForm
                        roles={roles}
                        niveaux={niveaux}
                        filieres={filieresForForm}
                        partenaires={partenaires}
                        showSuccessToast={ok}
                        showErrorToast={ko}
                        fetchData={async (_force?: boolean) => { /* no-op */ }}
                        defaultAnnee={academicYearLabel}
                        defaultYearId={chosen.academic_year_id}
                        defaultNiveauId={chosen.niveau_id}
                        defaultFiliereId={chosen.filiere_id}
                        defaultClasse={{ id: chosen.id, libelle: chosen.libelle }}
                        onCreated={async () => {
                          // fermer et rafraîchir les listes pertinentes
                          setShowGlobalAdd(false);
                          invalidateListsCache();
                          // si une classe est ouverte, on laisse la vue de classe se rafraîchir dans ses propres modales
                          // sinon, un petit toast global suffit
                          ok('Étudiant ajouté.');
                        }}
                      />
                    );
                  })()}
                </div>

                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={()=>setShowGlobalAdd(false)}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={()=>setShowGlobalAdd(false)} />
        </>
        </ModalPortal>
      )}

      {/* Toasts globaux */}
      <Toast message={toastMsg} type="success" show={okShow} onClose={() => setOkShow(false)} />
      <Toast message={toastMsg} type="error" show={errShow} onClose={() => setErrShow(false)} />

      {/* Chevrons du fil d’Ariane */}
      <style jsx>{`
        :global(.breadcrumb-item + .breadcrumb-item::before) {
          content: ">";
          padding-right: .3rem;
        }
      `}</style>
      <style jsx global>{`
        .modal-backdrop { z-index: 1990 !important; }
        .modal          { z-index: 2000 !important; }
      `}</style>
    </div>
  );
    
}

/* ===== Modale VOIR — charge et affiche TOUT le doc ===== */
function StudentViewModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [user, setUser] = useState<TUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try{
        const snap = await getDoc(doc(db,'users', userId));
        if (snap.exists()) setUser({ id: snap.id, ...(snap.data() as any) });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  return (
    <ModalPortal>
    <>
      <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
        <div className="modal-dialog modal-xl modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title"><i className="bi bi-eye me-2" />Détails étudiant</h5>
              <button className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body">
              {loading ? (
                <div className="text-center py-4"><div className="spinner-border" /></div>
              ) : !user ? (
                <div className="alert alert-warning">Étudiant introuvable.</div>
              ) : (
                <>
                  <h6 className="fw-bold">Informations de base</h6><hr className="mt-1"/>
                  <div className="row small">
                    <div className="col-md-3"><strong>Nom</strong><div>{user.nom} {user.prenom}</div></div>
                    <div className="col-md-3"><strong>Email</strong><div>{user.email || '—'}</div></div>
                    <div className="col-md-3"><strong>Téléphone</strong><div>{user.telephone ? `+221 ${user.telephone}` : '—'}</div></div>
                    <div className="col-md-3"><strong>Matricule</strong><div>{user.matricule || '—'}</div></div>
                    <div className="col-md-3"><strong>Login</strong><div>{user.login || '—'}</div></div>
                    <div className="col-md-3"><strong>Rôle</strong><div>{user.role_libelle || '—'}</div></div>
                  </div>

                  <h6 className="fw-bold mt-3">Identité</h6><hr className="mt-1"/>
                  <div className="row small">
                    <div className="col-md-3"><strong>Sexe</strong><div>{user.sexe || '—'}</div></div>
                    <div className="col-md-3"><strong>Date de naissance</strong><div>{user.date_naissance || '—'}</div></div>
                    <div className="col-md-3"><strong>Lieu de naissance</strong><div>{user.lieu_naissance || '—'}</div></div>
                    <div className="col-md-3"><strong>Nationalité</strong><div>{user.nationalite || '—'}</div></div>
                    <div className="col-md-6"><strong>Adresse</strong><div>{user.adresse || '—'}</div></div>
                    <div className="col-md-3"><strong>CNI / Passeport</strong><div>{user.cni_passeport || '—'}</div></div>
                    <div className="col-md-3"><strong>Situation matrimoniale</strong><div>{user.situation_matrimoniale || '—'}</div></div>
                    <div className="col-md-3"><strong>Nombre d’enfants</strong><div>{typeof user.nombre_enfants==='number'? user.nombre_enfants : '—'}</div></div>
                  </div>

                  <h6 className="fw-bold mt-3">Scolarité actuelle</h6><hr className="mt-1"/>
                  <div className="row small">
                    <div className="col-md-3"><strong>Programme</strong><div>{user.programme || '—'}</div></div>
                    <div className="col-md-3"><strong>Année académique</strong><div>{user.annee_academique || '—'}</div></div>
                    <div className="col-md-3"><strong>Classe</strong><div>{user.classe || '—'}</div></div>
                    <div className="col-md-3"><strong>Type d’inscription</strong><div>{user.type_inscription || '—'}</div></div>
                    <div className="col-md-6"><strong>Dernier établissement</strong><div>{user.dernier_etablissement || '—'}</div></div>
                  </div>

                  <h6 className="fw-bold mt-3">Diplôme obtenu</h6><hr className="mt-1"/>
                  <div className="row small">
                    <div className="col-md-4"><strong>Série</strong><div>{user.diplome_obtenu?.serie || '—'}</div></div>
                    <div className="col-md-4"><strong>Année d’obtention</strong><div>{user.diplome_obtenu?.annee_obtention || '—'}</div></div>
                    <div className="col-md-4"><strong>Mention</strong><div>{user.diplome_obtenu?.mention || '—'}</div></div>
                  </div>

                  <h6 className="fw-bold mt-3">Bourse</h6><hr className="mt-1"/>
                  <div className="row small">
                    <div className="col-md-3"><strong>Boursier</strong><div>{user.boursier || '—'}</div></div>
                    <div className="col-md-6"><strong>Partenaire</strong><div>{user.bourse_fournisseur || (user.boursier==='oui'?'(non renseigné)':'—')}</div></div>
                  </div>

                  <h6 className="fw-bold mt-3">Parents & Urgence</h6><hr className="mt-1"/>
                  <div className="row small">
                    <div className="col-md-3"><strong>Père</strong><div>{user.parents?.pere?.prenom} {user.parents?.pere?.nom}</div></div>
                    <div className="col-md-3"><strong>Tel Père</strong><div>{user.parents?.pere?.telephone || '—'}</div></div>
                    <div className="col-md-3"><strong>Mère</strong><div>{user.parents?.mere?.prenom} {user.parents?.mere?.nom}</div></div>
                    <div className="col-md-3"><strong>Tel Mère</strong><div>{user.parents?.mere?.telephone || '—'}</div></div>
                    <div className="col-md-3"><strong>Urgence — relation</strong><div>{user.parents?.contact_urgence?.relation || '—'}</div></div>
                    <div className="col-md-3"><strong>Urgence — lien</strong><div>{user.parents?.contact_urgence?.lien_autre || '—'}</div></div>
                    <div className="col-md-6"><strong>Urgence — adresse</strong><div>{user.parents?.contact_urgence?.adresse || '—'}</div></div>
                    <div className="col-md-3"><strong>Urgence — téléphone</strong><div>{user.parents?.contact_urgence?.telephone || '—'}</div></div>
                  </div>

                  <h6 className="fw-bold mt-3">Dossier administratif</h6><hr className="mt-1"/>
                  <div className="row small">
                    <div className="col-md-4">
                      <div className="fw-semibold">Nouveau L1</div>
                      <ul className="mb-2">
                        <li>Bac légalisé: {user.dossier_admin?.nouveau_L1?.bac_legalise? 'Oui':'Non'}</li>
                        <li>Pièce d’identité: {user.dossier_admin?.nouveau_L1?.piece_identite? 'Oui':'Non'}</li>
                        <li>Frais: {user.dossier_admin?.nouveau_L1?.frais_inscription_ok || '—'}</li>
                        <li>Engagement: {user.dossier_admin?.nouveau_L1?.engagement_reglement? 'Oui':'Non'}</li>
                      </ul>
                    </div>
                    <div className="col-md-4">
                      <div className="fw-semibold">Nouveau L2/L3</div>
                      <ul className="mb-2">
                        <li>Bac légalisé: {user.dossier_admin?.nouveau_L2_L3?.bac_legalise? 'Oui':'Non'}</li>
                        <li>Relevés antérieurs: {user.dossier_admin?.nouveau_L2_L3?.releves_notes_anterieurs? 'Oui':'Non'}</li>
                        <li>Pièce d’identité: {user.dossier_admin?.nouveau_L2_L3?.piece_identite? 'Oui':'Non'}</li>
                        <li>Frais: {user.dossier_admin?.nouveau_L2_L3?.frais_inscription_ok || '—'}</li>
                        <li>Engagement: {user.dossier_admin?.nouveau_L2_L3?.engagement_reglement? 'Oui':'Non'}</li>
                      </ul>
                    </div>
                    <div className="col-md-4">
                      <div className="fw-semibold">Ancien L2/L3</div>
                      <ul className="mb-2">
                        <li>Dernier relevé: {user.dossier_admin?.ancien_L2_L3?.dernier_releve_notes? 'Oui':'Non'}</li>
                        <li>Frais: {user.dossier_admin?.ancien_L2_L3?.frais_inscription_ok || '—'}</li>
                      </ul>
                    </div>
                  </div>

                  <h6 className="fw-bold mt-3">Infos complémentaires</h6><hr className="mt-1"/>
                  <div className="row small">
                    <div className="col-md-3"><strong>Groupe sanguin</strong><div>{user.medical?.groupe_sanguin || '—'}</div></div>
                    <div className="col-md-3"><strong>Allergies</strong><div>{user.medical?.allergies || '—'}</div></div>
                    <div className="col-md-3"><strong>Maladies</strong><div>{user.medical?.maladies || '—'}</div></div>
                    <div className="col-md-3"><strong>Handicap</strong><div>{user.medical?.handicap || '—'}</div></div>
                    <div className="col-md-3"><strong>Moyen transport</strong><div>{user.transport?.moyen || '—'}</div></div>
                    <div className="col-md-3"><strong>Temps campus</strong><div>{user.transport?.temps_campus || '—'}</div></div>
                  </div>

                  <h6 className="fw-bold mt-3">Documents</h6><hr className="mt-1"/>
                  <div className="small">
                    <div>Copie Bac : {user.documents?.copie_bac ? <a href={user.documents?.copie_bac} target="_blank" rel="noreferrer">Ouvrir</a> : '—'}</div>
                    <div>Copie CNI : {user.documents?.copie_cni ? <a href={user.documents?.copie_cni} target="_blank" rel="noreferrer">Ouvrir</a> : '—'}</div>
                    <div>Relevé notes : {user.documents?.releve_notes ? <a href={user.documents?.releve_notes} target="_blank" rel="noreferrer">Ouvrir</a> : '—'}</div>
                  </div>

                  <h6 className="fw-bold mt-3">Parcours</h6><hr className="mt-1"/>
                  <ul className="small">
                    {(user.parcours?.length ? user.parcours : []).map((p,i)=>(
                      <li key={i}>{p.annee} — {p.classe} {p.class_id ? `(${p.class_id})`:''}</li>
                    ))}
                    {!(user.parcours?.length) && <li>—</li>}
                  </ul>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
    </ModalPortal>
  );
}

/* ===== Modale MODIFIER — “modal d’inscription” complet ===== */
function StudentEditInscriptionModal({
  userId,
  classeContexte,
  years,
  onClose,
  onSaved,
}: {
  userId: string;
  classeContexte: TClasse;
  years: { id:string; label:string }[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [f, setF] = useState<TUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // charger tout le doc
  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db,'users', userId));
      if (snap.exists()) setF({ id: snap.id, ...(snap.data() as any) });
    };
    load();
  }, [userId]);

  const setField = (path: string, value: any) => {
    setF(prev => {
      if (!prev) return prev;
      const next: any = { ...prev };
      const keys = path.split('.');
      let ref = next;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]; ref[k] = ref[k] ?? {}; ref = ref[k];
      }
      ref[keys[keys.length-1]] = value;
      return next;
    });
  };

  const save = async () => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      // si l’admin modifie l’année/classe actuelle, on met à jour parcours/keys aussi
      const updates: any = {
        prenom: f.prenom || '',
        nom: f.nom || '',
        email: f.email || '',
        telephone: (f.telephone || '').toString(),
        matricule: (f.matricule || '').toString(),
        login: f.login || '',
        role_id: f.role_id || '',
        role_libelle: f.role_libelle || 'Etudiant',

        sexe: f.sexe || '',
        date_naissance: f.date_naissance || '',
        lieu_naissance: f.lieu_naissance || '',
        nationalite: f.nationalite || '',
        cni_passeport: f.cni_passeport || '',
        adresse: f.adresse || '',
        situation_matrimoniale: f.situation_matrimoniale || '',
        nombre_enfants: typeof f.nombre_enfants === 'number' ? f.nombre_enfants : 0,

        programme: f.programme || '',
        niveau_id: f.niveau_id || '',
        filiere_id: f.filiere_id || '',
        annee_academique: f.annee_academique || '',
        academic_year_id: f.academic_year_id || null,
        classe: f.classe || '',
        classe_id: f.classe_id || null,
        type_inscription: f.type_inscription || '',
        dernier_etablissement: f.dernier_etablissement || '',

        diplome_obtenu: {
          serie: f.diplome_obtenu?.serie || '',
          annee_obtention: f.diplome_obtenu?.annee_obtention || '',
          mention: f.diplome_obtenu?.mention || '',
        },

        boursier: f.boursier || 'non',
        bourse_fournisseur: f.boursier === 'oui' ? (f.bourse_fournisseur || null) : null,

        parents: {
          pere: {
            prenom: f.parents?.pere?.prenom,
            nom: f.parents?.pere?.nom,
            profession: f.parents?.pere?.profession,
            telephone: f.parents?.pere?.telephone,
          },
          mere: {
            prenom: f.parents?.mere?.prenom,
            nom: f.parents?.mere?.nom,
            profession: f.parents?.mere?.profession,
            telephone: f.parents?.mere?.telephone,
          },
          contact_urgence: {
            relation: f.parents?.contact_urgence?.relation ,
            lien_autre: f.parents?.contact_urgence?.lien_autre,
            adresse: f.parents?.contact_urgence?.adresse,
            telephone: f.parents?.contact_urgence?.telephone,
          },
        },

        dossier_admin: {
          nouveau_L1: {
            bac_legalise: !!f.dossier_admin?.nouveau_L1?.bac_legalise,
            piece_identite: !!f.dossier_admin?.nouveau_L1?.piece_identite,
            frais_inscription_ok: f.dossier_admin?.nouveau_L1?.frais_inscription_ok || '',
            engagement_reglement: !!f.dossier_admin?.nouveau_L1?.engagement_reglement,
          },
          nouveau_L2_L3: {
            bac_legalise: !!f.dossier_admin?.nouveau_L2_L3?.bac_legalise,
            releves_notes_anterieurs: !!f.dossier_admin?.nouveau_L2_L3?.releves_notes_anterieurs,
            piece_identite: !!f.dossier_admin?.nouveau_L2_L3?.piece_identite,
            frais_inscription_ok: f.dossier_admin?.nouveau_L2_L3?.frais_inscription_ok || '',
            engagement_reglement: !!f.dossier_admin?.nouveau_L2_L3?.engagement_reglement,
          },
          ancien_L2_L3: {
            dernier_releve_notes: !!f.dossier_admin?.ancien_L2_L3?.dernier_releve_notes,
            frais_inscription_ok: f.dossier_admin?.ancien_L2_L3?.frais_inscription_ok || '',
          },
        },

        medical: {
          groupe_sanguin: f.medical?.groupe_sanguin || '',
          allergies: f.medical?.allergies || '',
          maladies: f.medical?.maladies || '',
          handicap: f.medical?.handicap || '',
        },

        transport: {
          moyen: f.transport?.moyen || '',
          temps_campus: f.transport?.temps_campus || '',
        },
      };

      // Mettre à jour parcours/keys si année & classe actuelles présentes
      if (updates.academic_year_id && updates.classe_id) {
        const entry: TParcoursEntry = {
          annee: updates.annee_academique || '',
          classe: updates.classe || '',
          class_id: updates.classe_id || null,
        };
        const key = `${updates.academic_year_id}__${updates.classe_id}`;
        const prevParcours = Array.isArray((f as any).parcours) ? (f as any).parcours as TParcoursEntry[] : [];
        const exists = prevParcours.some((p) => p.annee === entry.annee && p.class_id === entry.class_id);
        const nextParcours = exists ? prevParcours : [...prevParcours, entry];
        const prevKeys = Array.isArray((f as any).parcours_keys) ? (f as any).parcours_keys as string[] : [];
        const nextKeys = Array.from(new Set([...prevKeys, key]));
        updates.parcours = nextParcours;
        updates.parcours_keys = nextKeys;
      }

      await updateDoc(doc(db,'users', f.id), updates);
      await onSaved();
    } catch (e:any) {
      console.error(e);
      setErr("Impossible d'enregistrer les modifications.");
    } finally {
      setBusy(false);
    }
  };

  const phone9 = (v: string) => onlyDigits(v).slice(0,9);

  return (
    <ModalPortal>
    <>
      <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
        <div className="modal-dialog modal-xl modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title"><i className="bi bi-pencil me-2" />Modifier l’étudiant (inscription)</h5>
              <button className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body">
              {!f ? (
                <div className="text-center py-4"><div className="spinner-border" /></div>
              ) : (
                <div className="row g-3">
                  {err && <div className="col-12"><div className="alert alert-danger">{err}</div></div>}

                  <div className="col-12"><h6 className="fw-bold">Base</h6><hr className="mt-1"/></div>
                  <div className="col-md-4">
                    <label className="form-label">Prénom</label>
                    <input className="form-control" value={f.prenom||''} onChange={e=>setField('prenom', e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Nom</label>
                    <input className="form-control" value={f.nom||''} onChange={e=>setField('nom', e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Matricule</label>
                    <input className="form-control" value={f.matricule||''} onChange={e=>setField('matricule', e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Email</label>
                    <input className="form-control" value={f.email||''} onChange={e=>setField('email', e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Téléphone (+221)</label>
                    <div className="input-group">
                      <span className="input-group-text">+221</span>
                      <input className="form-control" value={f.telephone||''} onChange={e=>setField('telephone', phone9(e.target.value))} />
                    </div>
                  </div>

                  <div className="col-12"><h6 className="fw-bold">Identité</h6><hr className="mt-1"/></div>
                  <div className="col-md-3">
                    <label className="form-label">Sexe</label>
                    <select className="form-select" value={f.sexe||''} onChange={e=>setField('sexe', e.target.value)}>
                      <option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Date de naissance</label>
                    <input type="date" className="form-control" value={f.date_naissance||''} onChange={e=>setField('date_naissance', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Lieu de naissance</label>
                    <input className="form-control" value={f.lieu_naissance||''} onChange={e=>setField('lieu_naissance', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Nationalité</label>
                    <input className="form-control" value={f.nationalite||''} onChange={e=>setField('nationalite', e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Adresse</label>
                    <input className="form-control" value={f.adresse||''} onChange={e=>setField('adresse', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">CNI/Passeport</label>
                    <input className="form-control" value={f.cni_passeport||''} onChange={e=>setField('cni_passeport', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Situation matrimoniale</label>
                    <select className="form-select" value={f.situation_matrimoniale||''} onChange={e=>setField('situation_matrimoniale', e.target.value)}>
                      <option value="">—</option>
                      <option value="Célibataire">Célibataire</option><option value="Marié(e)">Marié(e)</option><option value="Divorcé(e)">Divorcé(e)</option><option value="Veuf(ve)">Veuf(ve)</option>
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Nombre d’enfants</label>
                    <input type="number" min={0} className="form-control" value={typeof f.nombre_enfants==='number'?f.nombre_enfants:0} onChange={e=>setField('nombre_enfants', parseInt(e.target.value)||0)} />
                  </div>

                  <div className="col-12"><h6 className="fw-bold">Scolarité actuelle</h6><hr className="mt-1"/></div>
                  <div className="col-md-3">
                    <label className="form-label">Programme</label>
                    <input className="form-control" value={f.programme||''} onChange={e=>setField('programme', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Année académique (libellé)</label>
                    <input className="form-control" value={f.annee_academique||''} onChange={e=>setField('annee_academique', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Année académique (ID)</label>
                    <select className="form-select" value={f.academic_year_id||''} onChange={e=>setField('academic_year_id', e.target.value)}>
                      <option value="">—</option>
                      {years.map(y=> <option key={y.id} value={y.id}>{y.label}</option>)}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Classe (libellé)</label>
                    <input className="form-control" value={f.classe||''} onChange={e=>setField('classe', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Classe (ID)</label>
                    <input className="form-control" value={f.classe_id||''} onChange={e=>setField('classe_id', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Type d’inscription</label>
                    <select className="form-select" value={f.type_inscription||''} onChange={e=>setField('type_inscription', e.target.value)}>
                      <option value="">—</option><option value="Nouveau">Inscription</option><option value="Redoublant">Réinscription</option><option value="Transfert">Transfert</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Dernier établissement</label>
                    <input className="form-control" value={f.dernier_etablissement||''} onChange={e=>setField('dernier_etablissement', e.target.value)} />
                  </div>

                  <div className="col-12"><h6 className="fw-bold">Diplôme obtenu</h6><hr className="mt-1"/></div>
                  <div className="col-md-4">
                    <label className="form-label">Série</label>
                    <input className="form-control" value={f.diplome_obtenu?.serie||''} onChange={e=>setField('diplome_obtenu.serie', e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Année d’obtention</label>
                    <input className="form-control" value={f.diplome_obtenu?.annee_obtention||''} onChange={e=>setField('diplome_obtenu.annee_obtention', e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Mention</label>
                    <input className="form-control" value={f.diplome_obtenu?.mention||''} onChange={e=>setField('diplome_obtenu.mention', e.target.value)} />
                  </div>

                  <div className="col-12"><h6 className="fw-bold">Bourse</h6><hr className="mt-1"/></div>
                  <div className="col-md-3">
                    <label className="form-label">Boursier</label>
                    <select className="form-select" value={f.boursier||'non'} onChange={e=>setField('boursier', e.target.value)}>
                      <option value="non">Non</option><option value="oui">Oui</option>
                    </select>
                  </div>
                  {f.boursier === 'oui' && (
                    <div className="col-md-6">
                      <label className="form-label">Partenaire (ID ou libellé)</label>
                      <input className="form-control" value={f.bourse_fournisseur||''} onChange={e=>setField('bourse_fournisseur', e.target.value)} />
                    </div>
                  )}

                  <div className="col-12"><h6 className="fw-bold">Parents & Urgence</h6><hr className="mt-1"/></div>
                  <div className="col-md-3">
                    <label className="form-label">Père — Prénom</label>
                    <input className="form-control" value={f.parents?.pere?.prenom||''} onChange={e=>setField('parents.pere.prenom', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Père — Nom</label>
                    <input className="form-control" value={f.parents?.pere?.nom||''} onChange={e=>setField('parents.pere.nom', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Père — Profession</label>
                    <input className="form-control" value={f.parents?.pere?.profession||''} onChange={e=>setField('parents.pere.profession', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Père — Téléphone</label>
                    <div className="input-group"><span className="input-group-text">+221</span>
                      <input className="form-control" value={f.parents?.pere?.telephone||''} onChange={e=>setField('parents.pere.telephone', phone9(e.target.value))} />
                    </div>
                  </div>

                  <div className="col-md-3">
                    <label className="form-label">Mère — Prénom</label>
                    <input className="form-control" value={f.parents?.mere?.prenom||''} onChange={e=>setField('parents.mere.prenom', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Mère — Nom</label>
                    <input className="form-control" value={f.parents?.mere?.nom||''} onChange={e=>setField('parents.mere.nom', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Mère — Profession</label>
                    <input className="form-control" value={f.parents?.mere?.profession||''} onChange={e=>setField('parents.mere.profession', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Mère — Téléphone</label>
                    <div className="input-group"><span className="input-group-text">+221</span>
                      <input className="form-control" value={f.parents?.mere?.telephone||''} onChange={e=>setField('parents.mere.telephone', phone9(e.target.value))} />
                    </div>
                  </div>

                  <div className="col-md-3">
                    <label className="form-label">Urgence — Relation</label>
                    <select className="form-select" value={f.parents?.contact_urgence?.relation||''} onChange={e=>setField('parents.contact_urgence.relation', e.target.value)}>
                      <option value="">—</option><option value="Père">Père</option><option value="Mère">Mère</option><option value="Autre">Autre</option>
                    </select>
                  </div>
                  {f.parents?.contact_urgence?.relation === 'Autre' && (
                    <div className="col-md-3">
                      <label className="form-label">Urgence — Lien</label>
                      <input className="form-control" value={f.parents?.contact_urgence?.lien_autre||''} onChange={e=>setField('parents.contact_urgence.lien_autre', e.target.value)} />
                    </div>
                  )}
                  <div className="col-md-6">
                    <label className="form-label">Urgence — Adresse</label>
                    <input className="form-control" value={f.parents?.contact_urgence?.adresse||''} onChange={e=>setField('parents.contact_urgence.adresse', e.target.value)} />
                  </div>
                  {f.parents?.contact_urgence?.relation === 'Autre' && (
                    <div className="col-md-3">
                      <label className="form-label">Urgence — Téléphone</label>
                      <div className="input-group"><span className="input-group-text">+221</span>
                        <input className="form-control" value={f.parents?.contact_urgence?.telephone||''} onChange={e=>setField('parents.contact_urgence.telephone', phone9(e.target.value))} />
                      </div>
                    </div>
                  )}

                  <div className="col-12"><h6 className="fw-bold">Dossier administratif</h6><hr className="mt-1"/></div>
                  <div className="col-md-4">
                    <div className="fw-semibold mb-2">Nouveau — L1</div>
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" checked={!!f.dossier_admin?.nouveau_L1?.bac_legalise} onChange={e=>setField('dossier_admin.nouveau_L1.bac_legalise', e.target.checked)} />
                      <label className="form-check-label">Bac légalisé</label>
                    </div>
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" checked={!!f.dossier_admin?.nouveau_L1?.piece_identite} onChange={e=>setField('dossier_admin.nouveau_L1.piece_identite', e.target.checked)} />
                      <label className="form-check-label">Pièce d’identité</label>
                    </div>
                    <div className="mt-2">
                      <label className="form-label">Frais OK</label>
                      <select className="form-select" value={f.dossier_admin?.nouveau_L1?.frais_inscription_ok||''} onChange={e=>setField('dossier_admin.nouveau_L1.frais_inscription_ok', e.target.value)}>
                        <option value="">—</option><option value="oui">Oui</option><option value="non">Non</option>
                      </select>
                    </div>
                    <div className="form-check mt-2">
                      <input className="form-check-input" type="checkbox" checked={!!f.dossier_admin?.nouveau_L1?.engagement_reglement} onChange={e=>setField('dossier_admin.nouveau_L1.engagement_reglement', e.target.checked)} />
                      <label className="form-check-label">Engagement règlement</label>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="fw-semibold mb-2">Nouveau — L2/L3</div>
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" checked={!!f.dossier_admin?.nouveau_L2_L3?.bac_legalise} onChange={e=>setField('dossier_admin.nouveau_L2_L3.bac_legalise', e.target.checked)} />
                      <label className="form-check-label">Bac légalisé</label>
                    </div>
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" checked={!!f.dossier_admin?.nouveau_L2_L3?.releves_notes_anterieurs} onChange={e=>setField('dossier_admin.nouveau_L2_L3.releves_notes_anterieurs', e.target.checked)} />
                      <label className="form-check-label">Relevés antérieurs</label>
                    </div>
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" checked={!!f.dossier_admin?.nouveau_L2_L3?.piece_identite} onChange={e=>setField('dossier_admin.nouveau_L2_L3.piece_identite', e.target.checked)} />
                      <label className="form-check-label">Pièce d’identité</label>
                    </div>
                    <div className="mt-2">
                      <label className="form-label">Frais OK</label>
                      <select className="form-select" value={f.dossier_admin?.nouveau_L2_L3?.frais_inscription_ok||''} onChange={e=>setField('dossier_admin.nouveau_L2_L3.frais_inscription_ok', e.target.value)}>
                        <option value="">—</option><option value="oui">Oui</option><option value="non">Non</option>
                      </select>
                    </div>
                    <div className="form-check mt-2">
                      <input className="form-check-input" type="checkbox" checked={!!f.dossier_admin?.nouveau_L2_L3?.engagement_reglement} onChange={e=>setField('dossier_admin.nouveau_L2_L3.engagement_reglement', e.target.checked)} />
                      <label className="form-check-label">Engagement règlement</label>
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="fw-semibold mb-2">Ancien — L2/L3</div>
                    <div className="form-check">
                      <input className="form-check-input" type="checkbox" checked={!!f.dossier_admin?.ancien_L2_L3?.dernier_releve_notes} onChange={e=>setField('dossier_admin.ancien_L2_L3.dernier_releve_notes', e.target.checked)} />
                      <label className="form-check-label">Dernier relevé</label>
                    </div>
                    <div className="mt-2">
                      <label className="form-label">Frais OK</label>
                      <select className="form-select" value={f.dossier_admin?.ancien_L2_L3?.frais_inscription_ok||''} onChange={e=>setField('dossier_admin.ancien_L2_L3.frais_inscription_ok', e.target.value)}>
                        <option value="">—</option><option value="oui">Oui</option><option value="non">Non</option>
                      </select>
                    </div>
                  </div>

                  <div className="col-12"><h6 className="fw-bold">Infos complémentaires</h6><hr className="mt-1"/></div>
                  <div className="col-md-3">
                    <label className="form-label">Groupe sanguin</label>
                    <input className="form-control" value={f.medical?.groupe_sanguin||''} onChange={e=>setField('medical.groupe_sanguin', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Allergies</label>
                    <input className="form-control" value={f.medical?.allergies||''} onChange={e=>setField('medical.allergies', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Maladies</label>
                    <input className="form-control" value={f.medical?.maladies||''} onChange={e=>setField('medical.maladies', e.target.value)} />
                  </div>
                  <div className="col-md-3">  
                    <label className="form-label">Handicap</label>
                    <input className="form-control" value={f.medical?.handicap||''} onChange={e=>setField('medical.handicap', e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Moyen de transport</label>
                    <input className="form-control" value={f.transport?.moyen||''} onChange={e=>setField('transport.moyen', e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Temps pour campus</label>
                    <input className="form-control" value={f.transport?.temps_campus||''} onChange={e=>setField('transport.temps_campus', e.target.value)} />
                  </div>

                  {/* On laisse les documents en lecture seule ici */}
                  <div className="col-12"><h6 className="fw-bold">Documents (liens)</h6><hr className="mt-1"/></div>
                  <div className="col-12 small">
                    <div>Copie Bac : {f.documents?.copie_bac ? <a href={f.documents?.copie_bac} target="_blank" rel="noreferrer">Ouvrir</a> : '—'}</div>
                    <div>Copie CNI : {f.documents?.copie_cni ? <a href={f.documents?.copie_cni} target="_blank" rel="noreferrer">Ouvrir</a> : '—'}</div>
                    <div>Relevé notes : {f.documents?.releve_notes ? <a href={f.documents?.releve_notes} target="_blank" rel="noreferrer">Ouvrir</a> : '—'}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
              <button className="btn btn-primary" onClick={save} disabled={busy || !f}>
                {busy ? (<><span className="spinner-border spinner-border-sm me-2" />Enregistrement…</>) : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
    </ModalPortal>
  );
}

/* ===== Modale SUPPRIMER (inchangé) ===== */
function StudentDeleteModal({
  user,
  onCancel,
  onConfirm,
}: {
  user: TUser;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try{ await onConfirm(); }
    catch(e){ console.error(e); setErr("La suppression a échoué."); }
    finally{ setBusy(false); }
  };

  return (
    <ModalPortal>
    <>
      <div className="modal fade show" style={{display:'block'}} aria-modal="true" role="dialog">
        <div className="modal-dialog modal-md modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header bg-danger text-white">
              <h5 className="modal-title"><i className="bi bi-exclamation-triangle me-2" />Supprimer cet étudiant ?</h5>
              <button className="btn-close btn-close-white" onClick={onCancel}/>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-light border border-danger">{err}</div>}
              <p>Vous êtes sur le point de <strong>supprimer définitivement</strong> le compte de <strong>{user.nom} {user.prenom}</strong>.</p>
              <ul>
                <li>Le document dans <strong>Firestore</strong> sera supprimé.</li>
                <li>La suppression <strong>Firebase Auth</strong> nécessite une route API serveur (Firebase Admin).</li>
                <li>Action irréversible.</li>
              </ul>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Annuler</button>
              <button className="btn btn-danger" onClick={run} disabled={busy}>
                {busy ? (<><span className="spinner-border spinner-border-sm me-2" />Suppression…</>) : (<> <i className="bi bi-trash me-1" />Supprimer</>)}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onCancel} />
    </>
    </ModalPortal>

  );
}

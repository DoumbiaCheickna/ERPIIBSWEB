//src/app/admin/pages/users/etudiantForm.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  setDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';

/* === Auth (secondary app pour ne pas déconnecter l’admin) === */
import { getApp, getApps, initializeApp, FirebaseOptions } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';

interface StudentFormProps {
  roles: { id: string; libelle: string }[];
  niveaux: { id: string; libelle: string }[];
  filieres: { id: string; libelle: string }[];
  partenaires: { id: string; libelle: string }[];
  showSuccessToast: (msg: string) => void;
  showErrorToast: (msg: string) => void;
  fetchData: () => Promise<void>;
  onCreated?: (id: string) => void;

  /** Année académique par défaut (libellé) pour l’affichage */
  defaultAnnee?: string;
  /** ID Firestore de l’année académique (clé utilisée pour les requêtes) */
  defaultYearId?: string;

  /** Contexte classe (pré-remplissage depuis EtudiantsPage) */
  defaultNiveauId?: string;
  defaultFiliereId?: string;
  defaultClasse?: { id: string; libelle: string };
}

/* =========================== Helpers & Constantes =========================== */
type Errors = Record<string, string>;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const phoneRegex = /^(70|75|76|77|78)\d{7}$/; // 9 chiffres sans +221
const onlyDigits = (s: string) => s.replace(/\D/g, '');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo
const allowedFileTypes = ['application/pdf', 'image/jpeg', 'image/png'];
const sanitize = (v: string) =>
  v.replace(/<\s*script/gi, '').replace(/[<>]/g, '').trim().slice(0, 5000);
const normalizeLogin = (raw: string) => {
  let s = raw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9._-]/g, '').replace(/[._-]{2,}/g, '.').replace(/^[^a-z]+/, '');
  return s.slice(0, 32);
};
const SERIES_BAC = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'F6',
  'T1',
  'T2',
  'STEG',
  "L'",
  'L1',
  'L1a',
  'L1b',
  'L2',
  'LA',
  'L-AR',
  'S1A',
  'S2A',
] as const;

/* =========================== État initial =========================== */
const initialForm = (annee?: string) => ({
  // base
  email: '',
  login: '',
  password: '',
  role_id: '',
  first_login: '1' as '1' | '0',
  // identités
  prenom: '',
  nom: '',
  sexe: '',
  date_naissance: '',
  lieu_naissance: '',
  nationalite: '',
  cni_passeport: '',
  // coordonnées
  adresse: '',
  telephone: '',
  // extra
  situation_matrimoniale: '',
  nombre_enfants: 0,
  // académiques
  matricule: '',
  programme: '',
  niveau_id: '',
  filiere_id: '',
  classe_id: '',
  classe: '',
  annee_academique: annee || '',
  type_inscription: 'Nouveau',
  dernier_etablissement: '',
  // diplôme
  diplome_obtenu: { serie: '', annee_obtention: '', mention: '' },
  // bourse
  boursier: 'non' as 'oui' | 'non',
  bourse_fournisseur: '',
  // parents
  parents: {
    pere: { prenom: '', nom: '', profession: '', telephone: '' },
    mere: { prenom: '', nom: '', profession: '', telephone: '' },
    contact_urgence: { relation: '', lien_autre: '', adresse: '', telephone: '' },
  },
  // administratif
  dossier_admin: {
    nouveau_L1: {
      bac_legalise: false,
      piece_identite: false,
      frais_inscription_ok: '' as '' | 'oui' | 'non',
      engagement_reglement: false,
    },
    nouveau_L2_L3: {
      bac_legalise: false,
      releves_notes_anterieurs: false,
      piece_identite: false,
      frais_inscription_ok: '' as '' | 'oui' | 'non',
      engagement_reglement: false,
    },
    ancien_L2_L3: { dernier_releve_notes: false, frais_inscription_ok: '' as '' | 'oui' | 'non' },
  },
  // complémentaires
  medical: { groupe_sanguin: '', allergies: '', maladies: '', handicap: '' },
  transport: { moyen: '', temps_campus: '' },
  // documents + previews (facultatifs)
  documents: { copie_bac: null as File | null, copie_cni: null as File | null, releve_notes: null as File | null },
  previews: { copie_bac: '', copie_cni: '', releve_notes: '' },
});

/* === Secondary Auth helper === */
const getSecondaryAuth = () => {
  const primary = getApp();
  const options = primary.options as FirebaseOptions;
  const name = 'admin-worker';
  const secApp = getApps().find((a) => a.name === name) || initializeApp(options, name);
  return getAuth(secApp);
};

const DEFAULT_PARTENAIRES: { id: string; libelle: string }[] = [
  { id: '3FPT', libelle: '3FPT' },
  { id: 'VILLE_DAKAR', libelle: 'Ville de Dakar' },
  { id: 'AUTRE', libelle: 'Autres' },
];


export default function StudentForm({
  roles = [],
  niveaux = [],
  filieres = [],
  partenaires = [],
  showSuccessToast,
  showErrorToast,
  fetchData,
  onCreated,
  defaultAnnee,
  defaultYearId,
  defaultNiveauId,
  defaultFiliereId,
  defaultClasse,
}: StudentFormProps) {
  const [f, setF] = useState(initialForm(defaultAnnee));
  const [errors, setErrors] = useState<Errors>({});
  const [checkingLogin, setCheckingLogin] = useState(false);
  const [loginAvailable, setLoginAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prérempli rôle = Étudiant
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const etudiantRole = useMemo(
    () => roles.find((r) => normalize(r.libelle) === 'etudiant') || null,
    [roles]
  );
  useEffect(() => {
    if (etudiantRole && f.role_id !== etudiantRole.id)
      setF((p) => ({ ...p, role_id: etudiantRole.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etudiantRole]);

  const setField = (path: string, value: any) => {
    setF((prev) => {
      const next: any = { ...prev };
      const keys = path.split('.');
      let ref = next;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        ref[k] = ref[k] ?? {};
        ref = ref[k];
      }
      ref[keys[keys.length - 1]] = value;
      return next;
    });
    setErrors((e) => {
      const c = { ...e };
      delete c[path];
      return c;
    });
  };

    // si "partenaires" est vide, on utilise la liste par défaut
  const partnerOptions = (partenaires?.length ? [...partenaires, { id: 'AUTRE', libelle: 'Autres' }] : DEFAULT_PARTENAIRES);

  // suivi de la sélection du partenaire (pour gérer "Autres")
  const [bourseSelect, setBourseSelect] = useState<string>('');


  const [showPwd, setShowPwd] = useState(false);
  // Appliquer le contexte classe (préremplissage + verrouillage)
  const lockedClassContext = Boolean(defaultNiveauId && defaultFiliereId && defaultClasse && defaultYearId);
  useEffect(() => {
    if (!lockedClassContext) return;
    setF((prev) => ({
      ...prev,
      annee_academique: defaultAnnee || prev.annee_academique, // libellé (ex: 2024-2025)
      niveau_id: defaultNiveauId!,
      filiere_id: defaultFiliereId!,
      classe_id: defaultClasse!.id,
      classe: defaultClasse!.libelle,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedClassContext, defaultAnnee, defaultNiveauId, defaultFiliereId, defaultClasse?.id]);

  // Vérif unicité login (debounce)
  useEffect(() => {
    const val = f.login.trim();
    if (!val) {
      setCheckingLogin(false);
      setLoginAvailable(null);
      return;
    }
    setCheckingLogin(true);
    const t = setTimeout(async () => {
      try {
        const lower = val.toLowerCase();
        const [a, b] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('login', '==', val))),
          getDocs(query(collection(db, 'users'), where('login_insensitive', '==', lower))),
        ]);
        const exists = !a.empty || !b.empty;
        setLoginAvailable(!exists);
        setErrors((prev) => {
          const c = { ...prev };
          if (exists) c['login'] = "Ce nom d’utilisateur existe déjà.";
          else delete c['login'];
          return c;
        });
      } catch {
        setLoginAvailable(null);
      } finally {
        setCheckingLogin(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [f.login]);

  // (Optionnel) computeClass si pas de contexte verrouillé
  const computeClass = async (niveauId: string, filiereId: string) => {
    if (lockedClassContext) return; // déjà défini
    if (!niveauId || !filiereId) {
      setField('classe_id', '');
      setField('classe', '');
      return;
    }
    const nv = niveaux.find((n) => n.id === niveauId);
    const fi = filieres.find((x) => x.id === filiereId);
    if (!nv || !fi) return;
    const lib = `${fi.libelle} - ${nv.libelle}`;

    try {
      const qy = defaultYearId
        ? query(
            collection(db, 'classes'),
            where('niveau_id', '==', niveauId),
            where('filiere_id', '==', filiereId),
            where('academic_year_id', '==', defaultYearId)
          )
        : query(
            collection(db, 'classes'),
            where('niveau_id', '==', niveauId),
            where('filiere_id', '==', filiereId),
            where('annee', '==', f.annee_academique || '')
          );
      const snap = await getDocs(qy);
      if (!snap.empty) {
        const d = snap.docs[0];
        setField('classe_id', d.id);
        setField('classe', (d.data() as any).libelle || lib);
      } else {
        setField('classe_id', '');
        setField('classe', lib);
      }
    } catch {
      setField('classe_id', '');
      setField('classe', lib);
    }
  };

  // Fichiers (validation + preview)
  const handleFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    key: 'copie_bac' | 'copie_cni' | 'releve_notes'
  ) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setField(`documents.${key}`, null);
      setField(`previews.${key}`, '');
      return;
    }
    if (!allowedFileTypes.includes(file.type)) {
      setErrors((p) => ({ ...p, [`documents.${key}`]: 'Type de fichier non autorisé (PDF/JPG/PNG).' }));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrors((p) => ({ ...p, [`documents.${key}`]: 'Fichier trop volumineux (max 5 Mo).' }));
      return;
    }
    setField(`documents.${key}`, file);
    setField(`previews.${key}`, URL.createObjectURL(file));
  };

  // Validation
  const validate = async (): Promise<Errors> => {
    const err: Errors = {};
    // base
    if (!f.role_id) err['role_id'] = 'Sélectionnez un rôle.';
    if (!f.prenom || sanitize(f.prenom).length < 2) err['prenom'] = 'Min. 2 caractères.';
    if (!f.nom || sanitize(f.nom).length < 2) err['nom'] = 'Min. 2 caractères.';
    if (!f.email || !emailRegex.test(f.email)) err['email'] = 'Email invalide.';
    if (!f.login) err['login'] = "Nom d’utilisateur requis.";
    if (!f.password) err['password'] = 'Mot de passe requis.';
    if (!f.sexe) err['sexe'] = 'Obligatoire.';
    if (!f.date_naissance) err['date_naissance'] = 'Obligatoire.';
    if (!f.lieu_naissance) err['lieu_naissance'] = 'Obligatoire.';
    if (!f.nationalite) err['nationalite'] = 'Obligatoire.';
    if (!f.cni_passeport) err['cni_passeport'] = 'Obligatoire.';
    else if (onlyDigits(f.cni_passeport) !== f.cni_passeport) err['cni_passeport'] = 'Chiffres uniquement.';
    // coordonnées
    if (!f.adresse) err['adresse'] = 'Obligatoire.';
    if (!f.telephone) err['telephone'] = 'Obligatoire.';
    else if (!phoneRegex.test(f.telephone))
      err['telephone'] = 'Format: 9 chiffres commençant par 70/75/76/77/78.';
    // académiques
    if (!f.matricule) err['matricule'] = 'Obligatoire.';
    else if (onlyDigits(f.matricule) !== f.matricule) err['matricule'] = 'Chiffres uniquement.';
    if (!f.niveau_id) err['niveau_id'] = 'Obligatoire.';
    if (!f.filiere_id) err['filiere_id'] = 'Obligatoire.';
    if (!f.classe) err['classe'] = 'Classe requise.';
    if (!f.annee_academique) err['annee_academique'] = 'Obligatoire.';
    if (!f.type_inscription) err['type_inscription'] = 'Obligatoire.';
    // diplôme
    if (!f.diplome_obtenu.serie) err['diplome_obtenu.serie'] = 'Obligatoire.';
    if (!f.diplome_obtenu.annee_obtention) err['diplome_obtenu.annee_obtention'] = 'Obligatoire.';
    if (!f.diplome_obtenu.mention) err['diplome_obtenu.mention'] = 'Obligatoire.';
    // bourse
    if (f.boursier === 'oui' && !f.bourse_fournisseur) err['bourse_fournisseur'] = 'Sélection obligatoire.';
    // parents
    if (!f.parents.pere.prenom || sanitize(f.parents.pere.prenom).length < 2)
      err['parents.pere.prenom'] = 'Min. 2 caractères.';
    if (!f.parents.pere.nom || sanitize(f.parents.pere.nom).length < 2)
      err['parents.pere.nom'] = 'Min. 2 caractères.';
    if (!f.parents.mere.prenom || sanitize(f.parents.mere.prenom).length < 2)
      err['parents.mere.prenom'] = 'Min. 2 caractères.';
    if (!f.parents.mere.nom || sanitize(f.parents.mere.nom).length < 2)
      err['parents.mere.nom'] = 'Min. 2 caractères.';
    // urgence
    if (!f.parents.contact_urgence.relation)
      err['parents.contact_urgence.relation'] = 'Obligatoire.';
    if (!f.parents.contact_urgence.adresse)
      err['parents.contact_urgence.adresse'] = 'Obligatoire.';
    if (f.parents.contact_urgence.relation === 'Autre') {
      if (!f.parents.contact_urgence.lien_autre)
        err['parents.contact_urgence.lien_autre'] = 'Obligatoire.';
      if (!f.parents.contact_urgence.telephone)
        err['parents.contact_urgence.telephone'] = 'Obligatoire.';
      else if (!phoneRegex.test(f.parents.contact_urgence.telephone))
        err['parents.contact_urgence.telephone'] = 'Téléphone invalide.';
    }
    // fichiers (facultatifs mais sûrs)
    (['copie_bac', 'copie_cni', 'releve_notes'] as const).forEach((k) => {
      const file = (f.documents as any)[k] as File | null;
      if (!file) return;
      if (!allowedFileTypes.includes(file.type))
        err[`documents.${k}`] = 'Type non autorisé (PDF/JPG/PNG).';
      if (file.size > MAX_FILE_SIZE)
        err[`documents.${k}`] = 'Fichier trop volumineux (max 5 Mo).';
    });
    // unicité login
    if (!err['login']) {
      const lower = f.login.toLowerCase();
      const [a, b] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('login', '==', f.login))),
        getDocs(query(collection(db, 'users'), where('login_insensitive', '==', lower))),
      ]);
      if (!a.empty || !b.empty) err['login'] = "Ce nom d’utilisateur existe déjà.";
    }
    return err;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    try {
      const err = await validate();
      if (Object.keys(err).length) {
        setErrors(err);
        showErrorToast('Veuillez corriger les champs en rouge.');
        setSubmitting(false);
        return;
      }

      // mock upload (remplace par Storage si besoin)
      const uploadFile = async (file: File) =>
        Promise.resolve(`https://example.com/uploads/${encodeURIComponent(file.name)}`);

      const fileUrls = {
        copie_bac: f.documents.copie_bac ? await uploadFile(f.documents.copie_bac) : null,
        copie_cni: f.documents.copie_cni ? await uploadFile(f.documents.copie_cni) : null,
        releve_notes: f.documents.releve_notes ? await uploadFile(f.documents.releve_notes) : null,
      };

      const normalizedLogin = normalizeLogin(f.login);

      // Préparer historique/parcours
      const parcoursEntry =
        f.annee_academique && f.classe
          ? [{ annee: f.annee_academique, classe: f.classe, class_id: f.classe_id || null }]
          : [];

      const parcoursKeys =
        f.classe_id && defaultYearId ? [`${defaultYearId}__${f.classe_id}`] : [];

      const payload = {
        prenom: sanitize(f.prenom),
        nom: sanitize(f.nom),
        email: sanitize(f.email),
        login: normalizedLogin,
        login_insensitive: normalizedLogin.toLowerCase(),
        first_login: '1' as const,
        role_id: f.role_id,
        role_libelle: roles.find((r) => r.id === f.role_id)?.libelle || 'Etudiant',
        sexe: f.sexe,
        date_naissance: f.date_naissance,
        lieu_naissance: sanitize(f.lieu_naissance),
        nationalite: sanitize(f.nationalite),
        cni_passeport: sanitize(f.cni_passeport),
        adresse: sanitize(f.adresse),
        telephone: sanitize(f.telephone),
        situation_matrimoniale: f.situation_matrimoniale,
        nombre_enfants: f.nombre_enfants,

        matricule: f.matricule,
        programme: sanitize(f.programme),
        niveau_id: f.niveau_id,
        filiere_id: f.filiere_id,

        // Liens d’inscription actuels
        academic_year_id: defaultYearId || null, // <--- ID d’année pour les requêtes
        annee_academique: f.annee_academique, // libellé pour l’affichage
        classe_id: f.classe_id || null,
        classe: f.classe,

        type_inscription: f.type_inscription,
        dernier_etablissement: sanitize(f.dernier_etablissement),

        diplome_obtenu: {
          serie: f.diplome_obtenu.serie,
          annee_obtention: sanitize(f.diplome_obtenu.annee_obtention),
          mention: f.diplome_obtenu.mention,
        },

        // Bourse : partenaire seulement si boursier = 'oui'
        boursier: f.boursier,
        bourse_fournisseur: f.boursier === 'oui' ? f.bourse_fournisseur : null,

        parents: {
          pere: {
            prenom: sanitize(f.parents.pere.prenom),
            nom: sanitize(f.parents.pere.nom),
            profession: sanitize(f.parents.pere.profession),
            telephone: sanitize(f.parents.pere.telephone),
          },
          mere: {
            prenom: sanitize(f.parents.mere.prenom),
            nom: sanitize(f.parents.mere.nom),
            profession: sanitize(f.parents.mere.profession),
            telephone: sanitize(f.parents.mere.telephone),
          },
          contact_urgence: {
            relation: f.parents.contact_urgence.relation,
            lien_autre: sanitize(f.parents.contact_urgence.lien_autre),
            adresse: sanitize(f.parents.contact_urgence.adresse),
            telephone: sanitize(
              f.parents.contact_urgence.relation === 'Père'
                ? f.parents.pere.telephone
                : f.parents.contact_urgence.relation === 'Mère'
                ? f.parents.mere.telephone
                : f.parents.contact_urgence.telephone
            ),
          },
        },

        dossier_admin: f.dossier_admin,
        medical: f.medical,
        transport: f.transport,
        documents: fileUrls,

        parcours: parcoursEntry,
        parcours_keys: parcoursKeys,

        created_at: serverTimestamp(),
      };

      /* ========= 1) Création dans Firebase Auth ========= */
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secAuth, sanitize(f.email), f.password);
      const uid = cred.user.uid;
      await updateProfile(cred.user, {
        displayName: `${payload.prenom} ${payload.nom}`.trim(),
      });
      await signOut(secAuth).catch(() => {});

      /* ========= 2) Écriture Firestore avec docId = uid ========= */
      await setDoc(doc(db, 'users', uid), { ...payload, uid });

      /* ========= 3) (Optionnel) créer l’INSCRIPTION ========= */
      if (f.classe_id && (defaultYearId || f.annee_academique)) {
        await addDoc(collection(db, 'inscriptions'), {
          user_id: uid,
          class_id: f.classe_id,
          academic_year_id: defaultYearId || null,
          annee: f.annee_academique,
          created_at: Date.now(),
        });
      }

      showSuccessToast('Étudiant ajouté avec succès !');
      onCreated?.(uid);
      setF(initialForm(defaultAnnee));
      setLoginAvailable(null);
      await fetchData();
    } catch (e: any) {
      console.error(e);
      if (e?.code?.startsWith?.('auth/')) {
        showErrorToast("Création dans Firebase Auth échouée.");
      } else {
        showErrorToast("Erreur lors de l’ajout de l’étudiant.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* =========================== UI =========================== */
  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="row g-3">
        {/* ==== Base ==== */}
        <div className="col-12">
          <h5 className="fw-bold">Informations de base</h5>
          <hr />
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Rôle<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors['role_id'] ? 'is-invalid' : ''}`}
            value={f.role_id}
            onChange={(e) => setField('role_id', e.target.value)}
            required
          >
            <option value="">Sélectionner un rôle</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.libelle}
              </option>
            ))}
          </select>
          {errors['role_id'] && <div className="invalid-feedback d-block">{errors['role_id']}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Prénom<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['prenom'] ? 'is-invalid' : ''}`}
            value={f.prenom}
            onChange={(e) => setField('prenom', e.target.value)}
          />
          {errors['prenom'] && <div className="invalid-feedback">{errors['prenom']}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Nom<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['nom'] ? 'is-invalid' : ''}`}
            value={f.nom}
            onChange={(e) => setField('nom', e.target.value)}
          />
          {errors['nom'] && <div className="invalid-feedback">{errors['nom']}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Email<span className="text-danger">*</span>
          </label>
          <input
            type="email"
            className={`form-control ${errors['email'] ? 'is-invalid' : ''}`}
            value={f.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="exemple@email.com"
          />
          {errors['email'] && <div className="invalid-feedback">{errors['email']}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Nom d’utilisateur<span className="text-danger">*</span>
          </label>
          <div className="input-group">
            <input
              className={`form-control ${errors['login'] ? 'is-invalid' : ''}`}
              value={f.login}
              onChange={(e) => setField('login', e.target.value)}
              onBlur={() => setField('login', normalizeLogin(f.login))}
              placeholder="unique"
            />
            <span className="input-group-text bg-white">
              {checkingLogin ? (
                <span className="spinner-border spinner-border-sm" />
              ) : loginAvailable === true ? (
                <i className="bi bi-check-circle text-success" />
              ) : loginAvailable === false ? (
                <i className="bi bi-x-circle text-danger" />
              ) : (
                <i className="bi bi-person" />
              )}
            </span>
          </div>
          {errors['login'] && <div className="invalid-feedback d-block">{errors['login']}</div>}
        </div>

        <div className="col-md-4">
        <label className="form-label">
          Mot de passe<span className="text-danger">*</span>
        </label>

        <div className="input-group">
          <input
            type={showPwd ? 'text' : 'password'}
            className={`form-control ${errors['password'] ? 'is-invalid' : ''}`}
            value={f.password}
            onChange={(e) => setField('password', e.target.value)}
            placeholder="Temporaire — sera changé au 1er login"
            autoComplete="new-password"
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setShowPwd(s => !s)}
            title={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={showPwd}
          >
            {showPwd ? <i className="bi bi-eye-slash" /> : <i className="bi bi-eye" />}
          </button>
        </div>

        {errors['password'] && <div className="invalid-feedback d-block">{errors['password']}</div>}
      </div>

        {/* ==== Infos perso ==== */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Informations personnelles</h5>
          <hr />
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Sexe<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors['sexe'] ? 'is-invalid' : ''}`}
            value={f.sexe}
            onChange={(e) => setField('sexe', e.target.value)}
          >
            <option value="">Sélectionner</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
          {errors['sexe'] && <div className="invalid-feedback">{errors['sexe']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Date de naissance<span className="text-danger">*</span>
          </label>
          <input
            type="date"
            className={`form-control ${errors['date_naissance'] ? 'is-invalid' : ''}`}
            value={f.date_naissance}
            onChange={(e) => setField('date_naissance', e.target.value)}
          />
          {errors['date_naissance'] && <div className="invalid-feedback">{errors['date_naissance']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Lieu de naissance<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['lieu_naissance'] ? 'is-invalid' : ''}`}
            value={f.lieu_naissance}
            onChange={(e) => setField('lieu_naissance', e.target.value)}
          />
          {errors['lieu_naissance'] && <div className="invalid-feedback">{errors['lieu_naissance']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Nationalité<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['nationalite'] ? 'is-invalid' : ''}`}
            value={f.nationalite}
            onChange={(e) => setField('nationalite', e.target.value)}
          />
          {errors['nationalite'] && <div className="invalid-feedback">{errors['nationalite']}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label">
            Adresse<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['adresse'] ? 'is-invalid' : ''}`}
            value={f.adresse}
            onChange={(e) => setField('adresse', e.target.value)}
          />
          {errors['adresse'] && <div className="invalid-feedback">{errors['adresse']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Téléphone (+221)<span className="text-danger">*</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">+221</span>
            <input
              inputMode="numeric"
              maxLength={9}
              className={`form-control ${errors['telephone'] ? 'is-invalid' : ''}`}
              value={f.telephone}
              onChange={(e) => setField('telephone', onlyDigits(e.target.value).slice(0, 9))}
              placeholder="77xxxxxxx"
            />
          </div>
          {errors['telephone'] && <div className="invalid-feedback d-block">{errors['telephone']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            CNI/Passeport<span className="text-danger">*</span>
          </label>
          <input
            inputMode="numeric"
            className={`form-control ${errors['cni_passeport'] ? 'is-invalid' : ''}`}
            value={f.cni_passeport}
            onChange={(e) => setField('cni_passeport', onlyDigits(e.target.value))}
          />
          {errors['cni_passeport'] && <div className="invalid-feedback">{errors['cni_passeport']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">Situation matrimoniale</label>
          <select
            className="form-select"
            value={f.situation_matrimoniale}
            onChange={(e) => setField('situation_matrimoniale', e.target.value)}
          >
            <option value="">Sélectionner</option>
            <option value="Célibataire">Célibataire</option>
            <option value="Marié(e)">Marié(e)</option>
            <option value="Divorcé(e)">Divorcé(e)</option>
            <option value="Veuf(ve)">Veuf(ve)</option>
          </select>
        </div>

        <div className="col-md-3">
          <label className="form-label">Nombre d’enfants</label>
          <input
            type="number"
            min={0}
            className="form-control"
            value={f.nombre_enfants}
            onChange={(e) => setField('nombre_enfants', parseInt(e.target.value) || 0)}
          />
        </div>

        {/* ==== Académiques ==== */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Informations académiques (inscription)</h5>
          <hr />
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Matricule<span className="text-danger">*</span>
          </label>
          <input
            inputMode="numeric"
            className={`form-control ${errors['matricule'] ? 'is-invalid' : ''}`}
            value={f.matricule}
            onChange={(e) => setField('matricule', onlyDigits(e.target.value))}
          />
          {errors['matricule'] && <div className="invalid-feedback">{errors['matricule']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Année académique (libellé)<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['annee_academique'] ? 'is-invalid' : ''}`}
            value={f.annee_academique}
            onChange={(e) => setField('annee_academique', e.target.value)}
            placeholder="2024-2025"
          />
          {errors['annee_academique'] && (
            <div className="invalid-feedback">{errors['annee_academique']}</div>
          )}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Niveau<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors['niveau_id'] ? 'is-invalid' : ''}`}
            value={f.niveau_id}
            onChange={async (e) => {
              setField('niveau_id', e.target.value);
              await computeClass(e.target.value, f.filiere_id);
            }}
            disabled={lockedClassContext}
          >
            <option value="">Sélectionner</option>
            {niveaux.map((n) => (
              <option key={n.id} value={n.id}>
                {n.libelle}
              </option>
            ))}
          </select>
          {errors['niveau_id'] && <div className="invalid-feedback">{errors['niveau_id']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Filière<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors['filiere_id'] ? 'is-invalid' : ''}`}
            value={f.filiere_id}
            onChange={async (e) => {
              setField('filiere_id', e.target.value);
              await computeClass(f.niveau_id, e.target.value);
            }}
            disabled={lockedClassContext}
          >
            <option value="">Sélectionner</option>
            {filieres.map((x) => (
              <option key={x.id} value={x.id}>
                {x.libelle}
              </option>
            ))}
          </select>
          {errors['filiere_id'] && <div className="invalid-feedback">{errors['filiere_id']}</div>}
        </div>

        <div className="col-md-6">
          <label className="form-label">Classe (auto)</label>
          <input className={`form-control ${errors['classe'] ? 'is-invalid' : ''}`} value={f.classe} readOnly />
          {errors['classe'] && <div className="invalid-feedback">{errors['classe']}</div>}
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Type d’inscription<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors['type_inscription'] ? 'is-invalid' : ''}`}
            value={f.type_inscription}
            onChange={(e) => setField('type_inscription', e.target.value)}
          >
            <option value="Nouveau">Inscription</option>
            <option value="Redoublant">Réinscription</option>
            <option value="Transfert">Transfert</option>
          </select>
          {errors['type_inscription'] && (
            <div className="invalid-feedback">{errors['type_inscription']}</div>
          )}
        </div>

        <div className="col-md-3">
          <label className="form-label">Dernier établissement</label>
          <input
            className="form-control"
            value={f.dernier_etablissement}
            onChange={(e) => setField('dernier_etablissement', e.target.value)}
          />
        </div>

        {/* ==== Diplôme ==== */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Diplôme obtenu</h5>
          <hr />
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Série<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors['diplome_obtenu.serie'] ? 'is-invalid' : ''}`}
            value={f.diplome_obtenu.serie}
            onChange={(e) => setField('diplome_obtenu.serie', e.target.value)}
          >
            <option value="">Sélectionner</option>
            {SERIES_BAC.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {errors['diplome_obtenu.serie'] && (
            <div className="invalid-feedback">{errors['diplome_obtenu.serie']}</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Année d’obtention<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['diplome_obtenu.annee_obtention'] ? 'is-invalid' : ''}`}
            value={f.diplome_obtenu.annee_obtention}
            onChange={(e) => setField('diplome_obtenu.annee_obtention', onlyDigits(e.target.value).slice(0, 4))}
            placeholder="exemple: 2023"
          />
          {errors['diplome_obtenu.annee_obtention'] && (
            <div className="invalid-feedback">{errors['diplome_obtenu.annee_obtention']}</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Mention<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors['diplome_obtenu.mention'] ? 'is-invalid' : ''}`}
            value={f.diplome_obtenu.mention}
            onChange={(e) => setField('diplome_obtenu.mention', e.target.value)}
          >
            <option value="">Sélectionner</option>
            <option value="Passable">Passable</option>
            <option value="Assez-bien">Assez-bien</option>
            <option value="Bien">Bien</option>
            <option value="Très-Bien">Très-Bien</option>
            <option value="Excellent">Excellent</option>
          </select>
          {errors['diplome_obtenu.mention'] && (
            <div className="invalid-feedback">{errors['diplome_obtenu.mention']}</div>
          )}
        </div>

        {/* ==== Bourse ==== */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Bourse</h5>
          <hr />
        </div>

        <div className="col-md-4">
          <label className="form-label">Boursier</label>
          <select
            className="form-select"
            value={f.boursier}
            // remplace l'onChange du select "Boursier" par :
            onChange={(e) => {
              const val = e.target.value as 'oui' | 'non';
              setField('boursier', val);
              if (val === 'non') {
                setBourseSelect('');
                setField('bourse_fournisseur', '');
              }
            }}
          >
            <option value="non">Non</option>
            <option value="oui">Oui</option>
          </select>
        </div>

        {f.boursier === 'oui' && (
          <div className="col-md-8">
            <label className="form-label">Partenaire (obligatoire si boursier)</label>

            {/* Sélecteur de partenaire (inclut "Autres") */}
            <select
              className={`form-select ${errors['bourse_fournisseur'] ? 'is-invalid' : ''}`}
              value={bourseSelect}
              onChange={(e) => {
                const v = e.target.value;
                setBourseSelect(v);
                // Si ce n'est PAS "Autres", on stocke directement la valeur choisie
                if (v !== 'AUTRE') setField('bourse_fournisseur', v);
                else setField('bourse_fournisseur', ''); // on attend la saisie libre
              }}
            >
              <option value="">Sélectionner</option>
              {partnerOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.libelle}</option>
              ))}
            </select>

            {/* Si "Autres", on affiche un champ de saisie libre */}
            {bourseSelect === 'AUTRE' && (
              <div className="mt-2">
                <input
                  className={`form-control ${errors['bourse_fournisseur'] ? 'is-invalid' : ''}`}
                  placeholder="Saisir le nom du partenaire"
                  value={f.bourse_fournisseur}
                  onChange={(e) => setField('bourse_fournisseur', e.target.value)}
                />
              </div>
            )}

            {errors['bourse_fournisseur'] && (
              <div className="invalid-feedback d-block">{errors['bourse_fournisseur']}</div>
            )}
          </div>
        )}

        {/* ==== Parents & Urgence ==== */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Coordonnées des parents</h5>
          <hr />
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Prénom du père<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['parents.pere.prenom'] ? 'is-invalid' : ''}`}
            value={f.parents.pere.prenom}
            onChange={(e) => setField('parents.pere.prenom', e.target.value)}
          />
          {errors['parents.pere.prenom'] && (
            <div className="invalid-feedback">{errors['parents.pere.prenom']}</div>
          )}
        </div>
        <div className="col-md-3">
          <label className="form-label">
            Nom du père<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['parents.pere.nom'] ? 'is-invalid' : ''}`}
            value={f.parents.pere.nom}
            onChange={(e) => setField('parents.pere.nom', e.target.value)}
          />
          {errors['parents.pere.nom'] && (
            <div className="invalid-feedback">{errors['parents.pere.nom']}</div>
          )}
        </div>
        <div className="col-md-3">
          <label className="form-label">Profession du père</label>
          <input
            className="form-control"
            value={f.parents.pere.profession}
            onChange={(e) => setField('parents.pere.profession', e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label">Téléphone du père</label>
          <div className="input-group">
            <span className="input-group-text">+221</span>
            <input
              className="form-control"
              inputMode="numeric"
              maxLength={9}
              value={f.parents.pere.telephone}
              onChange={(e) =>
                setField('parents.pere.telephone', onlyDigits(e.target.value).slice(0, 9))
              }
            />
          </div>
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Prénom de la mère<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['parents.mere.prenom'] ? 'is-invalid' : ''}`}
            value={f.parents.mere.prenom}
            onChange={(e) => setField('parents.mere.prenom', e.target.value)}
          />
          {errors['parents.mere.prenom'] && (
            <div className="invalid-feedback">{errors['parents.mere.prenom']}</div>
          )}
        </div>
        <div className="col-md-3">
          <label className="form-label">
            Nom de la mère<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['parents.mere.nom'] ? 'is-invalid' : ''}`}
            value={f.parents.mere.nom}
            onChange={(e) => setField('parents.mere.nom', e.target.value)}
          />
          {errors['parents.mere.nom'] && (
            <div className="invalid-feedback">{errors['parents.mere.nom']}</div>
          )}
        </div>
        <div className="col-md-3">
          <label className="form-label">Profession de la mère</label>
          <input
            className="form-control"
            value={f.parents.mere.profession}
            onChange={(e) => setField('parents.mere.profession', e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label">Téléphone de la mère</label>
          <div className="input-group">
            <span className="input-group-text">+221</span>
            <input
              className="form-control"
              inputMode="numeric"
              maxLength={9}
              value={f.parents.mere.telephone}
              onChange={(e) =>
                setField('parents.mere.telephone', onlyDigits(e.target.value).slice(0, 9))
              }
            />
          </div>
        </div>

        <div className="col-12 mt-2">
          <h6 className="fw-bold">Personne à contacter en cas d’urgence</h6>
        </div>

        <div className="col-md-3">
          <label className="form-label">
            Relation<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors['parents.contact_urgence.relation'] ? 'is-invalid' : ''}`}
            value={f.parents.contact_urgence.relation}
            onChange={(e) => setField('parents.contact_urgence.relation', e.target.value)}
          >
            <option value="">Sélectionner</option>
            <option value="Père">Père</option>
            <option value="Mère">Mère</option>
            <option value="Autre">Autre</option>
          </select>
          {errors['parents.contact_urgence.relation'] && (
            <div className="invalid-feedback">{errors['parents.contact_urgence.relation']}</div>
          )}
        </div>

        {f.parents.contact_urgence.relation === 'Autre' && (
          <div className="col-md-3">
            <label className="form-label">
              Lien<span className="text-danger">*</span>
            </label>
            <input
              className={`form-control ${errors['parents.contact_urgence.lien_autre'] ? 'is-invalid' : ''}`}
              value={f.parents.contact_urgence.lien_autre}
              onChange={(e) => setField('parents.contact_urgence.lien_autre', e.target.value)}
            />
            {errors['parents.contact_urgence.lien_autre'] && (
              <div className="invalid-feedback">{errors['parents.contact_urgence.lien_autre']}</div>
            )}
          </div>
        )}

        <div className="col-md-6">
          <label className="form-label">
            Adresse<span className="text-danger">*</span>
          </label>
          <input
            className={`form-control ${errors['parents.contact_urgence.adresse'] ? 'is-invalid' : ''}`}
            value={f.parents.contact_urgence.adresse}
            onChange={(e) => setField('parents.contact_urgence.adresse', e.target.value)}
          />
          {errors['parents.contact_urgence.adresse'] && (
            <div className="invalid-feedback">{errors['parents.contact_urgence.adresse']}</div>
          )}
        </div>

        {f.parents.contact_urgence.relation === 'Autre' && (
          <div className="col-md-3">
            <label className="form-label">
              Téléphone<span className="text-danger">*</span>
            </label>
            <div className="input-group">
              <span className="input-group-text">+221</span>
              <input
                className={`form-control ${errors['parents.contact_urgence.telephone'] ? 'is-invalid' : ''}`}
                inputMode="numeric"
                maxLength={9}
                value={f.parents.contact_urgence.telephone}
                onChange={(e) =>
                  setField(
                    'parents.contact_urgence.telephone',
                    onlyDigits(e.target.value).slice(0, 9)
                  )
                }
              />
            </div>
            {errors['parents.contact_urgence.telephone'] && (
              <div className="invalid-feedback d-block">{errors['parents.contact_urgence.telephone']}</div>
            )}
          </div>
        )}

        {/* ==== Dossier administratif (3 blocs) ==== */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Dossier administratif (à cocher lors de la remise)</h5>
          <hr />
        </div>

        <div className="col-md-4">
          <div className="fw-semibold mb-2">Nouveau — Inscription en L1</div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              checked={f.dossier_admin.nouveau_L1.bac_legalise}
              onChange={(e) => setField('dossier_admin.nouveau_L1.bac_legalise', e.target.checked)}
            />
            <label className="form-check-label">Copie légalisée du bac</label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              checked={f.dossier_admin.nouveau_L1.piece_identite}
              onChange={(e) => setField('dossier_admin.nouveau_L1.piece_identite', e.target.checked)}
            />
            <label className="form-check-label">Pièce d’identité</label>
          </div>
          <div className="mt-2">
            <label className="form-label">Frais d’inscription acquittés</label>
            <select
              className="form-select"
              value={f.dossier_admin.nouveau_L1.frais_inscription_ok}
              onChange={(e) =>
                setField('dossier_admin.nouveau_L1.frais_inscription_ok', e.target.value as any)
              }
            >
              <option value="">—</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
          <div className="form-check mt-2">
            <input
              className="form-check-input"
              type="checkbox"
              checked={f.dossier_admin.nouveau_L1.engagement_reglement}
              onChange={(e) =>
                setField('dossier_admin.nouveau_L1.engagement_reglement', e.target.checked)
              }
            />
            <label className="form-check-label">Engagement à respecter le règlement (signature)</label>
          </div>
        </div>

        <div className="col-md-4">
          <div className="fw-semibold mb-2">Nouveau — Inscription en L2/L3</div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              checked={f.dossier_admin.nouveau_L2_L3.bac_legalise}
              onChange={(e) => setField('dossier_admin.nouveau_L2_L3.bac_legalise', e.target.checked)}
            />
            <label className="form-check-label">Copie légalisée du bac</label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              checked={f.dossier_admin.nouveau_L2_L3.releves_notes_anterieurs}
              onChange={(e) =>
                setField('dossier_admin.nouveau_L2_L3.releves_notes_anterieurs', e.target.checked)
              }
            />
            <label className="form-check-label">Copies des relevés de notes antérieurs</label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              checked={f.dossier_admin.nouveau_L2_L3.piece_identite}
              onChange={(e) => setField('dossier_admin.nouveau_L2_L3.piece_identite', e.target.checked)}
            />
            <label className="form-check-label">Pièce d’identité</label>
          </div>
          <div className="mt-2">
            <label className="form-label">Frais d’inscription acquittés</label>
            <select
              className="form-select"
              value={f.dossier_admin.nouveau_L2_L3.frais_inscription_ok}
              onChange={(e) =>
                setField('dossier_admin.nouveau_L2_L3.frais_inscription_ok', e.target.value as any)
              }
            >
              <option value="">—</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
          <div className="form-check mt-2">
            <input
              className="form-check-input"
              type="checkbox"
              checked={f.dossier_admin.nouveau_L2_L3.engagement_reglement}
              onChange={(e) =>
                setField('dossier_admin.nouveau_L2_L3.engagement_reglement', e.target.checked)
              }
            />
            <label className="form-check-label">Engagement à respecter le règlement (signature)</label>
          </div>
        </div>

        <div className="col-md-4">
          <div className="fw-semibold mb-2">Ancien — Inscription en L2/L3</div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              checked={f.dossier_admin.ancien_L2_L3.dernier_releve_notes}
              onChange={(e) =>
                setField('dossier_admin.ancien_L2_L3.dernier_releve_notes', e.target.checked)
              }
            />
            <label className="form-check-label">Copie du dernier relevé de notes</label>
          </div>
          <div className="mt-2">
            <label className="form-label">Frais d’inscription acquittés</label>
            <select
              className="form-select"
              value={f.dossier_admin.ancien_L2_L3.frais_inscription_ok}
              onChange={(e) =>
                setField('dossier_admin.ancien_L2_L3.frais_inscription_ok', e.target.value as any)
              }
            >
              <option value="">—</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
        </div>

        {/* ==== Infos compl. ==== */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Informations complémentaires</h5>
          <hr />
        </div>

        <div className="col-md-3">
          <label className="form-label">Groupe sanguin</label>
          <select
            className="form-select"
            value={f.medical.groupe_sanguin}
            onChange={(e) => setField('medical.groupe_sanguin', e.target.value)}
          >
            <option value="">Sélectionner</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Allergies</label>
          <input
            className="form-control"
            value={f.medical.allergies}
            onChange={(e) => setField('medical.allergies', e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label">Maladies</label>
          <input
            className="form-control"
            value={f.medical.maladies}
            onChange={(e) => setField('medical.maladies', e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label">Handicap</label>
          <input
            className="form-control"
            value={f.medical.handicap}
            onChange={(e) => setField('medical.handicap', e.target.value)}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Moyen de transport</label>
          <select
            className="form-select"
            value={f.transport.moyen}
            onChange={(e) => setField('transport.moyen', e.target.value)}
          >
            <option value="">Sélectionner</option>
            <option value="Bus scolaire">Bus scolaire</option>
            <option value="Transport public">Transport public</option>
            <option value="Véhicule personnel">Véhicule personnel</option>
            <option value="Marche">Marche</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label">Temps pour arriver au campus</label>
          <input
            className="form-control"
            value={f.transport.temps_campus}
            onChange={(e) => setField('transport.temps_campus', e.target.value)}
            placeholder="Ex: 30 min"
          />
        </div>

        {/* ==== Documents ==== */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Documents (facultatifs)</h5>
          <hr />
        </div>

        <div className="col-md-4">
          <label className="form-label">Copie du BAC</label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className={`form-control ${errors['documents.copie_bac'] ? 'is-invalid' : ''}`}
            onChange={(e) => handleFile(e, 'copie_bac')}
          />
          {errors['documents.copie_bac'] && (
            <div className="invalid-feedback">{errors['documents.copie_bac']}</div>
          )}
          {f.previews.copie_bac && (
            <a
              href={f.previews.copie_bac}
              target="_blank"
              rel="noreferrer"
              className="small mt-1 d-inline-block"
            >
              Prévisualiser
            </a>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">Copie CNI / Passeport</label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className={`form-control ${errors['documents.copie_cni'] ? 'is-invalid' : ''}`}
            onChange={(e) => handleFile(e, 'copie_cni')}
          />
          {errors['documents.copie_cni'] && (
            <div className="invalid-feedback">{errors['documents.copie_cni']}</div>
          )}
          {f.previews.copie_cni && (
            <a
              href={f.previews.copie_cni}
              target="_blank"
              rel="noreferrer"
              className="small mt-1 d-inline-block"
            >
              Prévisualiser
            </a>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">Relevé de notes</label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className={`form-control ${errors['documents.releve_notes'] ? 'is-invalid' : ''}`}
            onChange={(e) => handleFile(e, 'releve_notes')}
          />
          {errors['documents.releve_notes'] && (
            <div className="invalid-feedback">{errors['documents.releve_notes']}</div>
          )}
          {f.previews.releve_notes && (
            <a
              href={f.previews.releve_notes}
              target="_blank"
              rel="noreferrer"
              className="small mt-1 d-inline-block"
            >
              Prévisualiser
            </a>
          )}
        </div>

        {/* Submit */}
        <div className="col-12 mt-4">
          <hr />
          <div className="d-flex justify-content-end">
            <button type="submit" className="btn btn-primary px-4" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Enregistrement…
                </>
              ) : (
                <>Enregistrer l’étudiant</>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

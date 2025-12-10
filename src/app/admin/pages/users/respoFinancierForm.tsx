//src/app/admin/pages/users/respoFinancierForm.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';

import {
  getApp,
  getApps,
  initializeApp,
  FirebaseOptions,
} from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from 'firebase/auth';

interface ResponsableFinancierFormProps {
  roles: { id: string; libelle: string }[];
  showSuccessToast: (msg: string) => void;
  showErrorToast: (msg: string) => void;
  fetchData: () => Promise<void>;
  onCreated?: (docId: string) => void;
}

type RFForm = {
  email: string;
  login: string;
  nom: string;
  prenom: string;
  password: string;
  role_id: string;
  first_login: '1' | '0';

  // Perso
  sexe: string;
  date_naissance: string;
  lieu_naissance: string;
  nationalite: string;
  situation_matrimoniale: string;
  nombre_enfants: number;
  cni_passeport: string;

  // Coordonnées
  adresse: string;
  telephone: string; // 9 chiffres, préfixe +221 affiché

  // Poste visé
  intitule_poste: string;
  departement_service: string;
  type_contrat: string;
  disponibilite: string;

  // Profil
  dernier_poste: string;
  fonctions_exercees: string[];
  experience_domaine: string;
  niveau_responsabilite: string;

  // Formation / Diplômes
  diplomes: Array<{
    intitule: string;
    niveau: string;
    annee: string;
    etablissement: string;
  }>;
  certifications_professionnelles: string[];
  formations_continues: string[];

  // Compétences
  competences: {
    techniques: string[];
    bureautiques: string[];
    langues: string[];
    permis_conduire: { type: string; validite: string };
  };

  // Références
  references_professionnelles: Array<{
    nom_reference: string;
    coordonnees: string;
    relation: string;
  }>;

  // Engagements
  accord_confidentialite: boolean;
  accord_verification: boolean;
  disponibilite_prise_poste: string;

  // Docs
  documents: {
    lettre_motivation: File | null;
    cv: File | null;
    piece_identite: File | null;
    diplomes: File | null;
    attestations_emploi: File | null;
    rib_bancaire: File | null;
  };
};

type Errors = Record<string, string>;

const initialState: RFForm = {
  email: '',
  login: '',
  nom: '',
  prenom: '',
  password: '',
  role_id: '',
  first_login: '1',

  sexe: '',
  date_naissance: '',
  lieu_naissance: '',
  nationalite: '',
  situation_matrimoniale: '',
  nombre_enfants: 0,
  cni_passeport: '',

  adresse: '',
  telephone: '',

  intitule_poste: '',
  departement_service: '',
  type_contrat: '',
  disponibilite: '',

  dernier_poste: '',
  fonctions_exercees: [''],
  experience_domaine: '',
  niveau_responsabilite: '',

  diplomes: [{ intitule: '', niveau: '', annee: '', etablissement: '' }],
  certifications_professionnelles: [''],
  formations_continues: [''],

  competences: {
    techniques: [''],
    bureautiques: [''],
    langues: [''],
    permis_conduire: { type: '', validite: '' },
  },

  references_professionnelles: [
    { nom_reference: '', coordonnees: '', relation: '' },
  ],

  accord_confidentialite: false,
  accord_verification: false,
  disponibilite_prise_poste: '',

  documents: {
    lettre_motivation: null,
    cv: null,
    piece_identite: null,
    diplomes: null,
    attestations_emploi: null,
    rib_bancaire: null,
  },
};

// --- helpers sécurité/validation ---
const sanitize = (v: string) =>
  v
    .replace(/<\s*script/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 5000);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const phoneRegex = /^(70|75|76|77|78)\d{7}$/; // 9 chiffres sans +221
const yearRegex = /^(19|20)\d{2}$/;
const onlyDigits = (s: string) => s.replace(/\D/g, '');

// normalisation login (comme adminForm)
const normalizeLogin = (raw: string) => {
  let s = raw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9._-]/g, '');
  s = s.replace(/[._-]{2,}/g, '.');
  s = s.replace(/^[^a-z]+/, '');
  s = s.slice(0, 32);
  return s;
};
const loginNorm = (login: string) => login.toLowerCase();

const allowedFileTypes: Record<string, string[]> = {
  lettre_motivation: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  cv: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  piece_identite: ['application/pdf', 'image/jpeg', 'image/png'],
  diplomes: ['application/pdf', 'image/jpeg', 'image/png'],
  attestations_emploi: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  rib_bancaire: ['application/pdf', 'image/jpeg', 'image/png'],
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo

export default function ResponsableFinancierForm({
  roles,
  showSuccessToast,
  showErrorToast,
  fetchData,
  onCreated,
}: ResponsableFinancierFormProps) {
  const [responsableForm, setResponsableForm] = useState<RFForm>(initialState);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  // État pour la vérif d'unicité en temps réel
  const [checkingLogin, setCheckingLogin] = useState(false);
  const [loginAvailable, setLoginAvailable] = useState<boolean | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  // Détection du rôle "Responsable Financier" (préremplissage du select)
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const detectedRole = useMemo(() => {
    return (
      roles.find((r) => normalize(r.libelle) === 'responsable financier') || null
    );
  }, [roles]);

  useEffect(() => {
    if (detectedRole && responsableForm.role_id !== detectedRole.id) {
      setResponsableForm((prev) => ({ ...prev, role_id: detectedRole.id }));
    }
  }, [detectedRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = <K extends keyof RFForm>(key: K, value: RFForm[K]) => {
    setResponsableForm((prev) => ({ ...prev, [key]: value }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[String(key)];
      return copy;
    });
  };

  const setNestedError = (key: string, message: string) =>
    setErrors((e) => ({ ...e, [key]: message }));

  // --- Vérification d'unicité du login (temps réel, debounce) ---
  useEffect(() => {
    const val = responsableForm.login.trim();
    if (!val) {
      setLoginAvailable(null);
      setCheckingLogin(false);
      return;
    }

    setCheckingLogin(true);
    const timer = setTimeout(async () => {
      try {
        const lower = val.toLowerCase();

        const [snapExact, snapInsensitive] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('login', '==', val))),
          getDocs(
            query(collection(db, 'users'), where('login_insensitive', '==', lower))
          ),
        ]);

        const exists = !snapExact.empty || !snapInsensitive.empty;
        setLoginAvailable(!exists);

        setErrors((prev) => {
          const copy = { ...prev };
          if (exists) copy.login = "Ce nom d’utilisateur existe déjà.";
          else delete copy.login;
          return copy;
        });
      } catch {
        // En cas d'erreur réseau, on ne bloque pas la saisie
        setLoginAvailable(null);
      } finally {
        setCheckingLogin(false);
      }
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responsableForm.login]);

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof RFForm['documents']
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      setField('documents', { ...responsableForm.documents, [field]: null });
      return;
    }
    const allowed = allowedFileTypes[field as string] || [];
    if (!allowed.includes(file.type)) {
      setNestedError(`documents.${field}`, 'Type de fichier non autorisé.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setNestedError(`documents.${field}`, 'Fichier trop volumineux (max 5 Mo).');
      return;
    }
    const docs = { ...responsableForm.documents, [field]: file };
    setField('documents', docs);
    setErrors((e) => {
      const copy = { ...e };
      delete copy[`documents.${field}`];
      return copy;
    });
  };

  const handleAddDiplome = () =>
    setField('diplomes', [
      ...responsableForm.diplomes,
      { intitule: '', niveau: '', annee: '', etablissement: '' },
    ]);

  const handleRemoveDiplome = (index: number) => {
    const next = [...responsableForm.diplomes];
    next.splice(index, 1);
    setField('diplomes', next);
  };

  const handleDiplomeChange = (
    index: number,
    field: keyof RFForm['diplomes'][number],
    value: string
  ) => {
    const next = [...responsableForm.diplomes];
    next[index] = { ...next[index], [field]: value };
    setField('diplomes', next);
    setErrors((e) => {
      const copy = { ...e };
      delete copy[`diplomes.${index}.${field}`];
      return copy;
    });
  };

  const handleAddReference = () =>
    setField('references_professionnelles', [
      ...responsableForm.references_professionnelles,
      { nom_reference: '', coordonnees: '', relation: '' },
    ]);

  const handleRemoveReference = (index: number) => {
    const next = [...responsableForm.references_professionnelles];
    next.splice(index, 1);
    setField('references_professionnelles', next);
  };

  const handleReferenceChange = (
    index: number,
    field: keyof RFForm['references_professionnelles'][number],
    value: string
  ) => {
    const next = [...responsableForm.references_professionnelles];
    next[index] = { ...next[index], [field]: value };
    setField('references_professionnelles', next);
    setErrors((e) => {
      const copy = { ...e };
      delete copy[`references_professionnelles.${index}.${field}`];
      return copy;
    });
  };

  const handleAddArrayItem = (field: keyof RFForm) => {
    const value = responsableForm[field];
    if (Array.isArray(value)) {
      setField(field, [...value, ''] as any);
    }
  };

  const handleRemoveArrayItem = (field: keyof RFForm, index: number) => {
    const value = responsableForm[field];
    if (Array.isArray(value)) {
      const next = [...value];
      next.splice(index, 1);
      setField(field, next as any);
    }
  };

  const handleArrayItemChange = (
    field: keyof RFForm,
    index: number,
    val: string
  ) => {
    const value = responsableForm[field];
    if (Array.isArray(value)) {
      const next = [...value];
      (next as any)[index] = val;
      setField(field, next as any);
      setErrors((e) => {
        const copy = { ...e };
        delete copy[`${String(field)}.${index}`];
        return copy;
      });
    }
  };

  const handleCompetenceChange = (
    category: keyof RFForm['competences'],
    index: number,
    val: string
  ) => {
    if (category === 'permis_conduire') return;
    const next = { ...responsableForm.competences };
    (next[category] as string[])[index] = val;
    setField('competences', next);
    setErrors((e) => {
      const copy = { ...e };
      delete copy[`competences.${String(category)}.${index}`];
      return copy;
    });
  };

  const handlePermisChange = (key: 'type' | 'validite', val: string) => {
    const next = {
      ...responsableForm.competences,
      permis_conduire: {
        ...responsableForm.competences.permis_conduire,
        [key]: val,
      },
    };
    setField('competences', next);
    setErrors((e) => {
      const copy = { ...e };
      delete copy[`competences.permis_conduire.${key}`];
      return copy;
    });
  };

  // Clés autorisées pour les tableaux de compétences
  type CompetenceArrayKey = 'techniques' | 'bureautiques' | 'langues';

  const handleAddCompetence = (category: CompetenceArrayKey) => {
    const current = responsableForm.competences[category] as string[];
    const next = {
      ...responsableForm.competences,
      [category]: [...current, ''],
    } as RFForm['competences'];

    setField('competences', next);
  };

  const handleRemoveCompetence = (category: CompetenceArrayKey, index: number) => {
    const current = [...(responsableForm.competences[category] as string[])];

    if (current.length > 1) {
      current.splice(index, 1);
    } else {
      current[0] = '';
    }

    const next = {
      ...responsableForm.competences,
      [category]: current,
    } as RFForm['competences'];

    setField('competences', next);

    setErrors((e) => {
      const copy = { ...e };
      delete copy[`competences.${category}.${index}`];
      return copy;
    });
  };

  const validate = async (): Promise<Errors> => {
    const err: Errors = {};
    const f = responsableForm;

    // Rôle (doit être présent)
    if (!f.role_id) err.role_id = 'Sélectionnez un rôle.';

    // Base
    if (!f.prenom || sanitize(f.prenom).length < 2)
      err.prenom = 'Le prénom doit comporter au moins 2 caractères.';
    if (!f.nom || sanitize(f.nom).length < 2)
      err.nom = 'Le nom doit comporter au moins 2 caractères.';
    if (!f.email || !emailRegex.test(f.email))
      err.email = 'Adresse e-mail invalide.';
    if (!f.login) err.login = "Le nom d’utilisateur est requis.";
    if (!f.password) err.password = 'Le mot de passe est requis.';

    // Unicité login (exact + insensible à la casse)
    if (!err.login) {
      const lower = f.login.toLowerCase();
      const [snapExact, snapInsensitive] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('login', '==', f.login))),
        getDocs(
          query(collection(db, 'users'), where('login_insensitive', '==', lower))
        ),
      ]);
      if (!snapExact.empty || !snapInsensitive.empty) {
        err.login = "Ce nom d’utilisateur existe déjà.";
      }
    }

    // Perso (tout obligatoire sauf enfants)
    if (!f.sexe) err.sexe = 'Champ obligatoire.';
    if (!f.date_naissance) err.date_naissance = 'Champ obligatoire.';
    if (!f.lieu_naissance) err.lieu_naissance = 'Champ obligatoire.';
    if (!f.nationalite) err.nationalite = 'Champ obligatoire.';
    if (!f.situation_matrimoniale) err.situation_matrimoniale = 'Champ obligatoire.';
    if (!f.cni_passeport)
      err.cni_passeport = 'Champ obligatoire.';
    else if (onlyDigits(f.cni_passeport) !== f.cni_passeport)
      err.cni_passeport = 'Le CNI doit contenir uniquement des chiffres.';

    // Coordonnées
    if (!f.adresse) err.adresse = 'Champ obligatoire.';
    if (!f.telephone) err.telephone = 'Champ obligatoire.';
    else if (!phoneRegex.test(f.telephone))
      err.telephone =
        'Numéro invalide. Format attendu : 9 chiffres commençant par 70, 75, 76, 77 ou 78.';

    // Poste visé (tout obligatoire sauf département_service & disponibilite)
    if (!f.intitule_poste) err.intitule_poste = 'Champ obligatoire.';
    if (!f.type_contrat) err.type_contrat = 'Champ obligatoire.';

    // Profil (seul expérience_domaine obligatoire)
    if (!f.experience_domaine) err.experience_domaine = 'Champ obligatoire.';

    // Diplômes
    if (!f.diplomes.length) err['diplomes'] = 'Au moins un diplôme est requis.';
    f.diplomes.forEach((d, i) => {
      if (!d.intitule) err[`diplomes.${i}.intitule`] = 'Obligatoire.';
      if (!d.niveau) err[`diplomes.${i}.niveau`] = 'Obligatoire.';
      if (!d.annee) err[`diplomes.${i}.annee`] = 'Obligatoire.';
      else if (!yearRegex.test(d.annee))
        err[`diplomes.${i}.annee`] = 'Année invalide.';
      if (!d.etablissement) err[`diplomes.${i}.etablissement`] = 'Obligatoire.';
    });

    // Fichiers (facultatifs, mais contrôlés)
    const docs = f.documents;
    (Object.keys(docs) as Array<keyof RFForm['documents']>).forEach((k) => {
      const file = docs[k];
      if (!file) return;
      const types = allowedFileTypes[k as string] || [];
      if (!types.includes(file.type))
        err[`documents.${k}`] = 'Type de fichier non autorisé.';
      if (file.size > MAX_FILE_SIZE)
        err[`documents.${k}`] = 'Fichier trop volumineux (max 5 Mo).';
    });

    return err;
  };

  // Secondary Auth (pour ne pas déconnecter l’admin courant)
  const getSecondaryAuth = () => {
    const primary = getApp();
    const options = primary.options as FirebaseOptions;
    const name = 'finance-worker';
    const secApp = getApps().find(a => a.name === name) || initializeApp(options, name);
    return getAuth(secApp);
  };

  const handleResponsableSubmit = async (e: React.FormEvent) => {
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

      const role = detectedRole;
      if (!role) {
        showErrorToast('Rôle Responsable Financier non trouvé.');
        setSubmitting(false);
        return;
      }

      // (Mock) upload — à remplacer par Firebase Storage si besoin
      const uploadFile = async (file: File) =>
        Promise.resolve(`https://example.com/uploads/${encodeURIComponent(file.name)}`);

      const fileUrls = {
        lettre_motivation: responsableForm.documents.lettre_motivation
          ? await uploadFile(responsableForm.documents.lettre_motivation)
          : null,
        cv: responsableForm.documents.cv ? await uploadFile(responsableForm.documents.cv) : null,
        piece_identite: responsableForm.documents.piece_identite
          ? await uploadFile(responsableForm.documents.piece_identite)
          : null,
        diplomes: responsableForm.documents.diplomes
          ? await uploadFile(responsableForm.documents.diplomes)
          : null,
        attestations_emploi: responsableForm.documents.attestations_emploi
          ? await uploadFile(responsableForm.documents.attestations_emploi)
          : null,
        rib_bancaire: responsableForm.documents.rib_bancaire
          ? await uploadFile(responsableForm.documents.rib_bancaire)
          : null,
      };

      // 1) Création dans Firebase Auth (app secondaire)
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(
        secAuth,
        responsableForm.email.trim(),
        responsableForm.password
      );
      const uid = cred.user.uid;
      await updateProfile(cred.user, {
        displayName: `${sanitize(responsableForm.prenom)} ${sanitize(responsableForm.nom)}`.trim(),
      });
      await signOut(secAuth).catch(() => {});

      // 2) Écriture Firestore (docId = UID) — ne JAMAIS stocker le mot de passe
      const normalizedLogin = normalizeLogin(responsableForm.login);
      const clean = {
        // identités
        prenom: sanitize(responsableForm.prenom),
        nom: sanitize(responsableForm.nom),
        email: sanitize(responsableForm.email),
        login: normalizedLogin,
        login_insensitive: normalizedLogin.toLowerCase(), // compat avec ton check existant
        login_norm: loginNorm(normalizedLogin),          // comme adminForm

        // rôle
        role_id: role.id,
        role_libelle: role.libelle,
        role_key: 'responsable_financier',

        // flags
        first_login: '1' as const,
        created_at: serverTimestamp(),

        // perso
        sexe: responsableForm.sexe,
        date_naissance: responsableForm.date_naissance,
        lieu_naissance: sanitize(responsableForm.lieu_naissance),
        nationalite: sanitize(responsableForm.nationalite),
        situation_matrimoniale: responsableForm.situation_matrimoniale,
        nombre_enfants: responsableForm.nombre_enfants,
        cni_passeport: sanitize(responsableForm.cni_passeport),

        // coordonnées
        adresse: sanitize(responsableForm.adresse),
        telephone: sanitize(responsableForm.telephone),

        // poste
        intitule_poste: sanitize(responsableForm.intitule_poste),
        departement_service: sanitize(responsableForm.departement_service),
        type_contrat: sanitize(responsableForm.type_contrat),
        disponibilite: sanitize(responsableForm.disponibilite),

        // profil pro
        dernier_poste: sanitize(responsableForm.dernier_poste),
        fonctions_exercees: responsableForm.fonctions_exercees.map(sanitize),
        experience_domaine: sanitize(responsableForm.experience_domaine),
        niveau_responsabilite: sanitize(responsableForm.niveau_responsabilite),

        // formations
        diplomes: responsableForm.diplomes.map((d) => ({
          intitule: sanitize(d.intitule),
          niveau: sanitize(d.niveau),
          annee: sanitize(d.annee),
          etablissement: sanitize(d.etablissement),
        })),
        certifications_professionnelles: responsableForm.certifications_professionnelles.map(sanitize),
        formations_continues: responsableForm.formations_continues.map(sanitize),

        // compétences
        competences: {
          techniques: responsableForm.competences.techniques.map(sanitize),
          bureautiques: responsableForm.competences.bureautiques.map(sanitize),
          langues: responsableForm.competences.langues.map(sanitize),
          permis_conduire: {
            type: responsableForm.competences.permis_conduire.type,
            validite: responsableForm.competences.permis_conduire.validite,
          },
        },

        // références
        references_professionnelles: responsableForm.references_professionnelles.map((r) => ({
          nom_reference: sanitize(r.nom_reference),
          coordonnees: sanitize(r.coordonnees),
          relation: sanitize(r.relation),
        })),

        // engagements
        accord_confidentialite: responsableForm.accord_confidentialite,
        accord_verification: responsableForm.accord_verification,
        disponibilite_prise_poste: sanitize(responsableForm.disponibilite_prise_poste),

        // documents (URLs)
        documents: fileUrls,

        // uid
        uid,
      };

      await setDoc(doc(db, 'users', uid), clean);

      showSuccessToast('Responsable financier ajouté avec succès !');

      // Reset & refresh
      setResponsableForm(initialState);
      setLoginAvailable(null);
      await fetchData();

      // remonte l’uid créé au parent
      onCreated?.(uid);

    } catch (error: any) {
      console.error("Erreur lors de l'ajout du responsable financier:", error);
      const code = error?.code || '';
      if (code.startsWith('auth/')) {
        if (code === 'auth/email-already-in-use') setErrors(e => ({ ...e, email: 'Cet email est déjà utilisé.' }));
        else if (code === 'auth/invalid-email') setErrors(e => ({ ...e, email: 'Adresse email invalide.' }));
        else if (code === 'auth/weak-password') setErrors(e => ({ ...e, password: 'Mot de passe jugé trop faible.' }));
        showErrorToast('Création dans Firebase Auth échouée.');
      } else {
        showErrorToast("Écriture dans la base échouée. Vérifiez les règles Firestore.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleResponsableSubmit} noValidate>
      <div className="row g-3">
        {/* Informations de base */}
        <div className="col-12">
          <h5 className="fw-bold">Informations de base</h5>
          <hr />
        </div>

        {/* Champ Rôle prérempli */}
        <div className="col-md-4">
          <label className="form-label">
            Rôle<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors.role_id ? 'is-invalid' : ''}`}
            value={responsableForm.role_id}
            onChange={(e) =>
              setResponsableForm((p) => ({ ...p, role_id: e.target.value }))
            }
            required
          >
            <option value="">Sélectionner un rôle</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.libelle}
              </option>
            ))}
          </select>
          {errors.role_id && (
            <div className="invalid-feedback d-block">{errors.role_id}</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Prénom<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.prenom ? 'is-invalid' : ''}`}
            value={responsableForm.prenom}
            onChange={(e) => setField('prenom', e.target.value)}
          />
          {errors.prenom && <div className="invalid-feedback">{errors.prenom}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Nom<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.nom ? 'is-invalid' : ''}`}
            value={responsableForm.nom}
            onChange={(e) => setField('nom', e.target.value)}
          />
          {errors.nom && <div className="invalid-feedback">{errors.nom}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Email<span className="text-danger">*</span>
          </label>
          <input
            type="email"
            className={`form-control ${errors.email ? 'is-invalid' : ''}`}
            value={responsableForm.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="exemple@email.com"
          />
          {errors.email && <div className="invalid-feedback">{errors.email}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Nom d’utilisateur<span className="text-danger">*</span>
          </label>
          <div className="input-group">
            <input
              type="text"
              className={`form-control ${errors.login ? 'is-invalid' : ''}`}
              value={responsableForm.login}
              onChange={(e) => setField('login', e.target.value)}
              placeholder="Nom d'utilisateur unique"
              onBlur={() => {
                // normalise visuellement au blur pour rester propre (optionnel)
                const norm = normalizeLogin(responsableForm.login);
                if (norm !== responsableForm.login) setField('login', norm);
              }}
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
          {errors.login && <div className="invalid-feedback d-block">{errors.login}</div>}
          {!errors.login && responsableForm.login && loginAvailable === true && (
            <div className="form-text text-success">Nom d’utilisateur disponible</div>
          )}
          {!errors.login && responsableForm.login && loginAvailable === false && (
            <div className="text-danger small">Ce nom d’utilisateur est déjà pris.</div>
          )}
          {checkingLogin && (
            <div className="form-text">Vérification de la disponibilité…</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Mot de passe<span className="text-danger">*</span>
          </label>

          <div className="input-group">
            <input
              type={showPwd ? 'text' : 'password'}
              className={`form-control ${errors.password ? 'is-invalid' : ''}`}
              value={responsableForm.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder="Défini temporairement — modifié à la 1ère connexion"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setShowPwd(v => !v)}
              title={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showPwd}
            >
              {showPwd ? <i className="bi bi-eye-slash" /> : <i className="bi bi-eye" />}
            </button>
          </div>

          {errors.password && <div className="invalid-feedback d-block">{errors.password}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Sexe<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors.sexe ? 'is-invalid' : ''}`}
            value={responsableForm.sexe}
            onChange={(e) => setField('sexe', e.target.value)}
          >
            <option value="">Sélectionner</option>
            <option value="Masculin">Masculin</option>
            <option value="Féminin">Féminin</option>
          </select>
          {errors.sexe && <div className="invalid-feedback">{errors.sexe}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Date de naissance<span className="text-danger">*</span>
          </label>
          <input
            type="date"
            className={`form-control ${errors.date_naissance ? 'is-invalid' : ''}`}
            value={responsableForm.date_naissance}
            onChange={(e) => setField('date_naissance', e.target.value)}
          />
          {errors.date_naissance && (
            <div className="invalid-feedback">{errors.date_naissance}</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Lieu de naissance<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.lieu_naissance ? 'is-invalid' : ''}`}
            value={responsableForm.lieu_naissance}
            onChange={(e) => setField('lieu_naissance', e.target.value)}
          />
          {errors.lieu_naissance && (
            <div className="invalid-feedback">{errors.lieu_naissance}</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Nationalité<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.nationalite ? 'is-invalid' : ''}`}
            value={responsableForm.nationalite}
            onChange={(e) => setField('nationalite', e.target.value)}
          />
          {errors.nationalite && (
            <div className="invalid-feedback">{errors.nationalite}</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Situation matrimoniale<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors.situation_matrimoniale ? 'is-invalid' : ''}`}
            value={responsableForm.situation_matrimoniale}
            onChange={(e) => setField('situation_matrimoniale', e.target.value)}
          >
            <option value="">Sélectionner</option>
            <option value="Célibataire">Célibataire</option>
            <option value="Marié(e)">Marié(e)</option>
            <option value="Divorcé(e)">Divorcé(e)</option>
            <option value="Veuf(ve)">Veuf(ve)</option>
          </select>
          {errors.situation_matrimoniale && (
            <div className="invalid-feedback">{errors.situation_matrimoniale}</div>
          )}
        </div>

        <div className="col-md-4">
          <label className="form-label">Nombre d’enfants</label>
          <input
            type="number"
            className="form-control"
            value={responsableForm.nombre_enfants}
            onChange={(e) =>
              setField('nombre_enfants', parseInt(e.target.value) || 0)
            }
            min={0}
          />
        </div>

        <div className="col-md-12">
          <label className="form-label">
            CNI (chiffres uniquement)<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            className={`form-control ${errors.cni_passeport ? 'is-invalid' : ''}`}
            value={responsableForm.cni_passeport}
            onChange={(e) => setField('cni_passeport', onlyDigits(e.target.value))}
            placeholder="Ex: 1234567890123"
          />
          {errors.cni_passeport && (
            <div className="invalid-feedback">{errors.cni_passeport}</div>
          )}
        </div>

        {/* Coordonnées */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Coordonnées</h5>
          <hr />
        </div>

        <div className="col-md-8">
          <label className="form-label">
            Adresse complète<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.adresse ? 'is-invalid' : ''}`}
            value={responsableForm.adresse}
            onChange={(e) => setField('adresse', e.target.value)}
          />
          {errors.adresse && <div className="invalid-feedback">{errors.adresse}</div>}
        </div>

        <div className="col-md-4">
          <label className="form-label">
            Téléphone (+221)<span className="text-danger">*</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">+221</span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={9}
              className={`form-control ${errors.telephone ? 'is-invalid' : ''}`}
              value={responsableForm.telephone}
              onChange={(e) =>
                setField('telephone', onlyDigits(e.target.value).slice(0, 9))
              }
              placeholder="Ex: 770000000"
            />
            {errors.telephone && (
              <div className="invalid-feedback d-block">{errors.telephone}</div>
            )}
          </div>
        </div>

        {/* Poste visé */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Poste visé</h5>
          <hr />
        </div>

        <div className="col-md-6">
          <label className="form-label">
            Intitulé du poste<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.intitule_poste ? 'is-invalid' : ''}`}
            value={responsableForm.intitule_poste}
            onChange={(e) => setField('intitule_poste', e.target.value)}
            placeholder="Ex: Responsable Financier"
          />
          {errors.intitule_poste && (
            <div className="invalid-feedback">{errors.intitule_poste}</div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label">Département / Service</label>
          <input
            type="text"
            className="form-control"
            value={responsableForm.departement_service}
            onChange={(e) => setField('departement_service', e.target.value)}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">
            Type de contrat<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors.type_contrat ? 'is-invalid' : ''}`}
            value={responsableForm.type_contrat}
            onChange={(e) => setField('type_contrat', e.target.value)}
          >
            <option value="">Sélectionner</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="Stage">Stage</option>
            <option value="Intérim">Intérim</option>
          </select>
          {errors.type_contrat && (
            <div className="invalid-feedback">{errors.type_contrat}</div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label">Disponibilité</label>
          <input
            type="text"
            className="form-control"
            value={responsableForm.disponibilite}
            onChange={(e) => setField('disponibilite', e.target.value)}
            placeholder="Ex: Immédiate, À partir du..."
          />
        </div>

        {/* Profil professionnel */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Profil professionnel</h5>
          <hr />
        </div>

        <div className="col-md-6">
          <label className="form-label">Dernier poste occupé</label>
          <input
            type="text"
            className="form-control"
            value={responsableForm.dernier_poste}
            onChange={(e) => setField('dernier_poste', e.target.value)}
            placeholder="Dernier poste occupé"
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">
            Expérience dans le domaine<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.experience_domaine ? 'is-invalid' : ''}`}
            value={responsableForm.experience_domaine}
            onChange={(e) => setField('experience_domaine', e.target.value)}
            placeholder="Ex: 5 ans en finance"
          />
          {errors.experience_domaine && (
            <div className="invalid-feedback">{errors.experience_domaine}</div>
          )}
        </div>

        <div className="col-md-12">
          <label className="form-label">Niveau de responsabilité</label>
          <textarea
            className="form-control"
            value={responsableForm.niveau_responsabilite}
            onChange={(e) => setField('niveau_responsabilite', e.target.value)}
            placeholder="Décrivez votre niveau de responsabilité..."
            rows={3}
          />
        </div>

        {/* Diplômes */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Formation / Diplômes</h5>
          <hr />
        </div>

        {errors['diplomes'] && (
          <div className="col-12">
            <div className="text-danger small mb-2">{errors['diplomes']}</div>
          </div>
        )}

        {responsableForm.diplomes.map((diplome, index) => (
          <div key={index} className="row g-2 mb-3 p-3 border rounded">
            <div className="col-md-3">
              <label className="form-label">
                Intitulé du diplôme<span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className={`form-control ${errors[`diplomes.${index}.intitule`] ? 'is-invalid' : ''}`}
                value={diplome.intitule}
                onChange={(e) => handleDiplomeChange(index, 'intitule', e.target.value)}
                placeholder="Ex: Master en Finance"
              />
              {errors[`diplomes.${index}.intitule`] && (
                <div className="invalid-feedback">{errors[`diplomes.${index}.intitule`]}</div>
              )}
            </div>

            <div className="col-md-3">
              <label className="form-label">
                Niveau<span className="text-danger">*</span>
              </label>
              <select
                className={`form-select ${errors[`diplomes.${index}.niveau`] ? 'is-invalid' : ''}`}
                value={diplome.niveau}
                onChange={(e) => handleDiplomeChange(index, 'niveau', e.target.value)}
              >
                <option value="">Sélectionner</option>
                <option value="Bac">Bac</option>
                <option value="Bac+2">Bac+2</option>
                <option value="Bac+3">Bac+3</option>
                <option value="Bac+5">Bac+5</option>
                <option value="Doctorat">Doctorat</option>
              </select>
              {errors[`diplomes.${index}.niveau`] && (
                <div className="invalid-feedback">{errors[`diplomes.${index}.niveau`]}</div>
              )}
            </div>

            <div className="col-md-2">
              <label className="form-label">
                Année<span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className={`form-control ${errors[`diplomes.${index}.annee`] ? 'is-invalid' : ''}`}
                value={diplome.annee}
                onChange={(e) => handleDiplomeChange(index, 'annee', e.target.value)}
                placeholder="2023"
              />
              {errors[`diplomes.${index}.annee`] && (
                <div className="invalid-feedback">{errors[`diplomes.${index}.annee`]}</div>
              )}
            </div>

            <div className="col-md-3">
              <label className="form-label">
                Établissement<span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className={`form-control ${errors[`diplomes.${index}.etablissement`] ? 'is-invalid' : ''}`}
                value={diplome.etablissement}
                onChange={(e) => handleDiplomeChange(index, 'etablissement', e.target.value)}
                placeholder="Nom de l'établissement"
              />
              {errors[`diplomes.${index}.etablissement`] && (
                <div className="invalid-feedback">{errors[`diplomes.${index}.etablissement`]}</div>
              )}
            </div>

            <div className="col-md-1 d-flex align-items-end">
              {responsableForm.diplomes.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => handleRemoveDiplome(index)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              )}
            </div>
          </div>
        ))}

        <div className="col-12">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={handleAddDiplome}
          >
            <i className="bi bi-plus me-1"></i>
            Ajouter diplôme
          </button>
        </div>

        {/* Certifications & formations */}
        <div className="col-12 mt-3">
          <h6 className="fw-bold">Certifications professionnelles</h6>
          {responsableForm.certifications_professionnelles.map((certification, index) => (
            <div key={index} className="mb-2 d-flex">
              <input
                type="text"
                className="form-control"
                value={certification}
                onChange={(e) =>
                  handleArrayItemChange('certifications_professionnelles', index, e.target.value)
                }
                placeholder="Certification professionnelle"
              />
              {responsableForm.certifications_professionnelles.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-danger ms-2"
                  onClick={() => handleRemoveArrayItem('certifications_professionnelles', index)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => handleAddArrayItem('certifications_professionnelles')}
          >
            <i className="bi bi-plus me-1"></i>
            Ajouter certification
          </button>
        </div>

        <div className="col-12 mt-3">
          <h6 className="fw-bold">Formations continues / Stages</h6>
          {responsableForm.formations_continues.map((formation, index) => (
            <div key={index} className="mb-2 d-flex">
              <input
                type="text"
                className="form-control"
                value={formation}
                onChange={(e) => handleArrayItemChange('formations_continues', index, e.target.value)}
                placeholder="Formation continue ou stage"
              />
              {responsableForm.formations_continues.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-danger ms-2"
                  onClick={() => handleRemoveArrayItem('formations_continues', index)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => handleAddArrayItem('formations_continues')}
          >
            <i className="bi bi-plus me-1"></i>
            Ajouter formation
          </button>
        </div>

        {/* Compétences */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Compétences</h5>
          <hr />
        </div>

        <div className="col-md-4">
          <h6 className="fw-bold">Compétences techniques</h6>
          {responsableForm.competences.techniques.map((competence, index) => (
            <div key={index} className="mb-2 d-flex">
              <input
                type="text"
                className="form-control"
                value={competence}
                onChange={(e) => handleCompetenceChange('techniques', index, e.target.value)}
                placeholder="Compétence technique"
              />
              {responsableForm.competences.techniques.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-danger ms-2"
                  onClick={() => handleRemoveCompetence('techniques', index)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => handleAddCompetence('techniques')}
          >
            <i className="bi bi-plus me-1"></i>
            Ajouter compétence
          </button>
        </div>

        <div className="col-md-4">
          <h6 className="fw-bold">Compétences bureautiques</h6>
          {responsableForm.competences.bureautiques.map((competence, index) => (
            <div key={index} className="mb-2 d-flex">
              <input
                type="text"
                className="form-control"
                value={competence}
                onChange={(e) => handleCompetenceChange('bureautiques', index, e.target.value)}
                placeholder="Ex: Excel, Word, PowerPoint"
              />
              {responsableForm.competences.bureautiques.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-danger ms-2"
                  onClick={() => handleRemoveCompetence('bureautiques', index)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => handleAddCompetence('bureautiques')}
          >
            <i className="bi bi-plus me-1"></i>
            Ajouter compétence
          </button>
        </div>

        <div className="col-md-4">
          <h6 className="fw-bold">Langues</h6>
          {responsableForm.competences.langues.map((langue, index) => (
            <div key={index} className="mb-2 d-flex">
              <input
                type="text"
                className="form-control"
                value={langue}
                onChange={(e) => handleCompetenceChange('langues', index, e.target.value)}
                placeholder="Ex: Français (natif), Anglais (fluent)"
              />
              {responsableForm.competences.langues.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-danger ms-2"
                  onClick={() => handleRemoveCompetence('langues', index)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => handleAddCompetence('langues')}
          >
            <i className="bi bi-plus me-1"></i>
            Ajouter langue
          </button>
        </div>

        {/* Permis de conduire */}
        <div className="col-12 mt-3">
          <h6 className="fw-bold">Permis de conduire</h6>
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label">Type de permis</label>
              <select
                className="form-select"
                value={responsableForm.competences.permis_conduire.type}
                onChange={(e) => handlePermisChange('type', e.target.value)}
              >
                <option value="">Sélectionner</option>
                <option value="A">A (Moto)</option>
                <option value="B">B (Voiture)</option>
                <option value="C">C (Poids lourd)</option>
                <option value="D">D (Transport en commun)</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Date de validité</label>
              <input
                type="date"
                className="form-control"
                value={responsableForm.competences.permis_conduire.validite}
                onChange={(e) => handlePermisChange('validite', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Références pro */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Références professionnelles</h5>
          <hr />
        </div>

        {responsableForm.references_professionnelles.map((reference, index) => (
          <div key={index} className="row g-2 mb-3 p-3 border rounded">
            <div className="col-md-4">
              <label className="form-label">Nom de la référence</label>
              <input
                type="text"
                className="form-control"
                value={reference.nom_reference}
                onChange={(e) => handleReferenceChange(index, 'nom_reference', e.target.value)}
                placeholder="Nom et prénom"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Coordonnées</label>
              <input
                type="text"
                className="form-control"
                value={reference.coordonnees}
                onChange={(e) => handleReferenceChange(index, 'coordonnees', e.target.value)}
                placeholder="Email ou téléphone"
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Relation</label>
              <select
                className="form-select"
                value={reference.relation}
                onChange={(e) => handleReferenceChange(index, 'relation', e.target.value)}
              >
                <option value="">Sélectionner</option>
                <option value="Ancien employeur">Ancien employeur</option>
                <option value="Responsable hiérarchique">Responsable hiérarchique</option>
                <option value="Collègue">Collègue</option>
                <option value="Client">Client</option>
              </select>
            </div>
            <div className="col-md-1 d-flex align-items-end">
              {responsableForm.references_professionnelles.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={() => handleRemoveReference(index)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Engagements */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Engagements</h5>
          <hr />
        </div>

        <div className="col-md-6">
          <label className="form-label">Disponibilité pour prise de poste</label>
          <input
            type="text"
            className="form-control"
            value={responsableForm.disponibilite_prise_poste}
            onChange={(e) => setField('disponibilite_prise_poste', e.target.value)}
            placeholder="Ex: Immédiate, 15 jours, 1 mois"
          />
        </div>

        <div className="col-12 mt-3">
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="accord_confidentialite"
              checked={responsableForm.accord_confidentialite}
              onChange={(e) => setField('accord_confidentialite', e.target.checked)}
            />
            <label className="form-check-label" htmlFor="accord_confidentialite">
              Le/la recruté·e accepte de respecter la confidentialité et la loyauté envers l’organisme.
            </label>
          </div>
        </div>

        <div className="col-12">
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="accord_verification"
              checked={responsableForm.accord_verification}
              onChange={(e) => setField('accord_verification', e.target.checked)}
            />
            <label className="form-check-label" htmlFor="accord_verification">
              Le/la recruté·e autorise la vérification des informations fournies dans le cadre du recrutement.
            </label>
          </div>
        </div>

        {/* Documents à joindre */}
        <div className="col-12 mt-3">
          <h5 className="fw-bold">Documents à joindre</h5>
          <hr />
        </div>

        <div className="col-md-6">
          <label className="form-label">Lettre de motivation</label>
          <input
            type="file"
            className={`form-control ${errors['documents.lettre_motivation'] ? 'is-invalid' : ''}`}
            accept=".pdf,.doc,.docx"
            onChange={(e) => handleFileChange(e, 'lettre_motivation')}
          />
          {errors['documents.lettre_motivation'] && (
            <div className="invalid-feedback">{errors['documents.lettre_motivation']}</div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label">CV</label>
          <input
            type="file"
            className={`form-control ${errors['documents.cv'] ? 'is-invalid' : ''}`}
            accept=".pdf,.doc,.docx"
            onChange={(e) => handleFileChange(e, 'cv')}
          />
          {errors['documents.cv'] && (
            <div className="invalid-feedback">{errors['documents.cv']}</div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label">Pièce d’identité</label>
          <input
            type="file"
            className={`form-control ${errors['documents.piece_identite'] ? 'is-invalid' : ''}`}
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => handleFileChange(e, 'piece_identite')}
          />
          {errors['documents.piece_identite'] && (
            <div className="invalid-feedback">{errors['documents.piece_identite']}</div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label">Diplômes</label>
          <input
            type="file"
            className={`form-control ${errors['documents.diplomes'] ? 'is-invalid' : ''}`}
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => handleFileChange(e, 'diplomes')}
          />
          {errors['documents.diplomes'] && (
            <div className="invalid-feedback">{errors['documents.diplomes']}</div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label">Attestations d’emploi</label>
          <input
            type="file"
            className={`form-control ${errors['documents.attestations_emploi'] ? 'is-invalid' : ''}`}
            accept=".pdf,.doc,.docx"
            onChange={(e) => handleFileChange(e, 'attestations_emploi')}
          />
          {errors['documents.attestations_emploi'] && (
            <div className="invalid-feedback">{errors['documents.attestations_emploi']}</div>
          )}
        </div>

        <div className="col-md-6">
          <label className="form-label">RIB bancaire</label>
          <input
            type="file"
            className={`form-control ${errors['documents.rib_bancaire'] ? 'is-invalid' : ''}`}
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => handleFileChange(e, 'rib_bancaire')}
          />
          {errors['documents.rib_bancaire'] && (
            <div className="invalid-feedback">{errors['documents.rib_bancaire']}</div>
          )}
        </div>

        {/* Submit */}
        <div className="col-12 mt-4">
          <hr />
          <div className="d-flex justify-content-end">
            <button
              type="submit"
              className="btn btn-primary px-4"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  />
                  Enregistrement...
                </>
              ) : (
                <>
                  <i className="bi bi-save me-2"></i>
                  Enregistrer le responsable financier
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

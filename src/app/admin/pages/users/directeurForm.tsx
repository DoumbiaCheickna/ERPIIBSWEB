//src/app/admin/pages/users/directeurForm.tsx
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

interface DirectorFormProps {
  roles: { id: string; libelle: string }[];
  showSuccessToast: (msg: string) => void;
  showErrorToast: (msg: string) => void;
  fetchData: () => Promise<void>;
  /** Optionnel : permet au parent de fermer le modal automatiquement */
  onCreated?: (docId: string) => void;
}

type DirectorFormState = {
  email: string;
  login: string;
  nom: string;
  prenom: string;
  password: string;
  role_id: string;
  first_login: '1' | '0';
  telephone: string;      // 9 chiffres, on affiche +221 à gauche
  departements: string[]; // ex: ['Pédagogie', 'Scolarité']
};

type Errors = Record<string, string>;

/** --- Sécurité / Validation --- */
const sanitize = (v: string) =>
  v
    .replace(/<\s*script/gi, '') // supprime les balises script
    .replace(/[<>]/g, '')        // supprime chevrons
    .trim()
    .slice(0, 5000);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const phoneRegex = /^(70|75|76|77|78)\d{7}$/; // 9 chiffres (sans +221)
const onlyDigits = (s: string) => s.replace(/\D/g, '');

// Normalisation login (comme adminForm)
const normalizeLogin = (raw: string) => {
  let s = raw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9._-]/g, '');
  s = s.replace(/[._-]{2,}/g, '.');
  s = s.replace(/^[^a-z]+/, '');
  s = s.slice(0, 32);
  return s;
};
const loginNorm = (login: string) => login.toLowerCase();

const initialState: DirectorFormState = {
  email: '',
  login: '',
  nom: '',
  prenom: '',
  password: '',
  role_id: '',
  first_login: '1',
  telephone: '',
  departements: [],
};

export default function DirectorForm({
  roles,
  showSuccessToast,
  showErrorToast,
  fetchData,
  onCreated,
}: DirectorFormProps) {
  const [directorForm, setDirectorForm] = useState<DirectorFormState>(initialState);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  // Vérification d’unicité du login (temps réel)
  const [checkingLogin, setCheckingLogin] = useState(false);
  const [loginAvailable, setLoginAvailable] = useState<boolean | null>(null);

  const [showPwd, setShowPwd] = useState(false);

  // Détection du rôle “Directeur des Études” pour préremplir le select
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const detectedRole = useMemo(
    () => roles.find(r => normalize(r.libelle) === 'directeur des etudes') || null,
    [roles]
  );

  useEffect(() => {
    if (detectedRole && directorForm.role_id !== detectedRole.id) {
      setDirectorForm(prev => ({ ...prev, role_id: detectedRole.id }));
    }
  }, [detectedRole]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Helpers set champ + clear erreur ciblée */
  const setField = <K extends keyof DirectorFormState>(key: K, value: DirectorFormState[K]) => {
    setDirectorForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      const copy = { ...prev };
      delete copy[String(key)];
      return copy;
    });
  };

  /** --- Vérification login unique (debounce ~350ms) --- */
  useEffect(() => {
    const val = directorForm.login.trim();
    if (!val) {
      setLoginAvailable(null);
      setCheckingLogin(false);
      return;
    }
    setCheckingLogin(true);
    const t = setTimeout(async () => {
      try {
        const lower = val.toLowerCase();
        const norm = normalizeLogin(val).toLowerCase();
        const [snapExact, snapInsensitive, snapNorm] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('login', '==', val))),
          getDocs(query(collection(db, 'users'), where('login_insensitive', '==', lower))),
          getDocs(query(collection(db, 'users'), where('login_norm', '==', norm))),
        ]);
        const exists = !snapExact.empty || !snapInsensitive.empty || !snapNorm.empty;
        setLoginAvailable(!exists);
        setErrors(prev => {
          const copy = { ...prev };
          if (exists) copy.login = "Ce nom d’utilisateur existe déjà.";
          else delete copy.login;
          return copy;
        });
      } catch {
        setLoginAvailable(null);
      } finally {
        setCheckingLogin(false);
      }
    }, 350);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directorForm.login]);

  /** --- Validation au submit (tous les champs obligatoires) --- */
  const validate = async (): Promise<Errors> => {
    const err: Errors = {};
    const f = directorForm;

    // Rôle
    if (!f.role_id) err.role_id = 'Sélectionnez un rôle.';

    // Nom / Prénom
    if (!f.prenom || sanitize(f.prenom).length < 2)
      err.prenom = 'Le prénom doit comporter au moins 2 caractères.';
    if (!f.nom || sanitize(f.nom).length < 2)
      err.nom = 'Le nom doit comporter au moins 2 caractères.';

    // Email
    if (!f.email || !emailRegex.test(f.email))
      err.email = 'Adresse e-mail invalide.';

    // Login (unicité)
    if (!f.login) err.login = "Le nom d’utilisateur est requis.";
    if (!err.login) {
      const lower = f.login.toLowerCase();
      const norm = normalizeLogin(f.login).toLowerCase();
      const [snapExact, snapInsensitive, snapNorm] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('login', '==', f.login))),
        getDocs(query(collection(db, 'users'), where('login_insensitive', '==', lower))),
        getDocs(query(collection(db, 'users'), where('login_norm', '==', norm))),
      ]);
      if (!snapExact.empty || !snapInsensitive.empty || !snapNorm.empty) {
        err.login = "Ce nom d’utilisateur existe déjà.";
      }
    }

    // Password (requis mais pas de min)
    if (!f.password) err.password = 'Le mot de passe est requis.';

    // Téléphone (+221 affiché ; 9 chiffres commençant par 70/75/76/77/78)
    if (!f.telephone) err.telephone = 'Le téléphone est requis.';
    else if (!phoneRegex.test(f.telephone))
      err.telephone =
        'Numéro invalide. 9 chiffres commençant par 70, 75, 76, 77 ou 78.';

    // Départements : au moins un
    if (!f.departements.length)
      err.departements = 'Choisissez au moins un département.';

    return err;
  };

  /** --- Auth secondaire pour ne pas déconnecter l’admin courant --- */
  const getSecondaryAuth = () => {
    const primary = getApp();
    const options = primary.options as FirebaseOptions;
    const name = 'director-worker';
    const secApp = getApps().find(a => a.name === name) || initializeApp(options, name);
    return getAuth(secApp);
  };

  /** --- Submit --- */
  const handleDirectorSubmit = async (e: React.FormEvent) => {
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

      const selectedRole =
        roles.find(r => r.id === directorForm.role_id) || detectedRole;
      if (!selectedRole) {
        showErrorToast('Rôle sélectionné invalide.');
        setSubmitting(false);
        return;
      }

      // 1) Création dans Firebase Auth (app secondaire)
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(
        secAuth,
        directorForm.email.trim(),
        directorForm.password
      );
      const uid = cred.user.uid;

      await updateProfile(cred.user, {
        displayName: `${sanitize(directorForm.prenom)} ${sanitize(directorForm.nom)}`.trim(),
      });

      // Important: on se déconnecte de l'app secondaire pour ne pas polluer la session admin
      await signOut(secAuth).catch(() => {});

      // 2) Écriture Firestore (docId = UID) — NE PAS stocker le mot de passe
      const normalizedLogin = normalizeLogin(directorForm.login);
      const clean = {
        email: sanitize(directorForm.email),
        login: normalizedLogin,
        login_insensitive: normalizedLogin.toLowerCase(),
        login_norm: loginNorm(normalizedLogin),

        nom: sanitize(directorForm.nom),
        prenom: sanitize(directorForm.prenom),

        role_id: selectedRole.id,
        role_libelle: selectedRole.libelle,
        role_key: 'directeur_des_etudes',

        first_login: '1' as const,
        telephone: sanitize(directorForm.telephone),

        // champ texte rétro-compat : "departement"
        departement: sanitize(directorForm.departements.join(', ')),
        // structure conseillée : tableau
        departements: directorForm.departements.map(sanitize),

        created_at: serverTimestamp(),

        // uid
        uid,
      };

      await setDoc(doc(db, 'users', uid), clean);

      showSuccessToast('Directeur des Études ajouté avec succès !');

      // Reset
      setDirectorForm(initialState);
      setLoginAvailable(null);
      await fetchData();

      // Fermer le modal si le parent expose onCreated (avec l’UID)
      onCreated?.(uid);
    } catch (error: any) {
      console.error('Erreur lors de l’ajout du Directeur des Études:', error);
      const code = error?.code || '';
      if (code.startsWith('auth/')) {
        if (code === 'auth/email-already-in-use') {
          setErrors(e => ({ ...e, email: 'Cet email est déjà utilisé.' }));
        } else if (code === 'auth/invalid-email') {
          setErrors(e => ({ ...e, email: 'Adresse email invalide.' }));
        } else if (code === 'auth/weak-password') {
          setErrors(e => ({ ...e, password: 'Mot de passe jugé trop faible.' }));
        }
        showErrorToast('Création dans Firebase Auth échouée.');
      } else {
        showErrorToast('Écriture dans la base échouée. Vérifiez les règles Firestore.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** --- UI --- */
  const toggleDepartement = (name: 'Pédagogie' | 'Scolarité') => {
    setDirectorForm(prev => {
      const has = prev.departements.includes(name);
      const next = has
        ? prev.departements.filter(d => d !== name)
        : [...prev.departements, name];
      return { ...prev, departements: next };
    });
    setErrors(prev => {
      const copy = { ...prev };
      delete copy.departements;
      return copy;
    });
  };

  return (
    <form onSubmit={handleDirectorSubmit} noValidate>
      <div className="row g-3">
        <div className="col-12">
          <h5 className="fw-bold">Directeur des Études</h5>
          <hr />
        </div>

        {/* Rôle (prérempli) */}
        <div className="col-md-6">
          <label className="form-label">
            Rôle<span className="text-danger">*</span>
          </label>
          <select
            className={`form-select ${errors.role_id ? 'is-invalid' : ''}`}
            value={directorForm.role_id}
            onChange={(e) => setField('role_id', e.target.value)}
            required
          >
            <option value="">Sélectionner un rôle</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>
                {r.libelle}
              </option>
            ))}
          </select>
          {errors.role_id && (
            <div className="invalid-feedback d-block">{errors.role_id}</div>
          )}
        </div>

        {/* Prénom */}
        <div className="col-md-6">
          <label className="form-label">
            Prénom<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.prenom ? 'is-invalid' : ''}`}
            value={directorForm.prenom}
            onChange={(e) => setField('prenom', e.target.value)}
            placeholder="Entrez le prénom"
          />
          {errors.prenom && <div className="invalid-feedback">{errors.prenom}</div>}
        </div>

        {/* Nom */}
        <div className="col-md-6">
          <label className="form-label">
            Nom<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.nom ? 'is-invalid' : ''}`}
            value={directorForm.nom}
            onChange={(e) => setField('nom', e.target.value)}
            placeholder="Entrez le nom"
          />
          {errors.nom && <div className="invalid-feedback">{errors.nom}</div>}
        </div>

        {/* Email */}
        <div className="col-md-6">
          <label className="form-label">
            Email<span className="text-danger">*</span>
          </label>
          <input
            type="email"
            className={`form-control ${errors.email ? 'is-invalid' : ''}`}
            value={directorForm.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="exemple@email.com"
          />
          {errors.email && <div className="invalid-feedback">{errors.email}</div>}
        </div>

        {/* Login + vérif dispo */}
        <div className="col-md-6">
          <label className="form-label">
            Nom d’utilisateur<span className="text-danger">*</span>
          </label>
          <input
            type="text"
            className={`form-control ${errors.login ? 'is-invalid' : ''}`}
            value={directorForm.login}
            onChange={(e) => setField('login', e.target.value)}
            placeholder="Nom d'utilisateur unique"
          />
          {errors.login && <div className="invalid-feedback">{errors.login}</div>}
          {!errors.login && directorForm.login && loginAvailable === true && (
            <div className="form-text text-success">Nom d’utilisateur disponible</div>
          )}
          {!errors.login && directorForm.login && loginAvailable === false && (
            <div className="text-danger small">Ce nom d’utilisateur est déjà pris.</div>
          )}
          {checkingLogin && (
            <div className="form-text">Vérification de la disponibilité…</div>
          )}
        </div>

        {/* Mot de passe (requis, pas de min) */}
        <div className="col-md-6">
          <label className="form-label">
            Mot de passe<span className="text-danger">*</span>
          </label>

          <div className="input-group">
            <input
              type={showPwd ? 'text' : 'password'}
              className={`form-control ${errors.password ? 'is-invalid' : ''}`}
              value={directorForm.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder="Mot de passe"
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

          {errors.password && <div className="invalid-feedback d-block">{errors.password}</div>}
        </div>

        {/* Téléphone (+221 + contraintes) */}
        <div className="col-md-6">
          <label className="form-label">
            Téléphone<span className="text-danger">*</span>
          </label>
          <div className="input-group">
            <span className="input-group-text">+221</span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={9}
              className={`form-control ${errors.telephone ? 'is-invalid' : ''}`}
              value={directorForm.telephone}
              onChange={(e) => setField('telephone', onlyDigits(e.target.value).slice(0, 9))}
              placeholder="Ex: 770000000"
            />
          </div>
          {errors.telephone && (
            <div className="invalid-feedback d-block">{errors.telephone}</div>
          )}
        </div>

        {/* Départements (checkbox – au moins un) */}
        <div className="col-12">
          <label className="form-label">
            Département(s)<span className="text-danger">*</span>
          </label>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="dep-pedagogie"
              checked={directorForm.departements.includes('Pédagogie')}
              onChange={() => toggleDepartement('Pédagogie')}
            />
            <label className="form-check-label" htmlFor="dep-pedagogie">
              Pédagogie
            </label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="dep-scolarite"
              checked={directorForm.departements.includes('Scolarité')}
              onChange={() => toggleDepartement('Scolarité')}
            />
            <label className="form-check-label" htmlFor="dep-scolarite">
              Scolarité
            </label>
          </div>
          {errors.departements && (
            <div className="text-danger small mt-1">{errors.departements}</div>
          )}
        </div>

        <div className="col-12">
          <div className="alert alert-info mt-2">
            <i className="bi bi-info-circle me-2"></i>
            La première connexion est activée pour forcer le changement de mot de passe.
          </div>
        </div>

        <div className="col-12 mt-2">
          <button type="submit" className="btn btn-primary px-4" disabled={submitting}>
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
                <i className="bi bi-plus-lg me-2"></i>
                Ajouter le Directeur des Études
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

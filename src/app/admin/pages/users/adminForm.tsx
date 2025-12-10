//src/app/admin/pages/users/adminForm.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  limit as fbLimit,
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

interface Role { id: string; libelle: string; }

interface AdminFormProps {
  roles: Role[];
  showSuccessToast: (msg: string) => void;
  showErrorToast: (msg: string) => void;
  fetchData: () => Promise<void>;
  onCreated?: () => void;
}

/* Helpers */
const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const hasMinChars = (s: string, min = 2) => s.trim().length >= min;
const sanitizeText = (s: string) =>
  s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
const normalizeLogin = (raw: string) => {
  let s = raw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9._-]/g, '');
  s = s.replace(/[._-]{2,}/g, '.');
  s = s.replace(/^[^a-z]+/, '');
  s = s.slice(0, 32);
  return s;
};
const isLoginValidShape = (login: string) => /^[a-z][a-z0-9._-]{2,31}$/.test(login);
const loginNorm = (login: string) => login.toLowerCase();

/* Component */
export default function AdminForm({
  roles,
  showSuccessToast,
  showErrorToast,
  fetchData,
  onCreated,
}: AdminFormProps) {
  const adminRole = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return roles.find(r => {
      const l = norm(r.libelle);
      return l === 'administrateur' || l === 'admin';
    }) || null;
  }, [roles]);

  // en haut du composant, avec les autres useState :
  const [showPwd, setShowPwd] = useState(false);

  const [adminForm, setAdminForm] = useState({
    email: '',
    login: '',
    nom: '',
    prenom: '',
    password: '',
    role_id: '',
    first_login: '1' as '1' | '0',
  });

  useEffect(() => {
    if (adminRole && !adminForm.role_id) {
      setAdminForm(p => ({ ...p, role_id: adminRole.id }));
    }
  }, [adminRole]); // eslint-disable-line react-hooks/exhaustive-deps

  type FieldErrors = {
    prenom?: string[];
    nom?: string[];
    email?: string[];
    login?: string[];
    password?: string[];
    role_id?: string[];
  };
  const [errors, setErrors] = useState<FieldErrors>({});
  const [checkingLogin, setCheckingLogin] = useState(false);
  const [loginTaken, setLoginTaken] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* Validations */
  const setFieldError = (f: keyof FieldErrors, msgs?: string[]) =>
    setErrors(prev => ({ ...prev, [f]: msgs }));

  const validatePrenom = () => {
    const v = sanitizeText(adminForm.prenom);
    if (!hasMinChars(v, 2)) { setFieldError('prenom', ['Le prénom doit contenir au moins 2 caractères.']); return false; }
    setFieldError('prenom', undefined); return true;
  };
  const validateNom = () => {
    const v = sanitizeText(adminForm.nom);
    if (!hasMinChars(v, 2)) { setFieldError('nom', ['Le nom doit contenir au moins 2 caractères.']); return false; }
    setFieldError('nom', undefined); return true;
  };
  const validateEmail = () => {
    const v = adminForm.email.trim();
    if (!v) { setFieldError('email', ['Email requis.']); return false; }
    if (!EMAIL_REGEX.test(v)) { setFieldError('email', ['Adresse email invalide.']); return false; }
    setFieldError('email', undefined); return true;
  };
  const validatePassword = () => {
    const v = adminForm.password;
    if (!v) { setFieldError('password', ['Mot de passe requis (temporaire).']); return false; }
    setFieldError('password', undefined); return true;
  };
  const validateRole = () => {
    if (!adminForm.role_id) { setFieldError('role_id', ['Rôle requis (pré-rempli Administrateur).']); return false; }
    setFieldError('role_id', undefined); return true;
  };
  const validateLoginShape = () => {
    const normalized = normalizeLogin(adminForm.login);
    if (!normalized) {
      setFieldError('login', ["Nom d'utilisateur requis. Utilisez lettres, chiffres, '.', '_' ou '-'."]);
    }
    if (!isLoginValidShape(normalized)) {
      setFieldError('login', ["Format invalide. 3–32 caractères, commence par une lettre, autorisé: lettres, chiffres, '.', '_' ou '-'."]);
      return { ok: false, normalized, usable: false };
    }
    setFieldError('login', undefined); return { ok: true, normalized, usable: true };
  };

  /* Unicité du login (Firestore) */
  const checkLoginExists = async (login: string) => {
    setCheckingLogin(true);
    const norm = loginNorm(login);
    try {
      const usersCol = collection(db, 'users');
      const byNorm = await getDocs(query(usersCol, where('login_norm', '==', norm), fbLimit(1)));
      if (!byNorm.empty) return true;
      const byExact = await getDocs(query(usersCol, where('login', '==', login), fbLimit(1)));
      return !byExact.empty;
    } catch (e) {
      console.error('Erreur vérif login unique:', e);
      return true;
    } finally { setCheckingLogin(false); }
  };

  const onBlurLogin = async () => {
    const normalized = normalizeLogin(adminForm.login);
    if (normalized !== adminForm.login) setAdminForm(p => ({ ...p, login: normalized }));
    const { usable } = validateLoginShape();
    if (!usable) { setLoginTaken(null); return; }
    const taken = await checkLoginExists(normalized);
    setLoginTaken(taken);
    if (taken) setFieldError('login', ["Ce nom d'utilisateur est déjà pris."]);
  };

  const validateAll = async () => {
    const okP = validatePrenom();
    const okN = validateNom();
    const okE = validateEmail();
    const okPwd = validatePassword();
    const okR = validateRole();
    const { usable, normalized } = validateLoginShape();
    let okUnique = true;
    if (usable) {
      const taken = await checkLoginExists(normalized);
      setLoginTaken(taken);
      if (taken) { setFieldError('login', ["Ce nom d'utilisateur est déjà pris."]); okUnique = false; }
    }
    return okP && okN && okE && okPwd && okR && usable && okUnique;
  };

  /* Secondary Auth (pour ne pas déconnecter l’admin courant) */
  const getSecondaryAuth = () => {
    const primary = getApp();
    const options = primary.options as FirebaseOptions;
    const name = 'admin-worker';
    const secApp = getApps().find(a => a.name === name) || initializeApp(options, name);
    return getAuth(secApp);
  };

  /* Submit */
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const isValid = await validateAll();
    if (!isValid) {
      showErrorToast('Veuillez corriger les erreurs.');
      setSubmitting(false);
      return;
    }

    const clean = {
      prenom: sanitizeText(adminForm.prenom),
      nom: sanitizeText(adminForm.nom),
      email: adminForm.email.trim(),
      login: normalizeLogin(adminForm.login),
      role_id: adminForm.role_id,
      role_libelle: roles.find(r => r.id === adminForm.role_id)?.libelle || 'Administrateur',
      role_key: 'admin',
      login_norm: loginNorm(normalizeLogin(adminForm.login)),
      first_login: '1' as const,
      created_at: serverTimestamp(),
    };

    let uid: string | null = null;
    try {
      // 1) Crée l’utilisateur dans Firebase Auth (secondary app)
      const secAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secAuth, clean.email, adminForm.password);
      uid = cred.user.uid;
      await updateProfile(cred.user, { displayName: `${clean.prenom} ${clean.nom}`.trim() });
      await signOut(secAuth).catch(() => {});

      // 2) Écrit la fiche dans Firestore avec le **UID comme docId**
      const userDoc = {
        ...clean,
        uid,
        // ne stocke PAS le mot de passe
      };
      await setDoc(doc(db, 'users', uid), userDoc); // ✅ écriture certaine, docId = uid

      showSuccessToast('Administrateur ajouté avec succès !');
      setAdminForm({
        email: '',
        login: '',
        nom: '',
        prenom: '',
        password: '',
        role_id: adminRole?.id || '',
        first_login: '1',
      });
      setErrors({});
      setLoginTaken(null);

      await fetchData();
      onCreated?.();

    } catch (err: any) {
      console.error('Erreur lors de la création:', err);
      const code = err?.code || '';
      if (code.startsWith('auth/')) {
        if (code === 'auth/email-already-in-use') setFieldError('email', ['Cet email est déjà utilisé.']);
        else if (code === 'auth/invalid-email') setFieldError('email', ['Adresse email invalide.']);
        else if (code === 'auth/weak-password') setFieldError('password', ['Mot de passe jugé trop faible.']);
        showErrorToast('Création dans Firebase Auth échouée.');
      } else {
        // Probable erreur de règles Firestore (permission-denied) ou réseau
        showErrorToast("Écriture dans la base échouée. Vérifiez les règles Firestore.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderErrors = (field?: keyof FieldErrors) =>
    field && errors[field]?.length ? (
      <ul className="mt-1 mb-0 ps-3 text-danger small">
        {errors[field]!.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    ) : null;

  const disableSubmit =
    submitting ||
    checkingLogin ||
    Object.values(errors).some(arr => (arr?.length || 0) > 0) ||
    !adminForm.email ||
    !adminForm.login ||
    !adminForm.nom ||
    !adminForm.prenom ||
    !adminForm.password ||
    !adminForm.role_id;

  return (
    <form onSubmit={handleAdminSubmit} noValidate>
      <div className="row g-3">
        <div className="col-12"><h5 className="fw-bold">Profil administrateur</h5><hr /></div>

        <div className="col-md-6">
          <label className="form-label">Prénom<span className="text-danger">*</span></label>
          <input
            type="text"
            className={`form-control ${errors.prenom ? 'is-invalid' : ''}`}
            value={adminForm.prenom}
            onChange={(e) => setAdminForm(p => ({ ...p, prenom: e.target.value }))}
            onBlur={validatePrenom}
            autoComplete="off"
            minLength={2}
          />
          {renderErrors('prenom')}
        </div>

        <div className="col-md-6">
          <label className="form-label">Nom<span className="text-danger">*</span></label>
          <input
            type="text"
            className={`form-control ${errors.nom ? 'is-invalid' : ''}`}
            value={adminForm.nom}
            onChange={(e) => setAdminForm(p => ({ ...p, nom: e.target.value }))}
            onBlur={validateNom}
            autoComplete="off"
            minLength={2}
          />
          {renderErrors('nom')}
        </div>

        <div className="col-md-6">
          <label className="form-label">Email<span className="text-danger">*</span></label>
          <input
            type="email"
            className={`form-control ${errors.email ? 'is-invalid' : ''}`}
            value={adminForm.email}
            onChange={(e) => setAdminForm(p => ({ ...p, email: e.target.value }))}
            onBlur={validateEmail}
            placeholder="exemple@email.com"
            autoComplete="off"
            inputMode="email"
          />
          {renderErrors('email')}
        </div>

        <div className="col-md-6">
          <label className="form-label">Nom d&apos;utilisateur<span className="text-danger">*</span></label>
          <div className="input-group">
            <input
              type="text"
              className={`form-control ${errors.login ? 'is-invalid' : ''}`}
              value={adminForm.login}
              onChange={(e) => setAdminForm(p => ({ ...p, login: e.target.value }))}
              onBlur={onBlurLogin}
              placeholder="ex: j.dupont ou jean-dupont"
              autoComplete="off"
            />
            <span className="input-group-text bg-white">
              {checkingLogin ? (
                <span className="spinner-border spinner-border-sm" />
              ) : loginTaken === true ? (
                <i className="bi bi-x-circle text-danger" />
              ) : loginTaken === false ? (
                <i className="bi bi-check-circle text-success" />
              ) : (
                <i className="bi bi-person" />
              )}
            </span>
          </div>
          <small className="text-muted d-block mt-1">
            3–32 caractères, commence par une lettre. Autorisés: lettres, chiffres,
            <code> . _ -</code>
          </small>
          {renderErrors('login')}
        </div>

        {/* --- remplace ce bloc --- */}
        <div className="col-md-6">
          <label className="form-label">
            Mot de passe (temporaire)<span className="text-danger">*</span>
          </label>

          <div className="input-group">
            <input
              type={showPwd ? 'text' : 'password'}
              className={`form-control ${errors.password ? 'is-invalid' : ''}`}
              value={adminForm.password}
              onChange={(e) => setAdminForm(p => ({ ...p, password: e.target.value }))}
              onBlur={validatePassword}
              placeholder="Mot de passe initial"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setShowPwd(s => !s)}
              title={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showPwd}
              tabIndex={0}
            >
              {showPwd ? <i className="bi bi-eye-slash" /> : <i className="bi bi-eye" />}
            </button>
          </div>

          {renderErrors('password')}
          <small className="text-muted d-block mt-1">
            Ce mot de passe sera demandé puis <strong>changé</strong> à la première connexion.
          </small>
        </div>

        <div className="col-md-6">
          <label className="form-label">Rôle<span className="text-danger">*</span></label>
          <select
            className={`form-select ${errors.role_id ? 'is-invalid' : ''}`}
            value={adminForm.role_id}
            onChange={(e) => setAdminForm(p => ({ ...p, role_id: e.target.value }))}
            disabled
          >
            {adminRole ? <option value={adminRole.id}>{adminRole.libelle}</option> : <option value="">Aucun rôle Admin trouvé</option>}
          </select>
          <small className="text-muted d-block mt-1">Rôle fixé à Administrateur pour éviter les erreurs.</small>
          {renderErrors('role_id')}
        </div>

        <div className="col-12 mt-2">
          <button type="submit" className="btn btn-primary px-4" disabled={disableSubmit}>
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                Enregistrement...
              </>
            ) : (
              <>
                <i className="bi bi-plus-lg me-2" />
                Ajouter l&apos;administrateur
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

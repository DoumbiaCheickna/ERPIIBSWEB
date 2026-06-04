// //src/app/admin/pages/users/directeurForm.tsx
// 'use client';

// import { useEffect, useMemo, useState } from 'react';
// import {
//   collection,
//   getDocs,
//   query,
//   where,
//   serverTimestamp,
//   doc,
//   setDoc,
// } from 'firebase/firestore';
// import { db } from '../../../../../firebaseConfig';

// import {
//   getApp,
//   getApps,
//   initializeApp,
//   FirebaseOptions,
// } from 'firebase/app';
// import {
//   getAuth,
//   createUserWithEmailAndPassword,
//   updateProfile,
//   signOut,
// } from 'firebase/auth';

// interface DirectorFormProps {
//   roles: { id: string; libelle: string }[];
//   showSuccessToast: (msg: string) => void;
//   showErrorToast: (msg: string) => void;
//   fetchData: () => Promise<void>;
//   /** Optionnel : permet au parent de fermer le modal automatiquement */
//   onCreated?: (docId: string) => void;
// }

// type DirectorFormState = {
//   email: string;
//   login: string;
//   nom: string;
//   prenom: string;
//   password: string;
//   role_id: string;
//   first_login: '1' | '0';
//   telephone: string;      // 9 chiffres, on affiche +221 à gauche
//   departements: string[]; // ex: ['Pédagogie', 'Scolarité']
// };

// type Errors = Record<string, string>;

// /** --- Sécurité / Validation --- */
// const sanitize = (v: string) =>
//   v
//     .replace(/<\s*script/gi, '') // supprime les balises script
//     .replace(/[<>]/g, '')        // supprime chevrons
//     .trim()
//     .slice(0, 5000);

// const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
// const phoneRegex = /^(70|75|76|77|78)\d{7}$/; // 9 chiffres (sans +221)
// const onlyDigits = (s: string) => s.replace(/\D/g, '');

// // Normalisation login (comme adminForm)
// const normalizeLogin = (raw: string) => {
//   let s = raw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
//   s = s.replace(/[^a-z0-9._-]/g, '');
//   s = s.replace(/[._-]{2,}/g, '.');
//   s = s.replace(/^[^a-z]+/, '');
//   s = s.slice(0, 32);
//   return s;
// };
// const loginNorm = (login: string) => login.toLowerCase();

// const initialState: DirectorFormState = {
//   email: '',
//   login: '',
//   nom: '',
//   prenom: '',
//   password: '',
//   role_id: '',
//   first_login: '1',
//   telephone: '',
//   departements: [],
// };

// export default function DirectorForm({
//   roles,
//   showSuccessToast,
//   showErrorToast,
//   fetchData,
//   onCreated,
// }: DirectorFormProps) {
//   const [directorForm, setDirectorForm] = useState<DirectorFormState>(initialState);
//   const [errors, setErrors] = useState<Errors>({});
//   const [submitting, setSubmitting] = useState(false);

//   // Vérification d’unicité du login (temps réel)
//   const [checkingLogin, setCheckingLogin] = useState(false);
//   const [loginAvailable, setLoginAvailable] = useState<boolean | null>(null);

//   const [showPwd, setShowPwd] = useState(false);

//   // Détection du rôle “Directeur des Études” pour préremplir le select
//   const normalize = (s: string) =>
//     s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
//   const detectedRole = useMemo(
//     () => roles.find(r => normalize(r.libelle) === 'directeur des etudes') || null,
//     [roles]
//   );

//   useEffect(() => {
//     if (detectedRole && directorForm.role_id !== detectedRole.id) {
//       setDirectorForm(prev => ({ ...prev, role_id: detectedRole.id }));
//     }
//   }, [detectedRole]); // eslint-disable-line react-hooks/exhaustive-deps

//   /** Helpers set champ + clear erreur ciblée */
//   const setField = <K extends keyof DirectorFormState>(key: K, value: DirectorFormState[K]) => {
//     setDirectorForm(prev => ({ ...prev, [key]: value }));
//     setErrors(prev => {
//       const copy = { ...prev };
//       delete copy[String(key)];
//       return copy;
//     });
//   };

//   /** --- Vérification login unique (debounce ~350ms) --- */
//   useEffect(() => {
//     const val = directorForm.login.trim();
//     if (!val) {
//       setLoginAvailable(null);
//       setCheckingLogin(false);
//       return;
//     }
//     setCheckingLogin(true);
//     const t = setTimeout(async () => {
//       try {
//         const lower = val.toLowerCase();
//         const norm = normalizeLogin(val).toLowerCase();
//         const [snapExact, snapInsensitive, snapNorm] = await Promise.all([
//           getDocs(query(collection(db, 'users'), where('login', '==', val))),
//           getDocs(query(collection(db, 'users'), where('login_insensitive', '==', lower))),
//           getDocs(query(collection(db, 'users'), where('login_norm', '==', norm))),
//         ]);
//         const exists = !snapExact.empty || !snapInsensitive.empty || !snapNorm.empty;
//         setLoginAvailable(!exists);
//         setErrors(prev => {
//           const copy = { ...prev };
//           if (exists) copy.login = "Ce nom d’utilisateur existe déjà.";
//           else delete copy.login;
//           return copy;
//         });
//       } catch {
//         setLoginAvailable(null);
//       } finally {
//         setCheckingLogin(false);
//       }
//     }, 350);

//     return () => clearTimeout(t);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [directorForm.login]);

//   /** --- Validation au submit (tous les champs obligatoires) --- */
//   const validate = async (): Promise<Errors> => {
//     const err: Errors = {};
//     const f = directorForm;

//     // Rôle
//     if (!f.role_id) err.role_id = 'Sélectionnez un rôle.';

//     // Nom / Prénom
//     if (!f.prenom || sanitize(f.prenom).length < 2)
//       err.prenom = 'Le prénom doit comporter au moins 2 caractères.';
//     if (!f.nom || sanitize(f.nom).length < 2)
//       err.nom = 'Le nom doit comporter au moins 2 caractères.';

//     // Email
//     if (!f.email || !emailRegex.test(f.email))
//       err.email = 'Adresse e-mail invalide.';

//     // Login (unicité)
//     if (!f.login) err.login = "Le nom d’utilisateur est requis.";
//     if (!err.login) {
//       const lower = f.login.toLowerCase();
//       const norm = normalizeLogin(f.login).toLowerCase();
//       const [snapExact, snapInsensitive, snapNorm] = await Promise.all([
//         getDocs(query(collection(db, 'users'), where('login', '==', f.login))),
//         getDocs(query(collection(db, 'users'), where('login_insensitive', '==', lower))),
//         getDocs(query(collection(db, 'users'), where('login_norm', '==', norm))),
//       ]);
//       if (!snapExact.empty || !snapInsensitive.empty || !snapNorm.empty) {
//         err.login = "Ce nom d’utilisateur existe déjà.";
//       }
//     }

//     // Password (requis mais pas de min)
//     if (!f.password) err.password = 'Le mot de passe est requis.';

//     // Téléphone (+221 affiché ; 9 chiffres commençant par 70/75/76/77/78)
//     if (!f.telephone) err.telephone = 'Le téléphone est requis.';
//     else if (!phoneRegex.test(f.telephone))
//       err.telephone =
//         'Numéro invalide. 9 chiffres commençant par 70, 75, 76, 77 ou 78.';

//     // Départements : au moins un
//     if (!f.departements.length)
//       err.departements = 'Choisissez au moins un département.';

//     return err;
//   };

//   /** --- Auth secondaire pour ne pas déconnecter l’admin courant --- */
//   const getSecondaryAuth = () => {
//     const primary = getApp();
//     const options = primary.options as FirebaseOptions;
//     const name = 'director-worker';
//     const secApp = getApps().find(a => a.name === name) || initializeApp(options, name);
//     return getAuth(secApp);
//   };

//   /** --- Submit --- */
//   const handleDirectorSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (submitting) return;
//     setSubmitting(true);
//     setErrors({});

//     try {
//       const err = await validate();
//       if (Object.keys(err).length) {
//         setErrors(err);
//         showErrorToast('Veuillez corriger les champs en rouge.');
//         setSubmitting(false);
//         return;
//       }

//       const selectedRole =
//         roles.find(r => r.id === directorForm.role_id) || detectedRole;
//       if (!selectedRole) {
//         showErrorToast('Rôle sélectionné invalide.');
//         setSubmitting(false);
//         return;
//       }

//       // 1) Création dans Firebase Auth (app secondaire)
//       const secAuth = getSecondaryAuth();
//       const cred = await createUserWithEmailAndPassword(
//         secAuth,
//         directorForm.email.trim(),
//         directorForm.password
//       );
//       const uid = cred.user.uid;

//       await updateProfile(cred.user, {
//         displayName: `${sanitize(directorForm.prenom)} ${sanitize(directorForm.nom)}`.trim(),
//       });

//       // Important: on se déconnecte de l'app secondaire pour ne pas polluer la session admin
//       await signOut(secAuth).catch(() => {});

//       // 2) Écriture Firestore (docId = UID) — NE PAS stocker le mot de passe
//       const normalizedLogin = normalizeLogin(directorForm.login);
//       const clean = {
//         email: sanitize(directorForm.email),
//         login: normalizedLogin,
//         login_insensitive: normalizedLogin.toLowerCase(),
//         login_norm: loginNorm(normalizedLogin),

//         nom: sanitize(directorForm.nom),
//         prenom: sanitize(directorForm.prenom),

//         role_id: selectedRole.id,
//         role_libelle: selectedRole.libelle,
//         role_key: 'directeur_des_etudes',

//         first_login: '1' as const,
//         telephone: sanitize(directorForm.telephone),

//         // champ texte rétro-compat : "departement"
//         departement: sanitize(directorForm.departements.join(', ')),
//         // structure conseillée : tableau
//         departements: directorForm.departements.map(sanitize),

//         created_at: serverTimestamp(),

//         // uid
//         uid,
//       };

//       await setDoc(doc(db, 'users', uid), clean);

//       showSuccessToast('Directeur des Études ajouté avec succès !');

//       // Reset
//       setDirectorForm(initialState);
//       setLoginAvailable(null);
//       await fetchData();

//       // Fermer le modal si le parent expose onCreated (avec l’UID)
//       onCreated?.(uid);
//     } catch (error: any) {
//       console.error('Erreur lors de l’ajout du Directeur des Études:', error);
//       const code = error?.code || '';
//       if (code.startsWith('auth/')) {
//         if (code === 'auth/email-already-in-use') {
//           setErrors(e => ({ ...e, email: 'Cet email est déjà utilisé.' }));
//         } else if (code === 'auth/invalid-email') {
//           setErrors(e => ({ ...e, email: 'Adresse email invalide.' }));
//         } else if (code === 'auth/weak-password') {
//           setErrors(e => ({ ...e, password: 'Mot de passe jugé trop faible.' }));
//         }
//         showErrorToast('Création dans Firebase Auth échouée.');
//       } else {
//         showErrorToast('Écriture dans la base échouée. Vérifiez les règles Firestore.');
//       }
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   /** --- UI --- */
//   const toggleDepartement = (name: 'Pédagogie' | 'Scolarité') => {
//     setDirectorForm(prev => {
//       const has = prev.departements.includes(name);
//       const next = has
//         ? prev.departements.filter(d => d !== name)
//         : [...prev.departements, name];
//       return { ...prev, departements: next };
//     });
//     setErrors(prev => {
//       const copy = { ...prev };
//       delete copy.departements;
//       return copy;
//     });
//   };

//   return (
//     <form onSubmit={handleDirectorSubmit} noValidate>
//       <div className="row g-3">
//         <div className="col-12">
//           <h5 className="fw-bold">Directeur des Études</h5>
//           <hr />
//         </div>

//         {/* Rôle (prérempli) */}
//         <div className="col-md-6">
//           <label className="form-label">
//             Rôle<span className="text-danger">*</span>
//           </label>
//           <select
//             className={`form-select ${errors.role_id ? 'is-invalid' : ''}`}
//             value={directorForm.role_id}
//             onChange={(e) => setField('role_id', e.target.value)}
//             required
//           >
//             <option value="">Sélectionner un rôle</option>
//             {roles.map(r => (
//               <option key={r.id} value={r.id}>
//                 {r.libelle}
//               </option>
//             ))}
//           </select>
//           {errors.role_id && (
//             <div className="invalid-feedback d-block">{errors.role_id}</div>
//           )}
//         </div>

//         {/* Prénom */}
//         <div className="col-md-6">
//           <label className="form-label">
//             Prénom<span className="text-danger">*</span>
//           </label>
//           <input
//             type="text"
//             className={`form-control ${errors.prenom ? 'is-invalid' : ''}`}
//             value={directorForm.prenom}
//             onChange={(e) => setField('prenom', e.target.value)}
//             placeholder="Entrez le prénom"
//           />
//           {errors.prenom && <div className="invalid-feedback">{errors.prenom}</div>}
//         </div>

//         {/* Nom */}
//         <div className="col-md-6">
//           <label className="form-label">
//             Nom<span className="text-danger">*</span>
//           </label>
//           <input
//             type="text"
//             className={`form-control ${errors.nom ? 'is-invalid' : ''}`}
//             value={directorForm.nom}
//             onChange={(e) => setField('nom', e.target.value)}
//             placeholder="Entrez le nom"
//           />
//           {errors.nom && <div className="invalid-feedback">{errors.nom}</div>}
//         </div>

//         {/* Email */}
//         <div className="col-md-6">
//           <label className="form-label">
//             Email<span className="text-danger">*</span>
//           </label>
//           <input
//             type="email"
//             className={`form-control ${errors.email ? 'is-invalid' : ''}`}
//             value={directorForm.email}
//             onChange={(e) => setField('email', e.target.value)}
//             placeholder="exemple@email.com"
//           />
//           {errors.email && <div className="invalid-feedback">{errors.email}</div>}
//         </div>

//         {/* Login + vérif dispo */}
//         <div className="col-md-6">
//           <label className="form-label">
//             Nom d’utilisateur<span className="text-danger">*</span>
//           </label>
//           <input
//             type="text"
//             className={`form-control ${errors.login ? 'is-invalid' : ''}`}
//             value={directorForm.login}
//             onChange={(e) => setField('login', e.target.value)}
//             placeholder="Nom d'utilisateur unique"
//           />
//           {errors.login && <div className="invalid-feedback">{errors.login}</div>}
//           {!errors.login && directorForm.login && loginAvailable === true && (
//             <div className="form-text text-success">Nom d’utilisateur disponible</div>
//           )}
//           {!errors.login && directorForm.login && loginAvailable === false && (
//             <div className="text-danger small">Ce nom d’utilisateur est déjà pris.</div>
//           )}
//           {checkingLogin && (
//             <div className="form-text">Vérification de la disponibilité…</div>
//           )}
//         </div>

//         {/* Mot de passe (requis, pas de min) */}
//         <div className="col-md-6">
//           <label className="form-label">
//             Mot de passe<span className="text-danger">*</span>
//           </label>

//           <div className="input-group">
//             <input
//               type={showPwd ? 'text' : 'password'}
//               className={`form-control ${errors.password ? 'is-invalid' : ''}`}
//               value={directorForm.password}
//               onChange={(e) => setField('password', e.target.value)}
//               placeholder="Mot de passe"
//               autoComplete="new-password"
//             />
//             <button
//               type="button"
//               className="btn btn-outline-secondary"
//               onClick={() => setShowPwd(s => !s)}
//               title={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
//               aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
//               aria-pressed={showPwd}
//             >
//               {showPwd ? <i className="bi bi-eye-slash" /> : <i className="bi bi-eye" />}
//             </button>
//           </div>

//           {errors.password && <div className="invalid-feedback d-block">{errors.password}</div>}
//         </div>

//         {/* Téléphone (+221 + contraintes) */}
//         <div className="col-md-6">
//           <label className="form-label">
//             Téléphone<span className="text-danger">*</span>
//           </label>
//           <div className="input-group">
//             <span className="input-group-text">+221</span>
//             <input
//               type="tel"
//               inputMode="numeric"
//               maxLength={9}
//               className={`form-control ${errors.telephone ? 'is-invalid' : ''}`}
//               value={directorForm.telephone}
//               onChange={(e) => setField('telephone', onlyDigits(e.target.value).slice(0, 9))}
//               placeholder="Ex: 770000000"
//             />
//           </div>
//           {errors.telephone && (
//             <div className="invalid-feedback d-block">{errors.telephone}</div>
//           )}
//         </div>

//         {/* Départements (checkbox – au moins un) */}
//         <div className="col-12">
//           <label className="form-label">
//             Département(s)<span className="text-danger">*</span>
//           </label>
//           <div className="form-check">
//             <input
//               className="form-check-input"
//               type="checkbox"
//               id="dep-pedagogie"
//               checked={directorForm.departements.includes('Pédagogie')}
//               onChange={() => toggleDepartement('Pédagogie')}
//             />
//             <label className="form-check-label" htmlFor="dep-pedagogie">
//               Pédagogie
//             </label>
//           </div>
//           <div className="form-check">
//             <input
//               className="form-check-input"
//               type="checkbox"
//               id="dep-scolarite"
//               checked={directorForm.departements.includes('Scolarité')}
//               onChange={() => toggleDepartement('Scolarité')}
//             />
//             <label className="form-check-label" htmlFor="dep-scolarite">
//               Scolarité
//             </label>
//           </div>
//           {errors.departements && (
//             <div className="text-danger small mt-1">{errors.departements}</div>
//           )}
//         </div>

//         <div className="col-12">
//           <div className="alert alert-info mt-2">
//             <i className="bi bi-info-circle me-2"></i>
//             La première connexion est activée pour forcer le changement de mot de passe.
//           </div>
//         </div>

//         <div className="col-12 mt-2">
//           <button type="submit" className="btn btn-primary px-4" disabled={submitting}>
//             {submitting ? (
//               <>
//                 <span
//                   className="spinner-border spinner-border-sm me-2"
//                   role="status"
//                   aria-hidden="true"
//                 />
//                 Enregistrement...
//               </>
//             ) : (
//               <>
//                 <i className="bi bi-plus-lg me-2"></i>
//                 Ajouter le Directeur des Études
//               </>
//             )}
//           </button>
//         </div>
//       </div>
//     </form>
//   );
// }
// src/app/admin/pages/users/directorForm.tsx
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
  telephone: string;
  departements: string[];
};

type Errors = Record<string, string>;

const sanitize = (v: string) =>
  v
    .replace(/<\s*script/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 5000);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const phoneRegex = /^(70|75|76|77|78)\d{7}$/;
const onlyDigits = (s: string) => s.replace(/\D/g, '');

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
  const [checkingLogin, setCheckingLogin] = useState(false);
  const [loginAvailable, setLoginAvailable] = useState<boolean | null>(null);
  const [showPwd, setShowPwd] = useState(false);

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
  }, [detectedRole]);

  const setField = <K extends keyof DirectorFormState>(key: K, value: DirectorFormState[K]) => {
    setDirectorForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      const copy = { ...prev };
      delete copy[String(key)];
      return copy;
    });
  };

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
          if (exists) copy.login = "Ce nom d'utilisateur existe déjà.";
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
  }, [directorForm.login]);

  const validate = async (): Promise<Errors> => {
    const err: Errors = {};
    const f = directorForm;

    if (!f.role_id) err.role_id = 'Sélectionnez un rôle.';
    if (!f.prenom || sanitize(f.prenom).length < 2)
      err.prenom = 'Le prénom doit comporter au moins 2 caractères.';
    if (!f.nom || sanitize(f.nom).length < 2)
      err.nom = 'Le nom doit comporter au moins 2 caractères.';
    if (!f.email || !emailRegex.test(f.email))
      err.email = 'Adresse e-mail invalide.';
    if (!f.login) err.login = "Le nom d'utilisateur est requis.";
    if (!err.login) {
      const lower = f.login.toLowerCase();
      const norm = normalizeLogin(f.login).toLowerCase();
      const [snapExact, snapInsensitive, snapNorm] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('login', '==', f.login))),
        getDocs(query(collection(db, 'users'), where('login_insensitive', '==', lower))),
        getDocs(query(collection(db, 'users'), where('login_norm', '==', norm))),
      ]);
      if (!snapExact.empty || !snapInsensitive.empty || !snapNorm.empty) {
        err.login = "Ce nom d'utilisateur existe déjà.";
      }
    }
    if (!f.password) err.password = 'Le mot de passe est requis.';
    if (!f.telephone) err.telephone = 'Le téléphone est requis.';
    else if (!phoneRegex.test(f.telephone))
      err.telephone = 'Numéro invalide. 9 chiffres commençant par 70, 75, 76, 77 ou 78.';
    if (!f.departements.length)
      err.departements = 'Choisissez au moins un département.';

    return err;
  };

  const getSecondaryAuth = () => {
    const primary = getApp();
    const options = primary.options as FirebaseOptions;
    const name = 'director-worker';
    const secApp = getApps().find(a => a.name === name) || initializeApp(options, name);
    return getAuth(secApp);
  };

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

      const selectedRole = roles.find(r => r.id === directorForm.role_id) || detectedRole;
      if (!selectedRole) {
        showErrorToast('Rôle sélectionné invalide.');
        setSubmitting(false);
        return;
      }

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

      await signOut(secAuth).catch(() => {});

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
        departement: sanitize(directorForm.departements.join(', ')),
        departements: directorForm.departements.map(sanitize),
        created_at: serverTimestamp(),
        uid,
      };

      await setDoc(doc(db, 'users', uid), clean);

      showSuccessToast('Directeur des Études ajouté avec succès !');
      setDirectorForm(initialState);
      setLoginAvailable(null);
      await fetchData();
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
      <div style={{
        background: '#1e293b',
        borderRadius: 24,
        padding: '32px',
        border: '1px solid rgba(2, 157, 254, 0.2)'
      }}>
        {/* Header */}
        <div className="mb-4 pb-2" style={{ borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(2, 157, 254, 0.3)'
            }}>
              <i className="bi bi-trophy-fill" style={{ color: '#029DFE', fontSize: 20 }} />
            </div>
            <div>
              <h5 style={{ fontWeight: 700, color: 'white', margin: 0 }}>Directeur des Études</h5>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Création d&apos;un nouveau compte directeur</p>
            </div>
          </div>
        </div>

        <div className="row g-4">
          {/* Rôle */}
          <div className="col-md-6">
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              marginBottom: 8,
              letterSpacing: 0.5
            }}>
              RÔLE <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                zIndex: 1
              }}>
                <i className="bi bi-shield-check" />
              </span>
              <select
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: errors.role_id ? '1px solid #ef4444' : '1px solid #334155',
                  color: 'white',
                  borderRadius: 12,
                  padding: '12px 16px 12px 42px',
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  if (!errors.role_id) e.target.style.borderColor = '#029DFE';
                  e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                }}
                onBlur={(e) => {
                  if (!errors.role_id) e.target.style.borderColor = '#334155';
                  e.target.style.boxShadow = 'none';
                }}
                value={directorForm.role_id}
                onChange={(e) => setField('role_id', e.target.value)}
                required
              >
                <option value="" style={{ background: '#0f172a' }}>Sélectionner un rôle</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id} style={{ background: '#0f172a' }}>
                    {r.libelle}
                  </option>
                ))}
              </select>
            </div>
            {errors.role_id && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#ef4444', fontSize: 12 }} />
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.role_id}</span>
              </div>
            )}
          </div>

          {/* Prénom */}
          <div className="col-md-6">
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              marginBottom: 8,
              letterSpacing: 0.5
            }}>
              PRÉNOM <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <i className="bi bi-person" />
              </span>
              <input
                type="text"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: errors.prenom ? '1px solid #ef4444' : '1px solid #334155',
                  color: 'white',
                  borderRadius: 12,
                  padding: '12px 16px 12px 42px',
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  if (!errors.prenom) e.target.style.borderColor = '#029DFE';
                  e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                }}
                onBlur={(e) => {
                  if (!errors.prenom) e.target.style.borderColor = '#334155';
                  e.target.style.boxShadow = 'none';
                }}
                value={directorForm.prenom}
                onChange={(e) => setField('prenom', e.target.value)}
                placeholder="Entrez le prénom"
              />
            </div>
            {errors.prenom && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#ef4444', fontSize: 12 }} />
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.prenom}</span>
              </div>
            )}
          </div>

          {/* Nom */}
          <div className="col-md-6">
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              marginBottom: 8,
              letterSpacing: 0.5
            }}>
              NOM <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <i className="bi bi-person-badge" />
              </span>
              <input
                type="text"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: errors.nom ? '1px solid #ef4444' : '1px solid #334155',
                  color: 'white',
                  borderRadius: 12,
                  padding: '12px 16px 12px 42px',
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  if (!errors.nom) e.target.style.borderColor = '#029DFE';
                  e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                }}
                onBlur={(e) => {
                  if (!errors.nom) e.target.style.borderColor = '#334155';
                  e.target.style.boxShadow = 'none';
                }}
                value={directorForm.nom}
                onChange={(e) => setField('nom', e.target.value)}
                placeholder="Entrez le nom"
              />
            </div>
            {errors.nom && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#ef4444', fontSize: 12 }} />
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.nom}</span>
              </div>
            )}
          </div>

          {/* Email */}
          <div className="col-md-6">
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              marginBottom: 8,
              letterSpacing: 0.5
            }}>
              EMAIL <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <i className="bi bi-envelope" />
              </span>
              <input
                type="email"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: errors.email ? '1px solid #ef4444' : '1px solid #334155',
                  color: 'white',
                  borderRadius: 12,
                  padding: '12px 16px 12px 42px',
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  if (!errors.email) e.target.style.borderColor = '#029DFE';
                  e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                }}
                onBlur={(e) => {
                  if (!errors.email) e.target.style.borderColor = '#334155';
                  e.target.style.boxShadow = 'none';
                }}
                value={directorForm.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="exemple@email.com"
              />
            </div>
            {errors.email && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#ef4444', fontSize: 12 }} />
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.email}</span>
              </div>
            )}
          </div>

          {/* Login */}
          <div className="col-md-6">
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              marginBottom: 8,
              letterSpacing: 0.5
            }}>
              NOM D&apos;UTILISATEUR <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }}>
                <i className="bi bi-person-circle" />
              </span>
              <input
                type="text"
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: errors.login ? '1px solid #ef4444' : '1px solid #334155',
                  color: 'white',
                  borderRadius: 12,
                  padding: '12px 16px 12px 42px',
                  fontSize: 14,
                  transition: 'all 0.2s',
                  paddingRight: '48px'
                }}
                onFocus={(e) => {
                  if (!errors.login) e.target.style.borderColor = '#029DFE';
                  e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                }}
                onBlur={(e) => {
                  if (!errors.login) e.target.style.borderColor = '#334155';
                  e.target.style.boxShadow = 'none';
                }}
                value={directorForm.login}
                onChange={(e) => setField('login', e.target.value)}
                placeholder="Nom d'utilisateur unique"
              />
              <span style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: checkingLogin ? '#64748b' : loginAvailable === true ? '#10b981' : loginAvailable === false ? '#ef4444' : '#64748b'
              }}>
                {checkingLogin ? (
                  <div className="spinner-border spinner-border-sm" style={{ width: 16, height: 16 }} />
                ) : loginAvailable === true ? (
                  <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 18 }} />
                ) : loginAvailable === false ? (
                  <i className="bi bi-x-circle-fill" style={{ color: '#ef4444', fontSize: 18 }} />
                ) : (
                  <i className="bi bi-person" style={{ fontSize: 18 }} />
                )}
              </span>
            </div>
            {errors.login && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#ef4444', fontSize: 12 }} />
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.login}</span>
              </div>
            )}
            {!errors.login && directorForm.login && loginAvailable === true && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 12 }} />
                <span style={{ color: '#10b981', fontSize: 12 }}>Nom d&apos;utilisateur disponible</span>
              </div>
            )}
          </div>

          {/* Mot de passe */}
          <div className="col-md-6">
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              marginBottom: 8,
              letterSpacing: 0.5
            }}>
              MOT DE PASSE <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                zIndex: 1
              }}>
                <i className="bi bi-lock" />
              </span>
              <input
                type={showPwd ? 'text' : 'password'}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: errors.password ? '1px solid #ef4444' : '1px solid #334155',
                  color: 'white',
                  borderRadius: 12,
                  padding: '12px 16px 12px 42px',
                  fontSize: 14,
                  transition: 'all 0.2s',
                  paddingRight: '48px'
                }}
                onFocus={(e) => {
                  if (!errors.password) e.target.style.borderColor = '#029DFE';
                  e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                }}
                onBlur={(e) => {
                  if (!errors.password) e.target.style.borderColor = '#334155';
                  e.target.style.boxShadow = 'none';
                }}
                value={directorForm.password}
                onChange={(e) => setField('password', e.target.value)}
                placeholder="Mot de passe"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  zIndex: 1
                }}
              >
                {showPwd ? <i className="bi bi-eye-slash" style={{ fontSize: 18 }} /> : <i className="bi bi-eye" style={{ fontSize: 18 }} />}
              </button>
            </div>
            {errors.password && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#ef4444', fontSize: 12 }} />
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.password}</span>
              </div>
            )}
          </div>

          {/* Téléphone */}
          <div className="col-md-6">
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              marginBottom: 8,
              letterSpacing: 0.5
            }}>
              TÉLÉPHONE <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative', display: 'flex', gap: 0 }}>
              <span style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                zIndex: 1
              }}>
                +221
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={9}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: errors.telephone ? '1px solid #ef4444' : '1px solid #334155',
                  color: 'white',
                  borderRadius: 12,
                  padding: '12px 16px 12px 70px',
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  if (!errors.telephone) e.target.style.borderColor = '#029DFE';
                  e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                }}
                onBlur={(e) => {
                  if (!errors.telephone) e.target.style.borderColor = '#334155';
                  e.target.style.boxShadow = 'none';
                }}
                value={directorForm.telephone}
                onChange={(e) => setField('telephone', onlyDigits(e.target.value).slice(0, 9))}
                placeholder="770000000"
              />
            </div>
            {errors.telephone && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#ef4444', fontSize: 12 }} />
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.telephone}</span>
              </div>
            )}
          </div>

          {/* Départements */}
          <div className="col-12">
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: '#e2e8f0',
              marginBottom: 12,
              letterSpacing: 0.5
            }}>
              DÉPARTEMENT(S) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={directorForm.departements.includes('Pédagogie')}
                  onChange={() => toggleDepartement('Pédagogie')}
                  style={{
                    width: 18,
                    height: 18,
                    cursor: 'pointer',
                    accentColor: '#029DFE'
                  }}
                />
                <span style={{ color: '#cbd5e1', fontSize: 14 }}>Pédagogie</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={directorForm.departements.includes('Scolarité')}
                  onChange={() => toggleDepartement('Scolarité')}
                  style={{
                    width: 18,
                    height: 18,
                    cursor: 'pointer',
                    accentColor: '#029DFE'
                  }}
                />
                <span style={{ color: '#cbd5e1', fontSize: 14 }}>Scolarité</span>
              </label>
            </div>
            {errors.departements && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#ef4444', fontSize: 12 }} />
                <span style={{ color: '#ef4444', fontSize: 12 }}>{errors.departements}</span>
              </div>
            )}
          </div>
        </div>

        {/* Alert Info */}
        <div className="mt-4" style={{
          background: 'rgba(2, 157, 254, 0.1)',
          border: '1px solid rgba(2, 157, 254, 0.2)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <i className="bi bi-info-circle-fill" style={{ color: '#029DFE', fontSize: 18 }} />
          <span style={{ color: '#94a3b8', fontSize: 13 }}>
            La première connexion est activée pour forcer le changement de mot de passe.
          </span>
        </div>

        {/* Submit Button */}
        <div className="mt-4 pt-3">
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              background: submitting 
                ? '#475569' 
                : 'linear-gradient(135deg, #029DFE 0%, #0284c7 100%)',
              border: 'none',
              borderRadius: 12,
              padding: '14px',
              color: 'white',
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: 1,
              transition: 'all 0.3s ease',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
            onMouseEnter={(e) => {
              if (!submitting) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(2,157,254,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {submitting ? (
              <>
                <div className="spinner-border spinner-border-sm" style={{ width: 16, height: 16 }} />
                ENREGISTREMENT...
              </>
            ) : (
              <>
                <i className="bi bi-plus-lg" />
                AJOUTER LE DIRECTEUR DES ÉTUDES
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
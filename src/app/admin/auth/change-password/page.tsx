// // src/app/admin/auth/change-password/page.tsx
// 'use client';

// import React, { useEffect, useMemo, useState } from 'react';
// import Image from 'next/image';
// import { useRouter } from 'next/navigation';
// import {
//   collection,
//   getDocs,
//   query,
//   where,
//   doc,
//   updateDoc,
//   getDoc,
// } from 'firebase/firestore';
// import { db, auth } from '../../../../../firebaseConfig';
// import Logo from '../../assets/iibs-new.png';
// import Toast from '../../components/ui/Toast';
// import { routeForRole } from '@/lib/roleRouting';
// import { updatePassword, signOut } from 'firebase/auth';

// /** Anti-injection basique : retire caractères de contrôle + chevrons */
// const sanitizePassword = (v: string) =>
//   v.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/[<>]/g, '');

// const goLoginForReauth = async (router: any) => {
//   try { await signOut(auth); } catch {}
//   router.replace('/admin/auth/login');
// };


// export default function ChangePassword() {
//   const router = useRouter();

//   // UI state
//   const [checking, setChecking] = useState<boolean>(true);
//   const [password, setPassword] = useState<string>('');
//   const [confirmPassword, setConfirmPassword] = useState<string>('');
//   const [userLogin, setUserLogin] = useState<string>('');

//   // Afficher / cacher
//   const [showPwd, setShowPwd] = useState(false);
//   const [showConfirmPwd, setShowConfirmPwd] = useState(false);

//   // Validation à l’envoi (pour contrôler l’affichage des erreurs de confirmation)
//   const [submitted, setSubmitted] = useState(false);

//   // Toasts
//   const [showSuccess, setShowSuccess] = useState<boolean>(false);
//   const [showError, setShowError] = useState<boolean>(false);
//   const [toastMessage, setToastMessage] = useState<string>('');
//   const showSuccessToast = (msg: string) => { setToastMessage(msg); setShowSuccess(true); };
//   const showErrorToast   = (msg: string) => { setToastMessage(msg); setShowError(true); };

//   // Règles de robustesse
//   const hasMinLen = password.length >= 8;
//   const hasUpper  = /[A-Z]/.test(password);
//   const hasLower  = /[a-z]/.test(password);
//   const hasDigit  = /\d/.test(password);
//   const isPasswordValid = hasMinLen && hasUpper && hasLower && hasDigit;

//   /**
//    * Pré-check :
//    * - login en localStorage
//    * - user existe
//    * - si first_login == 0 => redirection direct
//    */
//   useEffect(() => {
//     const precheck = async () => {
//       const login = localStorage.getItem('userLogin');
//       if (!login) {
//         router.replace('/admin/auth/login');
//         return;
//       }

//       try {
//         const q = query(collection(db, 'users'), where('login', '==', login));
//         const snap = await getDocs(q);

//         if (snap.empty) {
//           router.replace('/admin/auth/login');
//           return;
//         }

//         const userDoc = snap.docs[0];
//         const userData = userDoc.data() as any;

//         // Déjà traité → route d’accueil suivant le rôle
//         if (userData.first_login === 0 || userData.first_login === '0') {
//           const roleLabel =
//             userData.role_libelle ||
//             (await (async () => {
//               try {
//                 const r = await getDoc(doc(db, 'roles', String(userData.role_id)));
//                 return r.data()?.libelle || '';
//               } catch {
//                 return '';
//               }
//             })());

//           router.replace(routeForRole(roleLabel));
//           return;
//         }

//         // OK pour afficher le formulaire
//         setUserLogin(login);
//         setChecking(false);
//       } catch (err) {
//         console.error('Precheck error:', err);
//         router.replace('/admin/auth/login');
//       }
//     };

//     precheck();
//   }, [router]);

//   const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
//     e.preventDefault();
//     setSubmitted(true); // ✅ On marque que l’utilisateur a cliqué sur "Changer"

//     if (!isPasswordValid) {
//       showErrorToast('Le mot de passe ne respecte pas les critères.');
//       return;
//     }

//     if (password !== confirmPassword) {
//       showErrorToast('Les mots de passe ne correspondent pas.');
//       return;
//     }

//     try {
//       // On re-sanitise juste avant usage
//       const safePwd = sanitizePassword(password);

//       // Récupérer l’utilisateur par login
//       const q = query(collection(db, 'users'), where('login', '==', userLogin));
//       const snap = await getDocs(q);

//       if (snap.empty) {
//         showErrorToast('Utilisateur non trouvé.');
//         return;
//       }

//       const userDocRef = snap.docs[0].ref;
//       const userData = snap.docs[0].data() as any;

//       // ⚠️ En prod: éviter de stocker un mdp en clair. (TODO: supprimer ce champ côté Firestore)
//       await updateDoc(userDocRef, {
//         //password: safePwd,
//         first_login: 0,
//       });

//       // Mettre à jour dans Firebase Auth
//       const u = auth.currentUser;
//       if (!u || !u.email) {
//         showErrorToast('Utilisateur non connecté.');
//         await goLoginForReauth(router);
//         return;
//       }

//       // Vérifier que le compte possède le provider "password"
//       const hasPasswordProvider = u.providerData.some(p => p.providerId === 'password');
//       if (!hasPasswordProvider) {
//         showErrorToast("Ce compte n'utilise pas un mot de passe. Veuillez vous reconnecter.");
//         await goLoginForReauth(router);
//         return;
//       }

//       try {
//           await updatePassword(u, safePwd);
//         } catch (err: any) {
//           console.error('updatePassword error:', err);
//           if (err?.code === 'auth/requires-recent-login') {
//             showErrorToast('Session expirée. Veuillez vous reconnecter.');
//           } else {
//             showErrorToast("Impossible de changer le mot de passe pour le moment.");
//           }
//           await goLoginForReauth(router);
//           return;
//         }

//       showSuccessToast('Mot de passe changé avec succès !');

//       try { await signOut(auth); } catch {}
//         router.replace('/admin/auth/login?changed=1');
//     } catch (error) {
//       console.error(error);
//       showErrorToast('Erreur serveur, veuillez réessayer plus tard.');
//     }
//   };

//   if (checking) {
//     return (
//       <div className="min-vh-100 d-flex align-items-center justify-content-center">
//         <div className="text-center">
//           <div className="spinner-border" role="status" />
//           <p className="text-muted mt-2 mb-0 small">Préparation de la page…</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
//       <div className="container" style={{ maxWidth: 760 }}>
//         <div className="row justify-content-center">
//           <div className="col-12">
//              <div className="card border-0 shadow-sm overflow-hidden" style={{ background:'#eef6ff', borderRadius:'20px' }}>
//               <div
//                 className="card-body p-4 p-md-5"
//                 style={{ background: '#eef6ff' }}
//               >
//                 {/* Logo */}
//                 <Image
//                   src={Logo}
//                   alt="IBS Logo"
//                   className="d-block mx-auto mb-4"
//                   style={{ width: '220px', height: 'auto' }}  // ↑ un peu plus grand
//                   priority
//                 />
//             <div className="mb-2 text-center">
//               <h5 className="fw-semibold mb-1">Changer votre mot de passe</h5>
//               <p className="text-muted small mb-0">
//                 Première connexion détectée — définissez un mot de passe robuste.
//               </p>
//             </div>

//             <form onSubmit={handleChangePassword} className="mt-3">
//               {/* Mot de passe */}
//               <div className="mb-2">
//                 <label htmlFor="password" className="form-label fw-semibold small mb-1">
//                   Nouveau mot de passe
//                 </label>
//                 <div className="input-group">
//                   <input
//                     type={showPwd ? 'text' : 'password'}
//                     id="password"
//                     className="form-control py-2"
//                     placeholder="Au moins 8 caractères"
//                     value={password}
//                     onChange={(e) => {
//                       // on sanitis e en live pour bloquer chevrons / ctrl
//                       const v = sanitizePassword(e.target.value);
//                       setPassword(v);
//                       // reset l’état "submitted" si l’utilisateur retape
//                       if (submitted) setSubmitted(false);
//                     }}
//                     autoComplete="new-password"
//                     inputMode="text"
//                   />
//                   <button
//                     type="button"
//                     className="btn btn-outline-secondary"
//                     onClick={() => setShowPwd((s) => !s)}
//                     tabIndex={-1}
//                     aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
//                     title={showPwd ? 'Masquer' : 'Afficher'}
//                   >
//                     <i className={`bi ${showPwd ? 'bi-eye-slash' : 'bi-eye'}`} />
//                   </button>
//                 </div>

//                 {/* Checklist live */}
//                 <ul className="list-unstyled mt-2 mb-0 small">
//                   <li className={hasMinLen ? 'text-success' : 'text-muted'}>
//                     <i className={`bi ${hasMinLen ? 'bi-check-circle' : 'bi-dot'} me-1`} />
//                     8 caractères minimum
//                   </li>
//                   <li className={hasUpper ? 'text-success' : 'text-muted'}>
//                     <i className={`bi ${hasUpper ? 'bi-check-circle' : 'bi-dot'} me-1`} />
//                     Au moins une majuscule
//                   </li>
//                   <li className={hasLower ? 'text-success' : 'text-muted'}>
//                     <i className={`bi ${hasLower ? 'bi-check-circle' : 'bi-dot'} me-1`} />
//                     Au moins une minuscule
//                   </li>
//                   <li className={hasDigit ? 'text-success' : 'text-muted'}>
//                     <i className={`bi ${hasDigit ? 'bi-check-circle' : 'bi-dot'} me-1`} />
//                     Au moins un chiffre
//                   </li>
//                 </ul>
//               </div>

//               {/* Confirmation */}
//               <div className="mb-2">
//                 <label htmlFor="confirmPassword" className="form-label fw-semibold small mb-1">
//                   Confirmer le mot de passe
//                 </label>
//                 <div className="input-group">
//                   <input
//                     type={showConfirmPwd ? 'text' : 'password'}
//                     id="confirmPassword"
//                     className="form-control py-2"
//                     placeholder="Retapez le mot de passe"
//                     value={confirmPassword}
//                     onChange={(e) => {
//                       const v = sanitizePassword(e.target.value);
//                       setConfirmPassword(v);
//                       // On n’affiche PAS l’erreur ici : seulement à la soumission
//                     }}
//                     autoComplete="new-password"
//                   />
//                   <button
//                     type="button"
//                     className="btn btn-outline-secondary"
//                     onClick={() => setShowConfirmPwd((s) => !s)}
//                     tabIndex={-1}
//                     aria-label={showConfirmPwd ? 'Masquer la confirmation' : 'Afficher la confirmation'}
//                     title={showConfirmPwd ? 'Masquer' : 'Afficher'}
//                   >
//                     <i className={`bi ${showConfirmPwd ? 'bi-eye-slash' : 'bi-eye'}`} />
//                   </button>
//                 </div>

//                 {/* ❗️Erreur de confirmation affichée UNIQUEMENT après clic sur "Changer" */}
//                 {submitted && confirmPassword !== password && (
//                   <small className="text-danger d-block mt-1">
//                     Les mots de passe ne correspondent pas.
//                   </small>
//                 )}
//               </div>

//               <div className="d-grid mt-3">
//                 <button
//                   className="btn fw-semibold py-2"
//                   style={{ backgroundColor: '#0b5ed7', borderColor: '#0b5ed7', borderRadius: '10px', color: 'white' }}
//                   type="submit"
//                   disabled={!isPasswordValid}
//                   title={!isPasswordValid ? 'Le mot de passe doit respecter les critères' : 'Changer le mot de passe'}
//                 >
//                   Changer le mot de passe
//                 </button>
//               </div>
//             </form>

//             {/* Toasts */}
//             <Toast
//               message={toastMessage}
//               type="success"
//               show={showSuccess}
//               onClose={() => setShowSuccess(false)}
//             />
//             <Toast
//               message={toastMessage}
//               type="error"
//               show={showError}
//               onClose={() => setShowError(false)}
//             />
//           </div>
//           </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
// src/app/admin/auth/change-password/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../../../../../firebaseConfig';
import Logo from '../../assets/iibs-new.png';
import Toast from '../../components/ui/Toast';
import { routeForRole } from '@/lib/roleRouting';
import { updatePassword, signOut } from 'firebase/auth';

/** Anti-injection basique : retire caractères de contrôle + chevrons */
const sanitizePassword = (v: string) =>
  v.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/[<>]/g, '');

const goLoginForReauth = async (router: any) => {
  try { await signOut(auth); } catch {}
  router.replace('/admin/auth/login');
};

export default function ChangePassword() {
  const router = useRouter();

  // UI state
  const [checking, setChecking] = useState<boolean>(true);
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [userLogin, setUserLogin] = useState<string>('');

  // Afficher / cacher
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // Validation à l’envoi (pour contrôler l’affichage des erreurs de confirmation)
  const [submitted, setSubmitted] = useState(false);

  // Toasts
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [showError, setShowError] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const showSuccessToast = (msg: string) => { setToastMessage(msg); setShowSuccess(true); };
  const showErrorToast   = (msg: string) => { setToastMessage(msg); setShowError(true); };

  // Règles de robustesse
  const hasMinLen = password.length >= 8;
  const hasUpper  = /[A-Z]/.test(password);
  const hasLower  = /[a-z]/.test(password);
  const hasDigit  = /\d/.test(password);
  const isPasswordValid = hasMinLen && hasUpper && hasLower && hasDigit;

  /**
   * Pré-check :
   * - login en localStorage
   * - user existe
   * - si first_login == 0 => redirection direct
   */
  useEffect(() => {
    const precheck = async () => {
      const login = localStorage.getItem('userLogin');
      if (!login) {
        router.replace('/admin/auth/login');
        return;
      }

      try {
        const q = query(collection(db, 'users'), where('login', '==', login));
        const snap = await getDocs(q);

        if (snap.empty) {
          router.replace('/admin/auth/login');
          return;
        }

        const userDoc = snap.docs[0];
        const userData = userDoc.data() as any;

        // Déjà traité → route d’accueil suivant le rôle
        if (userData.first_login === 0 || userData.first_login === '0') {
          const roleLabel =
            userData.role_libelle ||
            (await (async () => {
              try {
                const r = await getDoc(doc(db, 'roles', String(userData.role_id)));
                return r.data()?.libelle || '';
              } catch {
                return '';
              }
            })());

          router.replace(routeForRole(roleLabel));
          return;
        }

        // OK pour afficher le formulaire
        setUserLogin(login);
        setChecking(false);
      } catch (err) {
        console.error('Precheck error:', err);
        router.replace('/admin/auth/login');
      }
    };

    precheck();
  }, [router]);

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);

    if (!isPasswordValid) {
      showErrorToast('Le mot de passe ne respecte pas les critères.');
      return;
    }

    if (password !== confirmPassword) {
      showErrorToast('Les mots de passe ne correspondent pas.');
      return;
    }

    try {
      const safePwd = sanitizePassword(password);

      const q = query(collection(db, 'users'), where('login', '==', userLogin));
      const snap = await getDocs(q);

      if (snap.empty) {
        showErrorToast('Utilisateur non trouvé.');
        return;
      }

      const userDocRef = snap.docs[0].ref;

      await updateDoc(userDocRef, {
        first_login: 0,
      });

      const u = auth.currentUser;
      if (!u || !u.email) {
        showErrorToast('Utilisateur non connecté.');
        await goLoginForReauth(router);
        return;
      }

      const hasPasswordProvider = u.providerData.some(p => p.providerId === 'password');
      if (!hasPasswordProvider) {
        showErrorToast("Ce compte n'utilise pas un mot de passe. Veuillez vous reconnecter.");
        await goLoginForReauth(router);
        return;
      }

      try {
        await updatePassword(u, safePwd);
      } catch (err: any) {
        console.error('updatePassword error:', err);
        if (err?.code === 'auth/requires-recent-login') {
          showErrorToast('Session expirée. Veuillez vous reconnecter.');
        } else {
          showErrorToast("Impossible de changer le mot de passe pour le moment.");
        }
        await goLoginForReauth(router);
        return;
      }

      showSuccessToast('Mot de passe changé avec succès !');

      try { await signOut(auth); } catch {}
      router.replace('/admin/auth/login?changed=1');
    } catch (error) {
      console.error(error);
      showErrorToast('Erreur serveur, veuillez réessayer plus tard.');
    }
  };

  if (checking) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '48px',
          borderRadius: 32,
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(2, 157, 254, 0.2)'
        }}>
          <div className="spinner-border text-primary mb-3" role="status" style={{ color: '#029DFE' }} />
          <p style={{ color: '#94a3b8', margin: 0 }}>Préparation de la page…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3" style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Effet de grille technique */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'radial-gradient(circle at 25% 50%, rgba(2, 157, 254, 0.08) 0%, transparent 50%)',
        pointerEvents: 'none'
      }} />
      
      {/* Effet de particules */}
      <div style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23029DFE" fill-opacity="0.05"%3E%3Cpath d="M0 0 L10 10 L20 0 L30 10 L40 0" /%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        backgroundRepeat: 'repeat',
        animation: 'slide 20s linear infinite',
        opacity: 0.5,
        pointerEvents: 'none'
      }} />

      <div className="container" style={{ maxWidth: 600, position: 'relative', zIndex: 2 }}>
        <div className="row justify-content-center">
          <div className="col-12">
            <div style={{
              background: 'rgba(15, 23, 42, 0.8)',
              backdropFilter: 'blur(20px)',
              borderRadius: 40,
              border: '1px solid rgba(2, 157, 254, 0.3)',
              padding: '48px 40px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
            }}>
              {/* Logo animé */}
              <div className="text-center mb-4">
                <div style={{
                  width: 80,
                  height: 80,
                  background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
                  borderRadius: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  border: '1px solid rgba(2, 157, 254, 0.3)',
                  animation: 'pulse 2s infinite'
                }}>
                  <Image
                    src={Logo}
                    alt="IIBS Logo"
                    width={50}
                    height={50}
                    style={{ objectFit: 'contain' }}
                  />
                </div>
                
                <h2 style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: 'white',
                  marginBottom: 8,
                  letterSpacing: -0.5
                }}>
                  Sécurisez votre compte
                </h2>
                <p style={{
                  color: '#94a3b8',
                  fontSize: 14,
                  marginBottom: 0
                }}>
                  Définissez un mot de passe robuste pour votre première connexion
                </p>
              </div>

              <form onSubmit={handleChangePassword}>
                {/* Nouveau mot de passe */}
                <div className="mb-4">
                  <label style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#e2e8f0',
                    marginBottom: 8,
                    letterSpacing: 0.5
                  }}>
                    NOUVEAU MOT DE PASSE
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: 16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#64748b',
                      zIndex: 1
                    }}>
                      🔒
                    </span>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      id="password"
                      className="form-control"
                      style={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        color: 'white',
                        borderRadius: 16,
                        padding: '14px 16px 14px 48px',
                        fontSize: 14,
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#029DFE';
                        e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#334155';
                        e.target.style.boxShadow = 'none';
                      }}
                      placeholder="Au moins 8 caractères"
                      value={password}
                      onChange={(e) => {
                        const v = sanitizePassword(e.target.value);
                        setPassword(v);
                        if (submitted) setSubmitted(false);
                      }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
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
                      <i className={`bi ${showPwd ? 'bi-eye-slash' : 'bi-eye'}`} style={{ fontSize: 18 }} />
                    </button>
                  </div>

                  {/* Checklist live stylisée */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '8px',
                    marginTop: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        background: hasMinLen ? '#10b98120' : '#334155',
                        border: `1px solid ${hasMinLen ? '#10b981' : '#475569'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {hasMinLen && <i className="bi bi-check" style={{ color: '#10b981', fontSize: 12 }} />}
                      </div>
                      <span style={{ fontSize: 12, color: hasMinLen ? '#10b981' : '#94a3b8' }}>
                        8 caractères min
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        background: hasUpper ? '#10b98120' : '#334155',
                        border: `1px solid ${hasUpper ? '#10b981' : '#475569'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {hasUpper && <i className="bi bi-check" style={{ color: '#10b981', fontSize: 12 }} />}
                      </div>
                      <span style={{ fontSize: 12, color: hasUpper ? '#10b981' : '#94a3b8' }}>
                        Une majuscule
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        background: hasLower ? '#10b98120' : '#334155',
                        border: `1px solid ${hasLower ? '#10b981' : '#475569'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {hasLower && <i className="bi bi-check" style={{ color: '#10b981', fontSize: 12 }} />}
                      </div>
                      <span style={{ fontSize: 12, color: hasLower ? '#10b981' : '#94a3b8' }}>
                        Une minuscule
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        background: hasDigit ? '#10b98120' : '#334155',
                        border: `1px solid ${hasDigit ? '#10b981' : '#475569'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {hasDigit && <i className="bi bi-check" style={{ color: '#10b981', fontSize: 12 }} />}
                      </div>
                      <span style={{ fontSize: 12, color: hasDigit ? '#10b981' : '#94a3b8' }}>
                        Un chiffre
                      </span>
                    </div>
                  </div>
                </div>

                {/* Confirmation */}
                <div className="mb-4">
                  <label style={{
                    display: 'block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#e2e8f0',
                    marginBottom: 8,
                    letterSpacing: 0.5
                  }}>
                    CONFIRMER LE MOT DE PASSE
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: 16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#64748b'
                    }}>
                      ✓
                    </span>
                    <input
                      type={showConfirmPwd ? 'text' : 'password'}
                      id="confirmPassword"
                      className="form-control"
                      style={{
                        background: '#0f172a',
                        border: submitted && confirmPassword !== password ? '1px solid #ef4444' : '1px solid #334155',
                        color: 'white',
                        borderRadius: 16,
                        padding: '14px 16px 14px 48px',
                        fontSize: 14,
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        if (!(submitted && confirmPassword !== password)) {
                          e.target.style.borderColor = '#029DFE';
                        }
                        e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                      }}
                      onBlur={(e) => {
                        if (!(submitted && confirmPassword !== password)) {
                          e.target.style.borderColor = '#334155';
                        }
                        e.target.style.boxShadow = 'none';
                      }}
                      placeholder="Retapez le mot de passe"
                      value={confirmPassword}
                      onChange={(e) => {
                        const v = sanitizePassword(e.target.value);
                        setConfirmPassword(v);
                      }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPwd((s) => !s)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      <i className={`bi ${showConfirmPwd ? 'bi-eye-slash' : 'bi-eye'}`} style={{ fontSize: 18 }} />
                    </button>
                  </div>

                  {submitted && confirmPassword !== password && (
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <i className="bi bi-exclamation-triangle-fill" />
                      Les mots de passe ne correspondent pas
                    </div>
                  )}
                </div>

                {/* Bouton de validation */}
                <button
                  type="submit"
                  disabled={!isPasswordValid}
                  style={{
                    width: '100%',
                    background: !isPasswordValid 
                      ? '#475569' 
                      : 'linear-gradient(135deg, #029DFE 0%, #0284c7 100%)',
                    border: 'none',
                    borderRadius: 16,
                    padding: '16px',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: 1,
                    transition: 'all 0.3s ease',
                    cursor: !isPasswordValid ? 'not-allowed' : 'pointer',
                    opacity: !isPasswordValid ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (isPasswordValid) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(2,157,254,0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  CHANGER LE MOT DE PASSE
                </button>
              </form>

              {/* Footer */}
              <div className="text-center mt-5 pt-3">
                <p style={{ fontSize: 11, color: '#475569', letterSpacing: 0.5, margin: 0 }}>
                  © 2024 IIBS DIGITAL SCHOOL | Sécurité renforcée
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toasts */}
      <Toast message={toastMessage} type="success" show={showSuccess} onClose={() => setShowSuccess(false)} />
      <Toast message={toastMessage} type="error" show={showError} onClose={() => setShowError(false)} />

      {/* Animations CSS */}
      <style jsx>{`
        @keyframes slide {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 40px 40px;
          }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(2, 157, 254, 0.4);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 0 0 10px rgba(2, 157, 254, 0);
          }
        }
      `}</style>
    </div>
  );
}
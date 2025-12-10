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
    setSubmitted(true); // ✅ On marque que l’utilisateur a cliqué sur "Changer"

    if (!isPasswordValid) {
      showErrorToast('Le mot de passe ne respecte pas les critères.');
      return;
    }

    if (password !== confirmPassword) {
      showErrorToast('Les mots de passe ne correspondent pas.');
      return;
    }

    try {
      // On re-sanitise juste avant usage
      const safePwd = sanitizePassword(password);

      // Récupérer l’utilisateur par login
      const q = query(collection(db, 'users'), where('login', '==', userLogin));
      const snap = await getDocs(q);

      if (snap.empty) {
        showErrorToast('Utilisateur non trouvé.');
        return;
      }

      const userDocRef = snap.docs[0].ref;
      const userData = snap.docs[0].data() as any;

      // ⚠️ En prod: éviter de stocker un mdp en clair. (TODO: supprimer ce champ côté Firestore)
      await updateDoc(userDocRef, {
        //password: safePwd,
        first_login: 0,
      });

      // Mettre à jour dans Firebase Auth
      const u = auth.currentUser;
      if (!u || !u.email) {
        showErrorToast('Utilisateur non connecté.');
        await goLoginForReauth(router);
        return;
      }

      // Vérifier que le compte possède le provider "password"
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
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border" role="status" />
          <p className="text-muted mt-2 mb-0 small">Préparation de la page…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="row justify-content-center">
          <div className="col-12">
             <div className="card border-0 shadow-sm overflow-hidden" style={{ background:'#eef6ff', borderRadius:'20px' }}>
              <div
                className="card-body p-4 p-md-5"
                style={{ background: '#eef6ff' }}
              >
                {/* Logo */}
                <Image
                  src={Logo}
                  alt="IBS Logo"
                  className="d-block mx-auto mb-4"
                  style={{ width: '220px', height: 'auto' }}  // ↑ un peu plus grand
                  priority
                />
            <div className="mb-2 text-center">
              <h5 className="fw-semibold mb-1">Changer votre mot de passe</h5>
              <p className="text-muted small mb-0">
                Première connexion détectée — définissez un mot de passe robuste.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="mt-3">
              {/* Mot de passe */}
              <div className="mb-2">
                <label htmlFor="password" className="form-label fw-semibold small mb-1">
                  Nouveau mot de passe
                </label>
                <div className="input-group">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    id="password"
                    className="form-control py-2"
                    placeholder="Au moins 8 caractères"
                    value={password}
                    onChange={(e) => {
                      // on sanitis e en live pour bloquer chevrons / ctrl
                      const v = sanitizePassword(e.target.value);
                      setPassword(v);
                      // reset l’état "submitted" si l’utilisateur retape
                      if (submitted) setSubmitted(false);
                    }}
                    autoComplete="new-password"
                    inputMode="text"
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowPwd((s) => !s)}
                    tabIndex={-1}
                    aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    title={showPwd ? 'Masquer' : 'Afficher'}
                  >
                    <i className={`bi ${showPwd ? 'bi-eye-slash' : 'bi-eye'}`} />
                  </button>
                </div>

                {/* Checklist live */}
                <ul className="list-unstyled mt-2 mb-0 small">
                  <li className={hasMinLen ? 'text-success' : 'text-muted'}>
                    <i className={`bi ${hasMinLen ? 'bi-check-circle' : 'bi-dot'} me-1`} />
                    8 caractères minimum
                  </li>
                  <li className={hasUpper ? 'text-success' : 'text-muted'}>
                    <i className={`bi ${hasUpper ? 'bi-check-circle' : 'bi-dot'} me-1`} />
                    Au moins une majuscule
                  </li>
                  <li className={hasLower ? 'text-success' : 'text-muted'}>
                    <i className={`bi ${hasLower ? 'bi-check-circle' : 'bi-dot'} me-1`} />
                    Au moins une minuscule
                  </li>
                  <li className={hasDigit ? 'text-success' : 'text-muted'}>
                    <i className={`bi ${hasDigit ? 'bi-check-circle' : 'bi-dot'} me-1`} />
                    Au moins un chiffre
                  </li>
                </ul>
              </div>

              {/* Confirmation */}
              <div className="mb-2">
                <label htmlFor="confirmPassword" className="form-label fw-semibold small mb-1">
                  Confirmer le mot de passe
                </label>
                <div className="input-group">
                  <input
                    type={showConfirmPwd ? 'text' : 'password'}
                    id="confirmPassword"
                    className="form-control py-2"
                    placeholder="Retapez le mot de passe"
                    value={confirmPassword}
                    onChange={(e) => {
                      const v = sanitizePassword(e.target.value);
                      setConfirmPassword(v);
                      // On n’affiche PAS l’erreur ici : seulement à la soumission
                    }}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowConfirmPwd((s) => !s)}
                    tabIndex={-1}
                    aria-label={showConfirmPwd ? 'Masquer la confirmation' : 'Afficher la confirmation'}
                    title={showConfirmPwd ? 'Masquer' : 'Afficher'}
                  >
                    <i className={`bi ${showConfirmPwd ? 'bi-eye-slash' : 'bi-eye'}`} />
                  </button>
                </div>

                {/* ❗️Erreur de confirmation affichée UNIQUEMENT après clic sur "Changer" */}
                {submitted && confirmPassword !== password && (
                  <small className="text-danger d-block mt-1">
                    Les mots de passe ne correspondent pas.
                  </small>
                )}
              </div>

              <div className="d-grid mt-3">
                <button
                  className="btn fw-semibold py-2"
                  style={{ backgroundColor: '#0b5ed7', borderColor: '#0b5ed7', borderRadius: '10px', color: 'white' }}
                  type="submit"
                  disabled={!isPasswordValid}
                  title={!isPasswordValid ? 'Le mot de passe doit respecter les critères' : 'Changer le mot de passe'}
                >
                  Changer le mot de passe
                </button>
              </div>
            </form>

            {/* Toasts */}
            <Toast
              message={toastMessage}
              type="success"
              show={showSuccess}
              onClose={() => setShowSuccess(false)}
            />
            <Toast
              message={toastMessage}
              type="error"
              show={showError}
              onClose={() => setShowError(false)}
            />
          </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

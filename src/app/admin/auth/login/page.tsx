//src/app/admin/auth/login/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

import Link from 'next/link';
import {
  collection,
  getDocs,
  query,
  where,
  limit as fbLimit,
  doc,
  getDoc
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';

import { db, auth } from '../../../../../firebaseConfig';
import Logo from '../../../../../public/iibs.jpg';
import Toast from '../../components/ui/Toast';
import { routeForRole, isPathAllowedForRole } from '@/lib/roleRouting';
import { useSearchParams } from 'next/navigation';


/* Helpers */
const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const normalizeLogin = (raw: string) => {
  let s = raw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9._-]/g, '');
  s = s.replace(/[._-]{2,}/g, '.');
  s = s.replace(/^[^a-z]+/, '');
  s = s.slice(0, 32);
  return s;
};
const loginNorm = (login: string) => login.toLowerCase();
const sanitize = (v: string) =>
  v.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/[<>]/g, '').trim();

export default function Login() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password modals
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [fpIdentifier, setFpIdentifier] = useState('');
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState<string | null>(null);
  const [showCheckEmailModal, setShowCheckEmailModal] = useState(false);

  // Toasts
  const [toastMessage, setToastMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  const params = useSearchParams();
  const next = params.get('next');
  const changed = params.get('changed');

  const showSuccessToast = (msg: string) => { setToastMessage(msg); setShowSuccess(true); };
  const showErrorToast   = (msg: string) => { setToastMessage(msg); setShowError(true); };

  React.useEffect(() => {
    if (changed === '1') {
      setToastMessage('Mot de passe mis à jour. Veuillez vous reconnecter.');
      setShowSuccess(true);
    }
  }, [changed]);

  const resolveEmail = async (id: string): Promise<{ email: string; userDocId?: string }> => {
    const raw = sanitize(id);
    const trimmed = raw.trim();

    if (EMAIL_REGEX.test(trimmed)) {
      return { email: trimmed };
    }

    const usersCol = collection(db, 'users');
    const norm = loginNorm(normalizeLogin(trimmed));

    let snap = await getDocs(query(usersCol, where('login_norm', '==', norm), fbLimit(1)));
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data() as any;
      if (!data?.email) throw new Error("Profil incomplet : email introuvable.");
      return { email: String(data.email), userDocId: d.id };
    }

    snap = await getDocs(query(usersCol, where('login', '==', trimmed), fbLimit(1)));
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data() as any;
      if (!data?.email) throw new Error("Profil incomplet : email introuvable.");
      return { email: String(data.email), userDocId: d.id };
    }

    throw new Error("Aucun utilisateur trouvé avec cet identifiant.");
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setShowError(false);
    setShowSuccess(false);

    try {
      const { email } = await resolveEmail(identifier);
      const cred = await signInWithEmailAndPassword(auth, email, password);

      const uid = cred.user.uid;
      let userDocSnap = await getDoc(doc(db, 'users', uid));
      if (!userDocSnap.exists()) {
        const fallback = await getDocs(
          query(collection(db, 'users'), where('email', '==', email), fbLimit(1))
        );
        if (!fallback.empty) {
          userDocSnap = fallback.docs[0];
        }
      }

      const userData = userDocSnap.exists() ? (userDocSnap.data() as any) : null;
      const roleLabelFromUser = userData?.role_libelle || '';
      const roleId = userData?.role_id || '';
      const firstLoginRaw = userData?.first_login;
      const firstLogin = firstLoginRaw === '1' || firstLoginRaw === 1 || firstLoginRaw === true;

      // Stockage local (utile ailleurs)
      localStorage.setItem('userLogin', userData?.login || sanitize(identifier));
      if (roleLabelFromUser) localStorage.setItem('userRole', roleLabelFromUser);
      if (next && next.startsWith('/')) {
        router.replace(next);
        return;
      }

      // ---------- Redirection (NOUVEAU) ----------
      if (firstLogin) {
        showSuccessToast('Connexion réussie — veuillez changer votre mot de passe.');
        router.replace('/admin/auth/change-password');
        return;
      }
      // Résoudre le rôle (priorité au libellé direct, sinon via role_id)
      let resolvedRole = roleLabelFromUser || '';
      if (!resolvedRole && roleId) {
        try {
          const roleDoc = await getDoc(doc(db, 'roles', String(roleId)));
          let roleName = roleDoc.exists() ? (roleDoc.data() as any)?.libelle || '' : '';
          if (!roleName) {
            const rs = await getDocs(
              query(collection(db, 'roles'), where('id', '==', roleId), fbLimit(1))
            );
            if (!rs.empty) roleName = (rs.docs[0].data() as any)?.libelle || '';
          }
          if (roleName) resolvedRole = roleName;
        } catch {/* ignore */}
      }

      // Mémos locaux utiles ailleurs
      try {
        localStorage.setItem('userLogin', userData?.login || sanitize(identifier));
        if (resolvedRole) localStorage.setItem('userRole', resolvedRole);
      } catch {}

      // Choisir l’atterrissage: lastPath::<uid> validé par rôle, sinon routeForRole
      const { chooseLanding } = await import('@/lib/safeRedirect');
      router.replace(chooseLanding(uid, resolvedRole));
      return;

      // Résolution par role_id si besoin
      if (roleId) {
        try {
          const roleDoc = await getDoc(doc(db, 'roles', String(roleId)));
          let roleName = roleDoc.exists() ? (roleDoc.data() as any)?.libelle || '' : '';
          if (!roleName) {
            const rs = await getDocs(
              query(collection(db, 'roles'), where('id', '==', roleId), fbLimit(1))
            );
            if (!rs.empty) roleName = (rs.docs[0].data() as any)?.libelle || '';
          }
          if (roleName) {
            localStorage.setItem('userRole', roleName);
            // recheck lastPath avec ce roleName
            const lp = (typeof window !== 'undefined' && localStorage.getItem('lastPath')) || '';
            if (lp && isPathAllowedForRole(roleName, lp)) {
              router.replace(lp);
            } else {
              router.replace(routeForRole(roleName));
            }
            return;
          }
        } catch {/* ignore */}
      }

      router.replace('/admin/home');
    } catch (error: any) {
      console.error('Erreur de connexion:', error);
      const code = error?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        showErrorToast('Identifiants invalides, veuillez réessayer.');
      } else if (error?.message?.includes("Aucun utilisateur")) {
        showErrorToast("Aucun utilisateur trouvé avec cet identifiant.");
      } else if (code === 'permission-denied') {
        showErrorToast("Impossible de vérifier le nom d'utilisateur. Essayez avec votre email.");
      } else {
        showErrorToast('Erreur serveur, veuillez réessayer plus tard.');
      }
    } finally {
      setLoading(false);
    }
  };

  /* -------- Forgot Password Flow -------- */
  const openForgot = () => {
    setFpIdentifier('');
    setFpError(null);
    setShowForgotModal(true);
  };

  const cancelForgot = () => {
    setShowForgotModal(false);
    setFpIdentifier('');
    setFpError(null);
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fpLoading) return;

    const input = sanitize(fpIdentifier);
    if (!input) {
      setFpError("Veuillez saisir votre email ou nom d'utilisateur.");
      return;
    }

    setFpLoading(true);
    setFpError(null);

    try {
      const { email } = await resolveEmail(input);
      await sendPasswordResetEmail(auth, email);
      setShowForgotModal(false);
      setShowCheckEmailModal(true);
    } catch (err: any) {
      console.error('Forgot error:', err);
      const code = err?.code || '';
      if (err?.message?.includes('Aucun utilisateur')) {
        setFpError("Aucun utilisateur trouvé avec cet identifiant.");
      } else if (code === 'auth/invalid-email') {
        setFpError("Adresse e-mail invalide.");
      } else {
        setFpError("Impossible d'envoyer l’email. Réessayez plus tard.");
      }
    } finally {
      setFpLoading(false);
    }
  };

  const closeCheckEmail = () => {
    setShowCheckEmailModal(false);
  };

  return (
      <div className="container-fluid p-0 bg-page">
      <div className="row g-0 min-vh-100">
        {/* Colonne gauche : image dans une card bleue 029DFE */}
        <div className="col-lg-6 d-none d-lg-flex align-items-stretch pe-3 py-3 order-lg-2">
          <div
            className="card border-0 rounded-4 overflow-hidden shadow-sm ms-auto me-0"
            style={{ background: '#029DFE', width: 550, maxWidth: 550, flex: '0 0 auto' }} 
          >
            <div className="position-relative w-100 h-100 p-4 p-xl-5">
              <Image
                src="/tool.png"
                alt="Illustration"
                fill
                priority
                style={{ objectFit: 'contain', objectPosition: 'center' }}
              />
            </div>
          </div>
        </div>
        {/* Colonne droite : card plein hauteur, bleu très clair */}
        <div className="col-12 col-lg-6 d-flex min-vh-100 py-3 ps-3 order-lg-1">
          <div className="card border-0 w-100 h-100 d-flex bg-transparent shadow-none">
            <div
              className="card-body d-flex flex-column align-items-center justify-content-center p-3 p-md-4"
              style={{ background: '#eef6ff' }}
            >
              {/* Logo */}
              <div className="text-center mb-4">
                <Image
                  src="/iibs-new.png"
                  alt="IBS Logo"
                  priority
                  width={360}            // ← augmente la taille (ex: 320–420)
                  height={120}           // hauteur approximative; l'image restera proportionnelle
                  style={{
                    width: 'clamp(220px, 35vw, 360px)',  // ← responsive : mini 220, maxi 360
                    height: 'auto',
                    objectFit: 'contain'
                  }}
                />
              </div>

              <h3 className="text-center fw-semibold mb-4 mb-lg-5">Connexion</h3>

              {/* Formulaire */}
              <form onSubmit={handleLogin} className="w-100" style={{ maxWidth: 420 }}>
                <div className="mb-2">
                  <label htmlFor="identifier" className="form-label small fw-semibold mb-1">
                    Email ou nom d’utilisateur
                  </label>
                  <input
                    type="text"
                    id="identifier"
                    className="form-control rounded-3 py-2"
                    placeholder="ex: jean@exemple.com ou j.dupont"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>

                <div className="mb-2">
                  <label htmlFor="password" className="form-label small fw-semibold mb-1">
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    id="password"
                    className="form-control rounded-3 py-2"
                    placeholder="Votre mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>

                {/* Bouton : prends la largeur, tu peux adapter la couleur ici */}
                <button
                  className="btn w-100 fw-semibold mt-2 py-2 rounded-3"
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: '#029DFE', borderColor: '#0d6efd', color: '#fff' }}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                      Connexion...
                    </>
                  ) : (
                    'Je me connecte'
                  )}
                </button>

                <div className="text-center mt-2">
                  <button type="button" className="btn btn-link p-0 small" onClick={() => setShowForgotModal(true)}>
                    Mot de passe oublié ?
                  </button>
                </div>
              </form>

              <Toast message={toastMessage} type="success" show={showSuccess} onClose={() => setShowSuccess(false)} />
              <Toast message={toastMessage} type="error"   show={showError}   onClose={() => setShowError(false)} />
            </div>
          </div>
        </div>
      </div>

      {showForgotModal && (
        <>
          <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <form onSubmit={submitForgot} noValidate>
                  <div className="modal-header">
                    <h6 className="modal-title fw-bold">Réinitialiser le mot de passe</h6>
                    <button type="button" className="btn-close" onClick={cancelForgot} />
                  </div>
                  <div className="modal-body">
                    <div className="mb-2">
                      <label className="form-label small fw-semibold mb-1">Email ou nom d’utilisateur</label>
                      <input
                        type="text"
                        className="form-control rounded-3 py-2"
                        placeholder="Saisissez votre email ou login"
                        value={fpIdentifier}
                        onChange={(e) => setFpIdentifier(e.target.value)}
                        autoFocus
                      />
                      {fpError && <div className="text-danger small mt-1">{fpError}</div>}
                    </div>
                    <div className="small text-muted">
                      Nous enverrons un lien sécurisé à l’adresse e-Mail associée à votre compte. Vérifiez vos spams aussi.
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={cancelForgot} disabled={fpLoading}>
                      Annuler
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={fpLoading}>
                      {fpLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" />
                          Envoi...
                        </>
                      ) : (
                        'Envoyer le lien'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={cancelForgot} />
        </>
      )}

      {showCheckEmailModal && (
        <>
          <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h6 className="modal-title fw-bold">Vérifiez votre adresse mail</h6>
                  <button type="button" className="btn-close" onClick={closeCheckEmail} />
                </div>
                <div className="modal-body">
                  Un e-mail de réinitialisation a été envoyé. Veuillez suivre le lien reçu pour créer un nouveau mot de passe.
                </div>
                <div className="modal-footer">
                  <button className="btn btn-primary" onClick={closeCheckEmail}>OK</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={closeCheckEmail} />
        </>
      )}
      <style jsx>{`
      .bg-page { background: #eef6ff; }

      
      @media (min-width: 1400px) {
      }
    `}</style>
    </div>
  );
}

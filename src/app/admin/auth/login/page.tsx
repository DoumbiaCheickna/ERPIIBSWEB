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
      console.log('Email résolu pour login:', email);
      console.log('Tentative de connexion avec email:', email);
      console.log('Mot de passe fourni:', password ? password: '(vide)');
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
  <div className="min-vh-100 d-flex align-items-center" style={{ 
    background: 'radial-gradient(circle at 10% 20%, rgb(2, 157, 254) 0%, rgb(1, 78, 126) 50%, rgb(0, 32, 64) 100%)',
    position: 'relative',
    overflow: 'hidden'
  }}>
    <div className="bubbles-container" style={{
      position: 'absolute',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      zIndex: 0
    }}>
      {[...Array(15)].map((_, i) => (
        <div
          key={i}
          className="bubble"
          style={{
            position: 'absolute',
            left: `${Math.random() * 100}%`,
            bottom: `-${Math.random() * 100}px`,
            width: `${Math.random() * 80 + 20}px`,
            height: `${Math.random() * 80 + 20}px`,
            background: `rgba(255, 255, 255, ${Math.random() * 0.1 + 0.05})`,
            borderRadius: '50%',
            animation: `float ${Math.random() * 10 + 15}s linear infinite`,
            animationDelay: `${Math.random() * 10}s`,
            backdropFilter: 'blur(5px)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        />
      ))}
    </div>
    <div className="tech-particles" style={{
      position: 'absolute',
      width: '100%',
      height: '100%',
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M0 0 L10 10 L20 0 L30 10 L40 0'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      backgroundRepeat: 'repeat',
      animation: 'slide 20s linear infinite',
      opacity: 0.5,
      pointerEvents: 'none'
    }} />
    <div className="container py-5 position-relative" style={{ zIndex: 2 }}>
      <div className="row g-0 justify-content-center align-items-center">
        <div className="col-lg-6 d-none d-lg-block" data-aos="fade-right">
          <div className="pe-5">
            <div className="mb-5" style={{ animation: 'slideInLeft 0.8s ease-out' }}>
              <div className="d-flex align-items-center gap-3 mb-4">
                <div style={{ 
                  width: 60, 
                  height: 60, 
                  background: 'linear-gradient(135deg, #ffffff20 0%, #029DFE40 100%)',
                  borderRadius: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  animation: 'pulse 2s infinite'
                }}>
                  <span style={{ fontSize: 32, fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #029DFE 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    II
                  </span>
                </div>
                <div>
                  <h2 style={{ fontWeight: 800, margin: 0, color: 'white', fontSize: 32, letterSpacing: -1 }}>IIBS</h2>
                  <p style={{ fontSize: 13, color: '#ffffffcc', margin: 0, letterSpacing: 2 }}>INSTITUT INFORMATIQUE BUSINESS SCHOOL</p>
                </div>
              </div>
            </div>
            <div style={{ animation: 'slideInLeft 1s ease-out 0.2s both' }}>
              <h1 style={{ 
                fontSize: 56, 
                fontWeight: 800, 
                color: 'white',
                lineHeight: 1.2,
                marginBottom: 24,
                letterSpacing: -2,
                textShadow: '0 4px 20px rgba(0,0,0,0.2)'
              }}>
                L'excellence<br />
                <span style={{ 
                  background: 'linear-gradient(135deg, #029DFE 0%, #00d4ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>numérique</span><br />
                nouvelle génération sénégalaise.
              </h1>
              
              <p style={{ fontSize: 18, color: '#ffffffdd', lineHeight: 1.6, marginBottom: 40, maxWidth: 500 }}>
                Rejoignez la communauté d'élite qui forme les leaders de la transformation digitale.
              </p>
            </div>

            {/* STATS PREMIUM */}
            <div className="d-flex gap-5 mb-5" style={{ animation: 'slideInLeft 1s ease-out 0.4s both' }}>
              <div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#029DFE' }}>120+</div>
                <div style={{ fontSize: 13, color: '#ffffffcc', fontWeight: 500 }}>ÉTUDIANTS</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#029DFE' }}>98%</div>
                <div style={{ fontSize: 13, color: '#ffffffcc', fontWeight: 500 }}>SATISFACTION</div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#029DFE' }}>24/7</div>
                <div style={{ fontSize: 13, color: '#ffffffcc', fontWeight: 500 }}>SUPPORT</div>
              </div>
            </div>
{/* RÉSEAUX SOCIAUX AVEC VRAIES ICÔNES */}
<div style={{ animation: 'slideInLeft 1s ease-out 0.6s both' }}>
  <p style={{ fontSize: 14, color: '#ffffffcc', marginBottom: 16, letterSpacing: 1 }}>
    SUIVEZ-NOUS SUR
  </p>
  <div className="d-flex gap-3">
    {[
      { 
        name: 'LinkedIn', 
        icon: (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451c.979 0 1.771-.773 1.771-1.729V1.729C24 .774 23.204 0 22.225 0z"/>
          </svg>
        ), 
        color: '#0077b5', 
        url: 'https://sn.linkedin.com/company/iibs-sn' 
      },
      { 
        name: 'Twitter', 
        icon: (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 0021.967-12.114c0-.21-.005-.42-.015-.63A9.936 9.936 0 0024 4.59z"/>
          </svg>
        ), 
        color: '#1DA1F2', 
        url: 'https://twitter.com' 
      },
      { 
        name: 'Instagram', 
        icon: (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
        ), 
        color: '#E4405F', 
        url: 'https://www.instagram.com/iibs.sn/' 
      },
      { 
        name: 'Facebook', 
        icon: (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        ), 
        color: '#1877F2', 
        url: 'https://www.facebook.com/people/Iibs-sn/61579818293018/' 
      },
      { 
        name: 'YouTube', 
        icon: (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        ), 
        color: '#FF0000', 
        url: 'https://youtube.com' 
      }
    ].map((social, idx) => (
      <a
        key={idx}
        href={social.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          textDecoration: 'none',
          border: '1px solid rgba(255,255,255,0.2)',
          color: 'white'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-5px)';
          e.currentTarget.style.background = social.color;
          e.currentTarget.style.borderColor = social.color;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
        }}
      >
        {social.icon}
      </a>
    ))}
  </div>
</div>
            {/* <div style={{ animation: 'slideInLeft 1s ease-out 0.6s both' }}>
              <p style={{ fontSize: 14, color: '#ffffffcc', marginBottom: 16, letterSpacing: 1 }}>
                SUIVEZ-NOUS SUR
              </p>
              <div className="d-flex gap-3">
                {[
                  { name: 'LinkedIn', icon: '🔗', color: '#0077b5', url: '#' },
                  { name: 'Twitter', icon: '🐦', color: '#1DA1F2', url: '#' },
                  { name: 'Instagram', icon: '📸', color: '#E4405F', url: '#' },
                  { name: 'Facebook', icon: '📘', color: '#1877F2', url: '#' },
                  { name: 'YouTube', icon: '📺', color: '#FF0000', url: '#' }
                ].map((social, idx) => (
                  <a
                    key={idx}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(10px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      transition: 'all 0.3s ease',
                      textDecoration: 'none',
                      border: '1px solid rgba(255,255,255,0.2)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px)';
                      e.currentTarget.style.background = social.color;
                      e.currentTarget.style.borderColor = social.color;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    }}
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div> */}
          </div>
        </div>

        {/* SECTION DROITE - FORMULAIRE */}
        <div className="col-12 col-lg-6" data-aos="fade-left">
          <div style={{
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(20px)',
            borderRadius: 40,
            border: '1px solid rgba(2, 157, 254, 0.3)',
            padding: '56px 48px',
            maxWidth: 520,
            margin: '0 auto',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            
            {/* Header formulaire */}
            <div className="text-center mb-5">
              <div style={{
                width: 80,
                height: 80,
                background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
                borderRadius: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                border: '1px solid rgba(2, 157, 254, 0.4)'
              }}>
                <Image
                  src="/iibs-new.png"
                  alt="IIBS Logo"
                  width={50}
                  height={50}
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <h2 style={{ fontSize: 32, fontWeight: 700, color: 'white', marginBottom: 8 }}>Accès Plateforme</h2>
              <p style={{ color: '#94a3b8', fontSize: 14 }}>Connectez-vous à votre espace personnel</p>
            </div>

            {/* Formulaire */}
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label style={{ 
                  display: 'block', 
                  fontSize: 13, 
                  fontWeight: 600, 
                  color: '#e2e8f0',
                  marginBottom: 8,
                  letterSpacing: 0.5
                }}>
                  EMAIL OU IDENTIFIANT
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
                    📧
                  </span>
                  <input
                    type="text"
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
                    placeholder="jean.dupont@iibs.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', letterSpacing: 0.5 }}>
                    MOT DE PASSE
                  </label>
                  <button 
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#029DFE', fontSize: 12, fontWeight: 500 }}
                    onClick={() => setShowForgotModal(true)}
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
                    🔒
                  </span>
                  <input
                    type="password"
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
                    placeholder="Votre mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #029DFE 0%, #0284c7 100%)',
                  border: 'none',
                  borderRadius: 16,
                  padding: '16px',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: 1,
                  transition: 'all 0.3s ease',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(2,157,254,0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    CONNEXION...
                  </>
                ) : (
                  'SE CONNECTER'
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="text-center mt-5 pt-3">
              <p style={{ fontSize: 11, color: '#475569', letterSpacing: 0.5 }}>
                © 2026 IIBS DIGITAL SCHOOL | Tous droits réservés
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* MODALES - VOTRE CODE ORIGINAL */}
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
                    <label className="form-label small fw-semibold mb-1">Email ou nom d&apos;utilisateur</label>
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
                    Nous enverrons un lien sécurisé à l&apos;adresse e-Mail associée à votre compte. Vérifiez vos spams aussi.
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

    {/* ANIMATIONS CSS */}
    <style jsx>{`
      @keyframes float {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 0;
        }
        10% {
          opacity: 1;
        }
        90% {
          opacity: 1;
        }
        100% {
          transform: translateY(-100vh) rotate(360deg);
          opacity: 0;
        }
      }

      @keyframes slide {
        0% {
          background-position: 0 0;
        }
        100% {
          background-position: 40px 40px;
        }
      }

      @keyframes slideInLeft {
        from {
          opacity: 0;
          transform: translateX(-50px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
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

      .bubbles-container {
        position: absolute;
        width: 100%;
        height: 100%;
        overflow: hidden;
        z-index: 0;
      }

      @media (max-width: 992px) {
        .bubbles-container {
          opacity: 0.3;
        }
      }
    `}</style>

    {/* TOASTS */}
    <Toast message={toastMessage} type="success" show={showSuccess} onClose={() => setShowSuccess(false)} />
    <Toast message={toastMessage} type="error" show={showError} onClose={() => setShowError(false)} />
  </div>
);
// return (
//   <div className="min-vh-100 d-flex align-items-center" style={{ 
//     background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
//     position: 'relative',
//     overflow: 'hidden'
//   }}>
//     {/* Effet de grille technique */}
//     <div style={{
//       position: 'absolute',
//       top: 0,
//       left: 0,
//       right: 0,
//       bottom: 0,
//       backgroundImage: 'radial-gradient(circle at 25% 50%, rgba(2, 157, 254, 0.08) 0%, transparent 50%)',
//       pointerEvents: 'none'
//     }} />
    
//     {/* Effet de particules tech */}
//     <div style={{
//       position: 'absolute',
//       width: '100%',
//       height: '100%',
//       background: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23029DFE" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") repeat',
//       opacity: 0.3,
//       pointerEvents: 'none'
//     }} />

//     <div className="container py-5">
//       <div className="row g-0 justify-content-center">
        
//         {/* Section gauche - Présentation institutionnelle */}
//         <div className="col-lg-6 d-none d-lg-flex align-items-center">
//           <div className="pe-5" style={{ maxWidth: 540 }}>
//             <div className="mb-5">
//               <div className="d-flex align-items-center gap-2 mb-4">
//                 <div style={{ 
//                   width: 48, 
//                   height: 48, 
//                   background: 'linear-gradient(135deg, #029DFE 0%, #00d4ff 100%)',
//                   borderRadius: 16,
//                   display: 'flex',
//                   alignItems: 'center',
//                   justifyContent: 'center'
//                 }}>
//                   <span style={{ fontSize: 28, fontWeight: 800, color: 'white' }}>II</span>
//                 </div>
//                 <div>
//                   <h2 style={{ fontWeight: 700, margin: 0, color: 'white', letterSpacing: -0.5 }}>IIBS</h2>
//                   <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Digital School</p>
//                 </div>
//               </div>
              
//               <h1 style={{ 
//                 fontSize: 48, 
//                 fontWeight: 800, 
//                 color: 'white',
//                 lineHeight: 1.2,
//                 marginBottom: 24,
//                 letterSpacing: -1
//               }}>
//                 La réussite<br />
//                 <span style={{ color: '#029DFE' }}>digitale commence ici</span>
//               </h1>
              
//               <p style={{ fontSize: 18, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 32 }}>
//                 Plateforme éducative nouvelle génération pour étudiants et professionnels de la tech.
//                 Gérez votre parcours, accédez aux ressources et suivez votre progression.
//               </p>
              
//               <div className="d-flex gap-4">
//                 <div>
//                   <div style={{ fontSize: 28, fontWeight: 700, color: '#029DFE' }}>500+</div>
//                   <div style={{ fontSize: 13, color: '#94a3b8' }}>Étudiants actifs</div>
//                 </div>
//                 <div>
//                   <div style={{ fontSize: 28, fontWeight: 700, color: '#029DFE' }}>98%</div>
//                   <div style={{ fontSize: 13, color: '#94a3b8' }}>Taux de satisfaction</div>
//                 </div>
//                 <div>
//                   <div style={{ fontSize: 28, fontWeight: 700, color: '#029DFE' }}>24/7</div>
//                   <div style={{ fontSize: 13, color: '#94a3b8' }}>Support dédié</div>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Section droite - Formulaire de connexion */}
//         <div className="col-12 col-lg-6">
//           <div style={{
//             background: 'rgba(30, 41, 59, 0.7)',
//             backdropFilter: 'blur(20px)',
//             borderRadius: 32,
//             border: '1px solid rgba(2, 157, 254, 0.2)',
//             padding: '48px 40px',
//             maxWidth: 520,
//             margin: '0 auto'
//           }}>
            
//             {/* Logo */}
//             <div className="text-center mb-5">
//               <div style={{
//                 width: 64,
//                 height: 64,
//                 background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
//                 borderRadius: 20,
//                 display: 'flex',
//                 alignItems: 'center',
//                 justifyContent: 'center',
//                 margin: '0 auto 24px',
//                 border: '1px solid rgba(2, 157, 254, 0.3)'
//               }}>
//                 <Image
//                   src="/iibs-new.png"
//                   alt="IIBS Logo"
//                   width={40}
//                   height={40}
//                   style={{ objectFit: 'contain' }}
//                 />
//               </div>
//               <h2 style={{ fontSize: 28, fontWeight: 700, color: 'white', marginBottom: 8 }}>Bienvenue</h2>
//               <p style={{ color: '#94a3b8', fontSize: 14 }}>Connectez-vous à votre espace IIBS</p>
//             </div>

//             {/* Formulaire */}
//             <form onSubmit={handleLogin} className="w-100">
//               <div className="mb-4">
//                 <label htmlFor="identifier" style={{ 
//                   display: 'block', 
//                   fontSize: 13, 
//                   fontWeight: 500, 
//                   color: '#cbd5e1',
//                   marginBottom: 8 
//                 }}>
//                   Email ou identifiant
//                 </label>
//                 <input
//                   type="text"
//                   id="identifier"
//                   className="form-control"
//                   style={{
//                     background: '#1e293b',
//                     border: '1px solid #334155',
//                     color: 'white',
//                     borderRadius: 12,
//                     padding: '12px 16px',
//                     fontSize: 14,
//                     transition: 'all 0.2s'
//                   }}
//                   onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
//                     e.target.style.borderColor = '#029DFE';
//                   }}
//                   onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
//                     e.target.style.borderColor = '#334155';
//                   }}
//                   placeholder="ex: jean@exemple.com ou j.dupont"
//                   value={identifier}
//                   onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIdentifier(e.target.value)}
//                   required
//                   disabled={loading}
//                   autoComplete="username"
//                 />
//               </div>

//               <div className="mb-4">
//                 <div className="d-flex justify-content-between align-items-center mb-2">
//                   <label htmlFor="password" style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1', marginBottom: 0 }}>
//                     Mot de passe
//                   </label>
//                   <button 
//                     type="button"
//                     style={{ background: 'none', border: 'none', color: '#029DFE', fontSize: 12, padding: 0 }}
//                     onClick={() => setShowForgotModal(true)}
//                   >
//                     Mot de passe oublié ?
//                   </button>
//                 </div>
//                 <input
//                   type="password"
//                   id="password"
//                   className="form-control"
//                   style={{
//                     background: '#1e293b',
//                     border: '1px solid #334155',
//                     color: 'white',
//                     borderRadius: 12,
//                     padding: '12px 16px',
//                     fontSize: 14,
//                     transition: 'all 0.2s'
//                   }}
//                   onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
//                     e.target.style.borderColor = '#029DFE';
//                   }}
//                   onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
//                     e.target.style.borderColor = '#334155';
//                   }}
//                   placeholder="Votre mot de passe"
//                   value={password}
//                   onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
//                   required
//                   disabled={loading}
//                   autoComplete="current-password"
//                 />
//               </div>

//               <button
//                 type="submit"
//                 className="btn w-100 fw-semibold"
//                 disabled={loading}
//                 style={{
//                   background: 'linear-gradient(135deg, #029DFE 0%, #0284c7 100%)',
//                   border: 'none',
//                   borderRadius: 12,
//                   padding: '14px',
//                   color: 'white',
//                   fontWeight: 600,
//                   fontSize: 15,
//                   transition: 'transform 0.2s, box-shadow 0.2s',
//                   cursor: loading ? 'not-allowed' : 'pointer'
//                 }}
//                 onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
//                   if (!loading) {
//                     e.currentTarget.style.transform = 'translateY(-2px)';
//                     e.currentTarget.style.boxShadow = '0 8px 20px rgba(2, 157, 254, 0.3)';
//                   }
//                 }}
//                 onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
//                   e.currentTarget.style.transform = 'translateY(0)';
//                   e.currentTarget.style.boxShadow = 'none';
//                 }}
//               >
//                 {loading ? (
//                   <>
//                     <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
//                     Connexion...
//                   </>
//                 ) : (
//                   'Je me connecte'
//                 )}
//               </button>
//             </form>

//             {/* Footer */}
//             <div className="text-center mt-5 pt-3">
//               <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
//                 © 2024 IIBS Digital School. Tous droits réservés.
//               </p>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>

//     {/* Vos toasts (inchangés) */}
//     <Toast message={toastMessage} type="success" show={showSuccess} onClose={() => setShowSuccess(false)} />
//     <Toast message={toastMessage} type="error" show={showError} onClose={() => setShowError(false)} />

//     {/* Modale Mot de passe oublié (design modernisé mais fonctionnalités identiques) */}
//     {showForgotModal && (
//       <>
//         <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
//           <div className="modal-dialog modal-dialog-centered">
//             <div className="modal-content" style={{
//               background: '#1e293b',
//               border: '1px solid rgba(2, 157, 254, 0.2)',
//               borderRadius: 20
//             }}>
//               <form onSubmit={submitForgot} noValidate>
//                 <div className="modal-header" style={{ borderBottomColor: '#334155' }}>
//                   <h6 className="modal-title fw-bold" style={{ color: 'white' }}>Réinitialiser le mot de passe</h6>
//                   <button type="button" className="btn-close btn-close-white" onClick={cancelForgot} />
//                 </div>
//                 <div className="modal-body">
//                   <div className="mb-3">
//                     <label className="form-label small fw-semibold mb-2" style={{ color: '#cbd5e1' }}>
//                       Email ou nom d'utilisateur
//                     </label>
//                     <input
//                       type="text"
//                       className="form-control"
//                       style={{
//                         background: '#0f172a',
//                         border: '1px solid #334155',
//                         color: 'white',
//                         borderRadius: 12,
//                         padding: '12px 16px',
//                         fontSize: 14
//                       }}
//                       placeholder="Saisissez votre email ou login"
//                       value={fpIdentifier}
//                       onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFpIdentifier(e.target.value)}
//                       autoFocus
//                     />
//                     {fpError && <div className="text-danger small mt-2">{fpError}</div>}
//                   </div>
//                   <div className="small" style={{ color: '#94a3b8', fontSize: 12 }}>
//                     Nous enverrons un lien sécurisé à l'adresse e-mail associée à votre compte. Vérifiez vos spams aussi.
//                   </div>
//                 </div>
//                 <div className="modal-footer" style={{ borderTopColor: '#334155', gap: '12px' }}>
//                   <button 
//                     type="button" 
//                     className="btn btn-outline-secondary" 
//                     onClick={cancelForgot} 
//                     disabled={fpLoading}
//                     style={{
//                       background: 'transparent',
//                       borderColor: '#475569',
//                       color: '#cbd5e1'
//                     }}
//                   >
//                     Annuler
//                   </button>
//                   <button 
//                     type="submit" 
//                     className="btn btn-primary" 
//                     disabled={fpLoading}
//                     style={{
//                       background: 'linear-gradient(135deg, #029DFE 0%, #0284c7 100%)',
//                       border: 'none'
//                     }}
//                   >
//                     {fpLoading ? (
//                       <>
//                         <span className="spinner-border spinner-border-sm me-2" />
//                         Envoi...
//                       </>
//                     ) : (
//                       'Envoyer le lien'
//                     )}
//                   </button>
//                 </div>
//               </form>
//             </div>
//           </div>
//         </div>
//         <div className="modal-backdrop fade show" onClick={cancelForgot} style={{ background: 'rgba(0,0,0,0.7)' }} />
//       </>
//     )}

//     {/* Modale Confirmation email (design modernisé) */}
//     {showCheckEmailModal && (
//       <>
//         <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
//           <div className="modal-dialog modal-dialog-centered">
//             <div className="modal-content" style={{
//               background: '#1e293b',
//               border: '1px solid rgba(2, 157, 254, 0.2)',
//               borderRadius: 20
//             }}>
//               <div className="modal-header" style={{ borderBottomColor: '#334155' }}>
//                 <h6 className="modal-title fw-bold" style={{ color: 'white' }}>Vérifiez votre adresse mail</h6>
//                 <button type="button" className="btn-close btn-close-white" onClick={closeCheckEmail} />
//               </div>
//               <div className="modal-body">
//                 <div style={{ textAlign: 'center', padding: '20px 0' }}>
//                   <div style={{
//                     width: 64,
//                     height: 64,
//                     background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
//                     borderRadius: 50,
//                     display: 'flex',
//                     alignItems: 'center',
//                     justifyContent: 'center',
//                     margin: '0 auto 20px',
//                     border: '1px solid rgba(2, 157, 254, 0.3)'
//                   }}>
//                     <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
//                       <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#029DFE" strokeWidth="1.5" fill="none"/>
//                       <path d="M22 6L12 13L2 6" stroke="#029DFE" strokeWidth="1.5" fill="none"/>
//                     </svg>
//                   </div>
//                   <p style={{ color: '#cbd5e1', fontSize: 15, margin: 0 }}>
//                     Un e-mail de réinitialisation a été envoyé.<br />
//                     Veuillez suivre le lien reçu pour créer un nouveau mot de passe.
//                   </p>
//                 </div>
//               </div>
//               <div className="modal-footer" style={{ borderTopColor: '#334155', justifyContent: 'center' }}>
//                 <button 
//                   className="btn btn-primary" 
//                   onClick={closeCheckEmail}
//                   style={{
//                     background: 'linear-gradient(135deg, #029DFE 0%, #0284c7 100%)',
//                     border: 'none',
//                     padding: '10px 30px'
//                   }}
//                 >
//                   OK
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//         <div className="modal-backdrop fade show" onClick={closeCheckEmail} style={{ background: 'rgba(0,0,0,0.7)' }} />
//       </>
//     )}
//   </div>
// );
  // return (
  //     <div className="container-fluid p-0 bg-page">
  //     <div className="row g-0 min-vh-100">
  //       {/* Colonne gauche : image dans une card bleue 029DFE */}
  //       <div className="col-lg-6 d-none d-lg-flex align-items-stretch pe-3 py-3 order-lg-2">
  //         <div
  //           className="card border-0 rounded-4 overflow-hidden shadow-sm ms-auto me-0"
  //           style={{ background: '#029DFE', width: 550, maxWidth: 550, flex: '0 0 auto' }} 
  //         >
  //           <div className="position-relative w-100 h-100 p-4 p-xl-5">
  //             <Image
  //               src="/tool.png"
  //               alt="Illustration"
  //               fill
  //               priority
  //               style={{ objectFit: 'contain', objectPosition: 'center' }}
  //             />
  //           </div>
  //         </div>
  //       </div>
  //       {/* Colonne droite : card plein hauteur, bleu très clair */}
  //       <div className="col-12 col-lg-6 d-flex min-vh-100 py-3 ps-3 order-lg-1">
  //         <div className="card border-0 w-100 h-100 d-flex bg-transparent shadow-none">
  //           <div
  //             className="card-body d-flex flex-column align-items-center justify-content-center p-3 p-md-4"
  //             style={{ background: '#eef6ff' }}
  //           >
  //             {/* Logo */}
  //             <div className="text-center mb-4">
  //               <Image
  //                 src="/iibs-new.png"
  //                 alt="IBS Logo"
  //                 priority
  //                 width={360}            // ← augmente la taille (ex: 320–420)
  //                 height={120}           // hauteur approximative; l'image restera proportionnelle
  //                 style={{
  //                   width: 'clamp(220px, 35vw, 360px)',  // ← responsive : mini 220, maxi 360
  //                   height: 'auto',
  //                   objectFit: 'contain'
  //                 }}
  //               />
  //             </div>

  //             <h3 className="text-center fw-semibold mb-4 mb-lg-5">Connexion</h3>

  //             {/* Formulaire */}
  //             <form onSubmit={handleLogin} className="w-100" style={{ maxWidth: 420 }}>
  //               <div className="mb-2">
  //                 <label htmlFor="identifier" className="form-label small fw-semibold mb-1">
  //                   Email ou nom d’utilisateur
  //                 </label>
  //                 <input
  //                   type="text"
  //                   id="identifier"
  //                   className="form-control rounded-3 py-2"
  //                   placeholder="ex: jean@exemple.com ou j.dupont"
  //                   value={identifier}
  //                   onChange={(e) => setIdentifier(e.target.value)}
  //                   required
  //                   disabled={loading}
  //                   autoComplete="username"
  //                 />
  //               </div>

  //               <div className="mb-2">
  //                 <label htmlFor="password" className="form-label small fw-semibold mb-1">
  //                   Mot de passe
  //                 </label>
  //                 <input
  //                   type="password"
  //                   id="password"
  //                   className="form-control rounded-3 py-2"
  //                   placeholder="Votre mot de passe"
  //                   value={password}
  //                   onChange={(e) => setPassword(e.target.value)}
  //                   required
  //                   disabled={loading}
  //                   autoComplete="current-password"
  //                 />
  //               </div>

  //               {/* Bouton : prends la largeur, tu peux adapter la couleur ici */}
  //               <button
  //                 className="btn w-100 fw-semibold mt-2 py-2 rounded-3"
  //                 type="submit"
  //                 disabled={loading}
  //                 style={{ backgroundColor: '#029DFE', borderColor: '#0d6efd', color: '#fff' }}
  //               >
  //                 {loading ? (
  //                   <>
  //                     <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
  //                     Connexion...
  //                   </>
  //                 ) : (
  //                   'Je me connecte'
  //                 )}
  //               </button>

  //               <div className="text-center mt-2">
  //                 <button type="button" className="btn btn-link p-0 small" onClick={() => setShowForgotModal(true)}>
  //                   Mot de passe oublié ?
  //                 </button>
  //               </div>
  //             </form>

  //             <Toast message={toastMessage} type="success" show={showSuccess} onClose={() => setShowSuccess(false)} />
  //             <Toast message={toastMessage} type="error"   show={showError}   onClose={() => setShowError(false)} />
  //           </div>
  //         </div>
  //       </div>
  //     </div>

  //     {showForgotModal && (
  //       <>
  //         <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
  //           <div className="modal-dialog modal-dialog-centered">
  //             <div className="modal-content">
  //               <form onSubmit={submitForgot} noValidate>
  //                 <div className="modal-header">
  //                   <h6 className="modal-title fw-bold">Réinitialiser le mot de passe</h6>
  //                   <button type="button" className="btn-close" onClick={cancelForgot} />
  //                 </div>
  //                 <div className="modal-body">
  //                   <div className="mb-2">
  //                     <label className="form-label small fw-semibold mb-1">Email ou nom d’utilisateur</label>
  //                     <input
  //                       type="text"
  //                       className="form-control rounded-3 py-2"
  //                       placeholder="Saisissez votre email ou login"
  //                       value={fpIdentifier}
  //                       onChange={(e) => setFpIdentifier(e.target.value)}
  //                       autoFocus
  //                     />
  //                     {fpError && <div className="text-danger small mt-1">{fpError}</div>}
  //                   </div>
  //                   <div className="small text-muted">
  //                     Nous enverrons un lien sécurisé à l’adresse e-Mail associée à votre compte. Vérifiez vos spams aussi.
  //                   </div>
  //                 </div>
  //                 <div className="modal-footer">
  //                   <button type="button" className="btn btn-outline-secondary" onClick={cancelForgot} disabled={fpLoading}>
  //                     Annuler
  //                   </button>
  //                   <button type="submit" className="btn btn-primary" disabled={fpLoading}>
  //                     {fpLoading ? (
  //                       <>
  //                         <span className="spinner-border spinner-border-sm me-2" />
  //                         Envoi...
  //                       </>
  //                     ) : (
  //                       'Envoyer le lien'
  //                     )}
  //                   </button>
  //                 </div>
  //               </form>
  //             </div>
  //           </div>
  //         </div>
  //         <div className="modal-backdrop fade show" onClick={cancelForgot} />
  //       </>
  //     )}

  //     {showCheckEmailModal && (
  //       <>
  //         <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
  //           <div className="modal-dialog modal-dialog-centered">
  //             <div className="modal-content">
  //               <div className="modal-header">
  //                 <h6 className="modal-title fw-bold">Vérifiez votre adresse mail</h6>
  //                 <button type="button" className="btn-close" onClick={closeCheckEmail} />
  //               </div>
  //               <div className="modal-body">
  //                 Un e-mail de réinitialisation a été envoyé. Veuillez suivre le lien reçu pour créer un nouveau mot de passe.
  //               </div>
  //               <div className="modal-footer">
  //                 <button className="btn btn-primary" onClick={closeCheckEmail}>OK</button>
  //               </div>
  //             </div>
  //           </div>
  //         </div>
  //         <div className="modal-backdrop fade show" onClick={closeCheckEmail} />
  //       </>
  //     )}
  //     <style jsx>{`
  //     .bg-page { background: #eef6ff; }

      
  //     @media (min-width: 1400px) {
  //     }
  //   `}</style>
  //   </div>
  // );
}

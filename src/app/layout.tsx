// //src/app/layout.tsx
// 'use client';

// import { ReactNode, useEffect, useState } from 'react';
// import { onAuthStateChanged, User } from 'firebase/auth';
// import { auth } from '../../firebaseConfig';
// import { useRouter, usePathname } from 'next/navigation';
// import Navbar from './admin/components/layout/Navbar';
// import FirstLoginGuard from './admin/auth/FirstLoginGuard';
// import 'bootstrap/dist/css/bootstrap.min.css';
// import 'bootstrap-icons/font/bootstrap-icons.css';
// import { isPathAllowedForRole, routeForRole } from '@/lib/roleRouting';

// export default function RootLayout({ children }: { children: ReactNode }) {
//   const [user, setUser] = useState<User | null>(null);
//   const [booting, setBooting] = useState(true);
//   const router = useRouter();
//   const pathname = usePathname();

//   // observer session (affichage navbar + logique d'accueil)
//   useEffect(() => {
//     const unsub = onAuthStateChanged(auth, (u) => {
//       setUser(u);
//       setBooting(false);
//     });
//     return () => unsub();
//   }, []);

//   // mémoriser la dernière route (sauf login/change-password)
//   // mémoriser la dernière route (sauf login/change-password)
// // -- utilise une clé par utilisateur : lastPath::<uid>
//   useEffect(() => {
//     if (!pathname) return;
//     const authPaths = ['/admin/auth/login', '/admin/auth/change-password'];
//     if (authPaths.includes(pathname)) return;

//     const uid = auth.currentUser?.uid;
//     if (!uid) return;

//     try { localStorage.setItem(`lastPath::${uid}`, pathname); } catch {}
//   }, [pathname]);


//   // gestion de la racine "/"
//   useEffect(() => {
//     if (pathname !== '/') return;

//     const go = () => {
//       const u = auth.currentUser;
//       if (u) {
//         const uid = u.uid;
//         // On récupère le rôle stocké ou laisse vide
//         const role = (typeof window !== 'undefined' && localStorage.getItem('userRole')) || '';
//         // On choisit la destination sûre (lastPath::<uid> validé par rôle, sinon routeForRole)
//         const { chooseLanding } = require('@/lib/safeRedirect');
//         router.replace(chooseLanding(uid, role));
//       } else {
//         router.replace('/admin/auth/login');
//       }
//     };

//     go();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [pathname, router]);


//   if (booting) {
//     return (
//       <html lang="fr">
//         <body>
//           <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
//             <div className="text-center">
//               <div className="spinner-border text-primary" role="status">
//                 <span className="visually-hidden">Loading...</span>
//               </div>
//               <div className="mt-2">Chargement…</div>
//             </div>
//           </div>
//         </body>
//       </html>
//     );
//   }

//   // navbar sur /admin sauf login/change-password et hors espace directeur
//   const isDirectorArea = pathname.startsWith('/directeur-des-etudes');
//   const authPaths = ['/admin/auth/login', '/admin/auth/change-password'];
//   const showAdminNavbar =
//     !!user &&
//     pathname.startsWith('/admin') &&
//     !authPaths.includes(pathname) &&
//     !isDirectorArea;

//   return (
//     <html lang="fr">
//       <body>
//         {showAdminNavbar && <Navbar />}
//         <FirstLoginGuard>{children}</FirstLoginGuard>
//       </body>
//     </html>
//   );
// }
// src/app/layout.tsx
'use client';

import { ReactNode, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { useRouter, usePathname } from 'next/navigation';
import Navbar from './admin/components/layout/Navbar';
import FirstLoginGuard from './admin/auth/FirstLoginGuard';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { isPathAllowedForRole, routeForRole } from '@/lib/roleRouting';

export default function RootLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [progress, setProgress] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  // Animation de chargement progressive
  useEffect(() => {
    if (!booting) return;
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 10;
      });
    }, 200);
    
    return () => clearInterval(interval);
  }, [booting]);

  // observer session (affichage navbar + logique d'accueil)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setTimeout(() => {
        setProgress(100);
        setTimeout(() => setBooting(false), 500);
      }, 300);
    });
    return () => unsub();
  }, []);

  // mémoriser la dernière route (sauf login/change-password)
  useEffect(() => {
    if (!pathname) return;
    const authPaths = ['/admin/auth/login', '/admin/auth/change-password'];
    if (authPaths.includes(pathname)) return;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try { localStorage.setItem(`lastPath::${uid}`, pathname); } catch {}
  }, [pathname]);

  // gestion de la racine "/"
  useEffect(() => {
    if (pathname !== '/') return;

    const go = () => {
      const u = auth.currentUser;
      if (u) {
        const uid = u.uid;
        const role = (typeof window !== 'undefined' && localStorage.getItem('userRole')) || '';
        const { chooseLanding } = require('@/lib/safeRedirect');
        router.replace(chooseLanding(uid, role));
      } else {
        router.replace('/admin/auth/login');
      }
    };

    go();
  }, [pathname, router]);

  if (booting) {
    return (
      <html lang="fr">
        <head>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        </head>
        <body style={{ margin: 0, fontFamily: 'Inter, sans-serif' }}>
          {/* Fond animé */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            zIndex: 0
          }}>
            {/* Effet de grille */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backgroundImage: 'radial-gradient(circle at 25% 50%, rgba(2, 157, 254, 0.08) 0%, transparent 50%)',
              pointerEvents: 'none'
            }} />
            
            {/* Particules animées */}
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
          </div>

          {/* Conteneur principal du loader */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              textAlign: 'center',
              padding: '48px',
              borderRadius: 32,
              background: 'rgba(15, 23, 42, 0.8)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(2, 157, 254, 0.2)',
              minWidth: 320,
              animation: 'fadeInUp 0.6s ease-out'
            }}>
              {/* Logo animé */}
              <div style={{
                width: 80,
                height: 80,
                background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
                borderRadius: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                border: '1px solid rgba(2, 157, 254, 0.3)',
                animation: 'pulse 2s infinite'
              }}>
                <span style={{
                  fontSize: 40,
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #029DFE 0%, #00d4ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  II
                </span>
              </div>

              {/* Titre */}
              <h2 style={{
                fontSize: 24,
                fontWeight: 700,
                color: 'white',
                marginBottom: 8,
                letterSpacing: -0.5
              }}>
                IIBS Digital School
              </h2>
              <p style={{
                fontSize: 13,
                color: '#94a3b8',
                marginBottom: 32,
                letterSpacing: 1
              }}>
                CHARGEMENT DE LA PLATEFORME
              </p>

              {/* Barre de progression stylisée */}
              <div style={{
                width: '100%',
                height: 4,
                background: '#1e293b',
                borderRadius: 4,
                overflow: 'hidden',
                marginBottom: 16
              }}>
                <div style={{
                  width: `${Math.min(progress, 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #029DFE 0%, #00d4ff 100%)',
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    animation: 'shimmer 1.5s infinite'
                  }} />
                </div>
              </div>

              {/* Pourcentage */}
              <div style={{
                fontSize: 12,
                color: '#029DFE',
                fontWeight: 600,
                marginBottom: 24
              }}>
                {Math.floor(Math.min(progress, 100))}%
              </div>

              {/* Texte rotatif */}
              <div style={{
                fontSize: 12,
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}>
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#029DFE',
                  animation: 'blink 1s infinite'
                }} />
                Initialisation de l'environnement
              </div>
            </div>
          </div>

          {/* Animations CSS */}
          <style jsx global>{`
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
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

            @keyframes slide {
              0% {
                background-position: 0 0;
              }
              100% {
                background-position: 40px 40px;
              }
            }

            @keyframes shimmer {
              0% {
                transform: translateX(-100%);
              }
              100% {
                transform: translateX(100%);
              }
            }

            @keyframes blink {
              0%, 100% {
                opacity: 1;
              }
              50% {
                opacity: 0.3;
              }
            }

            @keyframes rotate {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </body>
      </html>
    );
  }

  return (
    <html lang="fr">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: 'Inter, sans-serif' }}>
        <FirstLoginGuard>
          {user ? <Navbar /> : null}
          {children}
        </FirstLoginGuard>
      </body>
    </html>
  );
}
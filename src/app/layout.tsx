//src/app/layout.tsx
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
  const router = useRouter();
  const pathname = usePathname();

  // observer session (affichage navbar + logique d'accueil)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setBooting(false);
    });
    return () => unsub();
  }, []);

  // mémoriser la dernière route (sauf login/change-password)
  // mémoriser la dernière route (sauf login/change-password)
// -- utilise une clé par utilisateur : lastPath::<uid>
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
        // On récupère le rôle stocké ou laisse vide
        const role = (typeof window !== 'undefined' && localStorage.getItem('userRole')) || '';
        // On choisit la destination sûre (lastPath::<uid> validé par rôle, sinon routeForRole)
        const { chooseLanding } = require('@/lib/safeRedirect');
        router.replace(chooseLanding(uid, role));
      } else {
        router.replace('/admin/auth/login');
      }
    };

    go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, router]);


  if (booting) {
    return (
      <html lang="fr">
        <body>
          <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
            <div className="text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <div className="mt-2">Chargement…</div>
            </div>
          </div>
        </body>
      </html>
    );
  }

  // navbar sur /admin sauf login/change-password et hors espace directeur
  const isDirectorArea = pathname.startsWith('/directeur-des-etudes');
  const authPaths = ['/admin/auth/login', '/admin/auth/change-password'];
  const showAdminNavbar =
    !!user &&
    pathname.startsWith('/admin') &&
    !authPaths.includes(pathname) &&
    !isDirectorArea;

  return (
    <html lang="fr">
      <body>
        {showAdminNavbar && <Navbar />}
        <FirstLoginGuard>{children}</FirstLoginGuard>
      </body>
    </html>
  );
}

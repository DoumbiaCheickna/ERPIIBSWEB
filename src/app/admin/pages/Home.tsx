//src/app/admin/pages/Home.tsx
'use client';

import React, { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import RolesPage from '../pages/roles/page';
import UsersManagement from '../pages/users/gestionUsers';

type TabKey = 'roles' | 'users';

export default function RenderHome() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Source de vérité = URL
  const activeTab = (searchParams.get('tab') as TabKey) || 'roles';

  const goTab = (tab: TabKey) => {
    if (tab === activeTab) return;
    router.push(`${pathname}?tab=${tab}`, { scroll: false });
  };

  const content = useMemo(() => {
    switch (activeTab) {
      case 'roles':
        return (
          <>
            <p className="text-secondary">
              Gérez les rôles applicatifs : création, édition, suppression et recherche.
            </p>
            <RolesPage />
          </>
        );
      case 'users':
        return (
          <>
            <p className="text-secondary">
              Consultez et gérez les comptes utilisateurs (pagination, recherche, actions).
            </p>
            <UsersManagement />
          </>
        );
      default:
        return null;
    }
  }, [activeTab]);

  return (
    <div className="container mt-5">
      <h2 className="fw-bold">Bienvenue dans la Gestion Scolaire</h2>

      {/* Onglets (même logique que la navbar) */}
      <ul className="nav nav-tabs mt-4">
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold ${activeTab === 'roles' ? 'active' : 'text-secondary'}`}
            onClick={() => goTab('roles')}
          >
            Rôles
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold ${activeTab === 'users' ? 'active' : 'text-secondary'}`}
            onClick={() => goTab('users')}
          >
            Utilisateurs
          </button>
        </li>
      </ul>

      {/* Contenu */}
      <div className="mt-3">{content}</div>
    </div>
  );
}

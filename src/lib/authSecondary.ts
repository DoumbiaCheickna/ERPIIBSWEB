// src/lib/authSecondary.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { app as primaryApp } from '../../firebaseConfig';

const SECONDARY_NAME = '__admin_secondary__';

function getSecondaryAuth() {
  // Réutilise si déjà créé
  const existing = getApps().find(a => a.name === SECONDARY_NAME);
  const secondaryApp = existing ?? initializeApp(primaryApp.options, SECONDARY_NAME);
  return getAuth(secondaryApp);
}

/**
 * Crée un utilisateur AUTH sans toucher à la session de l’admin connecté.
 * Retourne le uid du nouvel utilisateur.
 */
export async function createAuthUserViaSecondaryApp(params: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const auth2 = getSecondaryAuth();

  const cred = await createUserWithEmailAndPassword(auth2, params.email, params.password);

  if (params.displayName) {
    await updateProfile(cred.user, { displayName: params.displayName });
  }

  // ⚠️ très important : on ne touche pas à l’auth primaire (admin)
  await signOut(auth2);

  return { uid: cred.user.uid };
}

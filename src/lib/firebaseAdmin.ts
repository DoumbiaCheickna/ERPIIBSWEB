// src/lib/firebaseAdmin.ts
import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

function initAdmin() {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin env vars manquantes');
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return app;
}

export function getAdminAuth() {
  initAdmin();
  return admin.auth();
}

export function getAdminDb() {
  initAdmin();
  return admin.firestore();
}

export const adminFieldValue = admin.firestore.FieldValue;

//src/app/admin/pages/api/admin/deleteAuthUser.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(), // ou cert(serviceAccount)
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { uid } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'Missing uid' });

  try {
    await admin.auth().deleteUser(uid);
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('Admin deleteUser error:', e);
    return res.status(500).json({ error: e?.message || 'Deletion failed' });
  }
}

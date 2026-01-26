//src/app/api/users/create/route.ts

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, adminFieldValue } from '@/lib/firebaseAdmin';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const sanitize = (v: any) =>
  String(v ?? '')
    .replace(/<\s*script/gi, '')
    .replace(/[<>]/g, '')
    .trim();

export async function POST(req: Request) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const body = await req.json();

    const {
      email,
      password,               // utilisé uniquement pour Auth
      login,
      prenom,
      nom,
      role_id,
      role_libelle,
      telephone,
      departements,           // ex: ['Pédagogie','Scolarité'] pour le Directeur
      ...rest                 // autres champs éventuels
    } = body || {};

    // Validations minimales côté serveur
    if (!prenom || sanitize(prenom).length < 2)
      return NextResponse.json({ ok: false, message: 'Prénom invalide' }, { status: 400 });
    if (!nom || sanitize(nom).length < 2)
      return NextResponse.json({ ok: false, message: 'Nom invalide' }, { status: 400 });
    if (!email || !emailRegex.test(email))
      return NextResponse.json({ ok: false, message: 'Email invalide' }, { status: 400 });
    if (!login)
      return NextResponse.json({ ok: false, message: "Nom d'utilisateur requis" }, { status: 400 });
    if (!password)
      return NextResponse.json({ ok: false, message: 'Mot de passe requis' }, { status: 400 });
    if (!role_id || !role_libelle)
      return NextResponse.json({ ok: false, message: 'Rôle invalide' }, { status: 400 });

    // Unicité login (Firestore)
    const loginSnap = await adminDb
      .collection('users')
      .where('login', '==', sanitize(login))
      .limit(1)
      .get();
    if (!loginSnap.empty) {
      return NextResponse.json(
        { ok: false, code: 'login-already-in-use', message: "Ce nom d'utilisateur existe déjà." },
        { status: 409 }
      );
    }

    // Unicité email (Auth)
    try {
      const existing = await adminAuth.getUserByEmail(email);
      if (existing) {
        return NextResponse.json(
          { ok: false, code: 'email-already-in-use', message: 'Email déjà utilisé.' },
          { status: 409 }
        );
      }
    } catch {
      // pas trouvé => OK
    }

    // Création dans Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: `${sanitize(prenom)} ${sanitize(nom)}`,
      emailVerified: false,
      disabled: false,
    });

    // Écriture du doc Firestore (même id que Auth)
    const payload: Record<string, any> = {
      uid: userRecord.uid,
      email: sanitize(email),
      login: sanitize(login),
      prenom: sanitize(prenom),
      nom: sanitize(nom),
      role_id: sanitize(role_id),
      role_libelle: sanitize(role_libelle),
      first_login: '1',
      created_at: adminFieldValue.serverTimestamp(),
    };

    if (telephone) payload.telephone = sanitize(telephone);
    if (Array.isArray(departements)) payload.departements = departements.map(sanitize);

    // Ajoute le reste en version nettoyée (anti XSS / injections)
    Object.keys(rest || {}).forEach((k) => {
      payload[k] = sanitize(rest[k]);
    });

    await adminDb.collection('users').doc(userRecord.uid).set(payload);

    return NextResponse.json({ ok: true, uid: userRecord.uid }, { status: 201 });
  } catch (e: any) {
    console.error('API /api/users/create error:', e);
    return NextResponse.json(
      { ok: false, message: e?.message ?? 'Erreur serveur lors de la création' },
      { status: 500 }
    );
  }
}

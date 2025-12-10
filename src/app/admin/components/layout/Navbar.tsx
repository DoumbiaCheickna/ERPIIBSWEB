//src/app/admin/components/layout/Navbar.tsx
'use client';

import Image from 'next/image';
import Logo from '../../assets/iibs-new.png';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

import {
  signOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { auth, db } from '../../../../../firebaseConfig';
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  updateDoc,
  doc,
} from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

type UserProfile = {
  docId?: string;
  prenom?: string;
  nom?: string;
  photo_url?: string;
  email?: string;
};

export default function RenderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loggingOut, setLoggingOut] = useState(false);

  // --- Avatar menu + modales ---
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  // Profil (Firestore)
  const [profile, setProfile] = useState<UserProfile>({});
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Upload photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);

  // Sécurité (mdp)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [currentPwdValid, setCurrentPwdValid] = useState<null | boolean>(null);
  const [checkingCurrentPwd, setCheckingCurrentPwd] = useState(false);

  const [errCurrent, setErrCurrent] = useState<string | null>(null);
  const [errNew, setErrNew] = useState<string | null>(null);
  const [errConfirm, setErrConfirm] = useState<string | null>(null);
  const [secSaving, setSecSaving] = useState(false);
  const [secSuccess, setSecSuccess] = useState<string | null>(null);

  // Fermer le menu si clic à l'extérieur
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const currentTab = (searchParams.get('tab') || 'roles') as 'roles' | 'users';
  const onHome = pathname?.startsWith('/admin/home');

  const gotoTab = (tab: 'roles' | 'users') => {
    router.push(`/admin/home?tab=${tab}`, { scroll: false });
  };

  const isRolesActive = onHome && currentTab === 'roles';
  const isUsersActive = onHome && currentTab === 'users';

  // Charger profil Firestore (par email)
  const loadProfile = async () => {
    const u = auth.currentUser;
    if (!u?.email) {
      setProfile({
        prenom: u?.displayName?.split(' ')?.[0] || '',
        nom: u?.displayName?.split(' ')?.slice(1).join(' ') || '',
        photo_url: u?.photoURL || undefined,
        email: u?.email || undefined,
      });
      return;
    }
    setLoadingProfile(true);
    try {
      const qy = query(collection(db, 'users'), where('email', '==', u.email), limit(1));
      const snap = await getDocs(qy);
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data() as any;
        setProfile({
          docId: d.id,
          prenom: data.prenom || '',
          nom: data.nom || '',
          photo_url: data.photo_url || u.photoURL || undefined,
          email: data.email || u.email,
        });
      } else {
        setProfile({
          prenom: u.displayName?.split(' ')?.[0] || '',
          nom: u.displayName?.split(' ')?.slice(1).join(' ') || '',
          photo_url: u.photoURL || undefined,
          email: u.email || undefined,
        });
      }
    } catch (e) {
      console.error('Erreur loadProfile:', e);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Ouvrir modales
  const openProfile = async () => {
    await loadProfile();
    setShowProfileModal(true);
    setShowMenu(false);
  };
  const openSecurity = () => {
    // reset
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setCurrentPwdValid(null);
    setCheckingCurrentPwd(false);
    setErrCurrent(null);
    setErrNew(null);
    setErrConfirm(null);
    setSecSuccess(null);
    setShowSecurityModal(true);
    setShowMenu(false);
  };

  // Déconnexion
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);

    let navigated = false;
    const fallback = setTimeout(() => {
      if (!navigated) {
        navigated = true;
        router.replace('/admin/auth/login');
      }
    }, 300);

    try {
      await signOut(auth);
    } catch (e) {
      console.error('Erreur signOut:', e);
    } finally {
      clearTimeout(fallback);
      if (!navigated) {
        navigated = true;
        router.replace('/admin/auth/login');
      }
    }
  };

  // Upload photo
  const onPhotoChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    setPhotoError(null);
    if (!f) {
      setPhotoFile(null);
      return;
    }
    const okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!okTypes.includes(f.type)) {
      setPhotoError('Type de fichier non autorisé (JPEG/PNG/WEBP uniquement).');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setPhotoError('Fichier trop volumineux (max 2 Mo).');
      return;
    }
    setPhotoFile(f);
  };

  const saveNewPhoto = async () => {
    if (!photoFile) {
      setPhotoError('Veuillez choisir une image.');
      return;
    }
    const u = auth.currentUser;
    if (!u) {
      setPhotoError('Utilisateur non connecté.');
      return;
    }
    setSavingPhoto(true);
    setPhotoError(null);
    try {
      const storage = getStorage();
      const path = `avatars/${u.uid}-${Date.now()}-${photoFile.name.replace(/[^\w.-]/g, '_')}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, photoFile);
      const url = await getDownloadURL(ref);

      await updateProfile(u, { photoURL: url });
      if (profile.docId) {
        await updateDoc(doc(db, 'users', profile.docId), { photo_url: url });
      }
      setProfile((p) => ({ ...p, photo_url: url }));
      setPhotoFile(null);
    } catch (e) {
      console.error('Erreur upload photo:', e);
      setPhotoError("Impossible d'enregistrer la photo.");
    } finally {
      setSavingPhoto(false);
    }
  };

  // Robustesse mdp
  const strongPwd = (pwd: string) =>
    /[a-z]/.test(pwd) &&
    /[A-Z]/.test(pwd) &&
    /\d/.test(pwd) &&
    /[^A-Za-z0-9]/.test(pwd) &&
    pwd.length >= 8;

  // 1) Vérif du mot de passe actuel dès qu'on quitte le champ
  const verifyCurrentPassword = async () => {
    setErrCurrent(null);
    setCurrentPwdValid(null);
    const u = auth.currentUser;
    if (!u?.email) {
      setErrCurrent('Utilisateur non connecté.');
      setCurrentPwdValid(false);
      return;
    }
    if (!currentPassword) {
      setErrCurrent('Veuillez saisir votre mot de passe actuel.');
      setCurrentPwdValid(false);
      return;
    }
    setCheckingCurrentPwd(true);
    try {
      const cred = EmailAuthProvider.credential(u.email, currentPassword);
      await reauthenticateWithCredential(u, cred);
      setCurrentPwdValid(true);
    } catch (e: any) {
      console.error('reauth error:', e);
      if (e?.code === 'auth/wrong-password') {
        setErrCurrent('Mot de passe actuel incorrect.');
      } else if (e?.code === 'auth/too-many-requests') {
        setErrCurrent('Trop de tentatives. Réessayez plus tard.');
      } else {
        setErrCurrent("Impossible de vérifier le mot de passe actuel.");
      }
      setCurrentPwdValid(false);
    } finally {
      setCheckingCurrentPwd(false);
    }
  };

  // 2) Validation live du nouveau mdp (au blur uniquement)
  const onBlurNewPassword = () => {
    if (!currentPwdValid) return; // interdit tant que non validé
    if (!newPassword) {
      setErrNew('Veuillez saisir un nouveau mot de passe.');
      return;
    }
    if (!strongPwd(newPassword)) {
      setErrNew(
        "Mot de passe trop faible. Min. 8 caractères, au moins une minuscule, une majuscule, un chiffre et un caractère spécial."
      );
      return;
    }
    setErrNew(null);
  };

  // 3) Validation de la confirmation (au blur uniquement)
  const onBlurConfirmPassword = () => {
    if (!currentPwdValid) return;
    if (!confirmPassword) {
      setErrConfirm('Veuillez confirmer votre nouveau mot de passe.');
      return;
    }
    if (confirmPassword !== newPassword) {
      setErrConfirm('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    setErrConfirm(null);
  };

  // ✅ On NE valide plus “en live” pendant la frappe
  // (suppression du useEffect qui comparait newPassword / confirmPassword à chaque frappe)

  // On autorise le clic si tous les champs sont remplis et le mdp actuel validé
  const canSubmit =
    currentPwdValid === true &&
    !checkingCurrentPwd &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !secSaving;

  const changePassword = async () => {
    setSecSuccess(null);

    // Nettoie d’éventuels messages précédents
    setErrCurrent(null);
    setErrNew(null);
    setErrConfirm(null);

    // 1) Exiger la vérification du mdp actuel
    if (currentPwdValid !== true) {
      setErrCurrent('Veuillez vérifier votre mot de passe actuel.');
      return;
    }

    // 2) Nouveau mot de passe (force)
    if (!newPassword) {
      setErrNew('Veuillez saisir un nouveau mot de passe.');
      return;
    }
    if (!strongPwd(newPassword)) {
      setErrNew(
        "Mot de passe trop faible. Min. 8 caractères, au moins une minuscule, une majuscule, un chiffre et un caractère spécial."
      );
      return;
    }

    // 3) Confirmation (ne valide qu’au blur ou au clic)
    if (!confirmPassword) {
      setErrConfirm('Veuillez confirmer votre nouveau mot de passe.');
      return;
    }
    if (confirmPassword !== newPassword) {
      setErrConfirm('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    // 4) Mise à jour
    const u = auth.currentUser;
    if (!u) {
      setErrCurrent('Utilisateur non connecté.');
      return;
    }

    setSecSaving(true);
    try {
      await updatePassword(u, newPassword);
      setSecSuccess('Mot de passe modifié avec succès.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPwdValid(null);

      // Fermeture automatique
      setTimeout(() => setShowSecurityModal(false), 900);
    } catch (e: any) {
      console.error('Erreur updatePassword:', e);
      if (e?.code === 'auth/requires-recent-login') {
        setErrCurrent('Session expirée : veuillez revérifier le mot de passe actuel.');
        setCurrentPwdValid(false);
      } else {
        setErrConfirm("Impossible de modifier le mot de passe.");
      }
    } finally {
      setSecSaving(false);
    }
  };

  const avatarSrc = profile.photo_url || '/avatar-placeholder.png';

  return (
    <nav className="navbar navbar-expand-lg bg-white border-bottom px-4 py-2">
      <div className="container-fluid">
        <button
          className="navbar-brand btn btn-link p-0 text-decoration-none"
          onClick={() => gotoTab('roles')}
        >
          <Image
            src={Logo}
            alt="IIBS Logo"
            width={80}
            height={50}
            style={{ height: 40, width: 'auto' }} // garde les proportions
            priority
          />
        </button>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#adminNavbar"
          aria-controls="adminNavbar"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>

        <div className="collapse navbar-collapse justify-content-end" id="adminNavbar">
          <ul className="navbar-nav align-items-lg-center">
            <li className="nav-item">
              <button
                className={`nav-link btn btn-link ${isRolesActive ? 'active fw-semibold' : ''}`}
                onClick={() => gotoTab('roles')}
              >
                Rôles
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link btn btn-link ${isUsersActive ? 'active fw-semibold' : ''}`}
                onClick={() => gotoTab('users')}
              >
                Utilisateurs
              </button>
            </li>
          </ul>
        </div>

        {/* Avatar + menu */}
        <div className="ms-3 position-relative" ref={menuRef}>
          <button
            className="btn p-0 border-0 bg-transparent"
            aria-label="Menu utilisateur"
            onClick={async () => {
              if (!showMenu && !profile.email) {
                await loadProfile();
              }
              setShowMenu((s) => !s);
            }}
          >
            <Image
              src={avatarSrc}
              alt="Avatar"
              width={36}
              height={36}
              className="rounded-circle border"
            />
          </button>

          {showMenu && (
            <div
              className="card shadow position-absolute end-0 mt-2"
              style={{ minWidth: 220, zIndex: 1050 }}
            >
              <div className="list-group list-group-flush">
                <button
                  className="list-group-item list-group-item-action d-flex align-items-center gap-2"
                  onClick={openProfile}
                >
                  <i className="bi bi-person-circle" />
                  Mon profil
                </button>
                <button
                  className="list-group-item list-group-item-action d-flex align-items-center gap-2"
                  onClick={openSecurity}
                >
                  <i className="bi bi-shield-lock" />
                  Sécurité
                </button>
                <button
                  className="list-group-item list-group-item-action text-danger d-flex align-items-center gap-2"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? (
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  ) : (
                    <i className="bi bi-box-arrow-right" />
                  )}
                  Déconnexion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Mon profil */}
      {showProfileModal && (
        <>
          <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-person-circle me-2" />
                    Mon profil
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowProfileModal(false)} />
                </div>
                <div className="modal-body">
                  {loadingProfile ? (
                    <div className="d-flex align-items-center gap-2">
                      <span className="spinner-border" />
                      Chargement du profil...
                    </div>
                  ) : (
                    <>
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <Image
                          src={avatarSrc}
                          alt="Avatar"
                          width={64}
                          height={64}
                          className="rounded-circle border"
                        />
                        <div>
                          <div className="fw-semibold">
                            {profile.prenom || '(Prénom)'} {profile.nom || '(Nom)'}
                          </div>
                          <div className="text-muted small">{profile.email}</div>
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="form-label">Changer la photo de profil</label>
                        <input
                          type="file"
                          className={`form-control ${photoError ? 'is-invalid' : ''}`}
                          accept="image/jpeg,image/png,image/webp"
                          onChange={onPhotoChange}
                        />
                        {photoError && <div className="invalid-feedback">{photoError}</div>}
                        <div className="form-text">
                          Formats acceptés : JPEG/PNG/WEBP · Taille max : 2 Mo
                        </div>
                      </div>

                      <div className="d-flex justify-content-end">
                        <button
                          className="btn btn-primary"
                          onClick={saveNewPhoto}
                          disabled={savingPhoto || !photoFile}
                        >
                          {savingPhoto && (
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                          )}
                          Enregistrer la photo
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowProfileModal(false)} />
        </>
      )}

      {/* Modal Sécurité */}
      {showSecurityModal && (
        <>
          <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-shield-lock me-2" />
                    Sécurité
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowSecurityModal(false)} />
                </div>
                <div className="modal-body">
                  {secSuccess && <div className="alert alert-success py-2">{secSuccess}</div>}

                  {/* Mot de passe actuel */}
                  <div className="mb-3">
                    <label className="form-label">Mot de passe actuel</label>
                    <input
                      type="password"
                      className={`form-control ${errCurrent ? 'is-invalid' : ''}`}
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value);
                        // si on retape, on réinitialise le statut
                        setCurrentPwdValid(null);
                        setErrCurrent(null);
                      }}
                      onBlur={verifyCurrentPassword}
                      placeholder="........"
                    />
                    {checkingCurrentPwd && (
                      <div className="form-text d-flex align-items-center gap-2">
                        <span className="spinner-border spinner-border-sm" /> Vérification…
                      </div>
                    )}
                    {errCurrent && <div className="invalid-feedback d-block">{errCurrent}</div>}
                    {currentPwdValid === true && !errCurrent && (
                      <div className="text-success small mt-1">Mot de passe actuel vérifié.</div>
                    )}
                  </div>

                  {/* Nouveau mdp */}
                  <div className="mb-3">
                    <label className="form-label">Nouveau mot de passe</label>
                    <input
                      type="password"
                      className={`form-control ${errNew ? 'is-invalid' : ''}`}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (errNew) setErrNew(null);
                      }}
                      onBlur={onBlurNewPassword}
                      disabled={currentPwdValid !== true}
                      placeholder="Min. 8 caractères, majuscule, minuscule, chiffre, spécial"
                    />
                    {errNew && <div className="invalid-feedback d-block">{errNew}</div>}
                  </div>

                  {/* Confirmation */}
                  <div className="mb-3">
                    <label className="form-label">Confirmer le nouveau mot de passe</label>
                    <input
                      type="password"
                      className={`form-control ${errConfirm ? 'is-invalid' : ''}`}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (errConfirm) setErrConfirm(null);
                      }}
                      onBlur={onBlurConfirmPassword}
                      disabled={currentPwdValid !== true}
                      placeholder="Confirmez le nouveau mot de passe"
                    />
                    {errConfirm && <div className="invalid-feedback d-block">{errConfirm}</div>}
                  </div>

                  <div className="d-flex justify-content-end">
                    <button className="btn btn-primary" onClick={changePassword} disabled={!canSubmit}>
                      {secSaving && (
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                      )}
                      Mettre à jour le mot de passe
                    </button>
                  </div>

                  <hr />
                  <div className="small text-muted">
                    Pour votre sécurité, la vérification du <strong>mot de passe actuel</strong> est effectuée
                    dès que vous quittez le champ. Les champs de nouveau mot de passe restent désactivés tant que
                    le mot de passe actuel n’est pas validé.
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowSecurityModal(false)} />
        </>
      )}
    </nav>
  );
}

// src/app/directeur-des-etudes/components/AdminNavbar.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "../../../../firebaseConfig";
import { signOut, updatePassword, updateProfile } from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  limit as fbLimit,
} from "firebase/firestore";
import NotificationsBell from "./NotificationsBell";

/* ===================== MENU ===================== */

type MainItem =
  | "Accueil"
  | "EmargementsEtudiants"
  | "EmargementsProfesseurs"
  | "Etudiants"
  | "Professeurs"
  | "Filières"
  | "Personnel"
  | "Evaluations";

const MAIN_MENU: MainItem[] = [
  "Accueil",
  "EmargementsEtudiants",
  "EmargementsProfesseurs",
  "Etudiants",
  "Professeurs",
  "Filières",
  "Personnel",
  "Evaluations",
];

const ICONS: Record<MainItem, string> = {
  Accueil: "bi-house-door",
  EmargementsEtudiants: "bi-clipboard-check",
  EmargementsProfesseurs: "bi-clipboard-data",
  Etudiants: "bi-people",
  Professeurs: "bi-person-badge",
  "Filières": "bi-layers",
  Personnel: "bi-person-gear",
  Evaluations: "bi-bar-chart",
};

const LABELS: Record<MainItem, React.ReactNode> = {
  Accueil: "Accueil",
  EmargementsEtudiants: "Émarg. étudiants",
  EmargementsProfesseurs: "Émarg. profs",
  Etudiants: "Étudiants",
  Professeurs: "Professeurs",
  Filières: "Filières",
  Personnel: "Personnel",
  Evaluations: "Évaluations",
};

/* ===================== PROFIL ===================== */

type UserInfo = {
  docId: string;
  prenom: string;
  nom: string;
  login: string;
  email: string;
  password?: string;
  avatar_url?: string;
};

// (logique recherche conservée même si l’UI n’est pas affichée)
type SearchResult =
  | { kind: "prof"; id: string; title: string; subtitle?: string }
  | { kind: "etudiant"; id: string; title: string; subtitle?: string }
  | { kind: "classe"; id: string; title: string; subtitle?: string };

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const includesLoose = (hay: string, needle: string) => norm(hay).includes(norm(needle));

export default function AdminNavbar({
  active,
  onChange,
  allowedTabs = [],
}: {
  active: MainItem | null;
  onChange: (item: MainItem) => void;
  allowedTabs?: string[];
}) {
  const router = useRouter();

  const [openMenu, setOpenMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const [showProfile, setShowProfile] = React.useState(false);
  const [loadingProfile, setLoadingProfile] = React.useState(false);
  const [savingPwd, setSavingPwd] = React.useState(false);
  const [userInfo, setUserInfo] = React.useState<UserInfo | null>(null);
  const [newPwd, setNewPwd] = React.useState("");
  const [newPwd2, setNewPwd2] = React.useState("");
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = React.useState<string | null>(null);

  const [editFirst, setEditFirst] = React.useState("");
  const [editLast, setEditLast] = React.useState("");
  const [editLogin, setEditLogin] = React.useState("");

  const [avatarSrc, setAvatarSrc] = React.useState<string>("/avatar-woman.png");
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpenMenu(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const openProfile = async () => {
    setProfileError(null);
    setProfileSuccess(null);
    setLoadingProfile(true);
    setShowProfile(true);
    setOpenMenu(false);

    try {
      const login = typeof window !== "undefined" ? localStorage.getItem("userLogin") : null;
      const email = auth.currentUser?.email || "";

      let snap;
      if (login) {
        snap = await getDocs(query(collection(db, "users"), where("login", "==", login)));
      } else if (email) {
        snap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      }

      if (!snap || snap.empty) {
        setProfileError("Utilisateur introuvable.");
      } else {
        const d = snap.docs[0];
        const data = d.data() as any;
        const avatar = data.avatar_url || auth.currentUser?.photoURL || "/avatar-woman.png";
        setUserInfo({
          docId: d.id,
          prenom: data.prenom || "",
          nom: data.nom || "",
          login: data.login || "",
          email: data.email || "",
          password: data.password || "",
          avatar_url: data.avatar_url || "",
        });
        setEditFirst(data.prenom || "");
        setEditLast(data.nom || "");
        setEditLogin(data.login || "");
        setAvatarSrc(avatar);
      }
    } catch (e) {
      console.error(e);
      setProfileError("Erreur lors du chargement du profil.");
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    if (!userInfo) return;

    if (!newPwd || newPwd.length < 6) {
      setProfileError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPwd !== newPwd2) {
      setProfileError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    try {
      setSavingPwd(true);
      await updateDoc(doc(db, "users", userInfo.docId), { password: newPwd });
      if (auth.currentUser) {
        try {
          await updatePassword(auth.currentUser, newPwd);
        } catch (err: any) {
          if (err?.code === "auth/requires-recent-login") {
            setProfileError("Sécurité: reconnectez-vous pour changer le mot de passe.");
          } else {
            setProfileError("Erreur côté Auth lors du changement de mot de passe.");
          }
          setSavingPwd(false);
          return;
        }
      }
      setProfileSuccess("Mot de passe mis à jour avec succès.");
      setNewPwd("");
      setNewPwd2("");
    } catch (e) {
      console.error(e);
      setProfileError("Erreur lors de l’enregistrement.");
    } finally {
      setSavingPwd(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInfo) return;
    setProfileError(null);
    setProfileSuccess(null);
    try {
      setSavingProfile(true);
      await updateDoc(doc(db, "users", userInfo.docId), {
        prenom: editFirst.trim(),
        nom: editLast.trim(),
        login: editLogin.trim(),
      });
      setUserInfo({
        ...userInfo,
        prenom: editFirst.trim(),
        nom: editLast.trim(),
        login: editLogin.trim(),
      });
      setProfileSuccess("Profil mis à jour.");
    } catch (err) {
      console.error(err);
      setProfileError("Impossible de mettre à jour le profil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePickAvatar = () => fileRef.current?.click();

  const handleUploadAvatar: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userInfo) return;
    setProfileError(null);
    setProfileSuccess(null);
    setUploadingAvatar(true);
    try {
      const path = `avatars/${userInfo.docId}/${file.name}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      await updateDoc(doc(db, "users", userInfo.docId), { avatar_url: url });
      if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: url });
      setAvatarSrc(url);
      setUserInfo({ ...userInfo, avatar_url: url });
      setProfileSuccess("Photo de profil mise à jour.");
    } catch (err) {
      console.error(err);
      setProfileError("Échec de l’upload de la photo.");
    } finally {
      setUploadingAvatar(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleResetAvatar = async () => {
    if (!userInfo) return;
    setProfileError(null);
    setProfileSuccess(null);
    try {
      await updateDoc(doc(db, "users", userInfo.docId), { avatar_url: "" });
      const def = "/avatar-woman.png";
      if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: def });
      setAvatarSrc(def);
      setUserInfo({ ...userInfo, avatar_url: "" });
      setProfileSuccess("Avatar réinitialisé.");
    } catch (err) {
      console.error(err);
      setProfileError("Impossible de réinitialiser l’avatar.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("userLogin");
        localStorage.removeItem("userRole");
      }
      router.replace("/admin/auth/login");
    }
  };

  // recherche (logique conservée)
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const runSearch = React.useCallback(
    async (term: string) => {
      const q = term.trim();
      if (!q) {
        setResults([]);
        return;
      }
      try {
        const out: SearchResult[] = [];
        const profSnap = await getDocs(
          query(collection(db, "users"), where("role_key", "==", "prof"), fbLimit(25))
        );
        profSnap.forEach((d) => {
          const v = d.data() as any;
          const full = `${v.nom || ""} ${v.prenom || ""} ${v.specialite || v.specialty || ""}`;
          if (includesLoose(full, q)) {
            out.push({
              kind: "prof",
              id: d.id,
              title: `${v.nom || ""} ${v.prenom || ""}`.trim() || d.id,
              subtitle: v.specialite || v.specialty || "Professeur",
            });
          }
        });
        const studentKeys = ["etudiant", "student", "eleve"];
        for (const k of studentKeys) {
          const stuSnap = await getDocs(
            query(collection(db, "users"), where("role_key", "==", k), fbLimit(25))
          );
          stuSnap.forEach((d) => {
            const v = d.data() as any;
            const full = `${v.nom || ""} ${v.prenom || ""} ${v.matricule || ""} ${v.email || ""}`;
            if (includesLoose(full, q)) {
              out.push({
                kind: "etudiant",
                id: d.id,
                title: `${v.nom || ""} ${v.prenom || ""}`.trim() || d.id,
                subtitle: v.matricule || v.email || "Etudiant",
              });
            }
          });
        }
        const clsSnap = await getDocs(query(collection(db, "classes"), fbLimit(25)));
        clsSnap.forEach((d) => {
          const v = d.data() as any;
          const full = `${v.libelle || ""} ${v.filiere_libelle || ""}`;
          if (includesLoose(full, q)) {
            out.push({ kind: "classe", id: d.id, title: v.libelle || d.id, subtitle: v.filiere_libelle || "Classe" });
          }
        });
        const order = { prof: 0, etudiant: 1, classe: 2 } as const;
        out.sort((a, b) => {
          const ka = order[a.kind];
          const kb = order[b.kind];
          if (ka !== kb) return ka - kb;
          return (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" });
        });
        setResults(out.slice(0, 20));
      } catch (e) {
        console.error("search error", e);
        setResults([]);
      }
    },
    [db]
  );

  const TABS: MainItem[] = allowedTabs.length
    ? (MAIN_MENU.filter((t) => allowedTabs.includes(t)) as MainItem[])
    : MAIN_MENU;

  React.useEffect(() => {
    if (active && !TABS.includes(active)) onChange("Accueil");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [TABS]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail as
        | "Accueil" | "Etudiants" | "Professeurs" | "Filières"
        | "Personnel" | "Evaluations" | "EmargementsEtudiants" | "EmargementsProfesseurs";
      if (tab) onChange(tab);
    };
    window.addEventListener("iibs:navigate-main-tab", handler as any);
    return () => window.removeEventListener("iibs:navigate-main-tab", handler as any);
  }, [onChange]);

  return (
    <>
      <header className="topbar">
        <div className="container-fluid h-100 d-flex align-items-center justify-content-between">
          {/* Gauche : logo + menu compact */}
          <div className="left-wrap">
            <div className="brand">
              <img src="/iibs.jpg" alt="IIBS" className="brand-logo" />
            </div>

            <nav className="mainmenu" role="menu" aria-label="Navigation principale">
              {TABS.map((item) => (
                <button
                  key={item}
                  className={`menu-link ${active === item ? "active" : ""}`}
                  onClick={() => onChange(item)}
                  role="menuitem"
                >
                  <i className={`${ICONS[item]} me-1`} />
                  <span className="menu-text">{LABELS[item]}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Droite : notif + avatar */}
          <div className="right-wrap">
            <NotificationsBell />
            <div className="position-relative" ref={menuRef}>
              <button
                className="btn btn-avatar"
                onClick={() => setOpenMenu((s) => !s)}
                aria-haspopup="menu"
                aria-expanded={openMenu}
              >
                <img
                  src={avatarSrc || auth.currentUser?.photoURL || "/avatar-woman.png"}
                  alt="Profil"
                  width={28}
                  height={28}
                  className="rounded-circle me-2"
                />
                <span className="d-none d-md-inline">Compte</span>
                <i className="bi bi-caret-down-fill ms-1" />
              </button>

              {openMenu && (
                <div
                  className="dropdown-menu dropdown-menu-end show shadow"
                  style={{ position: "absolute", right: 0, top: "100%", zIndex: 1050, minWidth: 240 }}
                  role="menu"
                >
                  <button className="dropdown-item" onClick={openProfile}>
                    <i className="bi bi-person-badge me-2" /> Informations personnelles
                  </button>
                  <button className="dropdown-item" disabled>
                    <i className="bi bi-sliders me-2" /> Préférences
                  </button>
                  <button className="dropdown-item" disabled>
                    <i className="bi bi-life-preserver me-2" /> Assistance
                  </button>
                  <div className="dropdown-divider" />
                  <button className="dropdown-item text-danger" onClick={handleLogout}>
                    <i className="bi bi-box-arrow-right me-2" /> Déconnexion
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="topbar-spacer" />

      {/* Modal Profil */}
      {showProfile && (
        <>
          <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-person-badge me-2" />
                    Informations personnelles
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowProfile(false)} />
                </div>
                <div className="modal-body">
                  {loadingProfile && (
                    <div className="text-center py-4">
                      <div className="spinner-border" role="status" />
                      <div className="text-muted mt-2">Chargement…</div>
                    </div>
                  )}

                  {!loadingProfile && userInfo && (
                    <>
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <img src={avatarSrc} alt="Avatar" width={64} height={64} className="rounded-circle border" />
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={handlePickAvatar}
                            disabled={uploadingAvatar}
                          >
                            {uploadingAvatar ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-2" />
                                Upload…
                              </>
                            ) : (
                              <>
                                <i className="bi bi-upload me-1" />
                                Changer la photo
                              </>
                            )}
                          </button>
                          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleResetAvatar}>
                            <i className="bi bi-arrow-counterclockwise me-1" />
                            Avatar par défaut
                          </button>
                          <input ref={fileRef} type="file" accept="image/*" className="d-none" onChange={handleUploadAvatar} />
                        </div>
                      </div>

                      <form onSubmit={handleSaveProfile} className="mb-3">
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label">Prénom</label>
                            <input className="form-control" value={editFirst} onChange={(e) => setEditFirst(e.target.value)} />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Nom</label>
                            <input className="form-control" value={editLast} onChange={(e) => setEditLast(e.target.value)} />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Login</label>
                            <input className="form-control" value={editLogin} onChange={(e) => setEditLogin(e.target.value)} />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">Email</label>
                            <input className="form-control" value={userInfo.email} readOnly />
                          </div>
                        </div>

                        <div className="d-flex justify-content-end gap-2 mt-3">
                          <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                            {savingProfile ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-2" />
                                Enregistrement…
                              </>
                            ) : (
                              "Enregistrer le profil"
                            )}
                          </button>
                        </div>
                      </form>

                      <hr className="my-3" />

                      <form onSubmit={handleSavePassword}>
                        <div className="mb-2">
                          <label className="form-label">Nouveau mot de passe</label>
                          <input
                            type="password"
                            className="form-control"
                            value={newPwd}
                            onChange={(e) => setNewPwd(e.target.value)}
                            placeholder="Au moins 6 caractères"
                            minLength={6}
                            required
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label">Confirmer le mot de passe</label>
                          <input
                            type="password"
                            className="form-control"
                            value={newPwd2}
                            onChange={(e) => setNewPwd2(e.target.value)}
                            minLength={6}
                            required
                          />
                        </div>

                        {profileError && <div className="alert alert-danger py-2">{profileError}</div>}
                        {profileSuccess && <div className="alert alert-success py-2">{profileSuccess}</div>}

                        <div className="d-flex justify-content-end gap-2">
                          <button type="button" className="btn btn-outline-secondary" onClick={() => setShowProfile(false)}>
                            Fermer
                          </button>
                          <button type="submit" className="btn btn-primary" disabled={savingPwd}>
                            {savingPwd ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-2" />
                                Enregistrement…
                              </>
                            ) : (
                              "Enregistrer"
                            )}
                          </button>
                        </div>
                      </form>
                    </>
                  )}

                  {!loadingProfile && !userInfo && !profileError && (
                    <div className="text-muted">Aucune donnée à afficher.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowProfile(false)} />
        </>
      )}

      <style jsx>{`
        :global(html, body) { background: #eaf2ff; }

        .topbar {
          position: fixed;
          top: 12px;
          left: 12px;
          right: 12px;
          height: 60px;
          background: #ffffff;
          border: 1px solid #e6ebf3;
          border-radius: 16px;
          box-shadow: 0 2px 8px rgba(13, 110, 253, 0.05);
          z-index: 1050;
        }
        .topbar-spacer { height: 84px; }

        /* Gauche : logo + menu très compact */
        .left-wrap {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 40px;                 /* encore un peu moins d'espace près du logo */
        }
        .brand { display: flex; align-items: center; justify-content: center; padding: 2px 2px;margin-right: 12px;  }
        .brand-logo { height: 38px; width: auto; object-fit: contain; }

        .mainmenu {
          display: flex;
          align-items: center;
          gap: 4px;                 /* espacement minimal entre items */
          white-space: nowrap;
        }
        .menu-link {
          appearance: none;
          border: 1px solid transparent;
          background: transparent;
          color: #233043;
          font-size: 20px;          /* plus petit */
          padding: 4px 6px;         /* padding serré */
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          line-height: 1;
        }
        .menu-link i { font-size: 22px; margin-right: 4px; } /* icônes réduites */
        .menu-link:hover { background: #f4f7ff; }
        .menu-link.active {
          background: #eef4ff;
          color: #0395efff;
          border-color: #e4ecff;
          font-weight: 600;
        }

        /* Droite : notif + avatar */
        .right-wrap { display: flex; align-items: center; gap: 10px; }
        .btn-avatar {
          background: #fff;
          border: 1px solid #e6ebf3;
          border-radius: 12px;
          padding: 0.25rem 0.5rem;
          font-size: 13px;
        }
        .btn-avatar:hover { background: #f3f6fb; }

        /* Encore plus serré si l'écran est un peu étroit */
        @media (max-width: 1350px) {
          .brand-logo { height: 36px; }
          .menu-link { font-size: 11px; padding: 4px 5px; }
          .menu-link i { font-size: 13px; margin-right: 3px; }
          .mainmenu { gap: 3px; }
          .btn-avatar { font-size: 12px; }
        }
      `}</style>
    </>
  );
}

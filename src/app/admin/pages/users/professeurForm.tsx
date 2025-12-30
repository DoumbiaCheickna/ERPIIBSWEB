//src/app/admin/pages/users/professeurForm.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../../../../firebaseConfig";

import { getApp, getApps, initializeApp, FirebaseOptions } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import { useAcademicYear } from "../../../directeur-des-etudes/context/AcademicYearContext";


/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */
type TRole = { id: string | number; libelle: string };

type TDisponibilite = {
  jour: string; // Lundi, Mardi...
  debut: string; // HH:MM
  fin: string;   // HH:MM
};

type Mode = "create" | "edit";

type Props = {
  roles: TRole[];
  mode: Mode;
  docId?: string;
  onClose: () => void;          // ferme la modale
  onSaved?: () => void | Promise<void>; // callback après création/édition OK (rafraîchir la liste)
};

/* ------------------------------------------------------------------ */
/* Constantes & utils                                                 */
/* ------------------------------------------------------------------ */
const ROLE_PROF_KEY = "prof";
const MAX_FILE_MB = 5;
const START_HOUR = 8;
const END_HOUR = 22;

const sanitize = (s: string) =>
  String(s ?? "")
    .replace(/<[^>]*>?/g, "")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();

const emailRegex = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const usernameRegex = /^[a-zA-Z0-9._-]{3,}$/;
const phoneRegexLocal = /^(70|75|76|77|78)\d{7}$/;

const timeInRange = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  return h >= START_HOUR && (h < END_HOUR || (h === END_HOUR && m === 0));
};

function ensureSecondaryAuth() {
  const defaultApp = getApp(); // l’app principale existe déjà
  const secondaryApp =
    getApps().find((a) => a.name === "Secondary") ||
    initializeApp(defaultApp.options as FirebaseOptions, "Secondary");
  return getAuth(secondaryApp);
}

function toRoleKey(label: string) {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const normalize = (s: string) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/* ------------------------------------------------------------------ */
/* Composant                                                          */
/* ------------------------------------------------------------------ */
export default function ProfesseurForm({ roles, mode, docId, onClose, onSaved }: Props) {
  const { selected } = useAcademicYear();            // ← année sélectionnée
  const selectedYearId = selected?.id || "";
  const selectedYearLabel = selected?.label || "";
  const profRoleId = useMemo(() => {
    const r = roles?.find((x) => {
      const lab = normalize(x.libelle);
      return lab === "professeur" || lab === "prof";
    });
    return r ? String(r.id) : "";
  }, [roles]);

  useEffect(() => {
    if (profRoleId && String(form.role_id) !== profRoleId) {
      setForm((f) => ({ ...f, role_id: profRoleId }));
    }
  }, [profRoleId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showPwd, setShowPwd] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(mode === "edit");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");

  const [form, setForm] = useState({
    email: "",
    login: "",
    nom: "",
    prenom: "",
    password: "", // utilisé seulement en création
    role_id: profRoleId || "",
    specialite: "",
    specialite_detaillee: "",
    date_naissance: "",
    lieu_naissance: "",
    nationalite: "",
    sexe: "",
    situation_matrimoniale: "",
    cni_passeport: "",
    adresse: "",
    telephoneLocal: "",
    statut: "",
    fonction_principale: "",
    disponibilites: [] as TDisponibilite[],
    elements_constitutifs: [""], // (matières) qu’il peut assurer
    experience_enseignement: {
      annees: 0,
      etablissements: [""],
    },
    diplomes: [
      {
        intitule: "",
        niveau: "",
        annee: "",
        etablissement: "",
      },
    ],
    niveaux_enseignement: [""],
    competences: {
      outils: [""],
      langues: [""],
      publications: [""],
    },
    documents: {
      cv: null as File | null,
      diplomes: null as File | null,
      piece_identite: null as File | null,
    },
  });

  // --------- charger doc en EDIT ----------
  useEffect(() => {
    const load = async () => {
      if (mode !== "edit" || !docId) return;
      setLoadingDoc(true);
      try {
        const snap = await getDoc(doc(db, "users", docId));
        if (!snap.exists()) {
          setGlobalError("Impossible de charger ce professeur.");
          return;
        }
        const d = snap.data() as any;
        // essaye d’extraire “+221 XXXXXXX”
        const telLocal =
          typeof d.telephone === "string"
            ? d.telephone.replace("+221", "").trim().replace(/\s+/g, "")
            : "";

        setForm((prev) => ({
          ...prev,
          email: d.email || "",
          login: d.login || "",
          nom: d.nom || "",
          prenom: d.prenom || "",
          // password laissé vide et non utilisé en edit
          role_id: String(d.role_id ?? profRoleId ?? ""),
          specialite: d.specialite || d.specialty || "",
          specialite_detaillee: d.specialite_detaillee || "",
          date_naissance: d.date_naissance || "",
          lieu_naissance: d.lieu_naissance || "",
          nationalite: d.nationalite || "",
          sexe: d.sexe || "",
          situation_matrimoniale: d.situation_matrimoniale || "",
          cni_passeport: d.cni_passeport || "",
          adresse: d.adresse || "",
          telephoneLocal: telLocal,
          statut: d.statut || "",
          fonction_principale: d.fonction_principale || "",
          disponibilites: Array.isArray(d.disponibilites) ? d.disponibilites : [],
          elements_constitutifs: Array.isArray(d.elements_constitutifs) && d.elements_constitutifs.length
            ? d.elements_constitutifs
            : [""],
          experience_enseignement: {
            annees: Number(d?.experience_enseignement?.annees || 0),
            etablissements:
              Array.isArray(d?.experience_enseignement?.etablissements) &&
              d.experience_enseignement.etablissements.length
                ? d.experience_enseignement.etablissements
                : [""],
          },
          diplomes: Array.isArray(d.diplomes) && d.diplomes.length
            ? d.diplomes
            : [{ intitule: "", niveau: "", annee: "", etablissement: "" }],
          niveaux_enseignement:
            Array.isArray(d.niveaux_enseignement) && d.niveaux_enseignement.length
              ? d.niveaux_enseignement
              : [""],
          competences: {
            outils:
              Array.isArray(d?.competences?.outils) && d.competences.outils.length
                ? d.competences.outils
                : [""],
            langues:
              Array.isArray(d?.competences?.langues) && d.competences.langues.length
                ? d.competences.langues
                : [""],
            publications:
              Array.isArray(d?.competences?.publications) && d.competences.publications.length
                ? d.competences.publications
                : [""],
          },
          rib: d.rib || "",
          // documents non rechargés (fichiers) — on ne les réuploade pas en edit
        }));
      } catch (e) {
        console.error(e);
        setGlobalError("Erreur lors du chargement.");
      } finally {
        setLoadingDoc(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, docId]);

  // Efface l’erreur d’un champ dès qu’on corrige
  const setField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[key];
      return copy;
    });
    setGlobalError("");
  };

  // ---------- Vérif. “login” unique en direct (debounce) ----------
  useEffect(() => {
    if (!form.login || !usernameRegex.test(form.login)) return;
    const t = setTimeout(async () => {
      try {
        const qy = query(collection(db, "users"), where("login", "==", form.login));
        const snap = await getDocs(qy);
        if (!snap.empty) {
          // si on est en édition, accepter si c’est le même doc
          const same = mode === "edit" && snap.docs.every((d) => d.id === docId);
          if (!same) {
            setErrors((e) => ({ ...e, login: "Nom d’utilisateur déjà pris." }));
          } else {
            setErrors((e) => {
              const copy = { ...e };
              delete copy.login;
              return copy;
            });
          }
        } else {
          setErrors((e) => {
            const copy = { ...e };
            delete copy.login;
            return copy;
          });
        }
      } catch {
        // en cas d’échec réseau on ne bloque pas, on laissera la validation finale trancher
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.login, mode, docId]);

  // ---------- Helpers pour listes ----------
  const addItem = (field: string) => {
    const v: any = (form as any)[field];
    if (Array.isArray(v)) setField(field, [...v, ""]);
  };
  const removeItem = (field: string, index: number) => {
    const v: any = (form as any)[field];
    if (Array.isArray(v)) {
      const arr = [...v];
      arr.splice(index, 1);
      setField(field, arr);
    }
  };
  const changeItem = (field: string, index: number, val: string) => {
    const v: any = (form as any)[field];
    if (Array.isArray(v)) {
      const arr = [...v];
      arr[index] = val;
      setField(field, arr);
    }
  };

  const addDiplome = () =>
    setField("diplomes", [...form.diplomes, { intitule: "", niveau: "", annee: "", etablissement: "" }]);
  const removeDiplome = (idx: number) => {
    const arr = [...form.diplomes];
    arr.splice(idx, 1);
    setField("diplomes", arr);
  };
  const changeDiplome = (idx: number, field: string, v: string) => {
    const arr = [...form.diplomes];
    arr[idx] = { ...arr[idx], [field]: v };
    setField("diplomes", arr);
  };

  const addEtab = () =>
    setField("experience_enseignement", {
      ...form.experience_enseignement,
      etablissements: [...form.experience_enseignement.etablissements, ""],
    });
  const changeEtab = (idx: number, v: string) => {
    const arr = [...form.experience_enseignement.etablissements];
    arr[idx] = v;
    setField("experience_enseignement", { ...form.experience_enseignement, etablissements: arr });
  };
  const removeEtab = (idx: number) => {
    const arr = [...form.experience_enseignement.etablissements];
    arr.splice(idx, 1);
    setField("experience_enseignement", { ...form.experience_enseignement, etablissements: arr });
  };

  const addDisponibilite = () =>
    setField("disponibilites", [...form.disponibilites, { jour: "", debut: "08:00", fin: "10:00" }]);
  const changeDisponibilite = (idx: number, key: keyof TDisponibilite, v: string) => {
    const arr = [...form.disponibilites];
    arr[idx] = { ...arr[idx], [key]: v };
    setField("disponibilites", arr);
  };
  const removeDisponibilite = (idx: number) => {
    const arr = [...form.disponibilites];
    arr.splice(idx, 1);
    setField("disponibilites", arr);
  };

  const setDocField = (key: keyof typeof form.documents, file: File | null) => {
    setField("documents", { ...form.documents, [key]: file });
  };

  const validateFile = (file: File | null, types: string[]) => {
    if (!file) return "";
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_FILE_MB) return `Fichier trop volumineux (max ${MAX_FILE_MB} Mo).`;
    const ok = types.some((t) => file.type.includes(t));
    if (!ok) return "Type de fichier non autorisé.";
    return "";
  };

  // ---------- Validation complète ----------
  const validateAll = async () => {
    const e: Record<string, string> = {};

    // Rôle (prérenseigné & obligatoire)
    if (!form.role_id) e.role_id = "Rôle obligatoire (Professeur).";

    // Infos de base
    if (!form.prenom || form.prenom.trim().length < 2) e.prenom = "Au moins 2 caractères.";
    if (!form.nom || form.nom.trim().length < 2) e.nom = "Au moins 2 caractères.";
    if (!form.email || !emailRegex.test(form.email)) e.email = "Adresse email invalide.";
    if (!form.login || !usernameRegex.test(form.login)) e.login = "3+ caractères (lettres/chiffres . _ -).";
    if (mode === "create" && (!form.password || form.password.length < 6)) e.password = "6 caractères minimum.";
    if (!form.specialite) e.specialite = "Obligatoire.";

    // Unicité login (re-check au submit)
    if (!e.login) {
      const qy = query(collection(db, "users"), where("login", "==", form.login));
      const snap = await getDocs(qy);
      if (!snap.empty) {
        const okSame = mode === "edit" && snap.docs.every((d) => d.id === docId);
        if (!okSame) e.login = "Nom d’utilisateur déjà pris.";
      }
    }

    // Infos perso (toutes obligatoires)
    if (!form.date_naissance) e.date_naissance = "Obligatoire.";
    if (!form.lieu_naissance) e.lieu_naissance = "Obligatoire.";
    if (!form.nationalite) e.nationalite = "Obligatoire.";
    if (!form.sexe) e.sexe = "Obligatoire.";
    if (!form.situation_matrimoniale) e.situation_matrimoniale = "Obligatoire.";
    if (!form.cni_passeport) e.cni_passeport = "Obligatoire.";

    // Contact
    if (!phoneRegexLocal.test(form.telephoneLocal))
      e.telephoneLocal = "Format attendu : 70/75/76/77/78 + 7 chiffres (ex: 771234567).";


    // // Disponibilités
    // if (!form.disponibilites.length) {
    //   e.disponibilites = "Ajoutez au moins une disponibilité.";
    // } else {
    //   form.disponibilites.forEach((d, i) => {
    //     if (!d.jour) e[`disponibilites.${i}.jour`] = "Jour obligatoire.";
    //     if (!timeInRange(d.debut) || !timeInRange(d.fin))
    //       e[`disponibilites.${i}.plage`] = "Heures entre 08:00 et 22:00.";
    //     if (d.debut && d.fin && d.debut >= d.fin)
    //       e[`disponibilites.${i}.ordre`] = "Heure de début < heure de fin.";
    //   });
    // }

    // // Éléments constitutifs (matières)
    // const ecs = form.elements_constitutifs.map((s) => s.trim()).filter(Boolean);
    // if (!ecs.length) e.elements_constitutifs = "Renseignez au moins un élément.";

    // // Expérience enseignement (≥ 1 an)
    // if (!form.experience_enseignement.annees || form.experience_enseignement.annees < 1)
    //   e.experience_enseignement_annees = "Au moins 1 année d’expérience.";

    // // Diplômes (au moins un intitule + niveau)
    // const dipOK = form.diplomes.some((d) => d.intitule.trim() && d.niveau.trim());
    // if (!dipOK) e.diplomes = "Ajoutez au moins un diplôme (intitulé et niveau).";

    // // Niveaux d’enseignement
    // const nivs = form.niveaux_enseignement.map((s) => s.trim()).filter(Boolean);
    // if (!nivs.length) e.niveaux_enseignement = "Sélectionnez au moins un niveau.";

    // Fichiers (type/poids) — uniquement en création, sinon optionnels
    if (mode === "create") {
      const cvErr = validateFile(form.documents.cv, ["pdf"]);
      if (cvErr) e.documents_cv = cvErr;
      const diplomeDocErr = validateFile(form.documents.diplomes, ["pdf"]);
      if (diplomeDocErr) e.documents_diplomes = diplomeDocErr;
      const idErr = validateFile(form.documents.piece_identite, ["pdf", "jpeg", "png", "jpg"]);
      if (idErr) e.documents_piece_identite = idErr;
    }

    setErrors(e);
    return e;
  };

  const uploadFile = async (file: File): Promise<string> => {
    // TODO: Remplacer par Firebase Storage si nécessaire
    return URL.createObjectURL(file);
  };

  const createUserDoc = async (authUid: string) => {
    // id simple (comme ton existant)
    const usersSnapshot = await getDocs(collection(db, "users"));
    const newUserId = usersSnapshot.size + 1;

    const roleObj = roles.find((r) => String(r.id) === String(form.role_id));
    const role_libelle = roleObj?.libelle || "Professeur";
    const role_key =
      role_libelle.toLowerCase().trim() === "professeur" ? ROLE_PROF_KEY : toRoleKey(role_libelle);

    const phoneFull = `+221 ${form.telephoneLocal}`;

    // -- Uploads (mock local) --
    const fileUrls = {
      cv: form.documents.cv ? await uploadFile(form.documents.cv) : null,
      diplomes: form.documents.diplomes ? await uploadFile(form.documents.diplomes) : null,
      piece_identite: form.documents.piece_identite ? await uploadFile(form.documents.piece_identite) : null,
    };

    await addDoc(collection(db, "users"), {
      id: newUserId,
      role_id: String(form.role_id),
      role_libelle,
      role_key,
      email: sanitize(form.email),
      login: sanitize(form.login),
      nom: sanitize(form.nom),
      prenom: sanitize(form.prenom),
      specialty: sanitize(form.specialite), // compat
      specialite: sanitize(form.specialite),
      specialite_detaillee: sanitize(form.specialite_detaillee),
      date_naissance: form.date_naissance,
      lieu_naissance: sanitize(form.lieu_naissance),
      nationalite: sanitize(form.nationalite),
      sexe: form.sexe,
      situation_matrimoniale: form.situation_matrimoniale,
      cni_passeport: sanitize(form.cni_passeport),
      adresse: sanitize(form.adresse),
      telephone: phoneFull,
      statut: form.statut,
      fonction_principale: sanitize(form.fonction_principale),
      disponibilites: form.disponibilites,
      elements_constitutifs: form.elements_constitutifs.map(sanitize).filter(Boolean),
      experience_enseignement: {
        annees: Number(form.experience_enseignement.annees || 0),
        etablissements: form.experience_enseignement.etablissements.map(sanitize).filter(Boolean),
      },
      diplomes: form.diplomes.map((d) => ({
        intitule: sanitize(d.intitule),
        niveau: d.niveau,
        annee: sanitize(d.annee),
        etablissement: sanitize(d.etablissement),
      })),
      niveaux_enseignement: form.niveaux_enseignement.filter(Boolean),
      competences: {
        outils: form.competences.outils.map(sanitize).filter(Boolean),
        langues: form.competences.langues.map(sanitize).filter(Boolean),
        publications: form.competences.publications.map(sanitize).filter(Boolean),
      },
      documents: fileUrls,
      auth_uid: authUid,
      first_login: "1",
      academic_year_id: selectedYearId || null,
      academic_year_label: selectedYearLabel || null, 
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

  };

  const updateUserDoc = async () => {
    if (!docId) throw new Error("docId manquant pour l’édition.");

    // Charger l’existant pour savoir si les champs d’année sont déjà là
    const snap = await getDoc(doc(db, "users", docId));
    const cur = snap.exists() ? (snap.data() as any) : {};

    const roleObj = roles.find((r) => String(r.id) === String(form.role_id));
    const role_libelle = roleObj?.libelle || "Professeur";
    const role_key = role_libelle.toLowerCase().trim() === "professeur" ? ROLE_PROF_KEY : toRoleKey(role_libelle);

    const phoneFull = `+221 ${form.telephoneLocal}`;

    await setDoc(
      doc(db, "users", docId),
      {
        // ==== champs "année" seulement s’ils manquent déjà ====
        ...(cur.academic_year_id ? {} : { academic_year_id: selectedYearId || null }),
        ...(cur.academic_year_label ? {} : { academic_year_label: selectedYearLabel || null }),

        // ==== le reste de ta mise à jour ====
        role_id: String(form.role_id),
        role_libelle,
        role_key,
        email: sanitize(form.email),
        login: sanitize(form.login),
        nom: sanitize(form.nom),
        prenom: sanitize(form.prenom),
        specialty: sanitize(form.specialite),
        specialite: sanitize(form.specialite),
        specialite_detaillee: sanitize(form.specialite_detaillee),
        date_naissance: form.date_naissance,
        lieu_naissance: sanitize(form.lieu_naissance),
        nationalite: sanitize(form.nationalite),
        sexe: form.sexe,
        situation_matrimoniale: form.situation_matrimoniale,
        cni_passeport: sanitize(form.cni_passeport),
        adresse: sanitize(form.adresse),
        telephone: phoneFull,
        statut: form.statut,
        fonction_principale: sanitize(form.fonction_principale),
        disponibilites: form.disponibilites,
        elements_constitutifs: form.elements_constitutifs.map(sanitize).filter(Boolean),
        experience_enseignement: {
          annees: Number(form.experience_enseignement.annees || 0),
          etablissements: form.experience_enseignement.etablissements.map(sanitize).filter(Boolean),
        },
        diplomes: form.diplomes.map((d) => ({
          intitule: sanitize(d.intitule),
          niveau: d.niveau,
          annee: sanitize(d.annee),
          etablissement: sanitize(d.etablissement),
        })),
        niveaux_enseignement: form.niveaux_enseignement.filter(Boolean),
        competences: {
          outils: form.competences.outils.map(sanitize).filter(Boolean),
          langues: form.competences.langues.map(sanitize).filter(Boolean),
          publications: form.competences.publications.map(sanitize).filter(Boolean),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setGlobalError("");
    try {
      const es = await validateAll();
      if (Object.keys(es).length) {
        setSaving(false);
        return;
      }

      if (mode === "create") {
        // -- Création côté Auth (secondary app pour ne pas déconnecter l’admin) --
        const secondaryAuth = ensureSecondaryAuth();
        let authUid = "";
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
          authUid = cred.user.uid;
          await updateProfile(cred.user, { displayName: `${form.prenom} ${form.nom}`.trim() });
        } catch (err: any) {
          const map: Record<string, string> = {};
          if (err?.code === "auth/email-already-in-use") {
            map.email = "Email déjà utilisé.";
          } else if (err?.code === "auth/weak-password") {
            map.password = "Mot de passe trop faible.";
          } else {
            setGlobalError("Création du compte échouée. Vérifiez l’email/mot de passe et réessayez.");
          }
          if (Object.keys(map).length) setErrors((e) => ({ ...e, ...map }));
          setSaving(false);
          try {
            await signOut(secondaryAuth);
          } catch {}
          return;
        } finally {
          try {
            await signOut(secondaryAuth);
          } catch {}
        }

        await createUserDoc(authUid);
      } else {
        // EDIT
        await updateUserDoc();
      }

      // succès → close + refresh
      if (onSaved) await onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setGlobalError(mode === "create" ? "Erreur lors de l’ajout du professeur." : "Erreur lors de la mise à jour.");
    } finally {
      setSaving(false);
    }
  };

  const preview = (file: File | null) => {
    if (!file) return null;
    const url = URL.createObjectURL(file);
    if (file.type.includes("pdf")) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className="small">
          Prévisualiser le PDF
        </a>
      );
    }
    if (file.type.includes("png") || file.type.includes("jpeg") || file.type.includes("jpg")) {
      return <img src={url} alt="aperçu" style={{ maxWidth: 120, borderRadius: 6 }} />;
    }
    return <span className="small text-muted">{file.name}</span>;
  };

  /* ----------------------------- Render (MODALE) ----------------------------- */
  return (
    <>
      <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
        <div className="modal-dialog modal-xl modal-dialog-centered">
          <div className="modal-content">
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-plus-circle me-2" />
                  {mode === "create" ? "Créer un professeur" : "Modifier un professeur"}
                </h5>
                <button type="button" className="btn-close" onClick={onClose} />
              </div>

              <div className="modal-body">
                {globalError && <div className="alert alert-danger">{globalError}</div>}
                {loadingDoc && (
                  <div className="text-center py-4">
                    <div className="spinner-border" role="status" />
                    <div className="text-muted mt-2">Chargement…</div>
                  </div>
                )}
                {!loadingDoc && (
                  <>
                    {/* Rôle (pré-rempli/obligatoire) */}
                    <div className="mb-3">
                      <label className="form-label">
                        Rôle <span className="text-danger">*</span>
                      </label>
                      <select
                        className={`form-select ${errors.role_id ? "is-invalid" : ""}`}
                        value={form.role_id}
                        onChange={(e) => setField("role_id", e.target.value)}
                        disabled
                      >
                        <option value={form.role_id}>Professeur</option>
                      </select>
                      {errors.role_id && <div className="invalid-feedback">{errors.role_id}</div>}
                    </div>

                    {/* Informations de base */}
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">
                          Prénom <span className="text-danger">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.prenom ? "is-invalid" : ""}`}
                          value={form.prenom}
                          onChange={(e) => setField("prenom", e.target.value)}
                          placeholder="Prénom"
                        />
                        {errors.prenom && <div className="invalid-feedback">{errors.prenom}</div>}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Nom <span className="text-danger">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.nom ? "is-invalid" : ""}`}
                          value={form.nom}
                          onChange={(e) => setField("nom", e.target.value)}
                          placeholder="Nom"
                        />
                        {errors.nom && <div className="invalid-feedback">{errors.nom}</div>}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Email <span className="text-danger">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.email ? "is-invalid" : ""}`}
                          value={form.email}
                          onChange={(e) => setField("email", e.target.value)}
                          placeholder="exemple@email.com"
                        />
                        {errors.email && <div className="invalid-feedback">{errors.email}</div>}
                      </div>

                      <div className="col-md-4">
                        <label className="form-label">
                          Nom d’utilisateur <span className="text-danger">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.login ? "is-invalid" : ""}`}
                          value={form.login}
                          onChange={(e) => setField("login", e.target.value)}
                          placeholder="Unique, ex: j.doe"
                        />
                        {errors.login && <div className="invalid-feedback">{errors.login}</div>}
                      </div>

                      {mode === "create" && (
                      <div className="col-md-4">
                        <label className="form-label">
                          Mot de passe <span className="text-danger">*</span>
                        </label>

                        <div className="input-group">
                          <input
                            type={showPwd ? "text" : "password"}
                            className={`form-control ${errors.password ? "is-invalid" : ""}`}
                            value={form.password}
                            onChange={(e) => setField("password", e.target.value)}
                            placeholder="Min 6 caractères"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={() => setShowPwd(v => !v)}
                            title={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                            aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                            aria-pressed={showPwd}
                          >
                            {showPwd ? <i className="bi bi-eye-slash" /> : <i className="bi bi-eye" />}
                          </button>
                        </div>

                        {errors.password && <div className="invalid-feedback d-block">{errors.password}</div>}
                      </div>
                    )}
                      <div className={mode === "create" ? "col-md-4" : "col-md-8"}>
                        <label className="form-label">
                          Spécialité <span className="text-danger">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.specialite ? "is-invalid" : ""}`}
                          value={form.specialite}
                          onChange={(e) => setField("specialite", e.target.value)}
                          placeholder="Spécialité"
                        />
                        {errors.specialite && <div className="invalid-feedback">{errors.specialite}</div>}
                      </div>

                      <div className="col-md-12">
                        <label className="form-label">Spécialité détaillée</label>
                        <input
                          className="form-control"
                          value={form.specialite_detaillee}
                          onChange={(e) => setField("specialite_detaillee", e.target.value)}
                          placeholder="Ex: Développeur·euse Full-Stack"
                        />
                      </div>
                    </div>

                    {/* Informations personnelles */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Informations personnelles</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">
                          Date de naissance <span className="text-danger">*</span>
                        </label>
                        <input
                          type="date"
                          className={`form-control ${errors.date_naissance ? "is-invalid" : ""}`}
                          value={form.date_naissance}
                          onChange={(e) => setField("date_naissance", e.target.value)}
                        />
                        {errors.date_naissance && <div className="invalid-feedback">{errors.date_naissance}</div>}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Lieu de naissance <span className="text-danger">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.lieu_naissance ? "is-invalid" : ""}`}
                          value={form.lieu_naissance}
                          onChange={(e) => setField("lieu_naissance", e.target.value)}
                          placeholder="Lieu de naissance"
                        />
                        {errors.lieu_naissance && <div className="invalid-feedback">{errors.lieu_naissance}</div>}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Nationalité <span className="text-danger">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.nationalite ? "is-invalid" : ""}`}
                          value={form.nationalite}
                          onChange={(e) => setField("nationalite", e.target.value)}
                          placeholder="Nationalité"
                        />
                        {errors.nationalite && <div className="invalid-feedback">{errors.nationalite}</div>}
                      </div>

                      <div className="col-md-4">
                        <label className="form-label">
                          Sexe <span className="text-danger">*</span>
                        </label>
                        <select
                          className={`form-select ${errors.sexe ? "is-invalid" : ""}`}
                          value={form.sexe}
                          onChange={(e) => setField("sexe", e.target.value)}
                        >
                          <option value="">Sélectionner</option>
                          <option value="Masculin">Masculin</option>
                          <option value="Féminin">Féminin</option>
                        </select>
                        {errors.sexe && <div className="invalid-feedback">{errors.sexe}</div>}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Situation matrimoniale <span className="text-danger">*</span>
                        </label>
                        <select
                          className={`form-select ${errors.situation_matrimoniale ? "is-invalid" : ""}`}
                          value={form.situation_matrimoniale}
                          onChange={(e) => setField("situation_matrimoniale", e.target.value)}
                        >
                          <option value="">Sélectionner</option>
                          <option value="Célibataire">Célibataire</option>
                          <option value="Marié(e)">Marié(e)</option>
                          <option value="Divorcé(e)">Divorcé(e)</option>
                          <option value="Veuf(ve)">Veuf(ve)</option>
                        </select>
                        {errors.situation_matrimoniale && <div className="invalid-feedback">{errors.situation_matrimoniale}</div>}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          CNI / Passeport <span className="text-danger">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.cni_passeport ? "is-invalid" : ""}`}
                          value={form.cni_passeport}
                          onChange={(e) => setField("cni_passeport", e.target.value)}
                          placeholder="Numéro CNI ou Passeport"
                        />
                        {errors.cni_passeport && <div className="invalid-feedback">{errors.cni_passeport}</div>}
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Informations de contact</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Adresse</label>
                        <input
                          className="form-control"
                          value={form.adresse}
                          onChange={(e) => setField("adresse", e.target.value)}
                          placeholder="Adresse complète"
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">
                          Téléphone <span className="text-danger">*</span>
                        </label>
                        <div className="input-group">
                          <span className="input-group-text">+221</span>
                          <input
                            className={`form-control ${errors.telephoneLocal ? "is-invalid" : ""}`}
                            value={form.telephoneLocal}
                            onChange={(e) => setField("telephoneLocal", e.target.value)}
                            placeholder="70XXXXXXX"
                          />
                          {errors.telephoneLocal && <div className="invalid-feedback d-block">{errors.telephoneLocal}</div>}
                        </div>
                      </div>
                    </div>

                    {/* Situation pro */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Situation professionnelle</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">
                          Statut
                        </label>
                        <select
                          className="form-select"
                          value={form.statut}
                          onChange={(e) => setField("statut", e.target.value)}
                        >
                          <option value="">Sélectionner</option>
                          <option value="Vacataire">Vacataire</option>
                          <option value="Permanent">Permanent</option>
                          <option value="Temps partiel">Temps partiel</option>
                          <option value="Temps plein">Temps plein</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Fonction principale</label>
                        <input
                          className="form-control"
                          value={form.fonction_principale}
                          onChange={(e) => setField("fonction_principale", e.target.value)}
                          placeholder="Fonction principale"
                        />
                      </div>
                    </div>

                    {/* Disponibilités */}
                    <div className="mt-3">
                      <h6 className="fw-bold">
                        Disponibilités (08h–22h)
                      </h6>
                      {form.disponibilites.map((d, i) => (
                        <div key={i} className="row g-2 align-items-end mb-2">
                          <div className="col-md-3">
                            <label className="form-label">Jour</label>
                            <select
                              className={`form-select ${errors[`disponibilites.${i}.jour`] ? "is-invalid" : ""}`}
                              value={d.jour}
                              onChange={(e) => changeDisponibilite(i, "jour", e.target.value)}
                            >
                              <option value="">Sélectionner</option>
                              {days.map((j) => (
                                <option key={j} value={j}>
                                  {j}
                                </option>
                              ))}
                            </select>

                          </div>
                          <div className="col-md-3">
                            <label className="form-label">Début</label>
                            <input
                              type="time"
                              className="form-control"
                              value={d.debut}
                              onChange={(e) => changeDisponibilite(i, "debut", e.target.value)}
                              min="08:00"
                              max="22:00"
                            />
                          </div>
                          <div className="col-md-3">
                            <label className="form-label">Fin</label>
                            <input
                              type="time"
                              className="form-control"
                              value={d.fin}
                              onChange={(e) => changeDisponibilite(i, "fin", e.target.value)}
                              min="08:00"
                              max="22:00"
                            />
                          </div>
                          <div className="col-md-3 d-flex gap-2">
                            <button type="button" className="btn btn-outline-danger" onClick={() => removeDisponibilite(i)}>
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={addDisponibilite}>
                        <i className="bi bi-plus me-1" />
                        Ajouter une disponibilité
                      </button>
                    </div>

                    <div className="mt-3">
                      <h6 className="fw-bold">
                        Éléments constitutifs (Matières)
                      </h6>

                      {form.elements_constitutifs.map((ec, i) => (
                        <div key={i} className="d-flex mb-2">
                          <input
                            className="form-control"
                            value={ec}
                            onChange={(e) => changeItem("elements_constitutifs", i, e.target.value)}
                            placeholder="Ex: Algorithmique"
                          />
                          <button
                            type="button"
                            className="btn btn-outline-danger ms-2"
                            onClick={() => removeItem("elements_constitutifs", i)}
                            disabled={form.elements_constitutifs.length === 1}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => addItem("elements_constitutifs")}>
                        <i className="bi bi-plus me-1" />
                        Ajouter un élément
                      </button>
                    </div>

                    <div className="mt-3">
                      <h6 className="fw-bold">
                        Expérience d’enseignement
                      </h6>

                      <div className="row g-2">
                        <div className="col-md-4">
                          <label className="form-label">Années d’expérience</label>
                          <input
                            type="number"
                            className="form-control"
                            min={0}
                            value={form.experience_enseignement.annees}
                            onChange={(e) =>
                              setField("experience_enseignement", {
                                ...form.experience_enseignement,
                                annees: parseInt(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                        <div className="col-12">
                          <label className="form-label">Établissements précédents</label>
                          {form.experience_enseignement.etablissements.map((et, idx) => (
                            <div key={idx} className="d-flex mb-2">
                              <input
                                className="form-control"
                                value={et}
                                onChange={(e) => changeEtab(idx, e.target.value)}
                                placeholder="Nom de l'établissement"
                              />
                              <button type="button" className="btn btn-outline-danger ms-2" onClick={() => removeEtab(idx)} disabled={form.experience_enseignement.etablissements.length === 1}>
                                <i className="bi bi-trash" />
                              </button>
                            </div>
                          ))}
                          <button type="button" className="btn btn-outline-primary btn-sm" onClick={addEtab}>
                            <i className="bi bi-plus me-1" />
                            Ajouter établissement
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Diplômes */}
                    <div className="mt-3">
                      <h6 className="fw-bold">
                        Diplômes et formations 
                      </h6>
                      {form.diplomes.map((d, idx) => (
                        <div key={idx} className="row g-2 mb-2">
                          <div className="col-md-4">
                            <input
                              className="form-control"
                              placeholder="Intitulé"
                              value={d.intitule}
                              onChange={(e) => changeDiplome(idx, "intitule", e.target.value)}
                            />
                          </div>
                          <div className="col-md-3">
                            <select className="form-select" value={d.niveau} onChange={(e) => changeDiplome(idx, "niveau", e.target.value)}>
                              <option value="">Niveau</option>
                              <option value="Bac">Bac</option>
                              <option value="Bac+2">Bac+2</option>
                              <option value="Bac+3">Bac+3</option>
                              <option value="Bac+5">Bac+5</option>
                              <option value="Doctorat">Doctorat</option>
                            </select>
                          </div>
                          <div className="col-md-2">
                            <input
                              className="form-control"
                              placeholder="Année"
                              value={d.annee}
                              onChange={(e) => changeDiplome(idx, "annee", e.target.value)}
                            />
                          </div>
                          <div className="col-md-3">
                            <input
                              className="form-control"
                              placeholder="Établissement"
                              value={d.etablissement}
                              onChange={(e) => changeDiplome(idx, "etablissement", e.target.value)}
                            />
                          </div>
                          <div className="col-12">
                            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => removeDiplome(idx)} disabled={form.diplomes.length === 1}>
                              <i className="bi bi-trash" /> Retirer
                            </button>
                          </div>
                        </div>
                      ))}
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={addDiplome}>
                        <i className="bi bi-plus me-1" />
                        Ajouter un diplôme
                      </button>
                    </div>

                    {/* Niveaux d’enseignement */}
                    <div className="mt-3">
                      <h6 className="fw-bold">
                        Niveaux d’enseignement 
                      </h6>

                      {form.niveaux_enseignement.map((niveau, i) => (
                        <div key={i} className="d-flex mb-2">
                          <select
                            className="form-select"
                            value={niveau}
                            onChange={(e) => changeItem("niveaux_enseignement", i, e.target.value)}
                          >
                            <option value="">Sélectionner</option>
                            <option value="Primaire">Primaire</option>
                            <option value="Secondaire">Secondaire</option>
                            <option value="Lycée">Lycée</option>
                            <option value="Université">Université</option>
                            <option value="Formation professionnelle">Formation professionnelle</option>
                          </select>
                          <button
                            type="button"
                            className="btn btn-outline-danger ms-2"
                            onClick={() => removeItem("niveaux_enseignement", i)}
                            disabled={form.niveaux_enseignement.length === 1}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => addItem("niveaux_enseignement")}>
                        <i className="bi bi-plus me-1" />
                        Ajouter un niveau
                      </button>
                    </div>

                    {/* Compétences complémentaires */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Compétences complémentaires</h6>
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label">Outils maîtrisés</label>
                          {form.competences.outils.map((v, i) => (
                            <div key={i} className="d-flex mb-2">
                              <input
                                className="form-control"
                                value={v}
                                onChange={(e) =>
                                  setField("competences", {
                                    ...form.competences,
                                    outils: form.competences.outils.map((x, k) => (k === i ? e.target.value : x)),
                                  })
                                }
                                placeholder="Ex: Git, Docker…"
                              />
                              <button
                                type="button"
                                className="btn btn-outline-danger ms-2"
                                onClick={() =>
                                  setField("competences", {
                                    ...form.competences,
                                    outils: form.competences.outils.filter((_x, k) => k !== i),
                                  })
                                }
                                disabled={form.competences.outils.length === 1}
                              >
                                <i className="bi bi-trash" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() =>
                              setField("competences", { ...form.competences, outils: [...form.competences.outils, ""] })
                            }
                          >
                            <i className="bi bi-plus me-1" />
                            Ajouter
                          </button>
                        </div>

                        <div className="col-md-4">
                          <label className="form-label">Langues parlées</label>
                          {form.competences.langues.map((v, i) => (
                            <div key={i} className="d-flex mb-2">
                              <input
                                className="form-control"
                                value={v}
                                onChange={(e) =>
                                  setField("competences", {
                                    ...form.competences,
                                    langues: form.competences.langues.map((x, k) => (k === i ? e.target.value : x)),
                                  })
                                }
                                placeholder="Ex: Français, Anglais…"
                              />
                              <button
                                type="button"
                                className="btn btn-outline-danger ms-2"
                                onClick={() =>
                                  setField("competences", {
                                    ...form.competences,
                                    langues: form.competences.langues.filter((_x, k) => k !== i),
                                  })
                                }
                                disabled={form.competences.langues.length === 1}
                              >
                                <i className="bi bi-trash" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() =>
                              setField("competences", { ...form.competences, langues: [...form.competences.langues, ""] })
                            }
                          >
                            <i className="bi bi-plus me-1" />
                            Ajouter
                          </button>
                        </div>

                        <div className="col-md-4">
                          <label className="form-label">Publications / Travaux</label>
                          {form.competences.publications.map((v, i) => (
                            <div key={i} className="d-flex mb-2">
                              <input
                                className="form-control"
                                value={v}
                                onChange={(e) =>
                                  setField("competences", {
                                    ...form.competences,
                                    publications: form.competences.publications.map((x, k) =>
                                      k === i ? e.target.value : x
                                    ),
                                  })
                                }
                                placeholder="Titre, revue, année…"
                              />
                              <button
                                type="button"
                                className="btn btn-outline-danger ms-2"
                                onClick={() =>
                                  setField("competences", {
                                    ...form.competences,
                                    publications: form.competences.publications.filter((_x, k) => k !== i),
                                  })
                                }
                                disabled={form.competences.publications.length === 1}
                              >
                                <i className="bi bi-trash" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() =>
                              setField("competences", {
                                ...form.competences,
                                publications: [...form.competences.publications, ""],
                              })
                            }
                          >
                            <i className="bi bi-plus me-1" />
                            Ajouter
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RIB & Documents */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Documents</h6>
                      <div className="row g-3">

                        {/* En édition, ces fichiers sont optionnels et remplacent s’ils sont fournis */}
                        <div className="col-md-3">
                          <label className="form-label">CV (PDF)</label>
                          <input
                            type="file"
                            className={`form-control ${errors.documents_cv ? "is-invalid" : ""}`}
                            accept=".pdf"
                            onChange={(e) => setDocField("cv", e.target.files?.[0] || null)}
                          />
                          {errors.documents_cv && <div className="invalid-feedback d-block">{errors.documents_cv}</div>}
                          <div className="mt-1">{preview(form.documents.cv)}</div>
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Diplômes (PDF)</label>
                          <input
                            type="file"
                            className={`form-control ${errors.documents_diplomes ? "is-invalid" : ""}`}
                            accept=".pdf"
                            onChange={(e) => setDocField("diplomes", e.target.files?.[0] || null)}
                          />
                          {errors.documents_diplomes && (
                            <div className="invalid-feedback d-block">{errors.documents_diplomes}</div>
                          )}
                          <div className="mt-1">{preview(form.documents.diplomes)}</div>
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Pièce d’identité (PDF/JPG/PNG)</label>
                          <input
                            type="file"
                            className={`form-control ${errors.documents_piece_identite ? "is-invalid" : ""}`}
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setDocField("piece_identite", e.target.files?.[0] || null)}
                          />
                          {errors.documents_piece_identite && (
                            <div className="invalid-feedback d-block">{errors.documents_piece_identite}</div>
                          )}
                          <div className="mt-1">{preview(form.documents.piece_identite)}</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || loadingDoc}>
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      {mode === "create" ? "Enregistrement…" : "Mise à jour…"}
                    </>
                  ) : mode === "create" ? (
                    "Enregistrer"
                  ) : (
                    "Mettre à jour"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
  );
}
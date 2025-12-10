// src/app/directeur-des-etudes/components/personnel/PersonnelForm.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  query,
  where,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getApp, getApps, initializeApp, FirebaseOptions } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "firebase/auth";
import { db } from "../../../../../firebaseConfig";

type Mode = "create" | "edit";

export default function PersonnelForm({
  mode,
  docId,
  defaultRoleLabel,
  onClose,
  onSaved,
}: {
  mode: Mode;
  docId?: string;
  defaultRoleLabel: string; // "Assistant Directeur des Etudes"
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(mode === "edit");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState("");

  // ─────────── helpers regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  const usernameRegex = /^[a-zA-Z0-9._-]{3,}$/;
  const phoneRegexLocal = /^(70|75|76|77|78)\d{7}$/;

  const sanitize = (s: string) => String(s ?? "").replace(/<[^>]*>?/g, "").trim();
  // ↓ juste après les autres useState existants
  const [showPwd, setShowPwd] = useState(false);

  // indicateurs pour la vérification live du login
  const [checkingLogin, setCheckingLogin] = useState(false);
  const [loginAvailable, setLoginAvailable] = useState<boolean | null>(null);


  // ─────────── form
  const [form, setForm] = useState({
    role_libelle: defaultRoleLabel, // verrouillé
    email: "",
    login: "",
    password: "", // create only
    // Informations personnelles
    nom: "",
    prenom: "",
    sexe: "",
    date_naissance: "",
    lieu_naissance: "",
    nationalite: "",
    situation_matrimoniale: "",
    nb_enfants: "",
    cni_passeport: "",
    // Coordonnées
    adresse: "",
    telephoneLocal: "",
    emailPerso: "",
    // Poste visé
    intitule_poste: "",
    departements_services: [""], // ← multiple
    type_contrat: "",
    disponibilite: "",
    dispo_date: "",
    // Profil pro
    dernier_poste: "",
    fonctions_exercees: [""], // ← multiple
    experience: "",
    niveau_responsabilite: "",
    // Diplômes & formations
    diplomes: [{ intitule: "", niveau: "", annee: "", etablissement: "" }],
    certifications: [""],
    formations: [""],
    // Compétences
    competences: [""], // ← multiple
    langues: [""], // ← multiple
    permis: "",
    // Références
    references: [""],
    // Engagements
    engagement_loyaute: false,
    consentement_refs: false,
    dispo_pour_prise_de_poste: false,
    // Documents (optionnels ici)
    lettre_motivation: null as File | null,
    cv: null as File | null,
    piece_identite: null as File | null,
    diplomes_docs: null as File | null,
    attestations: null as File | null,
    rib: null as File | null,
  });

  const setField = (k: string, v: any) => {
    setForm((p: any) => ({ ...p, [k]: v }));
    setErrors((e) => {
      const c = { ...e };
      delete c[k];
      return c;
    });
    setGlobalError("");
  };

  // Edit → charger doc
  useEffect(() => {
    const load = async () => {
      if (mode !== "edit" || !docId) return;
      setLoadingDoc(true);
      try {
        const snap = await getDoc(doc(db, "users", docId));
        if (!snap.exists()) {
          setGlobalError("Introuvable.");
          return;
        }
        const d = snap.data() as any;
        const telLocal =
          typeof d.telephone === "string"
            ? d.telephone.replace("+221", "").trim().replace(/\s+/g, "")
            : "";
        const asArr = (x: any) => (Array.isArray(x) ? x : x ? [x] : [""]);
        setForm((prev: any) => ({
          ...prev,
          role_libelle: d.role_libelle || defaultRoleLabel,
          email: d.email || "",
          login: d.login || "",
          // no password in edit
          nom: d.nom || "",
          prenom: d.prenom || "",
          sexe: d.sexe || "",
          date_naissance: d.date_naissance || "",
          lieu_naissance: d.lieu_naissance || "",
          nationalite: d.nationalite || "",
          situation_matrimoniale: d.situation_matrimoniale || "",
          nb_enfants: d.nb_enfants || "",
          cni_passeport: d.cni_passeport || "",
          adresse: d.adresse || "",
          telephoneLocal: telLocal,
          emailPerso: d.emailPerso || "",
          intitule_poste: d.intitule_poste || "",
          departements_services: asArr(
            d.departements_services || d.departement || d.service
          ),
          type_contrat: d.type_contrat || "",
          disponibilite: d.disponibilite || "",
          dispo_date: d.dispo_date || "",
          dernier_poste: d.dernier_poste || "",
          fonctions_exercees: asArr(d.fonctions_exercees),
          experience: d.experience || "",
          niveau_responsabilite: d.niveau_responsabilite || "",
          diplomes:
            Array.isArray(d.diplomes) && d.diplomes.length
              ? d.diplomes
              : [{ intitule: "", niveau: "", annee: "", etablissement: "" }],
          certifications:
            Array.isArray(d.certifications) && d.certifications.length
              ? d.certifications
              : [""],
          formations:
            Array.isArray(d.formations) && d.formations.length ? d.formations : [""],
          competences: asArr(d.competences),
          langues: asArr(d.langues),
          permis: d.permis || "",
          references:
            Array.isArray(d.references) && d.references.length ? d.references : [""],
          engagement_loyaute: !!d.engagement_loyaute,
          consentement_refs: !!d.consentement_refs,
          dispo_pour_prise_de_poste: !!d.dispo_pour_prise_de_poste,
        }));
      } finally {
        setLoadingDoc(false);
      }
    };
    load();
  }, [mode, docId, defaultRoleLabel]);

  // Vérif login unique (onSubmit on re-check)
  useEffect(() => {
    // rien à vérifier si vide ou invalide
    if (!form.login || !usernameRegex.test(form.login)) {
      setLoginAvailable(null);
      setCheckingLogin(false);
      return;
    }

    setCheckingLogin(true);
    const t = setTimeout(async () => {
      try {
        const qy = query(collection(db, "users"), where("login", "==", form.login));
        const snap = await getDocs(qy);

        let exists = false;
        if (!snap.empty) {
          // en édition, autorise si c'est le même doc
          const same = mode === "edit" && snap.docs.every((d) => d.id === docId);
          exists = !same;
        }

        setLoginAvailable(!exists);
        setErrors((e) => {
          const c = { ...e };
          if (exists) c.login = "Nom d’utilisateur déjà pris.";
          else delete c.login;
          return c;
        });
      } catch {
        setLoginAvailable(null); // neutre en cas d'erreur réseau
      } finally {
        setCheckingLogin(false);
      }
    }, 400);

    return () => clearTimeout(t);
  }, [form.login, mode, docId]);

  // Utils listes
  const add = (k: string, empty: any) => setField(k, [...(form as any)[k], empty]);
  const remove = (k: string, i: number) => {
    const arr = [...(form as any)[k]];
    arr.splice(i, 1);
    setField(k, arr);
  };
  const change = (k: string, i: number, v: any) => {
    const arr = [...(form as any)[k]];
    arr[i] = v;
    setField(k, arr);
  };

  // Validation
  const validateAll = async () => {
    const e: Record<string, string> = {};
    const nonEmptyArr = (xs: string[]) =>
      Array.isArray(xs) && xs.some((s) => (s || "").trim().length > 0);

    if (!form.role_libelle) e.role_libelle = "Rôle obligatoire.";
    if (!form.prenom || form.prenom.trim().length < 2)
      e.prenom = "Au moins 2 caractères.";
    if (!form.nom || form.nom.trim().length < 2) e.nom = "Au moins 2 caractères.";
    if (!form.email || !emailRegex.test(form.email)) e.email = "Email invalide.";
    if (!form.login || !usernameRegex.test(form.login))
      e.login = "3+ caractères (lettres/chiffres . _ -).";
    if (mode === "create" && (!form.password || form.password.length < 6))
      e.password = "6 caractères minimum.";

    if (!form.sexe) e.sexe = "Obligatoire.";
    if (!form.date_naissance) e.date_naissance = "Obligatoire.";
    if (!form.lieu_naissance) e.lieu_naissance = "Obligatoire.";
    if (!form.nationalite) e.nationalite = "Obligatoire.";
    if (!form.situation_matrimoniale) e.situation_matrimoniale = "Obligatoire.";
    if (!form.cni_passeport) e.cni_passeport = "Obligatoire.";

    if (!phoneRegexLocal.test(form.telephoneLocal))
      e.telephoneLocal = "Format: 70/75/76/77/78 + 7 chiffres.";

    if (!form.intitule_poste) e.intitule_poste = "Obligatoire.";
    if (!nonEmptyArr(form.departements_services))
      e.departements_services = "Au moins un département/service.";
    if (!form.type_contrat) e.type_contrat = "Obligatoire.";
    if (!form.disponibilite) e.disponibilite = "Obligatoire.";
    if (form.disponibilite === "à partir d’une date" && !form.dispo_date)
      e.dispo_date = "Spécifiez la date.";

    // Diplômes: au moins un diplôme avec intitulé + niveau
    if (!form.diplomes.some((d) => d.intitule.trim() && d.niveau.trim()))
      e.diplomes = "Ajouter au moins un diplôme (intitulé + niveau).";

    // Nouvelles contraintes multi
    if (!nonEmptyArr(form.fonctions_exercees))
      e.fonctions_exercees = "Au moins une fonction exercée.";
    if (!nonEmptyArr(form.competences))
      e.competences = "Au moins une compétence.";
    if (!nonEmptyArr(form.langues)) e.langues = "Au moins une langue.";

    // Login unique final check
    if (!e.login) {
      const qy = query(collection(db, "users"), where("login", "==", form.login));
      const snap = await getDocs(qy);
      if (!snap.empty) {
        const okSame = mode === "edit" && snap.docs.every((d) => d.id === docId);
        if (!okSame) e.login = "Nom d’utilisateur déjà pris.";
      }
    }

    setErrors(e);
    return e;
  };

  // Secondary auth pour créer l’utilisateur sans déconnecter l’admin
  function ensureSecondaryAuth() {
    const defaultApp = getApp();
    const secondaryApp =
      getApps().find((a) => a.name === "Secondary") ||
      initializeApp(defaultApp.options as FirebaseOptions, "Secondary");
    return getAuth(secondaryApp);
  }

  const uploadFile = async (file: File | null) =>
    file ? URL.createObjectURL(file) : null;

  const createDoc = async (authUid: string) => {
    const usersSnap = await getDocs(collection(db, "users"));
    const nextId = usersSnap.size + 1;

    await addDoc(collection(db, "users"), {
      id: nextId,
      role_libelle: form.role_libelle,
      role_key: "assistant-directeur-des-etudes",
      email: sanitize(form.email),
      login: sanitize(form.login),
      nom: sanitize(form.nom),
      prenom: sanitize(form.prenom),
      sexe: form.sexe,
      date_naissance: form.date_naissance,
      lieu_naissance: sanitize(form.lieu_naissance),
      nationalite: sanitize(form.nationalite),
      situation_matrimoniale: form.situation_matrimoniale,
      nb_enfants: form.nb_enfants,
      cni_passeport: sanitize(form.cni_passeport),
      adresse: sanitize(form.adresse),
      telephone: `+221 ${form.telephoneLocal}`,
      emailPerso: sanitize(form.emailPerso),
      intitule_poste: sanitize(form.intitule_poste),
      departements_services: form.departements_services
        .map(sanitize)
        .filter(Boolean),
      type_contrat: form.type_contrat,
      disponibilite: form.disponibilite,
      dispo_date: form.dispo_date || null,
      dernier_poste: sanitize(form.dernier_poste),
      fonctions_exercees: form.fonctions_exercees.map(sanitize).filter(Boolean),
      experience: sanitize(form.experience),
      niveau_responsabilite: sanitize(form.niveau_responsabilite),
      diplomes: form.diplomes.map((d) => ({
        intitule: sanitize(d.intitule),
        niveau: d.niveau,
        annee: sanitize(d.annee),
        etablissement: sanitize(d.etablissement),
      })),
      certifications: form.certifications.map(sanitize).filter(Boolean),
      formations: form.formations.map(sanitize).filter(Boolean),
      competences: form.competences.map(sanitize).filter(Boolean),
      langues: form.langues.map(sanitize).filter(Boolean),
      permis: sanitize(form.permis),
      references: form.references.map(sanitize).filter(Boolean),
      engagement_loyaute: !!form.engagement_loyaute,
      consentement_refs: !!form.consentement_refs,
      dispo_pour_prise_de_poste: !!form.dispo_pour_prise_de_poste,
      documents: {
        lettre_motivation: await uploadFile(form.lettre_motivation),
        cv: await uploadFile(form.cv),
        piece_identite: await uploadFile(form.piece_identite),
        diplomes: await uploadFile(form.diplomes_docs),
        attestations: await uploadFile(form.attestations),
        rib: await uploadFile(form.rib),
      },
      auth_uid: authUid,
      first_login: "1",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const updateDocFs = async () => {
    if (!docId) throw new Error("docId missing");
    await setDoc(
      doc(db, "users", docId),
      {
        role_libelle: form.role_libelle,
        role_key: "assistant-directeur-des-etudes",
        email: sanitize(form.email),
        login: sanitize(form.login),
        nom: sanitize(form.nom),
        prenom: sanitize(form.prenom),
        sexe: form.sexe,
        date_naissance: form.date_naissance,
        lieu_naissance: sanitize(form.lieu_naissance),
        nationalite: sanitize(form.nationalite),
        situation_matrimoniale: form.situation_matrimoniale,
        nb_enfants: form.nb_enfants,
        cni_passeport: sanitize(form.cni_passeport),
        adresse: sanitize(form.adresse),
        telephone: `+221 ${form.telephoneLocal}`,
        emailPerso: sanitize(form.emailPerso),
        intitule_poste: sanitize(form.intitule_poste),
        departements_services: form.departements_services
          .map(sanitize)
          .filter(Boolean),
        type_contrat: form.type_contrat,
        disponibilite: form.disponibilite,
        dispo_date: form.dispo_date || null,
        dernier_poste: sanitize(form.dernier_poste),
        fonctions_exercees: form.fonctions_exercees.map(sanitize).filter(Boolean),
        experience: sanitize(form.experience),
        niveau_responsabilite: sanitize(form.niveau_responsabilite),
        diplomes: form.diplomes.map((d) => ({
          intitule: sanitize(d.intitule),
          niveau: d.niveau,
          annee: sanitize(d.annee),
          etablissement: sanitize(d.etablissement),
        })),
        certifications: form.certifications.map(sanitize).filter(Boolean),
        formations: form.formations.map(sanitize).filter(Boolean),
        competences: form.competences.map(sanitize).filter(Boolean),
        langues: form.langues.map(sanitize).filter(Boolean),
        permis: sanitize(form.permis),
        references: form.references.map(sanitize).filter(Boolean),
        engagement_loyaute: !!form.engagement_loyaute,
        consentement_refs: !!form.consentement_refs,
        dispo_pour_prise_de_poste: !!form.dispo_pour_prise_de_poste,
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
        // Création Auth (secondary)
        const secondaryAuth = ensureSecondaryAuth();
        let authUid = "";
        try {
          const cred = await createUserWithEmailAndPassword(
            secondaryAuth,
            form.email,
            form.password
          );
          authUid = cred.user.uid;
          await updateProfile(cred.user, {
            displayName: `${form.prenom} ${form.nom}`.trim(),
          });
        } catch (err: any) {
          if (err?.code === "auth/email-already-in-use")
            setErrors((e) => ({ ...e, email: "Email déjà utilisé." }));
          else if (err?.code === "auth/weak-password")
            setErrors((e) => ({ ...e, password: "Mot de passe trop faible." }));
          else setGlobalError("Création du compte échouée (Auth).");
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
        await createDoc(authUid);
      } else {
        await updateDocFs();
      }

      if (onSaved) await onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setGlobalError(
        mode === "create"
          ? "Erreur lors de l’ajout."
          : "Erreur lors de la mise à jour."
      );
    } finally {
      setSaving(false);
    }
  };

  // UI (modale)
  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block" }}
        aria-modal="true"
        role="dialog"
      >
        <div className="modal-dialog modal-xl modal-dialog-centered">
          <div className="modal-content">
            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-header">
                <h5 className="modal-title">
                  {mode === "create" ? "Ajouter un personnel" : "Modifier un personnel"}
                </h5>
                <button className="btn-close" onClick={onClose} type="button" />
              </div>

              <div className="modal-body">
                {globalError && <div className="alert alert-danger">{globalError}</div>}
                {loadingDoc ? (
                  <div className="text-center py-4">
                    <div className="spinner-border" role="status" />
                    <div className="text-muted mt-2">Chargement…</div>
                  </div>
                ) : (
                  <>
                    {/* Rôle (fixe) */}
                    <div className="mb-3">
                      <label className="form-label">Rôle</label>
                      <input className="form-control" value={form.role_libelle} disabled />
                    </div>

                    {/* Base */}
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">
                          Prénom <span className="req">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.prenom ? "is-invalid" : ""}`}
                          value={form.prenom}
                          onChange={(e) => setField("prenom", e.target.value)}
                        />
                        {errors.prenom && (
                          <div className="invalid-feedback">{errors.prenom}</div>
                        )}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Nom <span className="req">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.nom ? "is-invalid" : ""}`}
                          value={form.nom}
                          onChange={(e) => setField("nom", e.target.value)}
                        />
                        {errors.nom && <div className="invalid-feedback">{errors.nom}</div>}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Email <span className="req">*</span>
                        </label>
                        <input
                          className={`form-control ${errors.email ? "is-invalid" : ""}`}
                          value={form.email}
                          onChange={(e) => setField("email", e.target.value)}
                        />
                        {errors.email && (
                          <div className="invalid-feedback">{errors.email}</div>
                        )}
                      </div>

                      <div className="col-md-4">
                        <label className="form-label">
                          Nom d’utilisateur <span className="req">*</span>
                        </label>

                        <div className="input-group">
                          <input
                            className={`form-control ${errors.login ? "is-invalid" : ""}`}
                            value={form.login}
                            onChange={(e) => setField("login", e.target.value)}
                            placeholder="Unique, ex: j.doe"
                            onBlur={(e) => setField("login", e.target.value.trim())}
                          />
                          <span className="input-group-text bg-white">
                            {checkingLogin ? (
                              <span className="spinner-border spinner-border-sm" />
                            ) : loginAvailable === true ? (
                              <i className="bi bi-check-circle text-success" />
                            ) : loginAvailable === false ? (
                              <i className="bi bi-x-circle text-danger" />
                            ) : (
                              <i className="bi bi-person" />
                            )}
                          </span>
                        </div>

                        {errors.login && <div className="invalid-feedback d-block">{errors.login}</div>}
                        {!errors.login && form.login && loginAvailable === true && (
                          <div className="form-text text-success">Nom d’utilisateur disponible</div>
                        )}
                        {!errors.login && form.login && loginAvailable === false && (
                          <div className="text-danger small">Ce nom d’utilisateur est déjà pris.</div>
                        )}
                        {checkingLogin && <div className="form-text">Vérification de la disponibilité…</div>}
                      </div>

                      {mode === "create" && (
                      <div className="col-md-4">
                        <label className="form-label">
                          Mot de passe <span className="req">*</span>
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
                            onClick={() => setShowPwd((v) => !v)}
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
                    </div>

                    {/* Infos personnelles */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Informations personnelles</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-3">
                        <label className="form-label">
                          Sexe <span className="req">*</span>
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
                      <div className="col-md-3">
                        <label className="form-label">
                          Date de naissance <span className="req">*</span>
                        </label>
                        <input
                          type="date"
                          className={`form-control ${
                            errors.date_naissance ? "is-invalid" : ""
                          }`}
                          value={form.date_naissance}
                          onChange={(e) => setField("date_naissance", e.target.value)}
                        />
                        {errors.date_naissance && (
                          <div className="invalid-feedback">{errors.date_naissance}</div>
                        )}
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">
                          Lieu de naissance <span className="req">*</span>
                        </label>
                        <input
                          className={`form-control ${
                            errors.lieu_naissance ? "is-invalid" : ""
                          }`}
                          value={form.lieu_naissance}
                          onChange={(e) => setField("lieu_naissance", e.target.value)}
                        />
                        {errors.lieu_naissance && (
                          <div className="invalid-feedback">{errors.lieu_naissance}</div>
                        )}
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">
                          Nationalité <span className="req">*</span>
                        </label>
                        <input
                          className={`form-control ${
                            errors.nationalite ? "is-invalid" : ""
                          }`}
                          value={form.nationalite}
                          onChange={(e) => setField("nationalite", e.target.value)}
                        />
                        {errors.nationalite && (
                          <div className="invalid-feedback">{errors.nationalite}</div>
                        )}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Situation matrimoniale <span className="req">*</span>
                        </label>
                        <select
                          className={`form-select ${
                            errors.situation_matrimoniale ? "is-invalid" : ""
                          }`}
                          value={form.situation_matrimoniale}
                          onChange={(e) =>
                            setField("situation_matrimoniale", e.target.value)
                          }
                        >
                          <option value="">Sélectionner</option>
                          <option value="Célibataire">Célibataire</option>
                          <option value="Marié(e)">Marié(e)</option>
                          <option value="Divorcé(e)">Divorcé(e)</option>
                          <option value="Veuf(ve)">Veuf(ve)</option>
                        </select>
                        {errors.situation_matrimoniale && (
                          <div className="invalid-feedback">
                            {errors.situation_matrimoniale}
                          </div>
                        )}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Nombre d’enfants</label>
                        <input
                          className="form-control"
                          value={form.nb_enfants}
                          onChange={(e) => setField("nb_enfants", e.target.value)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          CNI / Passeport <span className="req">*</span>
                        </label>
                        <input
                          className={`form-control ${
                            errors.cni_passeport ? "is-invalid" : ""
                          }`}
                          value={form.cni_passeport}
                          onChange={(e) => setField("cni_passeport", e.target.value)}
                        />
                        {errors.cni_passeport && (
                          <div className="invalid-feedback">{errors.cni_passeport}</div>
                        )}
                      </div>
                    </div>

                    {/* Coordonnées */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Coordonnées</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Adresse</label>
                        <input
                          className="form-control"
                          value={form.adresse}
                          onChange={(e) => setField("adresse", e.target.value)}
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">
                          Téléphone <span className="req">*</span>
                        </label>
                        <div className="input-group">
                          <span className="input-group-text">+221</span>
                          <input
                            className={`form-control ${
                              errors.telephoneLocal ? "is-invalid" : ""
                            }`}
                            value={form.telephoneLocal}
                            onChange={(e) => setField("telephoneLocal", e.target.value)}
                            placeholder="70XXXXXXX"
                          />
                        </div>
                        {errors.telephoneLocal && (
                          <div className="invalid-feedback d-block">
                            {errors.telephoneLocal}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Poste visé */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Poste visé</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">
                          Intitulé du poste <span className="req">*</span>
                        </label>
                        <input
                          className={`form-control ${
                            errors.intitule_poste ? "is-invalid" : ""
                          }`}
                          value={form.intitule_poste}
                          onChange={(e) => setField("intitule_poste", e.target.value)}
                        />
                        {errors.intitule_poste && (
                          <div className="invalid-feedback">
                            {errors.intitule_poste}
                          </div>
                        )}
                      </div>

                      {/* Département / Service (multiple) */}
                      <div className="col-md-8">
                        <label className="form-label">Département / service</label>
                        {errors.departements_services && (
                          <div className="text-danger small mb-1">
                            {errors.departements_services}
                          </div>
                        )}
                        {form.departements_services.map((v, i) => (
                          <div key={i} className="d-flex mb-2">
                            <input
                              className="form-control"
                              placeholder="Ex: Scolarité, Finance…"
                              value={v}
                              onChange={(e) =>
                                change("departements_services", i, e.target.value)
                              }
                            />
                            <button
                              type="button"
                              className="btn btn-outline-danger ms-2"
                              onClick={() => remove("departements_services", i)}
                              disabled={form.departements_services.length === 1}
                              title="Supprimer"
                            >
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => add("departements_services", "")}
                        >
                          <i className="bi bi-plus me-1" /> Ajouter
                        </button>
                      </div>

                      <div className="col-md-4">
                        <label className="form-label">
                          Type de contrat <span className="req">*</span>
                        </label>
                        <select
                          className={`form-select ${
                            errors.type_contrat ? "is-invalid" : ""
                          }`}
                          value={form.type_contrat}
                          onChange={(e) => setField("type_contrat", e.target.value)}
                        >
                          <option value="">Sélectionner</option>
                          <option value="CDI">CDI</option>
                          <option value="CDD">CDD</option>
                          <option value="Stage">Stage</option>
                          <option value="Intérim">Intérim</option>
                        </select>
                        {errors.type_contrat && (
                          <div className="invalid-feedback">{errors.type_contrat}</div>
                        )}
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Disponibilité <span className="req">*</span>
                        </label>
                        <select
                          className={`form-select ${
                            errors.disponibilite ? "is-invalid" : ""
                          }`}
                          value={form.disponibilite}
                          onChange={(e) => setField("disponibilite", e.target.value)}
                        >
                          <option value="">Sélectionner</option>
                          <option value="immédiate">Immédiate</option>
                          <option value="à partir d’une date">À partir d’une date</option>
                        </select>
                        {errors.disponibilite && (
                          <div className="invalid-feedback">{errors.disponibilite}</div>
                        )}
                      </div>
                      {form.disponibilite === "à partir d’une date" && (
                        <div className="col-md-4">
                          <label className="form-label">
                            Date de disponibilité <span className="req">*</span>
                          </label>
                          <input
                            type="date"
                            className={`form-control ${
                              errors.dispo_date ? "is-invalid" : ""
                            }`}
                            value={form.dispo_date}
                            onChange={(e) => setField("dispo_date", e.target.value)}
                          />
                          {errors.dispo_date && (
                            <div className="invalid-feedback">{errors.dispo_date}</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Profil pro */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Profil professionnel</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Dernier poste occupé</label>
                        <input
                          className="form-control"
                          value={form.dernier_poste}
                          onChange={(e) => setField("dernier_poste", e.target.value)}
                        />
                      </div>

                      {/* Fonctions exercées (multiple) */}
                      <div className="col-md-6">
                        <label className="form-label">Fonction(s) exercée(s)</label>
                        {errors.fonctions_exercees && (
                          <div className="text-danger small mb-1">
                            {errors.fonctions_exercees}
                          </div>
                        )}
                        {form.fonctions_exercees.map((v, i) => (
                          <div key={i} className="d-flex mb-2">
                            <input
                              className="form-control"
                              value={v}
                              onChange={(e) =>
                                change("fonctions_exercees", i, e.target.value)
                              }
                            />
                            <button
                              type="button"
                              className="btn btn-outline-danger ms-2"
                              onClick={() => remove("fonctions_exercees", i)}
                              disabled={form.fonctions_exercees.length === 1}
                              title="Supprimer"
                            >
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => add("fonctions_exercees", "")}
                        >
                          <i className="bi bi-plus me-1" /> Ajouter
                        </button>
                      </div>

                      <div className="col-md-6">
                        <label className="form-label">Expérience dans le domaine</label>
                        <input
                          className="form-control"
                          value={form.experience}
                          onChange={(e) => setField("experience", e.target.value)}
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Niveau de responsabilité</label>
                        <input
                          className="form-control"
                          value={form.niveau_responsabilite}
                          onChange={(e) =>
                            setField("niveau_responsabilite", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    {/* Diplômes */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Formation / Diplômes</h6>
                      <hr />
                    </div>
                    {errors.diplomes && (
                      <div className="text-danger small mb-2">{errors.diplomes}</div>
                    )}
                    {form.diplomes.map((d, i) => (
                      <div className="row g-2 mb-2" key={i}>
                        <div className="col-md-4">
                          <input
                            className="form-control"
                            placeholder="Intitulé *"
                            value={d.intitule}
                            onChange={(e) => {
                              const arr = [...form.diplomes];
                              arr[i] = { ...d, intitule: e.target.value };
                              setField("diplomes", arr);
                            }}
                          />
                        </div>
                        <div className="col-md-3">
                          <select
                            className="form-select"
                            value={d.niveau}
                            onChange={(e) => {
                              const arr = [...form.diplomes];
                              arr[i] = { ...d, niveau: e.target.value };
                              setField("diplomes", arr);
                            }}
                          >
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
                            onChange={(e) => {
                              const arr = [...form.diplomes];
                              arr[i] = { ...d, annee: e.target.value };
                              setField("diplomes", arr);
                            }}
                          />
                        </div>
                        <div className="col-md-3">
                          <input
                            className="form-control"
                            placeholder="Établissement"
                            value={d.etablissement}
                            onChange={(e) => {
                              const arr = [...form.diplomes];
                              arr[i] = { ...d, etablissement: e.target.value };
                              setField("diplomes", arr);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="d-flex gap-2 mb-3">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={() =>
                          setField("diplomes", [
                            ...form.diplomes,
                            { intitule: "", niveau: "", annee: "", etablissement: "" },
                          ])
                        }
                      >
                        <i className="bi bi-plus me-1" /> Ajouter un diplôme
                      </button>
                      {form.diplomes.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => {
                            const arr = [...form.diplomes];
                            arr.pop();
                            setField("diplomes", arr);
                          }}
                        >
                          <i className="bi bi-trash me-1" /> Retirer le dernier
                        </button>
                      )}
                    </div>

                    {/* Compétences */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Compétences</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">
                          Compétences techniques / bureautiques
                        </label>
                        {errors.competences && (
                          <div className="text-danger small mb-1">
                            {errors.competences}
                          </div>
                        )}
                        {form.competences.map((v, i) => (
                          <div key={i} className="d-flex mb-2">
                            <input
                              className="form-control"
                              value={v}
                              onChange={(e) => change("competences", i, e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-outline-danger ms-2"
                              onClick={() => remove("competences", i)}
                              disabled={form.competences.length === 1}
                            >
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => add("competences", "")}
                        >
                          <i className="bi bi-plus me-1" /> Ajouter
                        </button>
                      </div>

                      <div className="col-md-6">
                        <label className="form-label">Langues parlées</label>
                        {errors.langues && (
                          <div className="text-danger small mb-1">{errors.langues}</div>
                        )}
                        {form.langues.map((v, i) => (
                          <div key={i} className="d-flex mb-2">
                            <input
                              className="form-control"
                              value={v}
                              onChange={(e) => change("langues", i, e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-outline-danger ms-2"
                              onClick={() => remove("langues", i)}
                              disabled={form.langues.length === 1}
                            >
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => add("langues", "")}
                        >
                          <i className="bi bi-plus me-1" /> Ajouter
                        </button>
                      </div>

                      <div className="col-md-6">
                        <label className="form-label">Permis (type et validité)</label>
                        <input
                          className="form-control"
                          value={form.permis}
                          onChange={(e) => setField("permis", e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Références */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Références professionnelles</h6>
                      <hr />
                    </div>
                    {form.references.map((r, i) => (
                      <div key={i} className="d-flex mb-2">
                        <input
                          className="form-control"
                          placeholder="Nom et coordonnées"
                          value={r}
                          onChange={(e) => change("references", i, e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-danger ms-2"
                          onClick={() => remove("references", i)}
                          disabled={form.references.length === 1}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => add("references", "")}
                    >
                      <i className="bi bi-plus me-1" /> Ajouter une référence
                    </button>

                    {/* Engagements */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Engagements et disponibilité</h6>
                      <hr />
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="loyaute"
                        checked={form.engagement_loyaute}
                        onChange={(e) => setField("engagement_loyaute", e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="loyaute">
                        Engagement de loyauté et de discrétion
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="consent"
                        checked={form.consentement_refs}
                        onChange={(e) => setField("consentement_refs", e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="consent">
                        Consentement pour vérification des références
                      </label>
                    </div>
                    <div className="form-check mb-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="dispo"
                        checked={form.dispo_pour_prise_de_poste}
                        onChange={(e) =>
                          setField("dispo_pour_prise_de_poste", e.target.checked)
                        }
                      />
                      <label className="form-check-label" htmlFor="dispo">
                        Disponibilité pour une prise de poste
                      </label>
                    </div>

                    {/* Documents (optionnels) */}
                    <div className="mt-3">
                      <h6 className="fw-bold">Documents (optionnels)</h6>
                      <hr />
                    </div>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">Lettre de motivation (PDF)</label>
                        <input
                          type="file"
                          accept=".pdf"
                          className="form-control"
                          onChange={(e) =>
                            setField("lettre_motivation", e.target.files?.[0] || null)
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">CV (PDF)</label>
                        <input
                          type="file"
                          accept=".pdf"
                          className="form-control"
                          onChange={(e) => setField("cv", e.target.files?.[0] || null)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Pièce d’identité (PDF/JPG/PNG)</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="form-control"
                          onChange={(e) =>
                            setField("piece_identite", e.target.files?.[0] || null)
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Diplômes (PDF)</label>
                        <input
                          type="file"
                          accept=".pdf"
                          className="form-control"
                          onChange={(e) =>
                            setField("diplomes_docs", e.target.files?.[0] || null)
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          Attestations d’emploi / stage (PDF)
                        </label>
                        <input
                          type="file"
                          accept=".pdf"
                          className="form-control"
                          onChange={(e) =>
                            setField("attestations", e.target.files?.[0] || null)
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">RIB (PDF/JPG/PNG)</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="form-control"
                          onChange={(e) => setField("rib", e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={onClose}
                  disabled={saving}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || loadingDoc}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Enregistrement…
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

      {/* Astérisques rouges */}
      <style jsx>{`
        .req {
          color: #dc3545;
          margin-left: 4px;
        }
      `}</style>
    </>
  );
}

// src/app/directeur-des-etudes/components/PersonnelPage.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import PersonnelForm from "./personnel/PersonnelForm";
import ModalPortal from "./ModalPortal";

/* ------------------------------------------------------------------ */
const ROLE_LABEL = "Assistant Directeur des Etudes";
const ROLE_KEY = "assistant-directeur-des-etudes"; // normalisé
const PER_PAGE = 10;

/* --- petit cache mémoire process-local (jusqu’au refresh de page) --- */
const memoryCache = new Map<string, TPerson[]>();
const LIST_CACHE_KEY = "personnel:assistants";

/* -------------------- Types simples pour la liste ------------------- */
type TPerson = {
  id?: number;
  docId: string;
  nom: string;
  prenom: string;
  email: string;
  login: string;
  telephone?: string;
  departement?: string;
  service?: string;
  role_libelle?: string;
};

type TPersonFull = any;

/* ------------------------------------------------------------------ */

export default function PersonnelPage() {
  /* === Liste (client) === */
  const [all, setAll] = useState<TPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // recherche / pagination (client)
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Modales CRUD
  const [showCreate, setShowCreate] = useState(false);
  const [editDocId, setEditDocId] = useState<string | null>(null);

  // Détails (modale complète)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<TPersonFull | null>(null);

  // Suppression
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  // Garde-fou anti-concurrence
  const lastLoadKeyRef = React.useRef<string>("");

  /* ---------------------- Chargement liste -------------------------- */
  const load = async () => {
    const CK = LIST_CACHE_KEY;
    lastLoadKeyRef.current = CK;
    setLoading(true);
    setErr(null);

    try {
      // cache hit → rendu immédiat
      if (memoryCache.has(CK)) {
        if (lastLoadKeyRef.current === CK) {
          setAll(memoryCache.get(CK)!);
          setLoading(false);
        }
        return;
      }

      const usersCol = collection(db, "users");

      // On lance les deux requêtes en parallèle (libellé et key), puis on fusionne
      const [snapByLabel, snapByKey] = await Promise.all([
        getDocs(query(usersCol, where("role_libelle", "==", ROLE_LABEL))),
        getDocs(query(usersCol, where("role_key", "==", ROLE_KEY))),
      ]);

      // Fusion: Map par docId pour dédupliquer proprement
      const byId = new Map<string, TPerson>();

      const pushDoc = (d: any) => {
        const v = d.data() as any;
        byId.set(d.id, {
          docId: d.id,
          id: v.id,
          nom: v.nom || "",
          prenom: v.prenom || "",
          email: v.email || "",
          login: v.login || "",
          telephone: v.telephone || "",
          departement: v.departement || v["département"] || v.dept || "",
          service: v.service || "",
          role_libelle: v.role_libelle || "",
        });
      };

      snapByLabel.forEach(pushDoc);
      snapByKey.forEach(pushDoc);

      // Liste + tri alpha: Nom puis Prénom
      const list = Array.from(byId.values()).sort((a, b) => {
        const n = (a.nom || "").localeCompare(b.nom || "", "fr", { sensitivity: "base" });
        if (n !== 0) return n;
        return (a.prenom || "").localeCompare(b.prenom || "", "fr", { sensitivity: "base" });
      });

      // cache + rendu (si toujours la dernière requête)
      memoryCache.set(CK, list);
      if (lastLoadKeyRef.current === CK) {
        setAll(list);
      }
    } catch (e) {
      console.error(e);
      if (lastLoadKeyRef.current === LIST_CACHE_KEY) {
        setErr("Erreur de chargement.");
      }
    } finally {
      if (lastLoadKeyRef.current === LIST_CACHE_KEY) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  /* ---------------------- Détails: open / load ---------------------- */
  const openDetails = async (docId: string) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const d = await getDoc(doc(db, "users", docId));
      if (!d.exists()) {
        setDetails(null);
        return;
      }
      const v = d.data() as any;
      const asArr = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
      const safeDocs = v.documents || {};

      setDetails({
        ...v,
        docId: d.id,
        departements_services: asArr(v.departements_services || v.departement || v.service),
        fonctions_exercees: asArr(v.fonctions_exercees),
        competences: asArr(v.competences),
        langues: asArr(v.langues),
        documents: {
          lettre_motivation: safeDocs.lettre_motivation || null,
          cv: safeDocs.cv || null,
          piece_identite: safeDocs.piece_identite || null,
          diplomes: safeDocs.diplomes || null,
          attestations: safeDocs.attestations || null,
          rib: safeDocs.rib || null,
        },
      });
    } catch (e) {
      console.error(e);
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  /* ---------------------- Supprimer ------------------------------- */
  const doDelete = async () => {
    if (!deleteDocId) return;
    try {
      await deleteDoc(doc(db, "users", deleteDocId));
      setDeleteDocId(null);
      // invalide cache + reload
      memoryCache.delete(LIST_CACHE_KEY);
      await load();
    } catch (e) {
      console.error(e);
      setErr("Suppression impossible.");
    }
  };

  /* ---------------------- Recherche / Pagination -------------------- */
  const sortRows = (rows: TPerson[]) => rows; // déjà trié au fetch

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortRows(all);
    return sortRows(
      all.filter((u) =>
        `${u.nom} ${u.prenom} ${u.email} ${u.login} ${u.departement || ""} ${u.service || ""}`
          .toLowerCase()
          .includes(q)
      )
    );
  }, [all, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1); // reset page quand la recherche change
  }, [search]);

  /* ---------------------- Render ----------------------------------- */
  return (
    <div className="container-fluid py-3">

      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 className="mb-1">Personnel</h3>
          <div className="text-muted">Gestion des comptes du personnel administratif</div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <i className="bi bi-plus-lg me-2" />
            Ajouter Personnel
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white border-0 position-sticky top-0" style={{ zIndex: 5 }}>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <h5 className="mb-0 fw-semibold">
              <i className="bi bi-people-gear me-2" />
              Liste du personnel
            </h5>
            <div className="d-flex gap-2 align-items-center">
              <div className="input-group input-group-sm" style={{ minWidth: 320 }}>
                <span className="input-group-text bg-light border-0">
                  <i className="bi bi-search" />
                </span>
                <input
                  className="form-control border-0"
                  placeholder="Rechercher "
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <button className="btn btn-primary" type="button" title="Rechercher">
                  <i className="bi bi-search me-1" /> Rechercher
                </button>
              </div>
              <span className="badge bg-light text-dark">
                {loading && all.length === 0 ? "Chargement…" : `${filtered.length} résultat(s)`}
              </span>
            </div>
          </div>
        </div>

        <div className="card-body p-0">
          {err && <div className="alert alert-danger m-3">{err}</div>}

          {loading && all.length === 0 ? (
            <div className="text-center py-5">
              <div className="spinner-border" role="status" />
              <div className="text-muted mt-2">Chargement…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-person-exclamation" style={{ fontSize: 32 }} />
              <div className="mt-2">Aucun personnel trouvé.</div>
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 4 }}>
                    <tr>
                      <th className="text-nowrap">Nom</th>
                      <th className="text-nowrap">Prénom</th>
                      <th className="text-nowrap">Email</th>
                      <th className="text-nowrap">Département</th>
                      <th className="text-end text-nowrap" style={{ width: 340 }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((p) => (
                      <tr key={p.docId}>
                        <td className="fw-semibold">{p.nom || "—"}</td>
                        <td>{p.prenom || "—"}</td>
                        <td>{p.email || "—"}</td>
                        <td>
                          {p.departement || p.service ? (
                            <span className="badge bg-secondary-subtle text-secondary-emphasis">
                              {p.departement || p.service}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="text-end">
                          <div className="btn-toolbar justify-content-end" role="toolbar">
                            <div className="btn-group me-2" role="group">
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                title="Voir les détails"
                                onClick={() => openDetails(p.docId)}
                              >
                                <i className="bi bi-eye" />
                              </button>
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                title="Modifier"
                                onClick={() => setEditDocId(p.docId)}
                              >
                                <i className="bi bi-pencil" />
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                title="Supprimer"
                                onClick={() => setDeleteDocId(p.docId)}
                              >
                                <i className="bi bi-trash" />
                              </button>
                            </div>
                            {/* Espace pour d'autres actions si besoin */}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination (client) */}
              <div className="p-3 d-flex justify-content-between align-items-center">
                <div className="small text-muted">
                  Page {page} / {totalPages} — {filtered.length} personnel(s), {PER_PAGE} par page
                </div>
                <div className="btn-group">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <i className="bi bi-chevron-left" /> Précédent
                  </button>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Suivant <i className="bi bi-chevron-right" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Modales ---------- */}

      {/* Créer */}
      {showCreate && (
        <ModalPortal>
        <>
          <PersonnelForm
            mode="create"
            defaultRoleLabel={ROLE_LABEL}
            onClose={() => setShowCreate(false)}
            onSaved={async () => {
              setShowCreate(false);
              memoryCache.delete(LIST_CACHE_KEY); // invalide le cache
              await load();
            }}
          />
          <div className="modal-backdrop fade show" onClick={() => setShowCreate(false)} />
        </>
        </ModalPortal>
      )}

      {/* Modifier */}
      {editDocId && (
        <ModalPortal>
        <>
          <PersonnelForm
            mode="edit"
            docId={editDocId}
            defaultRoleLabel={ROLE_LABEL}
            onClose={() => setEditDocId(null)}
            onSaved={async () => {
              setEditDocId(null);
              memoryCache.delete(LIST_CACHE_KEY); // invalide le cache
              await load();
            }}
          />
          <div className="modal-backdrop fade show" onClick={() => setEditDocId(null)} />
        </>
        </ModalPortal>
      )}

      {/* Détails — affiche TOUT */}
      {detailsOpen && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-eye me-2" />
                    Détails du personnel
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setDetailsOpen(false)} />
                </div>

                <div className="modal-body">
                  {detailsLoading ? (
                    <div className="text-center py-4">
                      <div className="spinner-border" role="status" />
                      <div className="text-muted mt-2">Chargement…</div>
                    </div>
                  ) : !details ? (
                    <div className="alert alert-warning">Fiche introuvable.</div>
                  ) : (
                    <>
                      <h6 className="fw-bold">Compte & rôle</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-3">
                          <strong>Rôle</strong>
                          <div>{details.role_libelle || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Login</strong>
                          <div>{details.login || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Email</strong>
                          <div>{details.email || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Informations personnelles</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-3">
                          <strong>Nom</strong>
                          <div>{details.nom || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Prénom(s)</strong>
                          <div>{details.prenom || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Sexe</strong>
                          <div>{details.sexe || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Date de naissance</strong>
                          <div>{details.date_naissance || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Lieu de naissance</strong>
                          <div>{details.lieu_naissance || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Nationalité</strong>
                          <div>{details.nationalite || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Situation matrimoniale</strong>
                          <div>{details.situation_matrimoniale || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Nb d’enfants</strong>
                          <div>{details.nb_enfants || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>CNI / Passeport</strong>
                          <div>{details.cni_passeport || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Coordonnées</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-6">
                          <strong>Adresse</strong>
                          <div>{details.adresse || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Téléphone</strong>
                          <div>{details.telephone || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Email perso</strong>
                          <div>{details.emailPerso || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Poste visé</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-3">
                          <strong>Intitulé</strong>
                          <div>{details.intitule_poste || "—"}</div>
                        </div>
                        <div className="col-md-6">
                          <strong>Département / Service</strong>
                          <div>{(details.departements_services || []).join(", ") || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Type de contrat</strong>
                          <div>{details.type_contrat || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Disponibilité</strong>
                          <div>{details.disponibilite || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Date dispo.</strong>
                          <div>{details.dispo_date || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Profil professionnel</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-4">
                          <strong>Dernier poste</strong>
                          <div>{details.dernier_poste || "—"}</div>
                        </div>
                        <div className="col-md-8">
                          <strong>Fonctions exercées</strong>
                          <div>{(details.fonctions_exercees || []).join(", ") || "—"}</div>
                        </div>
                        <div className="col-md-4">
                          <strong>Expérience</strong>
                          <div>{details.experience || "—"}</div>
                        </div>
                        <div className="col-md-4">
                          <strong>Niveau de responsabilité</strong>
                          <div>{details.niveau_responsabilite || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Formation / Diplômes</h6>
                      <hr className="mt-1" />
                      <div className="small">
                        {Array.isArray(details.diplomes) && details.diplomes.length ? (
                          <ul className="mb-2">
                            {details.diplomes.map((d: any, i: number) => (
                              <li key={i}>
                                <b>{d.intitule}</b> — {d.niveau || "—"} — {d.annee || "—"} —{" "}
                                {d.etablissement || "—"}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div className="row small">
                        <div className="col-md-6">
                          <strong>Certifications</strong>
                          <div>{(details.certifications || []).join(", ") || "—"}</div>
                        </div>
                        <div className="col-md-6">
                          <strong>Formations/stages</strong>
                          <div>{(details.formations || []).join(", ") || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Compétences & Langues</h6>
                      <hr className="mt-1" />
                      <div className="row small">
                        <div className="col-md-6">
                          <strong>Compétences</strong>
                          <div>{(details.competences || []).join(", ") || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Langues</strong>
                          <div>{(details.langues || []).join(", ") || "—"}</div>
                        </div>
                        <div className="col-md-3">
                          <strong>Permis</strong>
                          <div>{details.permis || "—"}</div>
                        </div>
                      </div>

                      <h6 className="fw-bold mt-3">Références</h6>
                      <hr className="mt-1" />
                      <div className="small">
                        {(details.references || []).length ? (
                          <ul className="mb-2">
                            {details.references.map((r: string, i: number) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </div>

                      <h6 className="fw-bold mt-3">Documents & RIB</h6>
                      <hr className="mt-1" />
                      <div className="small">
                        <div>
                          Lettre de motivation :{" "}
                          {details.documents?.lettre_motivation ? (
                            <a href={details.documents.lettre_motivation} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div>
                          CV :{" "}
                          {details.documents?.cv ? (
                            <a href={details.documents.cv} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div>
                          Pièce d’identité :{" "}
                          {details.documents?.piece_identite ? (
                            <a href={details.documents.piece_identite} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div>
                          Diplômes :{" "}
                          {details.documents?.diplomes ? (
                            <a href={details.documents.diplomes} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div>
                          Attestations :{" "}
                          {details.documents?.attestations ? (
                            <a href={details.documents.attestations} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                        <div>
                          RIB :{" "}
                          {details.documents?.rib ? (
                            <a href={details.documents.rib} target="_blank" rel="noreferrer">
                              Ouvrir
                            </a>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="modal-footer">
                  {details?.docId && (
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setEditDocId(details.docId);
                        setDetailsOpen(false);
                      }}
                    >
                      <i className="bi bi-pencil me-1" />
                      Modifier
                    </button>
                  )}
                  <button className="btn btn-outline-secondary" onClick={() => setDetailsOpen(false)}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setDetailsOpen(false)} />
        </>
        </ModalPortal>
      )}

      {/* Supprimer — modale DANGER */}
      {deleteDocId && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display: "block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-danger">
                <div className="modal-header bg-danger text-white">
                  <h5 className="modal-title">
                    <i className="bi bi-exclamation-triangle me-2" />
                    Confirmer la suppression
                  </h5>
                  <button className="btn-close btn-close-white" onClick={() => setDeleteDocId(null)} />
                </div>
                <div className="modal-body">
                  Cette action est <strong>irréversible</strong>. Voulez-vous vraiment supprimer ce personnel ?
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setDeleteDocId(null)}>
                    Annuler
                  </button>
                  <button className="btn btn-danger" onClick={doDelete}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setDeleteDocId(null)} />
        </>
        </ModalPortal>
      )}
       <style jsx global>{`
        .modal-backdrop { z-index: 1990 !important; }
        .modal          { z-index: 2000 !important; }
      `}</style>
    </div>
  );
}

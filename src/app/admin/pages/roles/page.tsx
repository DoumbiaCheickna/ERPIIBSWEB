//src/app/admin/pages/roles/page.tsx
'use client';

import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
  limit as fbLimit,
  startAfter,
  where,
  getCountFromServer,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Toast from '../../components/ui/Toast';

interface Role {
  id: number;
  libelle: string;
  docId?: string; // Firestore document ID
  role_key?: string; // clé normalisée (anti-dup + recherche)
}

const PAGE_SIZE = 5;

/* ------------------------- Utils: normalisation ------------------------- */
function normalizeLabel(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire accents
    .replace(/[^a-z0-9]+/g, ' ') // ponctuation -> espace
    .trim()
    .replace(/\s+/g, ' '); // espaces multiples -> simple
}

/* ------------------------------ Composant ------------------------------- */
export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [libelle, setLibelle] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [showError, setShowError] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Edition
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editLibelle, setEditLibelle] = useState<string>('');

  // Suppression (modal)
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

  // Pagination (mode normal / Firestore)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasNext, setHasNext] = useState<boolean>(false);
  const [loadingPage, setLoadingPage] = useState<boolean>(false);
  // pageCursors[i] = last doc de la page i (index 1-based; pageCursors[1] = null pour page 1)
  const pageCursors = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null, null]);

  // Recherche
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedTerm, setDebouncedTerm] = useState<string>('');
  const [allRolesCache, setAllRolesCache] = useState<Role[] | null>(null);
  const [loadingSearchCache, setLoadingSearchCache] = useState<boolean>(false);
  const [searchPage, setSearchPage] = useState<number>(1);

  const isSearchMode = debouncedTerm.length > 0;

  const showSuccessToast = (msg: string) => {
    setToastMessage(msg);
    setShowSuccess(true);
  };
  const showErrorToast = (msg: string) => {
    setToastMessage(msg);
    setShowError(true);
  };

  /* ----------------------------- Debounce input ----------------------------- */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(normalizeLabel(searchTerm)), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  /* --------------------------- Chargement page (FS) -------------------------- */
  const loadPage = async (pageNumber: number) => {
    setLoadingPage(true);
    try {
      const cursor = pageCursors.current[pageNumber] ?? null;

      let qFS = query(collection(db, 'roles'), orderBy('libelle'), fbLimit(PAGE_SIZE));
      if (cursor) {
        qFS = query(collection(db, 'roles'), orderBy('libelle'), startAfter(cursor), fbLimit(PAGE_SIZE));
      }

      const snap = await getDocs(qFS);
      const list: Role[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const rawId = data.id;
        const idNum = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10) || 0;
        return {
          id: idNum,
          libelle: String(data.libelle ?? ''),
          docId: d.id,
          role_key: data.role_key ?? undefined,
        };
      });

      pageCursors.current[pageNumber + 1] = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

      setRoles(list);
      setCurrentPage(pageNumber);
      setHasNext(snap.size === PAGE_SIZE);
    } catch (e) {
      console.error('Error loading roles page:', e);
      showErrorToast('Erreur lors du chargement des rôles.');
    } finally {
      setLoadingPage(false);
      setLoading(false);
    }
  };

  const loadFirstPageWithCount = async () => {
    setLoading(true);
    try {
      const countSnap = await getCountFromServer(collection(db, 'roles'));
      setTotalCount(Number(countSnap.data().count) || 0);
      pageCursors.current = [null, null];
      await loadPage(1);
    } catch (e) {
      console.error('Error counting roles:', e);
      showErrorToast('Erreur lors du chargement du total des rôles.');
      setLoading(false);
    }
  };

  const nextPage = async () => {
    if (!hasNext) return;
    await loadPage(currentPage + 1);
  };

  const prevPage = async () => {
    if (currentPage <= 1) return;
    await loadPage(currentPage - 1);
  };

  /* ----------------------------- Anti-duplication --------------------------- */
  const checkDuplicateLabel = async (label: string, excludeDocId?: string) => {
    const key = normalizeLabel(label);
    const qKey = query(collection(db, 'roles'), where('role_key', '==', key));
    const snapKey = await getDocs(qKey);
    const duplicateByKey = snapKey.docs.some((d) => d.id !== excludeDocId);
    if (duplicateByKey) return true;

    const scan = await getDocs(collection(db, 'roles'));
    const isDup = scan.docs.some((d) => {
      const data = d.data() as any;
      if (d.id === excludeDocId) return false;
      return normalizeLabel(String(data.libelle ?? '')) === key;
    });
    return isDup;
  };

  /* ------------------------------- CRUD Rôles ------------------------------- */
  const addRole = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const lib = libelle.trim();
    if (!lib) {
      showErrorToast('Veuillez saisir un libellé.');
      return;
    }

    try {
      const isDup = await checkDuplicateLabel(lib);
      if (isDup) {
        showErrorToast('Ce rôle existe déjà (libellé similaire).');
        return;
      }

      const qLast = query(collection(db, 'roles'), orderBy('id', 'desc'), fbLimit(1));
      const lastSnap = await getDocs(qLast);
      const nextId =
        lastSnap.empty
          ? 1
          : ((typeof lastSnap.docs[0].data().id === 'number'
              ? lastSnap.docs[0].data().id
              : parseInt(String(lastSnap.docs[0].data().id), 10) || 0) + 1);

      await addDoc(collection(db, 'roles'), {
        id: nextId,
        libelle: lib,
        role_key: normalizeLabel(lib),
      });

      showSuccessToast('Rôle ajouté avec succès !');
      setLibelle('');
      await loadFirstPageWithCount();

      if (debouncedTerm) {
        await loadAllRolesCache();
      }
    } catch (error) {
      console.error('Error adding role:', error);
      showErrorToast("Erreur lors de l'ajout du rôle.");
    }
  };

  const startEdit = (role: Role) => {
    setEditingRole(role);
    setEditLibelle(role.libelle);
  };

  const cancelEdit = () => {
    setEditingRole(null);
    setEditLibelle('');
  };

  const saveEdit = async () => {
    if (!editingRole || !editingRole.docId) {
      showErrorToast('Erreur lors de la modification.');
      return;
    }

    const lib = editLibelle.trim();
    if (!lib) {
      showErrorToast('Veuillez saisir un libellé.');
      return;
    }

    try {
      const isDup = await checkDuplicateLabel(lib, editingRole.docId);
      if (isDup) {
        showErrorToast('Ce rôle existe déjà (libellé similaire).');
        return;
      }

      await updateDoc(doc(db, 'roles', editingRole.docId), {
        libelle: lib,
        role_key: normalizeLabel(lib),
      });

      showSuccessToast('Rôle modifié avec succès !');
      setEditingRole(null);
      setEditLibelle('');

      await loadFirstPageWithCount();
      if (debouncedTerm) {
        await loadAllRolesCache();
      }
    } catch (error) {
      console.error('Error updating role:', error);
      showErrorToast('Erreur lors de la modification du rôle.');
    }
  };

  const askDelete = (role: Role) => {
    setRoleToDelete(role);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!roleToDelete?.docId) {
      setShowDeleteModal(false);
      return;
    }
    try {
      await deleteDoc(doc(db, 'roles', roleToDelete.docId));
      showSuccessToast('Rôle supprimé avec succès !');
      setShowDeleteModal(false);
      setRoleToDelete(null);

      const newTotal = Math.max(0, totalCount - 1);
      setTotalCount(newTotal);
      const totalPages = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
      const targetPage = Math.min(currentPage, totalPages);
      if (targetPage === 1) {
        pageCursors.current = [null, null];
      }
      await loadPage(targetPage);

      if (debouncedTerm) {
        await loadAllRolesCache();
      }
    } catch (error) {
      console.error('Error deleting role:', error);
      showErrorToast('Erreur lors de la suppression du rôle.');
      setShowDeleteModal(false);
      setRoleToDelete(null);
    }
  };

  /* --------------------------- Chargement initial --------------------------- */
  useEffect(() => {
    loadFirstPageWithCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------- Cache pour recherche ------------------------- */
  const loadAllRolesCache = async () => {
    setLoadingSearchCache(true);
    try {
      const snap = await getDocs(query(collection(db, 'roles'), orderBy('libelle')));
      const list: Role[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const rawId = d.data().id;
        const idNum = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10) || 0;
        return {
          id: idNum,
          libelle: String(data.libelle ?? ''),
          docId: d.id,
          role_key: data.role_key ?? normalizeLabel(String(data.libelle ?? '')),
        };
      });
      setAllRolesCache(list);
    } catch (e) {
      console.error('Error loading roles cache:', e);
      showErrorToast('Erreur lors du chargement pour la recherche.');
    } finally {
      setLoadingSearchCache(false);
    }
  };

  useEffect(() => {
    if (debouncedTerm && !allRolesCache && !loadingSearchCache) {
      loadAllRolesCache();
    }
    if (debouncedTerm) setSearchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTerm]);

  /* --------------------------- Filtrage (recherche) ------------------------- */
  const filteredSearchResults = useMemo(() => {
    if (!isSearchMode || !allRolesCache) return [];
    const needle = debouncedTerm;
    return allRolesCache.filter((r) => {
      const key = r.role_key || normalizeLabel(r.libelle || '');
      return key.includes(needle);
    });
  }, [isSearchMode, debouncedTerm, allRolesCache]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const searchTotal = filteredSearchResults.length;
  const searchTotalPages = Math.max(1, Math.ceil(searchTotal / PAGE_SIZE));

  const visibleRows: Role[] = useMemo(() => {
    if (!isSearchMode) return roles;
    const start = (searchPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredSearchResults.slice(start, end);
  }, [isSearchMode, roles, filteredSearchResults, searchPage]);

  const prevSearchPage = () => setSearchPage((p) => Math.max(1, p - 1));
  const nextSearchPage = () => setSearchPage((p) => Math.min(searchTotalPages, p + 1));

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="container-fluid px-4 py-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold text-dark mb-1">Gestion des Rôles</h2>
          <p className="text-muted mb-0">Gérez les rôles et permissions utilisateurs</p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          {!isSearchMode ? (
            <div className="badge bg-primary fs-6 px-3 py-2">
              {totalCount} rôle{totalCount > 1 ? 's' : ''}
            </div>
          ) : (
            <div className="badge bg-info fs-6 px-3 py-2">
              {searchTotal} résultat{searchTotal > 1 ? 's' : ''} (sur {totalCount})
            </div>
          )}
        </div>
      </div>

      <div className="row g-4">
        {/* Add Role Card */}
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-0 py-3">
              <h5 className="card-title mb-0 fw-semibold">
                <i className="bi bi-plus-circle me-2 text-primary"></i>
                Ajouter un nouveau rôle
              </h5>
            </div>
            <div className="card-body">
              <form onSubmit={addRole}>
                <div className="row g-3 align-items-end">
                  <div className="col-md-6">
                    <label htmlFor="libelle" className="form-label fw-medium text-dark">
                      Libellé du rôle
                    </label>
                    <input
                      type="text"
                      id="libelle"
                      className="form-control form-control-lg border-0 bg-light"
                      placeholder="Ex: Administrateur, Professeur, Directeur des études…"
                      value={libelle}
                      onChange={(e) => setLibelle(e.target.value)}
                      required
                      style={{ borderRadius: '10px' }}
                    />
                  </div>

                  <div className="col-md-4">
                    <button
                      className="btn btn-primary btn-lg w-100 fw-semibold"
                      type="submit"
                      style={{ borderRadius: '10px' }}
                      disabled={loadingPage}
                    >
                      <i className="bi bi-plus-lg me-2"></i>
                      Ajouter
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Roles List Card */}
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white border-0 py-3">
              {/* Titre + stats */}
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h5 className="card-title mb-0 fw-semibold">
                  <i className="bi bi-list-ul me-2 text-primary"></i>
                  {isSearchMode ? 'Résultats de la recherche' : 'Liste des rôles'}
                </h5>
                <span className="badge bg-light text-dark px-3 py-2">
                  {!isSearchMode
                    ? <>Page {currentPage}/{Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} — {roles.length} élément(s)</>
                    : <>Page {searchPage}/{searchTotalPages} — {visibleRows.length} élément(s)</>}
                </span>
              </div>

              {/* --- Champ de recherche joli, placé APRÈS le titre --- */}
              <div className="mt-3 position-relative">
                {/* Icône à gauche, intégrée */}
                <i className="bi bi-search position-absolute top-50 translate-middle-y ms-3" aria-hidden="true" />
                <input
                  id="search"
                  type="text"
                  className="form-control form-control-lg bg-light border-0 shadow-sm rounded-pill ps-5 pe-5"
                  placeholder="Rechercher un rôle (ex. directeur)…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    transition: 'box-shadow .2s ease, transform .05s ease',
                  }}
                  onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 .25rem rgba(13,110,253,.15)')}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = 'var(--bs-box-shadow-sm)')}
                />
                {/* Bouton Effacer à droite, discret */}
                {searchTerm && (
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-muted position-absolute top-50 end-0 translate-middle-y me-3"
                    onClick={() => setSearchTerm('')}
                    title="Effacer"
                    aria-label="Effacer la recherche"
                    style={{ textDecoration: 'none' }}
                  >
                    <i className="bi bi-x-circle"></i>
                  </button>
                )}
                {isSearchMode && loadingSearchCache && (
                  <small className="text-muted d-block mt-2">Préparation des résultats…</small>
                )}
              </div>
            </div>

            {loading ? (
              <div className="card-body text-center py-5">
                <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
                  <span className="visually-hidden">Chargement...</span>
                </div>
                <p className="text-muted mb-0">Chargement des rôles...</p>
              </div>
            ) : (
              <div className="card-body p-0">
                {visibleRows.length > 0 ? (
                  <>
                    <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th className="border-0 fw-semibold text-dark" style={{ width: '100px' }}>
                              <i className="bi bi-hash me-1"></i>ID
                            </th>
                            <th className="border-0 fw-semibold text-dark">
                              <i className="bi bi-tag me-1"></i>Libellé
                            </th>
                            <th className="border-0 fw-semibold text-dark" style={{ width: '120px' }}>
                              <i className="bi bi-calendar me-1"></i>Statut
                            </th>
                            <th className="border-0 fw-semibold text-dark" style={{ width: '180px' }}>
                              <i className="bi bi-gear me-1"></i>Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((role) => (
                            <tr key={role.docId ?? `${role.id}`}>
                              <td className="align-middle">
                                <span
                                  className="badge bg-gradient"
                                  style={{
                                    background: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    color: 'black',
                                  }}
                                >
                                  #{String(role.id ?? 0).padStart(3, '0')}
                                </span>
                              </td>
                              <td className="align-middle">
                                {editingRole?.docId === role.docId ? (
                                  <div className="d-flex align-items-center">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm me-2"
                                      value={editLibelle}
                                      onChange={(e) => setEditLibelle(e.target.value)}
                                      style={{ borderRadius: '6px' }}
                                    />
                                  </div>
                                ) : (
                                  <div className="d-flex align-items-center">
                                    <div
                                      className="rounded-circle me-3 d-flex align-items-center justify-content-center"
                                      style={{
                                        width: '40px',
                                        height: '40px',
                                        background: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                      }}
                                    >
                                      {(role.libelle || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <span className="fw-medium text-dark">{role.libelle}</span>
                                      <div className="small text-muted">Rôle système</div>
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="align-middle">
                                <span className="badge bg-success-subtle text-success border border-success-subtle px-3 py-2">
                                  <i className="bi bi-check-circle me-1"></i>
                                  Actif
                                </span>
                              </td>
                              <td className="align-middle">
                                {editingRole?.docId === role.docId ? (
                                  <div className="btn-group" role="group">
                                    <button className="btn btn-success btn-sm" onClick={saveEdit} title="Sauvegarder">
                                      <i className="bi bi-check-lg" /> Sauvegarder
                                    </button>
                                    <button className="btn btn-secondary btn-sm" onClick={cancelEdit} title="Annuler">
                                      <i className="bi bi-x-lg" /> Annuler
                                    </button>
                                  </div>
                                ) : (
                                  <div className="btn-group" role="group">
                                    <button
                                      className="btn btn-outline-primary btn-sm"
                                      onClick={() => startEdit(role)}
                                      title="Modifier"
                                    >
                                      <i className="bi bi-pencil" /> Modifier
                                    </button>
                                    <button
                                      className="btn btn-outline-danger btn-sm"
                                      onClick={() => askDelete(role)}
                                      title="Supprimer"
                                    >
                                      <i className="bi bi-trash" /> Supprimer
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {!isSearchMode ? (
                      <div className="d-flex justify-content-between align-items-center px-3 py-3">
                        <button className="btn btn-light" onClick={prevPage} disabled={currentPage <= 1 || loadingPage}>
                          <i className="bi bi-chevron-left me-1" />
                          Précédent
                        </button>
                        <div className="text-muted small">
                          Page <strong>{currentPage}</strong> / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
                        </div>
                        <button className="btn btn-light" onClick={nextPage} disabled={!hasNext || loadingPage}>
                          Suivant <i className="bi bi-chevron-right ms-1" />
                        </button>
                      </div>
                    ) : (
                      <div className="d-flex justify-content-between align-items-center px-3 py-3">
                        <button className="btn btn-light" onClick={prevSearchPage} disabled={searchPage <= 1}>
                          <i className="bi bi-chevron-left me-1" />
                          Précédent
                        </button>
                        <div className="text-muted small">
                          Page <strong>{searchPage}</strong> / {searchTotalPages}
                        </div>
                        <button className="btn btn-light" onClick={nextSearchPage} disabled={searchPage >= searchTotalPages}>
                          Suivant <i className="bi bi-chevron-right ms-1" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-5">
                    <div className="mb-4">
                      <i className="bi bi-folder2-open text-muted" style={{ fontSize: '4rem' }}></i>
                    </div>
                    <h6 className="text-muted fw-medium">
                      {isSearchMode ? 'Aucun rôle ne correspond à votre recherche' : 'Aucun rôle trouvé'}
                    </h6>
                    {!isSearchMode && (
                      <>
                        <p className="text-muted mb-4">Commencez par ajouter votre premier rôle</p>
                        <div className="d-flex justify-content-center">
                          <div className="bg-light rounded-3 px-4 py-2">
                            <small className="text-muted">
                              <i className="bi bi-lightbulb me-1"></i>
                              Utilisez le formulaire ci-dessus pour créer un nouveau rôle
                            </small>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de suppression */}
      {showDeleteModal && roleToDelete && (
        <>
          <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="bi bi-exclamation-triangle me-2 text-danger" />
                    Confirmer la suppression
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowDeleteModal(false)} />
                </div>
                <div className="modal-body">
                  <p>
                    Voulez-vous vraiment supprimer le rôle <strong>{roleToDelete.libelle}</strong> ?
                  </p>
                  <p className="text-muted small mb-0">Cette action est irréversible.</p>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setShowDeleteModal(false)}>
                    Annuler
                  </button>
                  <button className="btn btn-danger" onClick={confirmDelete}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowDeleteModal(false)} />
        </>
      )}

      {/* Toasts */}
      <Toast
        message={toastMessage}
        type="success"
        show={showSuccess}
        onClose={() => setShowSuccess(false)}
      />
      <Toast
        message={toastMessage}
        type="error"
        show={showError}
        onClose={() => setShowError(false)}
      />
    </div>
  );
}

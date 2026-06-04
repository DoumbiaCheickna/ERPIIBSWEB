// //src/app/admin/pages/roles/page.tsx
// 'use client';

// import {
//   collection,
//   getDocs,
//   addDoc,
//   query,
//   orderBy,
//   doc,
//   deleteDoc,
//   updateDoc,
//   limit as fbLimit,
//   startAfter,
//   where,
//   getCountFromServer,
//   QueryDocumentSnapshot,
//   DocumentData,
// } from 'firebase/firestore';
// import { db } from '../../../../../firebaseConfig';
// import React, { useEffect, useMemo, useRef, useState } from 'react';
// import Toast from '../../components/ui/Toast';

// interface Role {
//   id: number;
//   libelle: string;
//   docId?: string; // Firestore document ID
//   role_key?: string; // clé normalisée (anti-dup + recherche)
// }

// const PAGE_SIZE = 5;

// /* ------------------------- Utils: normalisation ------------------------- */
// function normalizeLabel(s: string) {
//   return s
//     .toLowerCase()
//     .normalize('NFD')
//     .replace(/[\u0300-\u036f]/g, '') // retire accents
//     .replace(/[^a-z0-9]+/g, ' ') // ponctuation -> espace
//     .trim()
//     .replace(/\s+/g, ' '); // espaces multiples -> simple
// }

// /* ------------------------------ Composant ------------------------------- */
// export default function RolesPage() {
//   const [roles, setRoles] = useState<Role[]>([]);
//   const [libelle, setLibelle] = useState<string>('');
//   const [loading, setLoading] = useState<boolean>(true);
//   const [showSuccess, setShowSuccess] = useState<boolean>(false);
//   const [showError, setShowError] = useState<boolean>(false);
//   const [toastMessage, setToastMessage] = useState<string>('');

//   // Edition
//   const [editingRole, setEditingRole] = useState<Role | null>(null);
//   const [editLibelle, setEditLibelle] = useState<string>('');

//   // Suppression (modal)
//   const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
//   const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

//   // Pagination (mode normal / Firestore)
//   const [currentPage, setCurrentPage] = useState<number>(1);
//   const [totalCount, setTotalCount] = useState<number>(0);
//   const [hasNext, setHasNext] = useState<boolean>(false);
//   const [loadingPage, setLoadingPage] = useState<boolean>(false);
//   // pageCursors[i] = last doc de la page i (index 1-based; pageCursors[1] = null pour page 1)
//   const pageCursors = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null, null]);

//   // Recherche
//   const [searchTerm, setSearchTerm] = useState<string>('');
//   const [debouncedTerm, setDebouncedTerm] = useState<string>('');
//   const [allRolesCache, setAllRolesCache] = useState<Role[] | null>(null);
//   const [loadingSearchCache, setLoadingSearchCache] = useState<boolean>(false);
//   const [searchPage, setSearchPage] = useState<number>(1);

//   const isSearchMode = debouncedTerm.length > 0;

//   const showSuccessToast = (msg: string) => {
//     setToastMessage(msg);
//     setShowSuccess(true);
//   };
//   const showErrorToast = (msg: string) => {
//     setToastMessage(msg);
//     setShowError(true);
//   };

//   /* ----------------------------- Debounce input ----------------------------- */
//   useEffect(() => {
//     const t = setTimeout(() => setDebouncedTerm(normalizeLabel(searchTerm)), 250);
//     return () => clearTimeout(t);
//   }, [searchTerm]);

//   /* --------------------------- Chargement page (FS) -------------------------- */
//   const loadPage = async (pageNumber: number) => {
//     setLoadingPage(true);
//     try {
//       const cursor = pageCursors.current[pageNumber] ?? null;

//       let qFS = query(collection(db, 'roles'), orderBy('libelle'), fbLimit(PAGE_SIZE));
//       if (cursor) {
//         qFS = query(collection(db, 'roles'), orderBy('libelle'), startAfter(cursor), fbLimit(PAGE_SIZE));
//       }

//       const snap = await getDocs(qFS);
//       const list: Role[] = snap.docs.map((d) => {
//         const data = d.data() as any;
//         const rawId = data.id;
//         const idNum = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10) || 0;
//         return {
//           id: idNum,
//           libelle: String(data.libelle ?? ''),
//           docId: d.id,
//           role_key: data.role_key ?? undefined,
//         };
//       });

//       pageCursors.current[pageNumber + 1] = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;

//       setRoles(list);
//       setCurrentPage(pageNumber);
//       setHasNext(snap.size === PAGE_SIZE);
//     } catch (e) {
//       console.error('Error loading roles page:', e);
//       showErrorToast('Erreur lors du chargement des rôles.');
//     } finally {
//       setLoadingPage(false);
//       setLoading(false);
//     }
//   };

//   const loadFirstPageWithCount = async () => {
//     setLoading(true);
//     try {
//       const countSnap = await getCountFromServer(collection(db, 'roles'));
//       setTotalCount(Number(countSnap.data().count) || 0);
//       pageCursors.current = [null, null];
//       await loadPage(1);
//     } catch (e) {
//       console.error('Error counting roles:', e);
//       showErrorToast('Erreur lors du chargement du total des rôles.');
//       setLoading(false);
//     }
//   };

//   const nextPage = async () => {
//     if (!hasNext) return;
//     await loadPage(currentPage + 1);
//   };

//   const prevPage = async () => {
//     if (currentPage <= 1) return;
//     await loadPage(currentPage - 1);
//   };

//   /* ----------------------------- Anti-duplication --------------------------- */
//   const checkDuplicateLabel = async (label: string, excludeDocId?: string) => {
//     const key = normalizeLabel(label);
//     const qKey = query(collection(db, 'roles'), where('role_key', '==', key));
//     const snapKey = await getDocs(qKey);
//     const duplicateByKey = snapKey.docs.some((d) => d.id !== excludeDocId);
//     if (duplicateByKey) return true;

//     const scan = await getDocs(collection(db, 'roles'));
//     const isDup = scan.docs.some((d) => {
//       const data = d.data() as any;
//       if (d.id === excludeDocId) return false;
//       return normalizeLabel(String(data.libelle ?? '')) === key;
//     });
//     return isDup;
//   };

//   /* ------------------------------- CRUD Rôles ------------------------------- */
//   const addRole = async (e: React.FormEvent<HTMLFormElement>) => {
//     e.preventDefault();

//     const lib = libelle.trim();
//     if (!lib) {
//       showErrorToast('Veuillez saisir un libellé.');
//       return;
//     }

//     try {
//       const isDup = await checkDuplicateLabel(lib);
//       if (isDup) {
//         showErrorToast('Ce rôle existe déjà (libellé similaire).');
//         return;
//       }

//       const qLast = query(collection(db, 'roles'), orderBy('id', 'desc'), fbLimit(1));
//       const lastSnap = await getDocs(qLast);
//       const nextId =
//         lastSnap.empty
//           ? 1
//           : ((typeof lastSnap.docs[0].data().id === 'number'
//               ? lastSnap.docs[0].data().id
//               : parseInt(String(lastSnap.docs[0].data().id), 10) || 0) + 1);

//       await addDoc(collection(db, 'roles'), {
//         id: nextId,
//         libelle: lib,
//         role_key: normalizeLabel(lib),
//       });

//       showSuccessToast('Rôle ajouté avec succès !');
//       setLibelle('');
//       await loadFirstPageWithCount();

//       if (debouncedTerm) {
//         await loadAllRolesCache();
//       }
//     } catch (error) {
//       console.error('Error adding role:', error);
//       showErrorToast("Erreur lors de l'ajout du rôle.");
//     }
//   };

//   const startEdit = (role: Role) => {
//     setEditingRole(role);
//     setEditLibelle(role.libelle);
//   };

//   const cancelEdit = () => {
//     setEditingRole(null);
//     setEditLibelle('');
//   };

//   const saveEdit = async () => {
//     if (!editingRole || !editingRole.docId) {
//       showErrorToast('Erreur lors de la modification.');
//       return;
//     }

//     const lib = editLibelle.trim();
//     if (!lib) {
//       showErrorToast('Veuillez saisir un libellé.');
//       return;
//     }

//     try {
//       const isDup = await checkDuplicateLabel(lib, editingRole.docId);
//       if (isDup) {
//         showErrorToast('Ce rôle existe déjà (libellé similaire).');
//         return;
//       }

//       await updateDoc(doc(db, 'roles', editingRole.docId), {
//         libelle: lib,
//         role_key: normalizeLabel(lib),
//       });

//       showSuccessToast('Rôle modifié avec succès !');
//       setEditingRole(null);
//       setEditLibelle('');

//       await loadFirstPageWithCount();
//       if (debouncedTerm) {
//         await loadAllRolesCache();
//       }
//     } catch (error) {
//       console.error('Error updating role:', error);
//       showErrorToast('Erreur lors de la modification du rôle.');
//     }
//   };

//   const askDelete = (role: Role) => {
//     setRoleToDelete(role);
//     setShowDeleteModal(true);
//   };

//   const confirmDelete = async () => {
//     if (!roleToDelete?.docId) {
//       setShowDeleteModal(false);
//       return;
//     }
//     try {
//       await deleteDoc(doc(db, 'roles', roleToDelete.docId));
//       showSuccessToast('Rôle supprimé avec succès !');
//       setShowDeleteModal(false);
//       setRoleToDelete(null);

//       const newTotal = Math.max(0, totalCount - 1);
//       setTotalCount(newTotal);
//       const totalPages = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
//       const targetPage = Math.min(currentPage, totalPages);
//       if (targetPage === 1) {
//         pageCursors.current = [null, null];
//       }
//       await loadPage(targetPage);

//       if (debouncedTerm) {
//         await loadAllRolesCache();
//       }
//     } catch (error) {
//       console.error('Error deleting role:', error);
//       showErrorToast('Erreur lors de la suppression du rôle.');
//       setShowDeleteModal(false);
//       setRoleToDelete(null);
//     }
//   };

//   /* --------------------------- Chargement initial --------------------------- */
//   useEffect(() => {
//     loadFirstPageWithCount();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   /* --------------------------- Cache pour recherche ------------------------- */
//   const loadAllRolesCache = async () => {
//     setLoadingSearchCache(true);
//     try {
//       const snap = await getDocs(query(collection(db, 'roles'), orderBy('libelle')));
//       const list: Role[] = snap.docs.map((d) => {
//         const data = d.data() as any;
//         const rawId = d.data().id;
//         const idNum = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10) || 0;
//         return {
//           id: idNum,
//           libelle: String(data.libelle ?? ''),
//           docId: d.id,
//           role_key: data.role_key ?? normalizeLabel(String(data.libelle ?? '')),
//         };
//       });
//       setAllRolesCache(list);
//     } catch (e) {
//       console.error('Error loading roles cache:', e);
//       showErrorToast('Erreur lors du chargement pour la recherche.');
//     } finally {
//       setLoadingSearchCache(false);
//     }
//   };

//   useEffect(() => {
//     if (debouncedTerm && !allRolesCache && !loadingSearchCache) {
//       loadAllRolesCache();
//     }
//     if (debouncedTerm) setSearchPage(1);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [debouncedTerm]);

//   /* --------------------------- Filtrage (recherche) ------------------------- */
//   const filteredSearchResults = useMemo(() => {
//     if (!isSearchMode || !allRolesCache) return [];
//     const needle = debouncedTerm;
//     return allRolesCache.filter((r) => {
//       const key = r.role_key || normalizeLabel(r.libelle || '');
//       return key.includes(needle);
//     });
//   }, [isSearchMode, debouncedTerm, allRolesCache]);

//   const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
//   const searchTotal = filteredSearchResults.length;
//   const searchTotalPages = Math.max(1, Math.ceil(searchTotal / PAGE_SIZE));

//   const visibleRows: Role[] = useMemo(() => {
//     if (!isSearchMode) return roles;
//     const start = (searchPage - 1) * PAGE_SIZE;
//     const end = start + PAGE_SIZE;
//     return filteredSearchResults.slice(start, end);
//   }, [isSearchMode, roles, filteredSearchResults, searchPage]);

//   const prevSearchPage = () => setSearchPage((p) => Math.max(1, p - 1));
//   const nextSearchPage = () => setSearchPage((p) => Math.min(searchTotalPages, p + 1));

//   /* ---------------------------------- UI ---------------------------------- */
//   return (
//     <div className="container-fluid px-4 py-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
//       {/* Header */}
//       <div className="d-flex justify-content-between align-items-center mb-4">
//         <div>
//           <h2 className="fw-bold text-dark mb-1">Gestion des Rôles</h2>
//           <p className="text-muted mb-0">Gérez les rôles et permissions utilisateurs</p>
//         </div>
//         <div className="d-flex gap-2 align-items-center">
//           {!isSearchMode ? (
//             <div className="badge bg-primary fs-6 px-3 py-2">
//               {totalCount} rôle{totalCount > 1 ? 's' : ''}
//             </div>
//           ) : (
//             <div className="badge bg-info fs-6 px-3 py-2">
//               {searchTotal} résultat{searchTotal > 1 ? 's' : ''} (sur {totalCount})
//             </div>
//           )}
//         </div>
//       </div>

//       <div className="row g-4">
//         {/* Add Role Card */}
//         <div className="col-12">
//           <div className="card border-0 shadow-sm">
//             <div className="card-header bg-white border-0 py-3">
//               <h5 className="card-title mb-0 fw-semibold">
//                 <i className="bi bi-plus-circle me-2 text-primary"></i>
//                 Ajouter un nouveau rôle
//               </h5>
//             </div>
//             <div className="card-body">
//               <form onSubmit={addRole}>
//                 <div className="row g-3 align-items-end">
//                   <div className="col-md-6">
//                     <label htmlFor="libelle" className="form-label fw-medium text-dark">
//                       Libellé du rôle
//                     </label>
//                     <input
//                       type="text"
//                       id="libelle"
//                       className="form-control form-control-lg border-0 bg-light"
//                       placeholder="Ex: Administrateur, Professeur, Directeur des études…"
//                       value={libelle}
//                       onChange={(e) => setLibelle(e.target.value)}
//                       required
//                       style={{ borderRadius: '10px' }}
//                     />
//                   </div>

//                   <div className="col-md-4">
//                     <button
//                       className="btn btn-primary btn-lg w-100 fw-semibold"
//                       type="submit"
//                       style={{ borderRadius: '10px' }}
//                       disabled={loadingPage}
//                     >
//                       <i className="bi bi-plus-lg me-2"></i>
//                       Ajouter
//                     </button>
//                   </div>
//                 </div>
//               </form>
//             </div>
//           </div>
//         </div>

//         {/* Roles List Card */}
//         <div className="col-12">
//           <div className="card border-0 shadow-sm">
//             <div className="card-header bg-white border-0 py-3">
//               {/* Titre + stats */}
//               <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
//                 <h5 className="card-title mb-0 fw-semibold">
//                   <i className="bi bi-list-ul me-2 text-primary"></i>
//                   {isSearchMode ? 'Résultats de la recherche' : 'Liste des rôles'}
//                 </h5>
//                 <span className="badge bg-light text-dark px-3 py-2">
//                   {!isSearchMode
//                     ? <>Page {currentPage}/{Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} — {roles.length} élément(s)</>
//                     : <>Page {searchPage}/{searchTotalPages} — {visibleRows.length} élément(s)</>}
//                 </span>
//               </div>

//               {/* --- Champ de recherche joli, placé APRÈS le titre --- */}
//               <div className="mt-3 position-relative">
//                 {/* Icône à gauche, intégrée */}
//                 <i className="bi bi-search position-absolute top-50 translate-middle-y ms-3" aria-hidden="true" />
//                 <input
//                   id="search"
//                   type="text"
//                   className="form-control form-control-lg bg-light border-0 shadow-sm rounded-pill ps-5 pe-5"
//                   placeholder="Rechercher un rôle (ex. directeur)…"
//                   value={searchTerm}
//                   onChange={(e) => setSearchTerm(e.target.value)}
//                   style={{
//                     transition: 'box-shadow .2s ease, transform .05s ease',
//                   }}
//                   onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 .25rem rgba(13,110,253,.15)')}
//                   onBlur={(e) => (e.currentTarget.style.boxShadow = 'var(--bs-box-shadow-sm)')}
//                 />
//                 {/* Bouton Effacer à droite, discret */}
//                 {searchTerm && (
//                   <button
//                     type="button"
//                     className="btn btn-sm btn-link text-muted position-absolute top-50 end-0 translate-middle-y me-3"
//                     onClick={() => setSearchTerm('')}
//                     title="Effacer"
//                     aria-label="Effacer la recherche"
//                     style={{ textDecoration: 'none' }}
//                   >
//                     <i className="bi bi-x-circle"></i>
//                   </button>
//                 )}
//                 {isSearchMode && loadingSearchCache && (
//                   <small className="text-muted d-block mt-2">Préparation des résultats…</small>
//                 )}
//               </div>
//             </div>

//             {loading ? (
//               <div className="card-body text-center py-5">
//                 <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
//                   <span className="visually-hidden">Chargement...</span>
//                 </div>
//                 <p className="text-muted mb-0">Chargement des rôles...</p>
//               </div>
//             ) : (
//               <div className="card-body p-0">
//                 {visibleRows.length > 0 ? (
//                   <>
//                     <div className="table-responsive">
//                       <table className="table table-hover mb-0">
//                         <thead className="table-light">
//                           <tr>
//                             <th className="border-0 fw-semibold text-dark" style={{ width: '100px' }}>
//                               <i className="bi bi-hash me-1"></i>ID
//                             </th>
//                             <th className="border-0 fw-semibold text-dark">
//                               <i className="bi bi-tag me-1"></i>Libellé
//                             </th>
//                             <th className="border-0 fw-semibold text-dark" style={{ width: '120px' }}>
//                               <i className="bi bi-calendar me-1"></i>Statut
//                             </th>
//                             <th className="border-0 fw-semibold text-dark" style={{ width: '180px' }}>
//                               <i className="bi bi-gear me-1"></i>Actions
//                             </th>
//                           </tr>
//                         </thead>
//                         <tbody>
//                           {visibleRows.map((role) => (
//                             <tr key={role.docId ?? `${role.id}`}>
//                               <td className="align-middle">
//                                 <span
//                                   className="badge bg-gradient"
//                                   style={{
//                                     background: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
//                                     padding: '8px 12px',
//                                     borderRadius: '8px',
//                                     fontSize: '12px',
//                                     fontWeight: '600',
//                                     color: 'black',
//                                   }}
//                                 >
//                                   #{String(role.id ?? 0).padStart(3, '0')}
//                                 </span>
//                               </td>
//                               <td className="align-middle">
//                                 {editingRole?.docId === role.docId ? (
//                                   <div className="d-flex align-items-center">
//                                     <input
//                                       type="text"
//                                       className="form-control form-control-sm me-2"
//                                       value={editLibelle}
//                                       onChange={(e) => setEditLibelle(e.target.value)}
//                                       style={{ borderRadius: '6px' }}
//                                     />
//                                   </div>
//                                 ) : (
//                                   <div className="d-flex align-items-center">
//                                     <div
//                                       className="rounded-circle me-3 d-flex align-items-center justify-content-center"
//                                       style={{
//                                         width: '40px',
//                                         height: '40px',
//                                         background: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
//                                         color: 'white',
//                                         fontSize: '14px',
//                                         fontWeight: '600',
//                                       }}
//                                     >
//                                       {(role.libelle || '?').charAt(0).toUpperCase()}
//                                     </div>
//                                     <div>
//                                       <span className="fw-medium text-dark">{role.libelle}</span>
//                                       <div className="small text-muted">Rôle système</div>
//                                     </div>
//                                   </div>
//                                 )}
//                               </td>
//                               <td className="align-middle">
//                                 <span className="badge bg-success-subtle text-success border border-success-subtle px-3 py-2">
//                                   <i className="bi bi-check-circle me-1"></i>
//                                   Actif
//                                 </span>
//                               </td>
//                               <td className="align-middle">
//                                 {editingRole?.docId === role.docId ? (
//                                   <div className="btn-group" role="group">
//                                     <button className="btn btn-success btn-sm" onClick={saveEdit} title="Sauvegarder">
//                                       <i className="bi bi-check-lg" /> Sauvegarder
//                                     </button>
//                                     <button className="btn btn-secondary btn-sm" onClick={cancelEdit} title="Annuler">
//                                       <i className="bi bi-x-lg" /> Annuler
//                                     </button>
//                                   </div>
//                                 ) : (
//                                   <div className="btn-group" role="group">
//                                     <button
//                                       className="btn btn-outline-primary btn-sm"
//                                       onClick={() => startEdit(role)}
//                                       title="Modifier"
//                                     >
//                                       <i className="bi bi-pencil" /> Modifier
//                                     </button>
//                                     <button
//                                       className="btn btn-outline-danger btn-sm"
//                                       onClick={() => askDelete(role)}
//                                       title="Supprimer"
//                                     >
//                                       <i className="bi bi-trash" /> Supprimer
//                                     </button>
//                                   </div>
//                                 )}
//                               </td>
//                             </tr>
//                           ))}
//                         </tbody>
//                       </table>
//                     </div>

//                     {/* Pagination */}
//                     {!isSearchMode ? (
//                       <div className="d-flex justify-content-between align-items-center px-3 py-3">
//                         <button className="btn btn-light" onClick={prevPage} disabled={currentPage <= 1 || loadingPage}>
//                           <i className="bi bi-chevron-left me-1" />
//                           Précédent
//                         </button>
//                         <div className="text-muted small">
//                           Page <strong>{currentPage}</strong> / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
//                         </div>
//                         <button className="btn btn-light" onClick={nextPage} disabled={!hasNext || loadingPage}>
//                           Suivant <i className="bi bi-chevron-right ms-1" />
//                         </button>
//                       </div>
//                     ) : (
//                       <div className="d-flex justify-content-between align-items-center px-3 py-3">
//                         <button className="btn btn-light" onClick={prevSearchPage} disabled={searchPage <= 1}>
//                           <i className="bi bi-chevron-left me-1" />
//                           Précédent
//                         </button>
//                         <div className="text-muted small">
//                           Page <strong>{searchPage}</strong> / {searchTotalPages}
//                         </div>
//                         <button className="btn btn-light" onClick={nextSearchPage} disabled={searchPage >= searchTotalPages}>
//                           Suivant <i className="bi bi-chevron-right ms-1" />
//                         </button>
//                       </div>
//                     )}
//                   </>
//                 ) : (
//                   <div className="text-center py-5">
//                     <div className="mb-4">
//                       <i className="bi bi-folder2-open text-muted" style={{ fontSize: '4rem' }}></i>
//                     </div>
//                     <h6 className="text-muted fw-medium">
//                       {isSearchMode ? 'Aucun rôle ne correspond à votre recherche' : 'Aucun rôle trouvé'}
//                     </h6>
//                     {!isSearchMode && (
//                       <>
//                         <p className="text-muted mb-4">Commencez par ajouter votre premier rôle</p>
//                         <div className="d-flex justify-content-center">
//                           <div className="bg-light rounded-3 px-4 py-2">
//                             <small className="text-muted">
//                               <i className="bi bi-lightbulb me-1"></i>
//                               Utilisez le formulaire ci-dessus pour créer un nouveau rôle
//                             </small>
//                           </div>
//                         </div>
//                       </>
//                     )}
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* Modal de suppression */}
//       {showDeleteModal && roleToDelete && (
//         <>
//           <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
//             <div className="modal-dialog modal-dialog-centered">
//               <div className="modal-content">
//                 <div className="modal-header">
//                   <h5 className="modal-title">
//                     <i className="bi bi-exclamation-triangle me-2 text-danger" />
//                     Confirmer la suppression
//                   </h5>
//                   <button type="button" className="btn-close" onClick={() => setShowDeleteModal(false)} />
//                 </div>
//                 <div className="modal-body">
//                   <p>
//                     Voulez-vous vraiment supprimer le rôle <strong>{roleToDelete.libelle}</strong> ?
//                   </p>
//                   <p className="text-muted small mb-0">Cette action est irréversible.</p>
//                 </div>
//                 <div className="modal-footer">
//                   <button className="btn btn-outline-secondary" onClick={() => setShowDeleteModal(false)}>
//                     Annuler
//                   </button>
//                   <button className="btn btn-danger" onClick={confirmDelete}>
//                     Supprimer
//                   </button>
//                 </div>
//               </div>
//             </div>
//           </div>
//           <div className="modal-backdrop fade show" onClick={() => setShowDeleteModal(false)} />
//         </>
//       )}

//       {/* Toasts */}
//       <Toast
//         message={toastMessage}
//         type="success"
//         show={showSuccess}
//         onClose={() => setShowSuccess(false)}
//       />
//       <Toast
//         message={toastMessage}
//         type="error"
//         show={showError}
//         onClose={() => setShowError(false)}
//       />
//     </div>
//   );
// }
// src/app/admin/pages/roles/page.tsx
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
  docId?: string;
  role_key?: string;
}

const PAGE_SIZE = 5;

function normalizeLabel(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [libelle, setLibelle] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [showError, setShowError] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editLibelle, setEditLibelle] = useState<string>('');

  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasNext, setHasNext] = useState<boolean>(false);
  const [loadingPage, setLoadingPage] = useState<boolean>(false);
  const pageCursors = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null, null]);

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(normalizeLabel(searchTerm)), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

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
      const nextId = lastSnap.empty
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
      if (debouncedTerm) await loadAllRolesCache();
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
      if (debouncedTerm) await loadAllRolesCache();
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
      if (targetPage === 1) pageCursors.current = [null, null];
      await loadPage(targetPage);
      if (debouncedTerm) await loadAllRolesCache();
    } catch (error) {
      console.error('Error deleting role:', error);
      showErrorToast('Erreur lors de la suppression du rôle.');
      setShowDeleteModal(false);
      setRoleToDelete(null);
    }
  };

  useEffect(() => {
    loadFirstPageWithCount();
  }, []);

  const loadAllRolesCache = async () => {
    setLoadingSearchCache(true);
    try {
      const snap = await getDocs(query(collection(db, 'roles'), orderBy('libelle')));
      const list: Role[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const rawId = data.id;
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
    if (debouncedTerm && !allRolesCache && !loadingSearchCache) loadAllRolesCache();
    if (debouncedTerm) setSearchPage(1);
  }, [debouncedTerm]);

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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      padding: '32px 24px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h1 style={{
            fontSize: 32,
            fontWeight: 800,
            color: 'white',
            marginBottom: 8,
            letterSpacing: -0.5
          }}>
            Gestion des rôles
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
            Gérez les rôles et permissions utilisateurs
          </p>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
          padding: '8px 20px',
          borderRadius: 40,
          border: '1px solid rgba(2, 157, 254, 0.3)'
        }}>
          <span style={{ color: '#029DFE', fontWeight: 700 }}>
            {isSearchMode ? `${searchTotal} résultat(s)` : `${totalCount} rôle(s)`}
          </span>
        </div>
      </div>

      <div className="row g-4">
        {/* Carte d'ajout */}
        <div className="col-12">
          <div style={{
            background: '#1e293b',
            borderRadius: 24,
            border: '1px solid rgba(2, 157, 254, 0.2)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <div style={{
                width: 40,
                height: 40,
                background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(2, 157, 254, 0.3)'
              }}>
                <i className="bi bi-plus-circle-fill" style={{ color: '#029DFE', fontSize: 20 }} />
              </div>
              <h5 style={{ fontWeight: 700, color: 'white', margin: 0 }}>Ajouter un nouveau rôle</h5>
            </div>
            <div style={{ padding: '24px' }}>
              <form onSubmit={addRole}>
                <div className="row g-3 align-items-end">
                  <div className="col-md-8">
                    <label style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#e2e8f0',
                      marginBottom: 8,
                      letterSpacing: 0.5
                    }}>
                      LIBELLÉ DU RÔLE
                    </label>
                    <input
                      type="text"
                      style={{
                        width: '100%',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 12,
                        padding: '12px 16px',
                        color: 'white',
                        fontSize: 14,
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => { e.target.style.borderColor = '#029DFE'; e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)'; }}
                      onBlur={(e) => { e.target.style.borderColor = '#334155'; e.target.style.boxShadow = 'none'; }}
                      placeholder="Ex: Administrateur, Professeur, Directeur des études…"
                      value={libelle}
                      onChange={(e) => setLibelle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-4">
                    <button
                      type="submit"
                      disabled={loadingPage}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, #029DFE 0%, #0284c7 100%)',
                        border: 'none',
                        borderRadius: 12,
                        padding: '12px',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: 14,
                        transition: 'all 0.3s ease',
                        cursor: loadingPage ? 'not-allowed' : 'pointer',
                        opacity: loadingPage ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!loadingPage) {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 8px 20px rgba(2,157,254,0.3)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <i className="bi bi-plus-lg me-2" /> Ajouter
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Liste des rôles */}
        <div className="col-12">
          <div style={{
            background: '#1e293b',
            borderRadius: 24,
            border: '1px solid rgba(2, 157, 254, 0.2)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <i className="bi bi-tags-fill" style={{ color: '#029DFE', fontSize: 20 }} />
                  <h5 style={{ fontWeight: 700, color: 'white', margin: 0 }}>
                    {isSearchMode ? 'Résultats de la recherche' : 'Liste des rôles'}
                  </h5>
                </div>
                <span style={{ background: '#0f172a', padding: '6px 12px', borderRadius: 20, fontSize: 12, color: '#94a3b8' }}>
                  {!isSearchMode
                    ? `Page ${currentPage}/${Math.max(1, Math.ceil(totalCount / PAGE_SIZE))} — ${roles.length} élément(s)`
                    : `Page ${searchPage}/${searchTotalPages} — ${visibleRows.length} élément(s)`}
                </span>
              </div>

              {/* Champ de recherche moderne */}
              <div style={{ position: 'relative' }}>
                <i className="bi bi-search" style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  zIndex: 1
                }} />
                <input
                  type="text"
                  placeholder="Rechercher un rôle (ex. directeur)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 40,
                    padding: '12px 16px 12px 48px',
                    color: 'white',
                    fontSize: 14,
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#029DFE';
                    e.target.style.boxShadow = '0 0 0 3px rgba(2,157,254,0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#334155';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    <i className="bi bi-x-circle-fill" />
                  </button>
                )}
              </div>
              {isSearchMode && loadingSearchCache && (
                <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                  <i className="bi bi-hourglass-split me-1" /> Préparation des résultats…
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div className="spinner-border" style={{ color: '#029DFE', width: 48, height: 48 }} />
                <p style={{ color: '#94a3b8', marginTop: 16 }}>Chargement des rôles...</p>
              </div>
            ) : (
              <div>
                {visibleRows.length > 0 ? (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#0f172a' }}>
                          <tr>
                            <th style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: 0.5, borderBottom: '1px solid #334155', width: '100px' }}>
                              <i className="bi bi-hash me-1" /> ID
                            </th>
                            <th style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: 0.5, borderBottom: '1px solid #334155' }}>
                              <i className="bi bi-tag me-1" /> Libellé
                            </th>
                            <th style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: 0.5, borderBottom: '1px solid #334155', width: '120px' }}>
                              <i className="bi bi-check-circle me-1" /> Statut
                            </th>
                            <th style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: 0.5, borderBottom: '1px solid #334155', width: '200px' }}>
                              <i className="bi bi-gear me-1" /> Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((role, idx) => (
                            <tr key={role.docId ?? `${role.id}`} style={{
                              borderBottom: idx === visibleRows.length - 1 ? 'none' : '1px solid #334155',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#0f172a'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ padding: '14px 16px' }}>
                                <span style={{
                                  background: 'linear-gradient(135deg, #029DFE 0%, #00d4ff 100%)',
                                  padding: '6px 12px',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: 'white'
                                }}>
                                  #{String(role.id ?? 0).padStart(3, '0')}
                                </span>
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                {editingRole?.docId === role.docId ? (
                                  <div className="d-flex align-items-center gap-2">
                                    <input
                                      type="text"
                                      style={{
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        borderRadius: 8,
                                        padding: '6px 12px',
                                        color: 'white',
                                        fontSize: 14
                                      }}
                                      value={editLibelle}
                                      onChange={(e) => setEditLibelle(e.target.value)}
                                    />
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                      width: 36,
                                      height: 36,
                                      background: 'linear-gradient(135deg, #029DFE 0%, #00d4ff 100%)',
                                      borderRadius: 10,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 14,
                                      fontWeight: 700,
                                      color: 'white'
                                    }}>
                                      {(role.libelle || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <div style={{ color: 'white', fontWeight: 500, fontSize: 14 }}>{role.libelle}</div>
                                      <div style={{ color: '#64748b', fontSize: 11 }}>Rôle système</div>
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <span style={{
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  color: '#10b981',
                                  padding: '4px 10px',
                                  borderRadius: 20,
                                  fontSize: 12,
                                  fontWeight: 500
                                }}>
                                  <i className="bi bi-check-circle-fill me-1" style={{ fontSize: 10 }} />
                                  Actif
                                </span>
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                {editingRole?.docId === role.docId ? (
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      onClick={saveEdit}
                                      style={{
                                        background: '#10b981',
                                        border: 'none',
                                        borderRadius: 8,
                                        padding: '6px 12px',
                                        color: 'white',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6
                                      }}
                                    >
                                      <i className="bi bi-check-lg" /> Sauvegarder
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      style={{
                                        background: '#334155',
                                        border: 'none',
                                        borderRadius: 8,
                                        padding: '6px 12px',
                                        color: '#cbd5e1',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6
                                      }}
                                    >
                                      <i className="bi bi-x-lg" /> Annuler
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      onClick={() => startEdit(role)}
                                      style={{
                                        background: 'rgba(2, 157, 254, 0.1)',
                                        border: '1px solid rgba(2, 157, 254, 0.3)',
                                        borderRadius: 8,
                                        padding: '6px 12px',
                                        color: '#029DFE',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#029DFE';
                                        e.currentTarget.style.color = 'white';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(2, 157, 254, 0.1)';
                                        e.currentTarget.style.color = '#029DFE';
                                      }}
                                    >
                                      <i className="bi bi-pencil me-1" /> Modifier
                                    </button>
                                    <button
                                      onClick={() => askDelete(role)}
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: 8,
                                        padding: '6px 12px',
                                        color: '#ef4444',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#ef4444';
                                        e.currentTarget.style.color = 'white';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                        e.currentTarget.style.color = '#ef4444';
                                      }}
                                    >
                                      <i className="bi bi-trash me-1" /> Supprimer
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                       </table>
                    </div>

                    {/* Pagination modernisée */}
                    {!isSearchMode ? (
                      <div style={{
                        padding: '16px 24px',
                        borderTop: '1px solid #334155',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12
                      }}>
                        <button
                          onClick={prevPage}
                          disabled={currentPage <= 1 || loadingPage}
                          style={{
                            background: currentPage <= 1 ? '#334155' : '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: 10,
                            padding: '8px 16px',
                            color: currentPage <= 1 ? '#64748b' : 'white',
                            cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (currentPage > 1) e.currentTarget.style.background = '#029DFE';
                          }}
                          onMouseLeave={(e) => {
                            if (currentPage > 1) e.currentTarget.style.background = '#0f172a';
                          }}
                        >
                          <i className="bi bi-chevron-left me-1" /> Précédent
                        </button>
                        <span style={{ color: '#94a3b8', fontSize: 13 }}>
                          Page <strong style={{ color: '#029DFE' }}>{currentPage}</strong> / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
                        </span>
                        <button
                          onClick={nextPage}
                          disabled={!hasNext || loadingPage}
                          style={{
                            background: !hasNext ? '#334155' : '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: 10,
                            padding: '8px 16px',
                            color: !hasNext ? '#64748b' : 'white',
                            cursor: !hasNext ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (hasNext) e.currentTarget.style.background = '#029DFE';
                          }}
                          onMouseLeave={(e) => {
                            if (hasNext) e.currentTarget.style.background = '#0f172a';
                          }}
                        >
                          Suivant <i className="bi bi-chevron-right ms-1" />
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        padding: '16px 24px',
                        borderTop: '1px solid #334155',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12
                      }}>
                        <button
                          onClick={prevSearchPage}
                          disabled={searchPage <= 1}
                          style={{
                            background: searchPage <= 1 ? '#334155' : '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: 10,
                            padding: '8px 16px',
                            color: searchPage <= 1 ? '#64748b' : 'white',
                            cursor: searchPage <= 1 ? 'not-allowed' : 'pointer',
                            fontSize: 13
                          }}
                        >
                          <i className="bi bi-chevron-left me-1" /> Précédent
                        </button>
                        <span style={{ color: '#94a3b8', fontSize: 13 }}>
                          Page <strong style={{ color: '#029DFE' }}>{searchPage}</strong> / {searchTotalPages}
                        </span>
                        <button
                          onClick={nextSearchPage}
                          disabled={searchPage >= searchTotalPages}
                          style={{
                            background: searchPage >= searchTotalPages ? '#334155' : '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: 10,
                            padding: '8px 16px',
                            color: searchPage >= searchTotalPages ? '#64748b' : 'white',
                            cursor: searchPage >= searchTotalPages ? 'not-allowed' : 'pointer',
                            fontSize: 13
                          }}
                        >
                          Suivant <i className="bi bi-chevron-right ms-1" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <i className="bi bi-folder2-open" style={{ color: '#334155', fontSize: 48 }} />
                    <h5 style={{ color: '#64748b', marginTop: 16 }}>
                      {isSearchMode ? 'Aucun rôle ne correspond à votre recherche' : 'Aucun rôle trouvé'}
                    </h5>
                    {!isSearchMode && (
                      <p style={{ color: '#94a3b8', marginTop: 8 }}>Commencez par ajouter votre premier rôle avec le formulaire ci-dessus</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de suppression modernisée */}
      {showDeleteModal && roleToDelete && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.7)' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content" style={{ background: '#1e293b', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20 }}>
                <div className="modal-header" style={{ borderBottomColor: '#334155', background: 'rgba(239,68,68,0.1)' }}>
                  <h5 className="modal-title" style={{ color: '#ef4444' }}>
                    <i className="bi bi-exclamation-triangle me-2" /> Confirmer la suppression
                  </h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowDeleteModal(false)} />
                </div>
                <div className="modal-body">
                  <p style={{ color: '#cbd5e1' }}>
                    Voulez-vous vraiment supprimer le rôle <strong style={{ color: '#029DFE' }}>{roleToDelete.libelle}</strong> ?
                  </p>
                  <p className="text-muted small mb-0" style={{ color: '#94a3b8' }}>Cette action est irréversible.</p>
                </div>
                <div className="modal-footer" style={{ borderTopColor: '#334155' }}>
                  <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)} style={{ background: '#334155', border: 'none' }}>
                    Annuler
                  </button>
                  <button className="btn btn-danger" onClick={confirmDelete} style={{ background: '#ef4444', border: 'none' }}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowDeleteModal(false)} />
        </>
      )}

      <Toast message={toastMessage} type="success" show={showSuccess} onClose={() => setShowSuccess(false)} />
      <Toast message={toastMessage} type="error" show={showError} onClose={() => setShowError(false)} />
    </div>
  );
}
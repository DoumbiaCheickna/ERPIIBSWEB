// //src/app/admin/pages/users/gestionUsers.tsx
// 'use client';

// import React, { useEffect, useMemo, useState } from 'react';
// import {
//   collection,
//   getDocs,
//   doc,
//   deleteDoc,
//   updateDoc,
//   setDoc,
// } from 'firebase/firestore';
// import { db } from '../../../../../firebaseConfig';
// import Toast from '../../components/ui/Toast';
// import StudentForm from './etudiantForm';
// import TeacherForm from './professeurForm';
// import AdminForm from './adminForm';
// import ResponsableFinancierForm from './respoFinancierForm';
// import DirectorForm from './directeurForm';
// import UserViewModal from './userModalView';

// interface User {
//   classe?: string;
//   id?: number;
//   email: string;
//   first_login: string;
//   login: string;
//   nom: string;
//   password?: string;
//   prenom: string;
//   role_id: string;
//   docId?: string; // = UID si tu as suivi la création avec Auth
//   specialty?: string;
//   intitule_poste?: string;
//   created_at?: { seconds: number; nanoseconds: number } | any;
//   // Beaucoup d'autres champs possibles selon le rôle (objets/arrays)
//   [key: string]: any;
// }

// interface Role { id: string; libelle: string; }
// interface Partenaire { id: string; libelle: string; }
// interface Niveau     { id: string; libelle: string; }
// interface Filiere    { id: string; libelle: string; }
// interface Matiere    { id: string; libelle: string; }

// const PAGE_SIZE = 10;

// /** Helpers */
// const clone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj || {}));
// const normalizeLogin = (raw: string) => {
//   let s = (raw || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
//   s = s.replace(/[^a-z0-9._-]/g, '');
//   s = s.replace(/[._-]{2,}/g, '.');
//   s = s.replace(/^[^a-z]+/, '');
//   s = s.slice(0, 32);
//   return s;
// };

// export default function UsersManagement() {
//   const [users, setUsers] = useState<User[]>([]);
//   const [roles, setRoles] = useState<Role[]>([]);
//   const [selectedRole, setSelectedRole] = useState('');
//   const [niveaux, setNiveaux] = useState<Niveau[]>([]);
//   const [filieres, setFilieres] = useState<Filiere[]>([]);
//   const [matieres, setMatieres] = useState<Matiere[]>([]);
//   const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
//   const [loading, setLoading] = useState(true);

//   // Modals d’ajout
//   const [showAdminModal, setShowAdminModal] = useState(false);
//   const [showFinModal, setShowFinModal] = useState(false);
//   const [showDirectorModal, setShowDirectorModal] = useState(false);

//   // Toast
//   const [showSuccess, setShowSuccess] = useState(false);
//   const [showError, setShowError] = useState(false);
//   const [toastMessage, setToastMessage] = useState('');

//   // Vue détail
//   const [viewingUser, setViewingUser] = useState<User | null>(null);
//   const [showViewModal, setShowViewModal] = useState(false);

//   // Edition (via modal)
//   const [editingUser, setEditingUser] = useState<User | null>(null);
//   const [showEditModal, setShowEditModal] = useState(false);

//   // Suppression (via modal)
//   const [deletingUser, setDeletingUser] = useState<User | null>(null);
//   const [showDeleteModal, setShowDeleteModal] = useState(false);
//   const [deleting, setDeleting] = useState(false);

//   // Recherche / filtres
//   const [searchTerm, setSearchTerm] = useState('');

//   // Pagination (client)
//   const [currentPage, setCurrentPage] = useState(1);

//   // Toast helpers
//   const showSuccessToast = (msg: string) => {
//     setToastMessage(msg);
//     setShowSuccess(true);
//     setTimeout(() => setShowSuccess(false), 3000);
//   };
//   const showErrorToast = (msg: string) => {
//     setToastMessage(msg);
//     setShowError(true);
//     setTimeout(() => setShowError(false), 3000);
//   };

//   // Vue détail
//   const viewUser = (user: User) => {
//     setViewingUser(user);
//     setShowViewModal(true);
//   };
//   const closeViewModal = () => {
//     setViewingUser(null);
//     setShowViewModal(false);
//   };

//   // Edition
//   const startEdit = (user: User) => {
//     setEditingUser(clone(user));
//     setShowEditModal(true);
//   };
//   const closeEditModal = () => {
//     setEditingUser(null);
//     setShowEditModal(false);
//   };

//   // Suppression
//   const askDelete = (user: User) => {
//     setDeletingUser(user);
//     setShowDeleteModal(true);
//   };
//   const cancelDelete = () => {
//     setDeletingUser(null);
//     setShowDeleteModal(false);
//   };

//   // Effacer filtres
//   const clearFilters = () => {
//     setSearchTerm('');
//     setSelectedRole('');
//   };

//   // Chargement des données
//   const fetchData = async () => {
//     try {
//       setLoading(true);

//       const usersSnapshot = await getDocs(collection(db, 'users'));
//       const usersList = usersSnapshot.docs.map((d) => ({
//         ...(d.data() as any),
//         docId: d.id,
//       })) as User[];

//       usersList.sort((a, b) => {
//         const ta = a.created_at?.seconds ?? 0;
//         const tb = b.created_at?.seconds ?? 0;
//         if (tb !== ta) return tb - ta;
//         const ia = a.id ?? 0;
//         const ib = b.id ?? 0;
//         return ib - ia;
//       });

//       setUsers(usersList);

//       const rolesSnapshot = await getDocs(collection(db, 'roles'));
//       const rolesList = rolesSnapshot.docs.map((d) => ({
//         id: d.id,
//         libelle: (d.data() as any).libelle,
//       })) as Role[];
//       setRoles(rolesList);

//       const niveauxSnapshot = await getDocs(collection(db, 'niveaux'));
//       setNiveaux(
//         niveauxSnapshot.docs.map((d) => ({ id: d.id, libelle: (d.data() as any).libelle }))
//       );
//       const filieresSnapshot = await getDocs(collection(db, 'filieres'));
//       setFilieres(
//         filieresSnapshot.docs.map((d) => ({ id: d.id, libelle: (d.data() as any).libelle }))
//       );
//       const matieresSnapshot = await getDocs(collection(db, 'matieres'));
//       setMatieres(
//         matieresSnapshot.docs.map((d) => ({ id: d.id, libelle: (d.data() as any).libelle }))
//       );
//       const partenairesSnapshot = await getDocs(collection(db, 'partenaires'));
//       setPartenaires(
//         partenairesSnapshot.docs.map((d) => ({ id: d.id, libelle: (d.data() as any).libelle }))
//       );
//     } catch (error) {
//       console.error('Error fetching data:', error);
//       showErrorToast('Error loading data');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const reloadAfterMutation = async () => {
//     await fetchData();
//   };

//   // Suppression Firestore + (optionnel) Auth via API Next.js
//   const confirmDelete = async () => {
//     if (!deletingUser?.docId) return;
//     setDeleting(true);
//     try {
//       // 1) Suppression du document Firestore
//       await deleteDoc(doc(db, 'users', deletingUser.docId));

//       // 2) Suppression du compte Firebase Auth
//       // IMPORTANT: côté client, on ne peut PAS supprimer un autre utilisateur directement.
//       // On déclenche un appel HTTP vers une route API (Next.js) qui utilise le Firebase Admin SDK.
//       // Implémente /api/admin/deleteAuthUser côté serveur avec votre service account.
//       try {
//         await fetch('/api/admin/deleteAuthUser', {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify({ uid: deletingUser.docId }),
//         });
//       } catch (e) {
//         // Si l’API n’est pas en place, on informe simplement que seul Firestore a été supprimé.
//         console.warn('API Auth deletion not reachable. Auth account may remain.');
//       }

//       showSuccessToast('Utilisateur supprimé (Firestore) — suppression Auth demandée.');
//       setShowDeleteModal(false);
//       setDeletingUser(null);
//       await fetchData();
//     } catch (error) {
//       console.error('Error deleting user:', error);
//       showErrorToast('Erreur lors de la suppression');
//     } finally {
//       setDeleting(false);
//     }
//   };

//   // Sauvegarde édition (modal)
//   const saveEdit = async (edited: User) => {
//     if (!edited?.docId) return;
//     try {
//       const payload = clone(edited);

//       // Ne jamais stocker password ici (si présent par erreur)
//       delete payload.password;

//       // Recalcule les champs dérivés si login/email changés
//       if (payload.login) {
//         const norm = normalizeLogin(payload.login);
//         payload.login = norm;
//         payload.login_insensitive = norm.toLowerCase();
//         payload.login_norm = norm.toLowerCase();
//       }
//       // Rétro-compat: si tableau departements, on maintient "departement"
//       if (Array.isArray(payload.departements)) {
//         payload.departement = payload.departements.join(', ');
//       }

//       // Empêche l’écrasement du created_at si c’est un Timestamp
//       // (on utilise setDoc merge pour garder les champs non touchés)
//       const { docId, created_at, ...rest } = payload;
//       await setDoc(doc(db, 'users', edited.docId), rest, { merge: true });

//       showSuccessToast('Utilisateur modifié avec succès !');
//       closeEditModal();
//       await fetchData();
//     } catch (error) {
//       console.error('Error updating user:', error);
//       showErrorToast('Erreur lors de la modification');
//     }
//   };

//   // Filtrage + pagination
//   const filteredUsers = useMemo(() => {
//     const s = searchTerm.trim().toLowerCase();
//     return users.filter((u) => {
//       const matchesSearch =
//         !s ||
//         u.nom?.toLowerCase().includes(s) ||
//         u.prenom?.toLowerCase().includes(s) ||
//         u.email?.toLowerCase().includes(s) ||
//         u.login?.toLowerCase().includes(s);
//       const matchesRole = !selectedRole || u.role_id === selectedRole;
//       return matchesSearch && matchesRole;
//     });
//   }, [users, searchTerm, selectedRole]);

//   const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
//   const page = Math.min(currentPage, totalPages);
//   const pageStart = (page - 1) * PAGE_SIZE;
//   const pageEnd = pageStart + PAGE_SIZE;
//   const pagedUsers = filteredUsers.slice(pageStart, pageEnd);

//   useEffect(() => {
//     setCurrentPage(1);
//   }, [searchTerm, selectedRole, users.length]);

//   useEffect(() => {
//     fetchData();
//   }, []);

//   // juste au-dessus du return
//   const roleLabelFor = (u: User) => {
//     const byId = roles.find(r => String(r.id) === String(u.role_id))?.libelle;
//     if (byId) return byId;
//     if (u.role_libelle) return u.role_libelle;

//     const byKey: Record<string, string> = {
//       prof: 'Professeur',
//       etudiant: 'Étudiant',
//       admin: 'Administrateur',
//       resp_fin: 'Responsable financier',
//       directeur: "Directeur des Études",
//     };
//     return byKey[u.role_key || ''] || 'Inconnu';
//   };

//   return (
//     <div className="container-fluid px-4 py-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
//       {/* Header */}
//       <div className="d-flex justify-content-between align-items-center mb-4">
//         <div>
//           <h2 className="fw-bold text-dark mb-1">Gestion des utilisateurs</h2>
//           <p className="text-muted mb-0">Gérer les étudiants, professeurs, administrateurs et responsables financiers</p>
//         </div>
//         <div className="badge bg-primary fs-6 px-3 py-2">
//           {users.length} utilisateur{users.length !== 1 ? 's' : ''}
//         </div>
//       </div>

//       <div className="row g-4">
//         {/* Boutons qui ouvrent les MODALS */}
//         <div className="col-12">
//           <div className="card border-0 shadow-sm">
//             <div className="card-header bg-white border-0 py-3">
//               <div className="d-flex flex-wrap gap-2">
//                 <button className="btn btn-outline-primary" onClick={() => setShowAdminModal(true)}>
//                   <i className="bi bi-person-gear me-2" />
//                   Ajouter un administrateur
//                 </button>
//                 <button className="btn btn-outline-primary" onClick={() => setShowFinModal(true)}>
//                   <i className="bi bi-calculator me-2" />
//                   Ajouter un responsable financier
//                 </button>
//                 <button className="btn btn-outline-primary" onClick={() => setShowDirectorModal(true)}>
//                   <i className="bi bi-mortarboard me-2" />
//                   Ajouter un Directeur des Études
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Liste paginée */}
//         <div className="col-12">
//           <div className="card border-0 shadow-sm">
//             <div className="card-header bg-white border-0 py-3">
//               <div className="d-flex justify-content-between align-items-center">
//                 <h5 className="card-title mb-0 fw-semibold">
//                   <i className="bi bi-people me-2 text-primary"></i>
//                   Liste des utilisateurs
//                 </h5>

//                 <div className="d-flex align-items-center gap-2">
//                   <div className="input-group" style={{ width: '250px' }}>
//                     <span className="input-group-text bg-white border-end-0">
//                       <i className="bi bi-search text-muted"></i>
//                     </span>
//                     <input
//                       type="text"
//                       className="form-control border-start-0"
//                       placeholder="Rechercher..."
//                       value={searchTerm}
//                       onChange={(e) => setSearchTerm(e.target.value)}
//                     />
//                     {searchTerm && (
//                       <button
//                         className="btn btn-outline-secondary border-start-0"
//                         type="button"
//                         onClick={() => setSearchTerm('')}
//                       >
//                         <i className="bi bi-x"></i>
//                       </button>
//                     )}
//                   </div>

//                   <select
//                     className="form-select"
//                     style={{ width: '200px' }}
//                     value={selectedRole}
//                     onChange={(e) => setSelectedRole(e.target.value)}
//                   >
//                     <option value="">Tous les rôles</option>
//                     {roles.map((role) => (
//                       <option key={role.id} value={role.id}>
//                         {role.libelle}
//                       </option>
//                     ))}
//                   </select>

//                   {(searchTerm || selectedRole) && (
//                     <button
//                       className="btn btn-outline-warning"
//                       onClick={clearFilters}
//                       title="Effacer les filtres"
//                     >
//                       <i className="bi bi-filter-circle-fill me-1"></i>
//                       Effacer
//                     </button>
//                   )}

//                   <span className="badge bg-light text-dark px-3 py-2 border">
//                     <i className="bi bi-eye me-1"></i>
//                     {filteredUsers.length} sur {users.length}
//                   </span>
//                 </div>
//               </div>
//             </div>

//             {loading ? (
//               <div className="card-body text-center py-5">
//                 <div className="spinner-border text-primary" role="status">
//                   <span className="visually-hidden">Chargement...</span>
//                 </div>
//                 <p className="text-muted mt-2">Chargement des utilisateurs...</p>
//               </div>
//             ) : (
//               <div className="card-body p-0">
//                 {pagedUsers.length > 0 ? (
//                   <>
//                     <div className="table-responsive">
//                       <table className="table table-hover mb-0">
//                         <thead className="table-light">
//                           <tr>
//                             <th>Nom</th>
//                             <th>Email</th>
//                             <th>Nom d’utilisateur</th>
//                             <th>Rôle</th>
//                             <th>Classe/Poste</th>
//                             <th>Première connexion</th>
//                             <th>Actions</th>
//                           </tr>
//                         </thead>
//                         <tbody>
//                           {pagedUsers.map((user) => (
//                             <tr key={user.docId}>
//                               <td>{`${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || '—'}</td>
//                               <td>{user.email || '—'}</td>
//                               <td>{user.login || '—'}</td>
//                               <td>{roleLabelFor(user)}</td>
//                               <td>{user.classe || user.intitule_poste || user.specialty || '-'}</td>
//                               <td>
//                                 {user.first_login === '1' ? (
//                                   <span className="badge bg-warning text-dark">Oui</span>
//                                 ) : (
//                                   <span className="badge bg-success">Non</span>
//                                 )}
//                               </td>
//                               <td>
//                                 <div className="btn-group btn-group-sm">
//                                   <button
//                                     className="btn btn-outline-info"
//                                     onClick={() => viewUser(user)}
//                                     title="Voir les détails"
//                                   >
//                                     <i className="bi bi-eye"></i>
//                                   </button>
//                                   <button
//                                     className="btn btn-outline-primary"
//                                     onClick={() => startEdit(user)}
//                                     title="Modifier"
//                                   >
//                                     <i className="bi bi-pencil"></i>
//                                   </button>
//                                   <button
//                                     className="btn btn-outline-danger"
//                                     onClick={() => askDelete(user)}
//                                     title="Supprimer"
//                                   >
//                                     <i className="bi bi-trash"></i>
//                                   </button>
//                                 </div>
//                               </td>
//                             </tr>
//                           ))}
//                         </tbody>
//                       </table>
//                     </div>

//                     {/* Pagination controls */}
//                     <div className="d-flex justify-content-between align-items-center px-3 py-2">
//                       <small className="text-muted">
//                         Affichage {filteredUsers.length === 0 ? 0 : pageStart + 1}–
//                         {Math.min(pageEnd, filteredUsers.length)} sur {filteredUsers.length}
//                       </small>

//                       <nav>
//                         <ul className="pagination mb-0">
//                           <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}>
//                             <button
//                               className="page-link"
//                               onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
//                             >
//                               Précédent
//                             </button>
//                           </li>

//                           {Array.from({ length: totalPages }, (_, i) => i + 1).map((pn) => (
//                             <li key={pn} className={`page-item ${pn === page ? 'active' : ''}`}>
//                               <button className="page-link" onClick={() => setCurrentPage(pn)}>
//                                 {pn}
//                               </button>
//                             </li>
//                           ))}

//                           <li className={`page-item ${page >= totalPages ? 'disabled' : ''}`}>
//                             <button
//                               className="page-link"
//                               onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
//                             >
//                               Suivant
//                             </button>
//                           </li>
//                         </ul>
//                       </nav>
//                     </div>
//                   </>
//                 ) : (
//                   <div className="text-center py-5">
//                     <i className="bi bi-people text-muted" style={{ fontSize: '3rem' }}></i>
//                     <h5 className="text-muted mt-3">Aucun utilisateur trouvé</h5>
//                     {searchTerm || selectedRole ? (
//                       <div>
//                         <p className="text-muted">Aucun résultat pour les filtres appliqués</p>
//                         <button className="btn btn-outline-primary btn-sm" onClick={clearFilters}>
//                           <i className="bi bi-arrow-clockwise me-1"></i>
//                           Effacer les filtres
//                         </button>
//                       </div>
//                     ) : (
//                       <p className="text-muted">Ajoutez votre premier utilisateur avec les boutons ci-dessus</p>
//                     )}
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* ------- MODALS ------- */}

//       {/* Modal Administrateur */}
//       {showAdminModal && (
//         <>
//           <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
//             <div className="modal-dialog modal-lg modal-dialog-centered">
//               <div className="modal-content">
//                 <div className="modal-header">
//                   <h5 className="modal-title">
//                     <i className="bi bi-person-gear me-2" />
//                     Ajouter un administrateur
//                   </h5>
//                   <button type="button" className="btn-close" onClick={() => setShowAdminModal(false)} />
//                 </div>
//                 <div className="modal-body">
//                   <AdminForm
//                     roles={roles}
//                     showSuccessToast={showSuccessToast}
//                     showErrorToast={showErrorToast}
//                     fetchData={reloadAfterMutation}
//                     onCreated={() => {
//                       setShowAdminModal(false);
//                       reloadAfterMutation();
//                     }}
//                   />
//                 </div>
//               </div>
//             </div>
//           </div>
//           <div className="modal-backdrop fade show" onClick={() => setShowAdminModal(false)} />
//         </>
//       )}

//       {/* Modal Responsable Financier */}
//       {showFinModal && (
//         <>
//           <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
//             <div className="modal-dialog modal-lg modal-dialog-centered">
//               <div className="modal-content">
//                 <div className="modal-header">
//                   <h5 className="modal-title">
//                     <i className="bi bi-calculator me-2" />
//                     Ajouter un responsable financier
//                   </h5>
//                   <button type="button" className="btn-close" onClick={() => setShowFinModal(false)} />
//                 </div>
//                 <div className="modal-body">
//                   <ResponsableFinancierForm
//                     roles={roles}
//                     showSuccessToast={showSuccessToast}
//                     showErrorToast={showErrorToast}
//                     fetchData={reloadAfterMutation}
//                     onCreated={() => setShowFinModal(false)}
//                   />
//                 </div>
//               </div>
//             </div>
//           </div>
//           <div className="modal-backdrop fade show" onClick={() => setShowFinModal(false)} />
//         </>
//       )}

//       {/* Modal Directeur des Études */}
//       {showDirectorModal && (
//         <>
//           <div className="modal fade show" style={{ display: 'block' }} aria-modal="true" role="dialog">
//             <div className="modal-dialog modal-lg modal-dialog-centered">
//               <div className="modal-content">
//                 <div className="modal-header">
//                   <h5 className="modal-title">
//                     <i className="bi bi-mortarboard me-2" />
//                     Ajouter un Directeur des Études
//                   </h5>
//                   <button
//                     type="button"
//                     className="btn-close"
//                     onClick={() => setShowDirectorModal(false)}
//                   />
//                 </div>

//                 <div className="modal-body">
//                   <DirectorForm
//                     roles={roles}
//                     showSuccessToast={showSuccessToast}
//                     showErrorToast={showErrorToast}
//                     fetchData={reloadAfterMutation}
//                     onCreated={() => setShowDirectorModal(false)}
//                   />
//                 </div>
//               </div>
//             </div>
//           </div>
//           <div
//             className="modal-backdrop fade show"
//             onClick={() => setShowDirectorModal(false)}
//           />
//         </>
//       )}

//       {/* Modal de visualisation d’un utilisateur (toutes infos, sauf password) */}
//       {showViewModal && viewingUser && (
//         <UserViewModal
//           user={viewingUser}
//           roles={roles}
//           show={showViewModal}
//           onClose={closeViewModal}
//           onEdit={(u) => startEdit(u)}
//         />
//       )}

//       {/* Modal d’édition d’un utilisateur (dynamique & pré-rempli) */}
//       {showEditModal && editingUser && (
//         <UserEditModal
//           user={editingUser}
//           roles={roles}
//           onClose={closeEditModal}
//           onSave={saveEdit}
//         />
//       )}

//       {/* Modal de confirmation de suppression */}
//       {showDeleteModal && deletingUser && (
//         <DeleteConfirmModal
//           user={deletingUser}
//           onCancel={cancelDelete}
//           onConfirm={confirmDelete}
//           loading={deleting}
//         />
//       )}

//       {/* Toasts */}
//       <Toast message={toastMessage} type="success" show={showSuccess} onClose={() => setShowSuccess(false)} />
//       <Toast message={toastMessage} type="error" show={showError} onClose={() => setShowError(false)} />
//     </div>
//   );
// }

// /* ---------- MODAL EDIT (dynamique) ---------- */
// function UserEditModal({
//   user,
//   roles,
//   onClose,
//   onSave,
// }: {
//   user: User;
//   roles: Role[];
//   onClose: () => void;
//   onSave: (edited: User) => void;
// }) {
//   const [form, setForm] = useState<User>(() => clone(user));
//   const [saving, setSaving] = useState(false);

//   // Champs à cacher (non éditables / sensibles)
//   const HIDDEN_KEYS = new Set([
//     'password',
//     'created_at',
//     'uid',
//     'role_libelle',
//     'login_insensitive',
//     'login_norm',
//     'first_login',
//     'role_key',
//   ]);

//   const EXCLUDE_FROM_DYNAMIC = new Set([
//   'prenom',
//   'nom',
//   'email',
//   'login',
//   'role_id',
//   'docId',
//   // 👇 et tous les sensibles qu'on ne veut pas afficher/éditer
//   'password',
//   'created_at',
//   'uid',
//   'role_libelle',
//   'login_insensitive',
//   'login_norm',
//   'first_login',
//   'role_key',
// ]);

//   const isPrimitive = (v: any) =>
//     v === null || ['string', 'number', 'boolean'].includes(typeof v);

//   const setAtPath = (path: (string | number)[], value: any) => {
//     setForm((prev) => {
//       const next = clone(prev);
//       let cur: any = next;
//       for (let i = 0; i < path.length - 1; i++) {
//         const k = path[i];
//         if (typeof k === 'number') {
//           if (!Array.isArray(cur)) return prev;
//           cur = cur[k];
//         } else {
//           cur[k] = cur[k] ?? {};
//           cur = cur[k];
//         }
//       }
//       const last = path[path.length - 1];
//       if (typeof last === 'number') {
//         if (!Array.isArray(cur)) return prev;
//         cur[last] = value;
//       } else {
//         cur[last] = value;
//       }
//       return next;
//     });
//   };

//   const addArrayItem = (path: (string | number)[], sample: any = '') => {
//     setForm((prev) => {
//       const next = clone(prev);
//       let cur: any = next;
//       for (let i = 0; i < path.length; i++) {
//         const k = path[i];
//         cur = cur[k];
//       }
//       if (!Array.isArray(cur)) return prev;
//       cur.push(isPrimitive(sample) ? '' : {});
//       return next;
//     });
//   };

//   const removeArrayIndex = (path: (string | number)[], idx: number) => {
//     setForm((prev) => {
//       const next = clone(prev);
//       let cur: any = next;
//       for (let i = 0; i < path.length; i++) {
//         const k = path[i];
//         cur = cur[k];
//       }
//       if (!Array.isArray(cur)) return prev;
//       cur.splice(idx, 1);
//       return next;
//     });
//   };

//   const renderValue = (key: string, value: any, path: (string | number)[] = []) => {
//     if (HIDDEN_KEYS.has(key)) return null;

//     // Champ rôle avec select
//     if (key === 'role_id') {
//       return (
//         <div className="mb-3" key={path.join('.')}>
//           <label className="form-label">Rôle</label>
//           <select
//             className="form-select"
//             value={value ?? ''}
//             onChange={(e) => setAtPath(path, e.target.value)}
//           >
//             <option value="">Sélectionner...</option>
//             {roles.map((r) => (
//               <option key={r.id} value={r.id}>
//                 {r.libelle}
//               </option>
//             ))}
//           </select>
//         </div>
//       );
//     }

//     // Affichage gentil pour created_at si présent (non édité)
//     if (key === 'created_at') {
//       const ts = value?.seconds ? new Date(value.seconds * 1000) : null;
//       return (
//         <div className="mb-2" key={path.join('.')}>
//           <label className="form-label">Créé le</label>
//           <div className="form-control" style={{ background: '#f8f9fa' }}>
//             {ts ? ts.toLocaleString() : '—'}
//           </div>
//         </div>
//       );
//     }

//     // Documents (liens)
//     if (key === 'documents' && value && typeof value === 'object' && !Array.isArray(value)) {
//       return (
//         <div className="mb-3" key={path.join('.')}>
//           <label className="form-label fw-semibold">Documents</label>
//           <div className="row g-2">
//             {Object.entries(value).map(([k, v]) => (
//               <div className="col-md-6" key={`${path.join('.')}.${k}`}>
//                 <label className="form-label text-muted">{k}</label>
//                 <input
//                   type="text"
//                   className="form-control"
//                   value={v ?? ''}
//                   onChange={(e) => setAtPath([...path, k], e.target.value)}
//                   placeholder="URL du document (ou laisser vide)"
//                 />
//                 {v ? (
//                   <a className="small mt-1 d-inline-block" href={String(v)} target="_blank" rel="noreferrer">
//                     Ouvrir
//                   </a>
//                 ) : null}
//               </div>
//             ))}
//           </div>
//         </div>
//       );
//     }

//     // Tableaux
//     if (Array.isArray(value)) {
//       // tableau de primitifs
//       const allPrims = value.every(isPrimitive);
//       if (allPrims) {
//         return (
//           <div className="mb-3" key={path.join('.')}>
//             <label className="form-label">{key}</label>
//             {value.map((item, idx) => (
//               <div className="d-flex gap-2 mb-2" key={`${path.join('.')}.${idx}`}>
//                 <input
//                   type="text"
//                   className="form-control"
//                   value={item ?? ''}
//                   onChange={(e) => setAtPath([...path, idx], e.target.value)}
//                 />
//                 <button
//                   type="button"
//                   className="btn btn-outline-danger"
//                   onClick={() => removeArrayIndex(path, idx)}
//                 >
//                   <i className="bi bi-trash"></i>
//                 </button>
//               </div>
//             ))}
//             <button
//               type="button"
//               className="btn btn-outline-primary btn-sm"
//               onClick={() => addArrayItem(path, '')}
//             >
//               <i className="bi bi-plus me-1"></i>Ajouter
//             </button>
//           </div>
//         );
//       }
//       // tableau d'objets
//       return (
//         <div className="mb-3" key={path.join('.')}>
//           <label className="form-label fw-semibold">{key}</label>
//           {value.map((obj, idx) => (
//             <div className="border rounded p-3 mb-2" key={`${path.join('.')}.${idx}`}>
//               <div className="d-flex justify-content-between align-items-center mb-2">
//                 <span className="text-muted">#{idx + 1}</span>
//                 <button
//                   type="button"
//                   className="btn btn-outline-danger btn-sm"
//                   onClick={() => removeArrayIndex(path, idx)}
//                 >
//                   <i className="bi bi-trash"></i>
//                 </button>
//               </div>
//               {Object.entries(obj || {}).map(([k, v]) =>
//                 renderValue(k, v, [...path, idx, k])
//               )}
//             </div>
//           ))}
//           <button
//             type="button"
//             className="btn btn-outline-primary btn-sm"
//             onClick={() => addArrayItem(path, {})}
//           >
//             <i className="bi bi-plus me-1"></i>Ajouter un élément
//           </button>
//         </div>
//       );
//     }

//     // Objet simple
//     if (value && typeof value === 'object') {
//       return (
//         <div className="mb-3" key={path.join('.')}>
//           <label className="form-label fw-semibold">{key}</label>
//           <div className="row g-2">
//             {Object.entries(value).map(([k, v]) => (
//               <div className="col-12" key={`${path.join('.')}.${k}`}>
//                 {renderValue(k, v, [...path, k])}
//               </div>
//             ))}
//           </div>
//         </div>
//       );
//     }

//     // Primitifs
//     const inputType =
//       typeof value === 'number'
//         ? 'number'
//         : typeof value === 'boolean'
//         ? 'checkbox'
//         : /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
//         ? 'date'
//         : 'text';

//     if (inputType === 'checkbox') {
//       return (
//         <div className="form-check mb-2" key={path.join('.')}>
//           <input
//             className="form-check-input"
//             type="checkbox"
//             checked={!!value}
//             onChange={(e) => setAtPath(path, e.target.checked)}
//             id={`chk-${path.join('.')}`}
//           />
//           <label className="form-check-label" htmlFor={`chk-${path.join('.')}`}>
//             {key}
//           </label>
//         </div>
//       );
//     }

//     return (
//       <div className="mb-2" key={path.join('.')}>
//         <label className="form-label">{key}</label>
//         <input
//           type={inputType}
//           className="form-control"
//           value={value ?? ''}
//           onChange={(e) => setAtPath(path, inputType === 'number' ? Number(e.target.value) : e.target.value)}
//         />
//       </div>
//     );
//   };

//   const handleSave = async () => {
//     setSaving(true);
//     try {
//       await onSave(form);
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
//       <div className="modal-dialog modal-xl modal-dialog-centered">
//         <div className="modal-content">
//           <div className="modal-header">
//             <h5 className="modal-title"><i className="bi bi-pencil-square me-2" />Modifier l’utilisateur</h5>
//             <button type="button" className="btn-close" onClick={onClose}></button>
//           </div>
//           <div className="modal-body">
//             <div className="alert alert-info mb-3">
//               Les champs ci-dessous reprennent toutes les informations stockées (sauf le mot de passe).
//             </div>
//             {/* Champs de base en tête */}
//             <div className="row g-3 mb-3">
//               <div className="col-md-4">
//                 <label className="form-label">Prénom</label>
//                 <input
//                   className="form-control"
//                   value={form.prenom ?? ''}
//                   onChange={(e) => setForm((p) => ({ ...p, prenom: e.target.value }))}
//                 />
//               </div>
//               <div className="col-md-4">
//                 <label className="form-label">Nom</label>
//                 <input
//                   className="form-control"
//                   value={form.nom ?? ''}
//                   onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
//                 />
//               </div>
//               <div className="col-md-4">
//                 <label className="form-label">Email</label>
//                 <input
//                   type="email"
//                   className="form-control"
//                   value={form.email ?? ''}
//                   onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
//                 />
//               </div>
//               <div className="col-md-4">
//                 <label className="form-label">Nom d’utilisateur</label>
//                 <input
//                   className="form-control"
//                   value={form.login ?? ''}
//                   onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))}
//                 />
//               </div>
//               <div className="col-md-4">
//                 <label className="form-label">Rôle</label>
//                 <select
//                   className="form-select"
//                   value={form.role_id ?? ''}
//                   onChange={(e) => setForm((p) => ({ ...p, role_id: e.target.value }))}
//                 >
//                   <option value="">Sélectionner...</option>
//                   {roles.map((r) => (
//                     <option key={r.id} value={r.id}>
//                       {r.libelle}
//                     </option>
//                   ))}
//                 </select>
//               </div>
//             </div>

//             {/* Rendu dynamique pour tout le reste */}
//             <div className="row g-3">
//               {Object.entries(form)
//                 .filter(([k]) => !EXCLUDE_FROM_DYNAMIC.has(k))
//                 .map(([k, v]) => (
//                   <div className="col-12" key={k}>
//                     {renderValue(k, v, [k])}
//                   </div>
//               ))}

//             </div>
//           </div>
//           <div className="modal-footer">
//             <button className="btn btn-secondary" onClick={onClose}>
//               <i className="bi bi-x-circle me-1"></i>Annuler
//             </button>
//             <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
//               {saving ? (
//                 <>
//                   <span className="spinner-border spinner-border-sm me-2" />
//                   Enregistrement...
//                 </>
//               ) : (
//                 <>
//                   <i className="bi bi-save me-1"></i>Enregistrer
//                 </>
//               )}
//             </button>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

// /* ---------- MODAL DELETE (confirmation claire) ---------- */
// function DeleteConfirmModal({
//   user,
//   onCancel,
//   onConfirm,
//   loading,
// }: {
//   user: User;
//   onCancel: () => void;
//   onConfirm: () => void;
//   loading: boolean;
// }) {
//   return (
//     <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
//       <div className="modal-dialog modal-md modal-dialog-centered">
//         <div className="modal-content">
//           <div className="modal-header bg-danger text-white">
//             <h5 className="modal-title">
//               <i className="bi bi-exclamation-triangle me-2" />
//               Supprimer cet utilisateur ?
//             </h5>
//             <button type="button" className="btn-close btn-close-white" onClick={onCancel}></button>
//           </div>
//           <div className="modal-body">
//             <p>
//               Vous êtes sur le point de <strong>supprimer définitivement</strong> le compte de{' '}
//               <strong>{user.prenom} {user.nom}</strong>.
//             </p>
//             <ul>
//               <li>Le document dans <strong>Firestore</strong> sera supprimé.</li>
//               <li>Le compte dans <strong>Firebase Authentication</strong> sera supprimé via une route serveur (si configurée).</li>
//               <li>Cette action est irréversible.</li>
//             </ul>
//             <div className="alert alert-warning">
//               Si l’API serveur n’est pas configurée, seule la suppression Firestore sera effectuée.
//             </div>
//           </div>
//           <div className="modal-footer">
//             <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
//               Annuler
//             </button>
//             <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
//               {loading ? (
//                 <>
//                   <span className="spinner-border spinner-border-sm me-2" />
//                   Suppression...
//                 </>
//               ) : (
//                 <>
//                   <i className="bi bi-trash me-1"></i>
//                   Supprimer
//                 </>
//               )}
//             </button>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
// src/app/admin/pages/users/gestionUsers.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import Toast from '../../components/ui/Toast';
import StudentForm from './etudiantForm';
import TeacherForm from './professeurForm';
import AdminForm from './adminForm';
import ResponsableFinancierForm from './respoFinancierForm';
import DirectorForm from './directeurForm';
import UserViewModal from './userModalView';

interface User {
  classe?: string;
  id?: number;
  email: string;
  first_login: string;
  login: string;
  nom: string;
  password?: string;
  prenom: string;
  role_id: string;
  docId?: string;
  specialty?: string;
  intitule_poste?: string;
  created_at?: { seconds: number; nanoseconds: number } | any;
  [key: string]: any;
}

interface Role { id: string; libelle: string; }
interface Partenaire { id: string; libelle: string; }
interface Niveau     { id: string; libelle: string; }
interface Filiere    { id: string; libelle: string; }
interface Matiere    { id: string; libelle: string; }

const PAGE_SIZE = 10;

/** Helpers */
const clone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj || {}));
const normalizeLogin = (raw: string) => {
  let s = (raw || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9._-]/g, '');
  s = s.replace(/[._-]{2,}/g, '.');
  s = s.replace(/^[^a-z]+/, '');
  s = s.slice(0, 32);
  return s;
};

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [niveaux, setNiveaux] = useState<Niveau[]>([]);
  const [filieres, setFilieres] = useState<Filiere[]>([]);
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showFinModal, setShowFinModal] = useState(false);
  const [showDirectorModal, setShowDirectorModal] = useState(false);

  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const showSuccessToast = (msg: string) => {
    setToastMessage(msg);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };
  const showErrorToast = (msg: string) => {
    setToastMessage(msg);
    setShowError(true);
    setTimeout(() => setShowError(false), 3000);
  };

  const viewUser = (user: User) => {
    setViewingUser(user);
    setShowViewModal(true);
  };
  const closeViewModal = () => {
    setViewingUser(null);
    setShowViewModal(false);
  };

  const startEdit = (user: User) => {
    setEditingUser(clone(user));
    setShowEditModal(true);
  };
  const closeEditModal = () => {
    setEditingUser(null);
    setShowEditModal(false);
  };

  const askDelete = (user: User) => {
    setDeletingUser(user);
    setShowDeleteModal(true);
  };
  const cancelDelete = () => {
    setDeletingUser(null);
    setShowDeleteModal(false);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedRole('');
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersList = usersSnapshot.docs.map((d) => ({
        ...(d.data() as any),
        docId: d.id,
      })) as User[];

      usersList.sort((a, b) => {
        const ta = a.created_at?.seconds ?? 0;
        const tb = b.created_at?.seconds ?? 0;
        if (tb !== ta) return tb - ta;
        const ia = a.id ?? 0;
        const ib = b.id ?? 0;
        return ib - ia;
      });

      setUsers(usersList);

      const rolesSnapshot = await getDocs(collection(db, 'roles'));
      const rolesList = rolesSnapshot.docs.map((d) => ({
        id: d.id,
        libelle: (d.data() as any).libelle,
      })) as Role[];
      setRoles(rolesList);

      const niveauxSnapshot = await getDocs(collection(db, 'niveaux'));
      setNiveaux(niveauxSnapshot.docs.map((d) => ({ id: d.id, libelle: (d.data() as any).libelle })));
      const filieresSnapshot = await getDocs(collection(db, 'filieres'));
      setFilieres(filieresSnapshot.docs.map((d) => ({ id: d.id, libelle: (d.data() as any).libelle })));
      const matieresSnapshot = await getDocs(collection(db, 'matieres'));
      setMatieres(matieresSnapshot.docs.map((d) => ({ id: d.id, libelle: (d.data() as any).libelle })));
      const partenairesSnapshot = await getDocs(collection(db, 'partenaires'));
      setPartenaires(partenairesSnapshot.docs.map((d) => ({ id: d.id, libelle: (d.data() as any).libelle })));
    } catch (error) {
      console.error('Error fetching data:', error);
      showErrorToast('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const reloadAfterMutation = async () => {
    await fetchData();
  };

  const confirmDelete = async () => {
    if (!deletingUser?.docId) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', deletingUser.docId));
      try {
        await fetch('/api/admin/deleteAuthUser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: deletingUser.docId }),
        });
      } catch (e) {
        console.warn('API Auth deletion not reachable. Auth account may remain.');
      }
      showSuccessToast('Utilisateur supprimé (Firestore) — suppression Auth demandée.');
      setShowDeleteModal(false);
      setDeletingUser(null);
      await fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
      showErrorToast('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const saveEdit = async (edited: User) => {
    if (!edited?.docId) return;
    try {
      const payload = clone(edited);
      delete payload.password;
      if (payload.login) {
        const norm = normalizeLogin(payload.login);
        payload.login = norm;
        payload.login_insensitive = norm.toLowerCase();
        payload.login_norm = norm.toLowerCase();
      }
      if (Array.isArray(payload.departements)) {
        payload.departement = payload.departements.join(', ');
      }
      const { docId, created_at, ...rest } = payload;
      await setDoc(doc(db, 'users', edited.docId), rest, { merge: true });
      showSuccessToast('Utilisateur modifié avec succès !');
      closeEditModal();
      await fetchData();
    } catch (error) {
      console.error('Error updating user:', error);
      showErrorToast('Erreur lors de la modification');
    }
  };

  const filteredUsers = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !s ||
        u.nom?.toLowerCase().includes(s) ||
        u.prenom?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s) ||
        u.login?.toLowerCase().includes(s);
      const matchesRole = !selectedRole || u.role_id === selectedRole;
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, selectedRole]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pagedUsers = filteredUsers.slice(pageStart, pageEnd);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRole, users.length]);

  useEffect(() => {
    fetchData();
  }, []);

  const roleLabelFor = (u: User) => {
    const byId = roles.find(r => String(r.id) === String(u.role_id))?.libelle;
    if (byId) return byId;
    if (u.role_libelle) return u.role_libelle;
    const byKey: Record<string, string> = {
      prof: 'Professeur',
      etudiant: 'Étudiant',
      admin: 'Administrateur',
      resp_fin: 'Responsable financier',
      directeur: "Directeur des Études",
    };
    return byKey[u.role_key || ''] || 'Inconnu';
  };

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
            Gestion des utilisateurs
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
            Gérez les étudiants, professeurs, administrateurs et responsables financiers
          </p>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)',
          padding: '8px 20px',
          borderRadius: 40,
          border: '1px solid rgba(2, 157, 254, 0.3)'
        }}>
          <span style={{ color: '#029DFE', fontWeight: 700 }}>
            {users.length} utilisateur{users.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Boutons d'ajout */}
      <div style={{
        background: '#1e293b',
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        border: '1px solid rgba(2, 157, 254, 0.2)'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button
            onClick={() => setShowAdminModal(true)}
            style={{
              background: 'rgba(2, 157, 254, 0.1)',
              border: '1px solid rgba(2, 157, 254, 0.3)',
              borderRadius: 12,
              padding: '10px 20px',
              color: '#029DFE',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 8
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
            <i className="bi bi-person-gear" /> Ajouter un administrateur
          </button>
          <button
            onClick={() => setShowFinModal(true)}
            style={{
              background: 'rgba(2, 157, 254, 0.1)',
              border: '1px solid rgba(2, 157, 254, 0.3)',
              borderRadius: 12,
              padding: '10px 20px',
              color: '#029DFE',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 8
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
            <i className="bi bi-calculator" /> Ajouter un responsable financier
          </button>
          <button
            onClick={() => setShowDirectorModal(true)}
            style={{
              background: 'rgba(2, 157, 254, 0.1)',
              border: '1px solid rgba(2, 157, 254, 0.3)',
              borderRadius: 12,
              padding: '10px 20px',
              color: '#029DFE',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 8
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
            <i className="bi bi-mortarboard" /> Ajouter un Directeur des Études
          </button>
        </div>
      </div>

      {/* Liste des utilisateurs */}
      <div style={{
        background: '#1e293b',
        borderRadius: 24,
        border: '1px solid rgba(2, 157, 254, 0.2)',
        overflow: 'hidden'
      }}>
        {/* Header avec filtres */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <i className="bi bi-people-fill" style={{ color: '#029DFE', fontSize: 20 }} />
            <h5 style={{ fontWeight: 700, color: 'white', margin: 0 }}>Liste des utilisateurs</h5>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <i className="bi bi-search" style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b'
              }} />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  padding: '10px 12px 10px 36px',
                  color: 'white',
                  fontSize: 14,
                  width: 220,
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#029DFE'}
                onBlur={(e) => e.target.style.borderColor = '#334155'}
              />
            </div>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: '10px 12px',
                color: 'white',
                fontSize: 14,
                cursor: 'pointer',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#029DFE'}
              onBlur={(e) => e.target.style.borderColor = '#334155'}
            >
              <option value="">Tous les rôles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.libelle}</option>
              ))}
            </select>

            {(searchTerm || selectedRole) && (
              <button
                onClick={clearFilters}
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 12,
                  padding: '10px 16px',
                  color: '#f59e0b',
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f59e0b';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(245, 158, 11, 0.1)';
                  e.currentTarget.style.color = '#f59e0b';
                }}
              >
                <i className="bi bi-filter-circle-fill me-1" /> Effacer
              </button>
            )}
          </div>
        </div>

        {/* Tableau */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div className="spinner-border" style={{ color: '#029DFE', width: 48, height: 48 }} />
            <p style={{ color: '#94a3b8', marginTop: 16 }}>Chargement des utilisateurs...</p>
          </div>
        ) : pagedUsers.length > 0 ? (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#0f172a' }}>
                  <tr>
                    {['Nom', 'Email', 'Nom d\'utilisateur', 'Rôle', 'Classe/Poste', '1ère connexion', 'Actions'].map((h) => (
                      <th key={h} style={{
                        textAlign: 'left',
                        padding: '14px 16px',
                        color: '#94a3b8',
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: 0.5,
                        borderBottom: '1px solid #334155'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((user, idx) => (
                    <tr key={user.docId} style={{
                      borderBottom: idx === pagedUsers.length - 1 ? 'none' : '1px solid #334155',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#0f172a'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '14px 16px', color: 'white', fontSize: 14 }}>
                        {`${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 14 }}>{user.email || '—'}</td>
                      <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 14 }}>{user.login || '—'}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          background: 'rgba(2, 157, 254, 0.1)',
                          color: '#029DFE',
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 500
                        }}>
                          {roleLabelFor(user)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: 14 }}>
                        {user.classe || user.intitule_poste || user.specialty || '-'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          background: user.first_login === '1' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: user.first_login === '1' ? '#f59e0b' : '#10b981',
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 500
                        }}>
                          {user.first_login === '1' ? 'Oui' : 'Non'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => viewUser(user)} style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            fontSize: 18,
                            padding: 4,
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#029DFE'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}>
                            <i className="bi bi-eye" />
                          </button>
                          <button onClick={() => startEdit(user)} style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            fontSize: 18,
                            padding: 4,
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#029DFE'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}>
                            <i className="bi bi-pencil" />
                          </button>
                          <button onClick={() => askDelete(user)} style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            fontSize: 18,
                            padding: 4,
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}>
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <small style={{ color: '#64748b' }}>
                Affichage {filteredUsers.length === 0 ? 0 : pageStart + 1}–
                {Math.min(pageEnd, filteredUsers.length)} sur {filteredUsers.length}
              </small>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{
                    background: page <= 1 ? '#334155' : '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: page <= 1 ? '#64748b' : 'white',
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    fontSize: 13
                  }}
                >
                  Précédent
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum = page;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (page <= 3) pageNum = i + 1;
                  else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = page - 2 + i;
                  if (pageNum > totalPages || pageNum < 1) return null;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      style={{
                        background: pageNum === page ? '#029DFE' : '#0f172a',
                        border: pageNum === page ? 'none' : '1px solid #334155',
                        borderRadius: 8,
                        padding: '6px 12px',
                        color: pageNum === page ? 'white' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: 13,
                        minWidth: 36
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    background: page >= totalPages ? '#334155' : '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: page >= totalPages ? '#64748b' : 'white',
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    fontSize: 13
                  }}
                >
                  Suivant
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <i className="bi bi-people" style={{ color: '#334155', fontSize: 48 }} />
            <h5 style={{ color: '#64748b', marginTop: 16 }}>Aucun utilisateur trouvé</h5>
            {(searchTerm || selectedRole) && (
              <button onClick={clearFilters} style={{
                marginTop: 16,
                background: 'rgba(2, 157, 254, 0.1)',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                color: '#029DFE',
                cursor: 'pointer'
              }}>
                Effacer les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {/* MODALS (inchangées mais conservées) */}
      {showAdminModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.7)' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content" style={{ background: '#1e293b', border: '1px solid rgba(2,157,254,0.2)', borderRadius: 20 }}>
                <div className="modal-header" style={{ borderBottomColor: '#334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="bi bi-person-gear" style={{ color: '#029DFE' }} />
                    </div>
                    <h5 className="modal-title" style={{ color: 'white', fontWeight: 600 }}>Ajouter un administrateur</h5>
                  </div>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowAdminModal(false)} />
                </div>
                <div className="modal-body">
                  <AdminForm
                    roles={roles}
                    showSuccessToast={showSuccessToast}
                    showErrorToast={showErrorToast}
                    fetchData={reloadAfterMutation}
                    onCreated={() => {
                      setShowAdminModal(false);
                      reloadAfterMutation();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowAdminModal(false)} />
        </>
      )}

      {showFinModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.7)' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content" style={{ background: '#1e293b', border: '1px solid rgba(2,157,254,0.2)', borderRadius: 20 }}>
                <div className="modal-header" style={{ borderBottomColor: '#334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="bi bi-calculator" style={{ color: '#029DFE' }} />
                    </div>
                    <h5 className="modal-title" style={{ color: 'white', fontWeight: 600 }}>Ajouter un responsable financier</h5>
                  </div>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowFinModal(false)} />
                </div>
                <div className="modal-body">
                  <ResponsableFinancierForm
                    roles={roles}
                    showSuccessToast={showSuccessToast}
                    showErrorToast={showErrorToast}
                    fetchData={reloadAfterMutation}
                    onCreated={() => setShowFinModal(false)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowFinModal(false)} />
        </>
      )}

      {showDirectorModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.7)' }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content" style={{ background: '#1e293b', border: '1px solid rgba(2,157,254,0.2)', borderRadius: 20 }}>
                <div className="modal-header" style={{ borderBottomColor: '#334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #029DFE20 0%, #00d4ff20 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="bi bi-mortarboard" style={{ color: '#029DFE' }} />
                    </div>
                    <h5 className="modal-title" style={{ color: 'white', fontWeight: 600 }}>Ajouter un Directeur des Études</h5>
                  </div>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowDirectorModal(false)} />
                </div>
                <div className="modal-body">
                  <DirectorForm
                    roles={roles}
                    showSuccessToast={showSuccessToast}
                    showErrorToast={showErrorToast}
                    fetchData={reloadAfterMutation}
                    onCreated={() => setShowDirectorModal(false)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowDirectorModal(false)} />
        </>
      )}

      {showViewModal && viewingUser && (
        <UserViewModal
          user={viewingUser}
          roles={roles}
          show={showViewModal}
          onClose={closeViewModal}
          onEdit={(u) => startEdit(u)}
        />
      )}

      {showEditModal && editingUser && (
        <UserEditModal
          user={editingUser}
          roles={roles}
          onClose={closeEditModal}
          onSave={saveEdit}
        />
      )}

      {showDeleteModal && deletingUser && (
        <DeleteConfirmModal
          user={deletingUser}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
          loading={deleting}
        />
      )}

      <Toast message={toastMessage} type="success" show={showSuccess} onClose={() => setShowSuccess(false)} />
      <Toast message={toastMessage} type="error" show={showError} onClose={() => setShowError(false)} />
    </div>
  );
}

/* ---------- MODAL EDIT (dynamique) - MODERNISÉE ---------- */
function UserEditModal({
  user,
  roles,
  onClose,
  onSave,
}: {
  user: User;
  roles: Role[];
  onClose: () => void;
  onSave: (edited: User) => void;
}) {
  const [form, setForm] = useState<User>(() => clone(user));
  const [saving, setSaving] = useState(false);

  const HIDDEN_KEYS = new Set([
    'password', 'created_at', 'uid', 'role_libelle', 'login_insensitive', 'login_norm', 'first_login', 'role_key',
  ]);

  const EXCLUDE_FROM_DYNAMIC = new Set([
    'prenom', 'nom', 'email', 'login', 'role_id', 'docId', 'password', 'created_at', 'uid', 'role_libelle', 'login_insensitive', 'login_norm', 'first_login', 'role_key',
  ]);

  const isPrimitive = (v: any) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

  const setAtPath = (path: (string | number)[], value: any) => {
    setForm((prev) => {
      const next = clone(prev);
      let cur: any = next;
      for (let i = 0; i < path.length - 1; i++) {
        const k = path[i];
        if (typeof k === 'number') {
          if (!Array.isArray(cur)) return prev;
          cur = cur[k];
        } else {
          cur[k] = cur[k] ?? {};
          cur = cur[k];
        }
      }
      const last = path[path.length - 1];
      if (typeof last === 'number') {
        if (!Array.isArray(cur)) return prev;
        cur[last] = value;
      } else {
        cur[last] = value;
      }
      return next;
    });
  };

  const addArrayItem = (path: (string | number)[], sample: any = '') => {
    setForm((prev) => {
      const next = clone(prev);
      let cur: any = next;
      for (let i = 0; i < path.length; i++) {
        const k = path[i];
        cur = cur[k];
      }
      if (!Array.isArray(cur)) return prev;
      cur.push(isPrimitive(sample) ? '' : {});
      return next;
    });
  };

  const removeArrayIndex = (path: (string | number)[], idx: number) => {
    setForm((prev) => {
      const next = clone(prev);
      let cur: any = next;
      for (let i = 0; i < path.length; i++) {
        const k = path[i];
        cur = cur[k];
      }
      if (!Array.isArray(cur)) return prev;
      cur.splice(idx, 1);
      return next;
    });
  };

  const renderValue = (key: string, value: any, path: (string | number)[] = []) => {
    if (HIDDEN_KEYS.has(key)) return null;

    if (key === 'role_id') {
      return (
        <div className="mb-3" key={path.join('.')}>
          <label className="form-label" style={{ color: '#e2e8f0' }}>Rôle</label>
          <select
            className="form-select"
            style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
            value={value ?? ''}
            onChange={(e) => setAtPath(path, e.target.value)}
          >
            <option value="">Sélectionner...</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.libelle}</option>
            ))}
          </select>
        </div>
      );
    }

    if (key === 'created_at') {
      const ts = value?.seconds ? new Date(value.seconds * 1000) : null;
      return (
        <div className="mb-2" key={path.join('.')}>
          <label className="form-label" style={{ color: '#e2e8f0' }}>Créé le</label>
          <div className="form-control" style={{ background: '#0f172a', border: '1px solid #334155', color: '#94a3b8' }}>
            {ts ? ts.toLocaleString() : '—'}
          </div>
        </div>
      );
    }

    if (key === 'documents' && value && typeof value === 'object' && !Array.isArray(value)) {
      return (
  <div className="mb-3" key={path.join('.')}>
    <label className="form-label fw-semibold" style={{ color: '#e2e8f0' }}>Documents</label>
    <div className="row g-2">
      {Object.entries(value).map(([k, v]) => (
        <div className="col-md-6" key={`${path.join('.')}.${k}`}>
          <label className="form-label text-muted" style={{ color: '#94a3b8' }}>{k}</label>
          <input
            type="text"
            className="form-control"
            style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
            value={String(v ?? '')}   // ← correction ici
            onChange={(e) => setAtPath([...path, k], e.target.value)}
            placeholder="URL du document"
          />
          {v && <a className="small mt-1 d-inline-block" href={String(v)} target="_blank" rel="noreferrer" style={{ color: '#029DFE' }}>Ouvrir</a>}
        </div>
      ))}
    </div>
  </div>
);
      // return (
      //   <div className="mb-3" key={path.join('.')}>
      //     <label className="form-label fw-semibold" style={{ color: '#e2e8f0' }}>Documents</label>
      //     <div className="row g-2">
      //       {Object.entries(value).map(([k, v]) => (
      //         <div className="col-md-6" key={`${path.join('.')}.${k}`}>
      //           <label className="form-label text-muted" style={{ color: '#94a3b8' }}>{k}</label>
      //           <input
      //             type="text"
      //             className="form-control"
      //             style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
      //             value={v ?? ''}
      //             onChange={(e) => setAtPath([...path, k], e.target.value)}
      //             placeholder="URL du document"
      //           />
      //           {v && <a className="small mt-1 d-inline-block" href={String(v)} target="_blank" rel="noreferrer" style={{ color: '#029DFE' }}>Ouvrir</a>}
      //         </div>
      //       ))}
      //     </div>
      //   </div>
      // );
    }

    if (Array.isArray(value)) {
      const allPrims = value.every(isPrimitive);
      if (allPrims) {
        return (
          <div className="mb-3" key={path.join('.')}>
            <label className="form-label" style={{ color: '#e2e8f0' }}>{key}</label>
            {value.map((item, idx) => (
              <div className="d-flex gap-2 mb-2" key={`${path.join('.')}.${idx}`}>
                <input
                  type="text"
                  className="form-control"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                  value={item ?? ''}
                  onChange={(e) => setAtPath([...path, idx], e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                  onClick={() => removeArrayIndex(path, idx)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              style={{ borderColor: '#029DFE', color: '#029DFE' }}
              onClick={() => addArrayItem(path, '')}
            >
              <i className="bi bi-plus me-1"></i>Ajouter
            </button>
          </div>
        );
      }
      return (
        <div className="mb-3" key={path.join('.')}>
          <label className="form-label fw-semibold" style={{ color: '#e2e8f0' }}>{key}</label>
          {value.map((obj, idx) => (
            <div className="border rounded p-3 mb-2" key={`${path.join('.')}.${idx}`} style={{ borderColor: '#334155' }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="text-muted" style={{ color: '#94a3b8' }}>#{idx + 1}</span>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                  onClick={() => removeArrayIndex(path, idx)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              </div>
              {Object.entries(obj || {}).map(([k, v]) => renderValue(k, v, [...path, idx, k]))}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            style={{ borderColor: '#029DFE', color: '#029DFE' }}
            onClick={() => addArrayItem(path, {})}
          >
            <i className="bi bi-plus me-1"></i>Ajouter un élément
          </button>
        </div>
      );
    }

    if (value && typeof value === 'object') {
      return (
        <div className="mb-3" key={path.join('.')}>
          <label className="form-label fw-semibold" style={{ color: '#e2e8f0' }}>{key}</label>
          <div className="row g-2">
            {Object.entries(value).map(([k, v]) => (
              <div className="col-12" key={`${path.join('.')}.${k}`}>
                {renderValue(k, v, [...path, k])}
              </div>
            ))}
          </div>
        </div>
      );
    }

    const inputType = typeof value === 'number' ? 'number'
      : typeof value === 'boolean' ? 'checkbox'
      : /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? 'date' : 'text';

    if (inputType === 'checkbox') {
      return (
        <div className="form-check mb-2" key={path.join('.')}>
          <input
            className="form-check-input"
            type="checkbox"
            checked={!!value}
            onChange={(e) => setAtPath(path, e.target.checked)}
            id={`chk-${path.join('.')}`}
            style={{ accentColor: '#029DFE' }}
          />
          <label className="form-check-label" htmlFor={`chk-${path.join('.')}`} style={{ color: '#cbd5e1' }}>
            {key}
          </label>
        </div>
      );
    }

    return (
      <div className="mb-2" key={path.join('.')}>
        <label className="form-label" style={{ color: '#e2e8f0' }}>{key}</label>
        <input
          type={inputType}
          className="form-control"
          style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
          value={value ?? ''}
          onChange={(e) => setAtPath(path, inputType === 'number' ? Number(e.target.value) : e.target.value)}
        />
      </div>
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="modal-dialog modal-xl modal-dialog-centered">
        <div className="modal-content" style={{ background: '#1e293b', border: '1px solid rgba(2,157,254,0.2)', borderRadius: 20 }}>
          <div className="modal-header" style={{ borderBottomColor: '#334155' }}>
            <h5 className="modal-title" style={{ color: 'white' }}>
              <i className="bi bi-pencil-square me-2" style={{ color: '#029DFE' }} /> Modifier l’utilisateur
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="alert alert-info mb-3" style={{ background: 'rgba(2,157,254,0.1)', border: '1px solid rgba(2,157,254,0.3)', color: '#cbd5e1' }}>
              Les champs ci-dessous reprennent toutes les informations stockées (sauf le mot de passe).
            </div>
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <label className="form-label" style={{ color: '#e2e8f0' }}>Prénom</label>
                <input
                  className="form-control"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                  value={form.prenom ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, prenom: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" style={{ color: '#e2e8f0' }}>Nom</label>
                <input
                  className="form-control"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                  value={form.nom ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" style={{ color: '#e2e8f0' }}>Email</label>
                <input
                  type="email"
                  className="form-control"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                  value={form.email ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" style={{ color: '#e2e8f0' }}>Nom d’utilisateur</label>
                <input
                  className="form-control"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                  value={form.login ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, login: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" style={{ color: '#e2e8f0' }}>Rôle</label>
                <select
                  className="form-select"
                  style={{ background: '#0f172a', border: '1px solid #334155', color: 'white' }}
                  value={form.role_id ?? ''}
                  onChange={(e) => setForm((p) => ({ ...p, role_id: e.target.value }))}
                >
                  <option value="">Sélectionner...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.libelle}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row g-3">
              {Object.entries(form)
                .filter(([k]) => !EXCLUDE_FROM_DYNAMIC.has(k))
                .map(([k, v]) => (
                  <div className="col-12" key={k}>{renderValue(k, v, [k])}</div>
                ))}
            </div>
          </div>
          <div className="modal-footer" style={{ borderTopColor: '#334155' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ background: '#334155', border: 'none' }}>
              <i className="bi bi-x-circle me-1"></i>Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg, #029DFE 0%, #0284c7 100%)', border: 'none' }}>
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <i className="bi bi-save me-1"></i>Enregistrer
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- MODAL DELETE (confirmation claire) - MODERNISÉE ---------- */
function DeleteConfirmModal({
  user,
  onCancel,
  onConfirm,
  loading,
}: {
  user: User;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="modal-dialog modal-md modal-dialog-centered">
        <div className="modal-content" style={{ background: '#1e293b', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20 }}>
          <div className="modal-header" style={{ borderBottomColor: '#334155', background: 'rgba(239,68,68,0.1)' }}>
            <h5 className="modal-title" style={{ color: '#ef4444' }}>
              <i className="bi bi-exclamation-triangle me-2" /> Supprimer cet utilisateur ?
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onCancel}></button>
          </div>
          <div className="modal-body">
            <p style={{ color: '#cbd5e1' }}>
              Vous êtes sur le point de <strong>supprimer définitivement</strong> le compte de{' '}
              <strong style={{ color: '#029DFE' }}>{user.prenom} {user.nom}</strong>.
            </p>
            <ul style={{ color: '#94a3b8' }}>
              <li>Le document dans <strong>Firestore</strong> sera supprimé.</li>
              <li>Le compte dans <strong>Firebase Authentication</strong> sera supprimé via une route serveur (si configurée).</li>
              <li>Cette action est irréversible.</li>
            </ul>
            <div className="alert alert-warning" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
              Si l’API serveur n’est pas configurée, seule la suppression Firestore sera effectuée.
            </div>
          </div>
          <div className="modal-footer" style={{ borderTopColor: '#334155' }}>
            <button className="btn btn-secondary" onClick={onCancel} disabled={loading} style={{ background: '#334155', border: 'none' }}>
              Annuler
            </button>
            <button className="btn btn-danger" onClick={onConfirm} disabled={loading} style={{ background: '#ef4444', border: 'none' }}>
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Suppression...
                </>
              ) : (
                <>
                  <i className="bi bi-trash me-1"></i> Supprimer
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
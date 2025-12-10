//src/app/admin/pages/users/userModalView.tsx
import React from 'react';

interface Role {
  id: string;
  libelle: string;
}

interface UserViewModalProps {
  user: Record<string, any> | null;
  roles: Role[];
  show: boolean;
  onClose: () => void;
  onEdit: (user: any) => void;
}

const isPrimitive = (v: any) =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v);

const formatTs = (v: any) => {
  if (v?.seconds) return new Date(v.seconds * 1000).toLocaleString();
  const d = new Date(v);
  return isNaN(+d) ? String(v ?? '—') : d.toLocaleString();
};

const FriendlyKey: Record<string, string> = {
  prenom: 'Prénom',
  nom: 'Nom',
  email: 'Email',
  login: 'Nom d’utilisateur',
  role_id: 'Rôle',
  first_login: 'Première connexion',
  telephone: 'Téléphone',
  intitule_poste: 'Intitulé du poste',
  departement: 'Département',
  departements: 'Départements',
  classe: 'Classe',
  specialty: 'Spécialité',
  created_at: 'Créé le',
  documents: 'Documents',
};

const UserViewModal: React.FC<UserViewModalProps> = ({
  user,
  roles,
  show,
  onClose,
  onEdit,
}) => {
  if (!show || !user) return null;

  const getRoleName = (roleId: string) =>
    roles.find((r) => r.id === roleId)?.libelle || roleId || 'Inconnu';

  const HIDE_KEYS = new Set(['password']);

  const renderValue = (key: string, value: any, path: string[] = []) => {
    if (HIDE_KEYS.has(key)) return null;

    // Rôle lisible
    if (key === 'role_id') {
      return row(key, getRoleName(String(value)));
    }

    // created_at
    if (key === 'created_at') {
      return row(key, formatTs(value));
    }

    // first_login
    if (key === 'first_login') {
      const badge =
        String(value) === '1' ? (
          <span className="badge bg-warning text-dark">Oui</span>
        ) : (
          <span className="badge bg-success">Non</span>
        );
      return row(key, badge);
    }

    // Documents: liens cliquables
    if (key === 'documents' && value && typeof value === 'object' && !Array.isArray(value)) {
      return (
        <div className="mb-3" key={path.join('.')}>
          <label className="form-label fw-semibold">{labelOf(key)}</label>
          <div className="row g-2">
            {Object.entries(value).map(([k, v]) => (
              <div className="col-md-6" key={`${path.join('.')}.${k}`}>
                <div className="small text-muted">{k}</div>
                {v ? (
                  <a href={String(v)} target="_blank" rel="noreferrer">
                    {String(v)}
                  </a>
                ) : (
                  <div className="text-muted">—</div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Tableaux
    if (Array.isArray(value)) {
      const allPrims = value.every(isPrimitive);
      if (allPrims) {
        return row(
          key,
          value.length ? (
            <ul className="mb-0">
              {value.map((it, idx) => (
                <li key={`${path.join('.')}.${idx}`}>{String(it ?? '') || '—'}</li>
              ))}
            </ul>
          ) : (
            '—'
          )
        );
      }
      // tableau d'objets
      return (
        <div className="mb-3" key={path.join('.')}>
          <label className="form-label fw-semibold">{labelOf(key)}</label>
          {!value.length && <div className="text-muted">—</div>}
          {value.map((obj, idx) => (
            <div className="border rounded p-3 mb-2" key={`${path.join('.')}.${idx}`}>
              <div className="small text-muted mb-2">#{idx + 1}</div>
              {Object.entries(obj || {}).map(([k, v]) => renderValue(k, v, [...path, String(idx), k]))}
            </div>
          ))}
        </div>
      );
    }

    // Objet
    if (value && typeof value === 'object') {
      return (
        <div className="mb-3" key={path.join('.')}>
          <label className="form-label fw-semibold">{labelOf(key)}</label>
          {Object.entries(value).length ? (
            <div className="row g-2">
              {Object.entries(value).map(([k, v]) => (
                <div className="col-12" key={`${path.join('.')}.${k}`}>
                  {renderValue(k, v, [...path, k])}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted">—</div>
          )}
        </div>
      );
    }

    // Primitif
    return row(key, String(value ?? '—'));
  };

  const labelOf = (k: string) => FriendlyKey[k] || k;

  const row = (k: string, content: React.ReactNode) => (
    <div className="row mb-2" key={k}>
      <div className="col-md-4">
        <small className="text-muted text-uppercase fw-semibold">{labelOf(k)}</small>
      </div>
      <div className="col-md-8">
        <div className="fw-semibold">{content}</div>
      </div>
    </div>
  );

  const handleEditClick = () => {
    onClose();
    onEdit(user);
  };

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-dark text-white border-0">
            <div className="d-flex align-items-center">
              <div className="bg-white rounded-circle p-2 me-3">
                <i className="bi bi-person-circle text-dark" style={{ fontSize: '1.5rem' }}></i>
              </div>
              <div>
                <h5 className="modal-title mb-0 fw-bold">Détails de l’utilisateur</h5>
                {user.docId && <small className="opacity-75">UID: {user.docId}</small>}
              </div>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body">
            <div className="row g-4">
              <div className="col-xl-6">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-header bg-white border-0">
                    <h6 className="mb-0 fw-bold"><i className="bi bi-person-lines-fill me-2" />Informations générales</h6>
                  </div>
                  <div className="card-body">
                    {renderValue('prenom', user.prenom)}
                    {renderValue('nom', user.nom)}
                    {renderValue('email', user.email)}
                    {renderValue('login', user.login)}
                    {renderValue('role_id', user.role_id)}
                    {renderValue('first_login', user.first_login)}
                    {user.created_at && renderValue('created_at', user.created_at)}
                  </div>
                </div>
              </div>

              <div className="col-xl-6">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-header bg-white border-0">
                    <h6 className="mb-0 fw-bold"><i className="bi bi-info-circle me-2" />Autres informations</h6>
                  </div>
                  <div className="card-body">
                    {Object.entries(user)
                      .filter(([k]) => !['prenom','nom','email','login','role_id','first_login','created_at','password','docId'].includes(k))
                      .map(([k, v]) => renderValue(k, v, [k]))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer border-0 bg-light">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              <i className="bi bi-x-circle me-1"></i>
              Fermer
            </button>
            <button
              type="button"
              className="btn btn-dark"
              onClick={handleEditClick}
            >
              <i className="bi bi-pencil me-1"></i>
              Modifier cet utilisateur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserViewModal;

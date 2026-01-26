"use client";
import React from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../../../../firebaseConfig";

type CahierEntry = {
  id: string;
  class_ids: string[];
  classes: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  matiere_libelle: string;
  nombre_heures: number;
  objectif_cours: string;
  professeur_nom: string;
  salle: string;
  travaux_a_faire: string;
};

type ClassGroup = {
  className: string;
  entries: CahierEntry[];
};

export default function CahierDeTextePage() {
  const [loading, setLoading] = React.useState(true);
  const [classGroups, setClassGroups] = React.useState<ClassGroup[]>([]);
  const [selectedClass, setSelectedClass] = React.useState<string>("");

  React.useEffect(() => {
    loadCahierTextes();
  }, []);

  const loadCahierTextes = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, "cahier_textes"), orderBy("date", "desc"));
      const snap = await getDocs(q);

      const entries: CahierEntry[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        entries.push({
          id: doc.id,
          class_ids: data.class_ids || [],
          classes: data.classes || "",
          date: data.date || "",
          heure_debut: data.heure_debut || "",
          heure_fin: data.heure_fin || "",
          matiere_libelle: data.matiere_libelle || "",
          nombre_heures: data.nombre_heures || 0,
          objectif_cours: data.objectif_cours || "",
          professeur_nom: data.professeur_nom || "",
          salle: data.salle || "",
          travaux_a_faire: data.travaux_a_faire || "",
        });
      });

      // Group by class
      const grouped = new Map<string, CahierEntry[]>();
      entries.forEach((entry) => {
        const className = entry.classes || "Sans classe";
        if (!grouped.has(className)) {
          grouped.set(className, []);
        }
        grouped.get(className)!.push(entry);
      });

      const groups: ClassGroup[] = Array.from(grouped.entries())
        .map(([className, entries]) => ({
          className,
          entries: entries.sort((a, b) => {
            const dateA = a.date.split("/").reverse().join("");
            const dateB = b.date.split("/").reverse().join("");
            return dateB.localeCompare(dateA);
          }),
        }))
        .sort((a, b) => a.className.localeCompare(b.className));

      setClassGroups(groups);
      if (groups.length > 0) {
        setSelectedClass(groups[0].className);
      }
    } catch (error) {
      console.error("Erreur lors du chargement du cahier de texte:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentGroup = classGroups.find((g) => g.className === selectedClass);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Chargement...</span>
        </div>
        <p className="text-muted mt-3 mb-0">Chargement du cahier de texte...</p>
      </div>
    );
  }

  return (
    <div className="cahier-page">
      <div className="page-header">
        <div className="header-content">
          <div className="header-left">
            <h4 className="page-title mb-0">
              <i className="bi bi-journal-text me-2"></i>
              Cahier de texte
            </h4>
          </div>
          <button className="btn btn-sm btn-outline-primary refresh-btn" onClick={loadCahierTextes}>
            <i className="bi bi-arrow-clockwise me-1"></i>
            Actualiser
          </button>
        </div>
      </div>

      {classGroups.length === 0 ? (
        <div className="empty-state">
          <i className="bi bi-inbox text-muted"></i>
          <p className="text-muted mt-3 mb-0">Aucune entrée dans le cahier de texte</p>
        </div>
      ) : (
        <>
          <div className="class-selector-container">
            <label className="form-label">Sélectionner une classe</label>
            <select
              className="form-select class-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              {classGroups.map((group) => (
                <option key={group.className} value={group.className}>
                  {group.className} ({group.entries.length} entrée{group.entries.length > 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </div>

          {currentGroup && (
            <div className="entries-grid">
              {currentGroup.entries.map((entry) => (
                <div key={entry.id} className="entry-card">
                  <div className="entry-header">
                    <h6 className="entry-title">
                      <i className="bi bi-book me-2"></i>
                      {entry.matiere_libelle}
                    </h6>
                    <div className="entry-meta">
                      <i className="bi bi-person-badge me-1"></i>
                      {entry.professeur_nom}
                    </div>
                  </div>

                  <div className="entry-badges">
                    <span className="badge-custom badge-date">
                      <i className="bi bi-calendar3 me-1"></i>
                      {entry.date}
                    </span>
                    <span className="badge-custom badge-time">
                      <i className="bi bi-clock me-1"></i>
                      {entry.heure_debut} - {entry.heure_fin}
                    </span>
                    <span className="badge-custom badge-duration">
                      <i className="bi bi-hourglass-split me-1"></i>
                      {entry.nombre_heures}h
                    </span>
                    <span className="badge-custom badge-room">
                      <i className="bi bi-door-open me-1"></i>
                      {entry.salle}
                    </span>
                  </div>

                  <div className="entry-content">
                    <div className="content-section">
                      <div className="section-label">Objectif du cours</div>
                      <p className="section-text">{entry.objectif_cours}</p>
                    </div>
                    {entry.travaux_a_faire && (
                      <div className="content-section">
                        <div className="section-label">Travaux à faire</div>
                        <p className="section-text">{entry.travaux_a_faire}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .cahier-page {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .page-header {
          background: white;
          border-bottom: 2px solid #e9ecef;
          padding: 1rem 0;
          margin-bottom: 1.5rem;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .page-title {
          color: #233043;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .refresh-btn {
          white-space: nowrap;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
        }

        .empty-state i {
          font-size: 4rem;
        }

        .class-selector-container {
          margin-bottom: 1.5rem;
        }

        .class-select {
          max-width: 500px;
          font-size: 1rem;
          padding: 0.6rem;
          border: 2px solid #e9ecef;
          border-radius: 8px;
        }

        .class-select:focus {
          border-color: #0d6efd;
          box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.15);
        }

        .entries-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr));
          gap: 1.25rem;
          animation: fadeIn 0.3s ease-in;
        }

        .entry-card {
          background: white;
          border: 1px solid #e9ecef;
          border-radius: 12px;
          padding: 1.25rem;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .entry-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .entry-header {
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #f0f0f0;
        }

        .entry-title {
          color: #0d6efd;
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .entry-meta {
          color: #6c757d;
          font-size: 0.9rem;
        }

        .entry-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .badge-custom {
          display: inline-flex;
          align-items: center;
          padding: 0.35rem 0.75rem;
          font-size: 0.85rem;
          border-radius: 6px;
          font-weight: 500;
        }

        .badge-date {
          background: #e7f3ff;
          color: #0d6efd;
        }

        .badge-time {
          background: #f8f9fa;
          color: #495057;
        }

        .badge-duration {
          background: #d1f4e0;
          color: #198754;
        }

        .badge-room {
          background: #fff3cd;
          color: #997404;
        }

        .entry-content {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .content-section {
          background: #f8f9fa;
          padding: 0.75rem;
          border-radius: 6px;
        }

        .section-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #6c757d;
          text-transform: uppercase;
          margin-bottom: 0.4rem;
        }

        .section-text {
          margin: 0;
          color: #233043;
          line-height: 1.5;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 768px) {
          .page-title {
            font-size: 1.25rem;
          }

          .entries-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .entry-card {
            padding: 1rem;
          }

          .entry-badges {
            gap: 0.4rem;
          }

          .badge-custom {
            font-size: 0.8rem;
            padding: 0.3rem 0.6rem;
          }
        }

        @media (min-width: 1200px) {
          .entries-grid {
            grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
          }
        }

        @media (min-width: 1600px) {
          .entries-grid {
            grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
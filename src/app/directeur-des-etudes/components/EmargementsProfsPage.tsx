// src/app/directeur-des-etudes/components/EmargementsProfsPage.tsx
"use client";

import React from "react";
import {
  collection, getDocs, query, where, orderBy, DocumentData
} from "firebase/firestore";
import { db } from "../../../../firebaseConfig";
import { notifyDirecteurProfEmargement } from "@/lib/notifications";
import ModalPortal from "./ModalPortal";

const useJsPDF = () => {
  const ref = React.useRef<{ jsPDF: any; autoTable: (doc: any, opts: any) => any } | null>(null);
  const load = async () => {
    if (!ref.current) {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf").then(m => ({ jsPDF: m.jsPDF })),
        import("jspdf-autotable"),
      ]);
      ref.current = { jsPDF, autoTable };
    }
    return ref.current!;
  };
  return load;
};


type Row = {
  id: string;
  professeur_id: string;
  enseignant: string;
  class_id: string;
  matiere_id: string;
  matiere_libelle: string;
  start: string;
  end: string;
  nbrHeures?: number;
  timestamp?: string;
  date?: string;
  salle?: string;
  type?: string;
};
type ProfMini = { docId: string; nom: string; prenom: string };

function isoDayBounds(d: Date) {
  const s = new Date(d); s.setHours(0,0,0,0);
  const e = new Date(d); e.setHours(23,59,59,999);
  return { startIso: s.toISOString(), endIso: e.toISOString() };
}
function isoMonthBounds(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
  const e = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
  return { startIso: s.toISOString(), endIso: e.toISOString() };
}
const hdiff = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh*60+em) - (sh*60+sm);
  return Math.max(0, mins)/60;
};

export default function EmargementsProfsPage() {
  const loadJsPDF = useJsPDF();

  // ---- onglets
  type View = "day" | "list";
  const [view, setView] = React.useState<View>("day");

  // ---- profs + classes
  const [profs, setProfs] = React.useState<ProfMini[]>([]);
  const profById = React.useMemo(
    () => Object.fromEntries(profs.map(p => [p.docId, p] as const)),
    [profs]
  );
  const [classMap, setClassMap] = React.useState<Record<string,string>>({});

  React.useEffect(() => {
    (async () => {
      const ps = await getDocs(query(collection(db, "users"), where("role_key", "==", "prof")));
      const list: ProfMini[] = [];
      ps.forEach(d => {
        const v = d.data() as any;
        list.push({ docId: d.id, nom: v.nom || "", prenom: v.prenom || "" });
      });
      list.sort((a,b)=> (a.nom+a.prenom).localeCompare(b.nom+b.prenom,"fr"));
      setProfs(list);

      const cs = await getDocs(collection(db, "classes"));
      const cmap: Record<string,string> = {};
      cs.forEach(d => {
        const v = d.data() as any;
        cmap[d.id] = String(v.libelle || d.id);
      });
      setClassMap(cmap);
    })();
  }, []);

  // ====================== VUE JOUR ======================
  const [day, setDay] = React.useState<Date>(new Date());
  const dayLabel = day.toLocaleDateString("fr-FR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
  const [loadingDay, setLoadingDay] = React.useState(false);
  const [dayRows, setDayRows] = React.useState<Row[]>([]);

  const fetchDayAll = React.useCallback(async (d: Date) => {
    setLoadingDay(true);
    try {
      const { startIso, endIso } = isoDayBounds(d);
      const qref = query(
        collection(db, "emargements_professeurs"),
        where("timestamp", ">=", startIso),
        where("timestamp", "<=", endIso),
        orderBy("timestamp", "asc"),
      );
      const snap = await getDocs(qref);
      const out: Row[] = [];
      snap.forEach(docu => {
        const v = docu.data() as DocumentData;
        const r: Row = {
          id: docu.id,
          professeur_id: String(v.professeur_id || ""),
          enseignant: String(v.enseignant || ""),
          class_id: String(v.class_id || ""),
          matiere_id: String(v.matiere_id || ""),
          matiere_libelle: String(v.matiere_libelle || ""),
          start: String(v.start || ""),
          end: String(v.end || ""),
          nbrHeures: typeof v.nbrHeures === "number" ? v.nbrHeures : undefined,
          timestamp: String(v.timestamp || ""),
          salle: String(v.salle || ""),
          date: String(v.date || ""),
          type: String(v.type || ""),
        };
        if (r.nbrHeures == null && r.start && r.end) r.nbrHeures = hdiff(r.start, r.end);
        out.push(r);
      });
      setDayRows(out);
    } finally { setLoadingDay(false); }
  }, []);
  React.useEffect(() => { fetchDayAll(day); }, [day, fetchDayAll]);

  // ====================== VUE LISTE (MENSUEL) ======================
  const [monthRef, setMonthRef] = React.useState<Date>(new Date());
  const monthLabel = React.useMemo(
    () => monthRef.toLocaleDateString("fr-FR", { month:"long", year:"numeric" }),
    [monthRef]
  );
  const [loadingMonth, setLoadingMonth] = React.useState(false);
  const [monthRows, setMonthRows] = React.useState<Row[]>([]);

  const loadMonth = React.useCallback(async (ref: Date) => {
    setLoadingMonth(true);
    try {
      const { startIso, endIso } = isoMonthBounds(ref);
      const qref = query(
        collection(db, "emargements_professeurs"),
        where("timestamp", ">=", startIso),
        where("timestamp", "<=", endIso),
        orderBy("timestamp", "asc"),
      );
      const snap = await getDocs(qref);
      const out: Row[] = [];
      // ...dans loadMonth()
      snap.forEach(docu => {
        const v = docu.data() as DocumentData;
        const r: Row = {
          id: docu.id,
          professeur_id: String(v.professeur_id || ""),
          enseignant: String(v.enseignant || ""),
          class_id: String(v.class_id || ""),
          matiere_id: String(v.matiere_id || ""),
          matiere_libelle: String(v.matiere_libelle || ""),
          start: String(v.start || ""),
          end: String(v.end || ""),
          nbrHeures: typeof v.nbrHeures === "number" ? v.nbrHeures : undefined,
          timestamp: String(v.timestamp || ""),
          // 👇 AJOUTS pour pouvoir afficher le détail
          date: String(v.date || ""),
          salle: String(v.salle || ""),
          type: String(v.type || ""),
        };
        if (r.nbrHeures == null && r.start && r.end) r.nbrHeures = hdiff(r.start, r.end);
        out.push(r);
      });
      setMonthRows(out);
    } finally { setLoadingMonth(false); }
  }, []);
  React.useEffect(() => { loadMonth(monthRef); }, [monthRef, loadMonth]);

  // Agrégations (tous)
  const monthlyAll = React.useMemo(() => {
    const agg = new Map<string, { total:number; byClass: Record<string, Record<string, number>> }>();
    for (const r of monthRows) {
      const pid = r.professeur_id || r.enseignant || "—";
      const hours = r.nbrHeures || 0;
      const classe = classMap[r.class_id] || r.class_id || "—";
      const mat = r.matiere_libelle || r.matiere_id || "—";
      if (!agg.has(pid)) agg.set(pid, { total:0, byClass:{} });
      const p = agg.get(pid)!;
      p.total += hours;
      if (!p.byClass[classe]) p.byClass[classe] = {};
      p.byClass[classe][mat] = (p.byClass[classe][mat] || 0) + hours;
    }
    return agg;
  }, [monthRows, classMap]);

  const profIdsSorted = React.useMemo(() => {
    const vec = Array.from(monthlyAll.entries());
    vec.sort((a,b) => {
      const t = b[1].total - a[1].total;
      if (t !== 0) return t;
      const pa = profById[a[0]], pb = profById[b[0]];
      const na = pa ? `${pa.prenom} ${pa.nom}` : a[0];
      const nb = pb ? `${pb.prenom} ${pb.nom}` : b[0];
      return na.localeCompare(nb, "fr", { sensitivity:"base" });
    });
    return vec.map(([id]) => id);
  }, [monthlyAll, profById]);

  const monthlyForOne = React.useCallback((profId: string) => {
    return monthlyAll.get(profId) || { total:0, byClass:{} as Record<string, Record<string, number>> };
  }, [monthlyAll]);

  // Modales + PDF
  const [showMonthlyAll, setShowMonthlyAll] = React.useState(false);
  const [showMonthlyOne, setShowMonthlyOne] = React.useState<null | { profId: string; title: string }>(null);

  const exportMonthlyAllPDF = async () => {
    const { jsPDF, autoTable } = await loadJsPDF();
    const doc = new jsPDF({ unit: "pt", format: "a4" });


    const M = 64;            // marge un peu plus grande
    const X = M, Y0 = M;
    let cursorY = Y0;

    // entête établissement + titre
    // entête établissement + titre (même taille, établissement en gras)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Institut Informatique Business School", X, cursorY);
    cursorY += 25; // petit espace entre les 2 lignes

    doc.setFont("helvetica", "bold"); // (si tu préfères le titre non-bold: "normal")
    doc.setFontSize(16);
    doc.text(`Émargements des professeurs — ${monthLabel}`, X, cursorY);
    cursorY += 28; // un peu plus d’air avant le contenu


    let firstPage = true;

    const writeProfBlock = (name: string, data: { total:number; byClass: Record<string, Record<string, number>> }) => {
      // si on est trop bas, page suivante
      const pageHeight = doc.internal.pageSize.getHeight();
      if (cursorY > pageHeight - 160) {
        doc.addPage();
        cursorY = Y0;
      }

      // Nom du prof + total
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(name, X, cursorY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Total heures : ${data.total.toFixed(2).replace(".", ",")} h`, X, cursorY + 16);
      cursorY += 34; // + d’espace avant les libellés de classe


      // Classes
      for (const [classe, mats] of Object.entries(data.byClass)) {
        // Titre de classe
        doc.setFontSize(12);
        cursorY += 4;
        doc.text(`Classe ${classe}`, X, cursorY);
        cursorY += 8;

        // Tableau matières/heures
        autoTable(doc, {
        startY: cursorY + 6,
        head: [["Matière", "Total heures"]],
        body: Object.entries(mats).map(([m, h]) => [m, h.toFixed(2).replace(".", ",")]),
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [13,110,253] },
        margin: { left: X, right: X },
        });
        // l’API expose le dernier tableau via doc.lastAutoTable
        const finalY = (doc as any).lastAutoTable?.finalY ?? (cursorY + 6);
        cursorY = finalY + 14;

      }
      // petite ligne séparatrice entre profs
      doc.setDrawColor(220);
      doc.line(X, cursorY, doc.internal.pageSize.getWidth() - X, cursorY);
      cursorY += 16;
    };

    for (const pid of profIdsSorted) {
      const data = monthlyAll.get(pid);
      if (!data || data.total <= 0) continue;
      const p = profById[pid];
      const name = p ? `${p.prenom} ${p.nom}` : pid;

      if (!firstPage && cursorY > doc.internal.pageSize.getHeight() - 200) {
        doc.addPage();
        cursorY = Y0;
      }
      firstPage = false;
      writeProfBlock(name, data);
    }

    if (firstPage) {
      doc.setFontSize(12);
      doc.text("Aucune donnée pour ce mois.", X, cursorY + 8);
    }

    const y = monthRef.getFullYear();
    const m = String(monthRef.getMonth()+1).padStart(2,"0");
    doc.save(`emargements_profs_${y}-${m}.pdf`);
  };

  // -------------------- RENDER --------------------
  return (
    <div className="container-fluid py-3">
      {/* TITRE DE PAGE (restauré) */}
      <nav aria-label="breadcrumb" className="mb-1">
        <ol className="breadcrumb small mb-0">
            <li className="breadcrumb-item">
            <span className="text-muted">Émargements</span>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
            Professeurs
            </li>
        </ol>
      </nav>
      <div className="d-flex justify-content-between align-items-end mb-2">
        <h3 className="mb-0">Émargements des professeurs</h3>
        {view === "day" ? (
          <span className="text-muted small">Jour : <b>{dayLabel}</b></span>
        ) : (
          <span className="text-muted small">Mois : <b>{monthLabel}</b></span>
        )}
      </div>

      {/* NAV TABS */}
      <ul className="nav nav-pills mb-3">
        <li className="nav-item">
          <button className={`nav-link ${view==="day" ? "active" : ""}`} onClick={()=>setView("day")}>
            Émargements du jour
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${view==="list" ? "active" : ""}`} onClick={()=>setView("list")}>
            Liste des professeurs
          </button>
        </li>
      </ul>

      {/* VUE JOUR */}
      {view === "day" && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white border-0 d-flex justify-content-between align-items-center">
            <h5 className="mb-0"><i className="bi bi-calendar-check me-2" /> {dayLabel}</h5>
            <div className="d-flex gap-2">
              <input
                type="date"
                className="form-control form-control-sm"
                value={day.toISOString().slice(0,10)}
                onChange={(e)=> setDay(new Date(e.target.value+"T00:00:00"))}
                style={{ minWidth: 170 }}
              />
              <button className="btn btn-outline-secondary btn-sm" onClick={()=>setDay(new Date())}>Aujourd’hui</button>
            </div>
          </div>
          <div className="card-body">
            {loadingDay ? (
              <div className="text-center py-4"><div className="spinner-border" /></div>
            ) : dayRows.length === 0 ? (
              <div className="text-muted">Aucun émargement pour ce jour.</div>
            ) : (
              Array.from(
                dayRows.reduce<Map<string, Row[]>>((m, r) => {
                  const k = r.professeur_id || r.enseignant || "—";
                  if (!m.has(k)) m.set(k, []);
                  m.get(k)!.push(r);
                  return m;
                }, new Map())
              ).map(([profId, list]) => {
                const p = profById[profId];
                const nom = p ? `${p.prenom} ${p.nom}` : (list[0]?.enseignant || "—");
                const total = list.reduce((s,x)=> s + (x.nbrHeures || 0), 0);
                return (
                  <div key={profId} className="mb-3">
                    <div className="fw-bold fs-6 mb-1">{nom}</div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle">
                        <thead className="table-light">
                          <tr>
                            <th>Matière</th>
                            <th>Classe</th>
                            <th>Salle</th>
                            <th>Créneau</th>
                            <th className="text-end">Heures</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map(r => (
                            <tr key={r.id}>
                              <td>{r.matiere_libelle || r.matiere_id}</td>
                              <td>{classMap[r.class_id] || r.class_id || "—"}</td>
                              <td>{r.salle || "—"}</td>
                              <td>{r.start} – {r.end}</td>
                              <td className="text-end">{(r.nbrHeures ?? 0).toFixed(2).replace(".", ",")}</td>
                            </tr>
                          ))}
                          <tr className="table-light">
                            <td colSpan={4} className="text-end fw-semibold">Total</td>
                            <td className="text-end fw-semibold">{total.toFixed(2).replace(".", ",")}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VUE LISTE */}
      {view === "list" && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white border-0 d-flex justify-content-between align-items-center">
            <h5 className="mb-0"><i className="bi bi-people me-2" /> Professeurs — <span className="text-muted fw-normal">{monthLabel}</span></h5>
            <div className="d-flex align-items-center gap-2">
              <input
                type="month"
                className="form-control form-control-sm"
                value={`${monthRef.getFullYear()}-${String(monthRef.getMonth()+1).padStart(2,"0")}`}
                onChange={(e)=> {
                  const [y,m] = e.target.value.split("-").map(Number);
                  setMonthRef(new Date(y, (m||1)-1, 1));
                }}
                style={{ minWidth: 150 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowMonthlyAll(true)}
                disabled={loadingMonth}
                title="Voir tous les profs (résumé mensuel) et exporter en PDF"
                >
                Résumé mensuel
              </button>
            </div>
          </div>
          <div className="card-body" style={{ maxHeight: 560, overflow: "auto" }}>
            {profs.map(p => {
              const agg = monthlyAll.get(p.docId);
              const total = agg?.total ?? 0;
              return (
                <div key={p.docId} className="d-flex flex-wrap justify-content-between align-items-center border-bottom py-2 gap-2">
                  <div className="fw-semibold">
                    {p.prenom} {p.nom}
                    <span className="text-muted ms-2 small">{total>0 ? `— ${total.toFixed(2).replace(".", ",")} h` : ""}</span>
                  </div>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={()=> setShowMonthlyOne({ profId:p.docId, title:`Résumé mensuel — ${p.prenom} ${p.nom} — ${monthLabel}` })}
                  >
                    Relevé mensuel
                  </button>
                </div>
              );
            })}
            {profs.length === 0 && <div className="text-muted">Aucun professeur.</div>}
          </div>
        </div>
      )}

      {/* MODALE — TOUS LES PROFS */}
      {showMonthlyAll && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display:"block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-xl modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Résumé mensuel — tous les professeurs — {monthLabel}</h5>
                  <button className="btn-close" onClick={()=>setShowMonthlyAll(false)} />
                </div>
                <div className="modal-body" style={{ maxHeight:"70vh", overflow:"auto" }}>
                  {profIdsSorted.length === 0 ? (
                    <div className="text-muted">Aucune donnée pour ce mois.</div>
                  ) : (
                    profIdsSorted.map(pid => {
                      const data = monthlyAll.get(pid);
                      if (!data || data.total <= 0) return null;
                      const p = profById[pid];
                      const name = p ? `${p.prenom} ${p.nom}` : pid;
                      return (
                        <div key={pid} className="mb-3">
                          <div className="fw-bold">{name} <span className="text-muted">— total {data.total.toFixed(2).replace(".", ",")} h</span></div>
                          {Object.entries(data.byClass).map(([classe, mats]) => (
                            <div key={classe} className="ms-2">
                              <div className="text-muted small">Classe {classe}</div>
                              <div className="table-responsive">
                                <table className="table table-sm align-middle">
                                  <thead className="table-light">
                                    <tr><th>Matière</th><th className="text-end">Total heures</th></tr>
                                  </thead>
                                  <tbody>
                                    {Object.entries(mats).map(([mat, h]) => (
                                      <tr key={mat}>
                                        <td>{mat}</td>
                                        <td className="text-end">{h.toFixed(2).replace(".", ",")}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={()=>setShowMonthlyAll(false)}>Fermer</button>
                  <button className="btn btn-primary btn-sm" onClick={exportMonthlyAllPDF}>
                    <i className="bi bi-filetype-pdf me-1" /> Exporter PDF global
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={()=>setShowMonthlyAll(false)} />
        </>
        </ModalPortal>
      )}

      {/* MODALE — UN PROF */}
      {showMonthlyOne && (
        <ModalPortal>
        <>
          <div className="modal fade show" style={{ display:"block" }} aria-modal="true" role="dialog">
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{showMonthlyOne.title}</h5>
                  <button className="btn-close" onClick={()=>setShowMonthlyOne(null)} />
                </div>
                <div className="modal-body">
                  {(() => {
                    // agrégat existant (pour total de secours)
                    const d = monthlyForOne(showMonthlyOne.profId);

                    // Détails pour CE prof sur le mois
                    const details = monthRows
                      .filter(r => r.professeur_id === showMonthlyOne.profId)
                      .sort((a,b) => {
                        const ta = a.timestamp || "";
                        const tb = b.timestamp || "";
                        if (ta !== tb) return ta.localeCompare(tb);
                        return (a.start || "").localeCompare(b.start || "");
                      });

                    if (details.length === 0) return <div className="text-muted">Aucune donnée pour ce mois.</div>;

                    const total = details.reduce((s, r) => s + (r.nbrHeures || 0), 0);

                    const fmtJour = (ts?: string, fallback?: string) => {
                      const d = ts ? new Date(ts) : (fallback ? new Date(fallback) : null);
                      if (!d || isNaN(d.getTime())) return fallback || "—";
                      return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
                    };

                    return (
                      <>
                        <div className="text-muted mb-2">
                          Total : <b>{(total || d.total || 0).toFixed(2).replace(".", ",")} h</b>
                        </div>

                        <div className="table-responsive">
                          <table className="table table-sm align-middle">
                            <thead className="table-light">
                              <tr>
                                <th>Jour</th>
                                <th>Créneau</th>
                                <th>Classe</th>
                                <th>Matière</th>
                                <th>Salle</th>
                                <th className="text-end">Heures</th>
                              </tr>
                            </thead>
                            <tbody>
                              {details.map((r) => (
                                <tr key={r.id}>
                                  <td>{fmtJour(r.timestamp, r.date)}</td>
                                  <td>{r.start} – {r.end}</td>
                                  <td>{classMap[r.class_id] || r.class_id || "—"}</td>
                                  <td>{r.matiere_libelle || r.matiere_id || "—"}</td>
                                  <td>{r.salle || "—"}</td>
                                  <td className="text-end">{(r.nbrHeures ?? 0).toFixed(2).replace(".", ",")}</td>
                                </tr>
                              ))}
                              <tr className="table-light">
                                <td colSpan={5} className="text-end fw-semibold">Total</td>
                                <td className="text-end fw-semibold">
                                  {total.toFixed(2).replace(".", ",")}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary btn-sm" onClick={()=>setShowMonthlyOne(null)}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={()=>setShowMonthlyOne(null)} />
        </>
        </ModalPortal>
      )}
      <style jsx>{`
        :global(nav[aria-label="breadcrumb"] .breadcrumb .breadcrumb-item),
        :global(nav[aria-label="breadcrumb"] .breadcrumb .breadcrumb-item a),
        :global(nav[aria-label="breadcrumb"] .breadcrumb .breadcrumb-item.active),
        :global(nav[aria-label="breadcrumb"] .breadcrumb .breadcrumb-item + .breadcrumb-item::before) {
            color: #0d6efd !important;
        }
        :global(nav[aria-label="breadcrumb"] .breadcrumb) {
          --bs-breadcrumb-divider: '>';
        }
        /* petit espace autour du séparateur */
        :global(nav[aria-label="breadcrumb"] .breadcrumb .breadcrumb-item + .breadcrumb-item::before) {
          padding: 0 .35rem;
        }
      `}</style>
      <style jsx global>{`
        .modal-backdrop { z-index: 1990 !important; }
        .modal          { z-index: 2000 !important; }
      `}</style>
    </div>
  );
}

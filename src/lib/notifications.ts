// src/lib/notifications.ts
import { addDoc, collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "../../firebaseConfig"; // adapte le chemin

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

export async function notifyDirecteurProfEmargement(payload: {
  professeur_id?: string;
  enseignant?: string;
  class_id: string;
  classe_libelle?: string;
  matiere_id: string;
  matiere_libelle?: string;
  date: Date;
  start: string;
  end: string;
  salle?: string;
}) {
  const dateISO = toISODate(payload.date);
  const dedup_key =
    `prof_emargement::${dateISO}::${payload.professeur_id || payload.enseignant || "NA"}::`+
    `${payload.class_id}::${payload.matiere_id}::${payload.start}-${payload.end}`;

  const exists = await getDocs(query(
    collection(db, "notifications"),
    where("dedup_key", "==", dedup_key),
    limit(1)
  ));
  if (!exists.empty) return;

  const title = `📝 Émargement prof — ${payload.enseignant || "Enseignant"}`;
  const body =
    `${dateISO} • ${(payload.matiere_libelle || payload.matiere_id)} ` +
    `(${payload.start}–${payload.end})` +
    (payload.classe_libelle ? ` • ${payload.classe_libelle}` : "") +
    (payload.salle ? ` • Salle ${payload.salle}` : "");

  await addDoc(collection(db, "notifications"), {
    type: "prof_emargement",
    title,
    body,
    created_at: new Date(),
    read: false,
    audience_role: "directeur",
    dedup_key,
    meta: {
      professeur_id: payload.professeur_id,
      enseignant: payload.enseignant,
      class_id: payload.class_id,
      classe_libelle: payload.classe_libelle,
      matiere_id: payload.matiere_id,
      matiere_libelle: payload.matiere_libelle,
      dateISO,
      start: payload.start,
      end: payload.end,
      salle: payload.salle || "",
    },
  });
}

// src/app/directeur-des-etudes/layout.tsx
import type { Metadata } from "next";
import { AcademicYearProvider } from "./context/AcademicYearContext";

export const metadata: Metadata = {
  title: "IIBS | Directeur des Études",
  description: "Espace Directeur des Études",
};

export default function DirecteurLayout({ children }: { children: React.ReactNode }) {
  // NEW (optionnel) : garde simple côté client
  if (typeof window !== "undefined") {
    const role = localStorage.getItem("userRole") || "";
    const r = role.toLowerCase();
    const isDirector = r.includes("directeur");
    const isAssistantDirector = r.includes("assistant") && r.includes("directeur");

    if (!isDirector && !isAssistantDirector) {
      // NEW: si tu veux forcer une redirection, dé-commente la ligne suivante :
      // window.location.href = "/admin/auth/login";
    }
  }

  return (
    <AcademicYearProvider>
      <div className="min-vh-100 d-flex flex-column">
        {children}
      </div>
    </AcademicYearProvider>
  );
}
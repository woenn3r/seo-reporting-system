import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ErrorBoundary, useCan } from "./components/ui";
import type { Permission } from "./domain/permissions";
import { t } from "./i18n";
import { resetDemo } from "./store/store";
import { Dashboard } from "./pages/Dashboard";
import { Pipeline } from "./pages/Pipeline";
import { ContentDetail } from "./pages/ContentDetail";
import { Scripts } from "./pages/Scripts";
import { Shotlists } from "./pages/Shotlists";
import { Shoots } from "./pages/Shoots";
import { ShootDetail } from "./pages/ShootDetail";
import { Media } from "./pages/Media";
import { MediaReview } from "./pages/MediaReview";
import { Approvals } from "./pages/Approvals";
import { Calendar } from "./pages/Calendar";
import { Clients } from "./pages/Clients";
import { Team } from "./pages/Team";
import { Settings } from "./pages/Settings";

/** Route guard: pages behind a permission redirect home instead of rendering (hiding the nav link is not enough). */
function Require({ permission, children }: { permission: Permission; children: ReactNode }) {
  return useCan(permission) ? <>{children}</> : <Navigate to="/" replace />;
}

/** Remounts a detail page when its :id changes so no local state leaks between records. */
function Keyed({ children }: { children: ReactNode }) {
  const { id } = useParams();
  return <div key={id}>{children}</div>;
}

function Crash({ reset }: { reset: () => void }) {
  return (
    <div className="empty" style={{ minHeight: "100vh", justifyContent: "center" }} role="alert">
      <h1>{t("app.crashTitle")}</h1>
      <p style={{ maxWidth: 460 }}>{t("app.crashHint")}</p>
      <div className="row">
        <button className="btn primary" onClick={() => window.location.reload()}>{t("app.reload")}</button>
        <button className="btn danger" onClick={() => confirm(t("settings.resetConfirm")) && void resetDemo().then(reset)}>{t("settings.reset")}</button>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary fallback={(reset) => <Crash reset={reset} />}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="content/:id" element={<Keyed><ContentDetail /></Keyed>} />
            <Route path="scripts" element={<Scripts />} />
            <Route path="shotlists" element={<Require permission="shots.manage"><Shotlists /></Require>} />
            <Route path="shoots" element={<Shoots />} />
            <Route path="shoots/:id" element={<Keyed><ShootDetail /></Keyed>} />
            <Route path="media" element={<Media />} />
            <Route path="media/:id" element={<Keyed><MediaReview /></Keyed>} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="clients" element={<Require permission="admin.clients"><Clients /></Require>} />
            <Route path="team" element={<Require permission="admin.team"><Team /></Require>} />
            <Route path="settings" element={<Require permission="admin.workspace"><Settings /></Require>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

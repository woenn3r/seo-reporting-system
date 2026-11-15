import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
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

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="content/:id" element={<ContentDetail />} />
          <Route path="scripts" element={<Scripts />} />
          <Route path="shotlists" element={<Shotlists />} />
          <Route path="shoots" element={<Shoots />} />
          <Route path="shoots/:id" element={<ShootDetail />} />
          <Route path="media" element={<Media />} />
          <Route path="media/:id" element={<MediaReview />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="clients" element={<Clients />} />
          <Route path="team" element={<Team />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { fmtBytes } from "../domain/format";
import { validateWorkspace } from "../domain/validate";
import type { Workspace } from "../domain/types";
import { mediaStore } from "../store/mediaStore";
import { replaceWorkspace, resetDemo, toast, useStore } from "../store/store";
import { PageHeader } from "../components/ui";

export function Settings() {
  const ws = useStore((s) => s.ws);
  const file = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>({});
  useEffect(() => {
    void mediaStore.estimate().then(setUsage);
  }, [ws]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(ws, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `social-studio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importJson = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data: unknown = JSON.parse(await f.text());
      const res = validateWorkspace(data);
      if (!res.ok) {
        toast(`Import abgelehnt – entspricht nicht dem Datenvertrag v1: ${res.errors.slice(0, 3).join("; ")}`, "error");
        return;
      }
      if (!confirm("Alle aktuellen Daten durch den Import ersetzen? (Videodateien im Browser bleiben erhalten)")) return;
      if (replaceWorkspace(data as Workspace)) toast("Import erfolgreich", "success");
    } catch (e) {
      toast(`Datei konnte nicht gelesen werden: ${(e as Error).message}`, "error");
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  return (
    <>
      <PageHeader title="Einstellungen" sub={`Workspace „${ws.workspace.name}“ · Datenvertrag v${ws.schemaVersion}`} />
      <div className="grid grid-2">
        <div className="card card-pad stack">
          <h2>Daten sichern & übertragen</h2>
          <p className="small muted">Export/Import als JSON nach <code>contracts/social_studio/v1.schema.json</code>. Dieselbe Datei kann die iOS-App lesen. Videodateien sind nicht enthalten.</p>
          <div className="row">
            <button className="btn" onClick={exportJson}><Download size={15} /> JSON exportieren</button>
            <button className="btn" onClick={() => file.current?.click()}><Upload size={15} /> JSON importieren</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
          </div>
        </div>
        <div className="card card-pad stack">
          <h2>Lokaler Speicher</h2>
          <p className="small muted">Belegt: {fmtBytes(usage.usage)} von ca. {fmtBytes(usage.quota)} (Browser-Kontingent). Große Rohdaten gehören in einen Cloud-Speicher.</p>
          <div className="row">
            <button
              className="btn danger"
              onClick={() => confirm("Alle Daten und hochgeladenen Dateien in diesem Browser löschen und Demo-Daten laden?") && void resetDemo().then(() => toast("Demo-Daten wiederhergestellt", "success"))}
            >
              <RotateCcw size={15} /> Auf Demo-Daten zurücksetzen
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

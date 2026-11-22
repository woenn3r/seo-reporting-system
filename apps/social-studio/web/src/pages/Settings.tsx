import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { fmtBytes } from "../i18n/format";
import { mediaStore } from "../store/mediaStore";
import { checkWorkspace, replaceWorkspace, resetDemo, toast, useStore, type Check } from "../store/store";
import { PageHeader, useT } from "../components/ui";
import { LanguageSelect } from "../components/Layout";

export function Settings() {
  const t = useT();
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
      const precheck = checkWorkspace(data);
      const reject = (c: Exclude<Check, { ok: true }>) =>
        toast(t(c.kind === "integrity" ? "settings.importInconsistent" : "settings.importRejected", { detail: c.errors.slice(0, 3).join("; ") }), "error");
      if (!precheck.ok) return reject(precheck);
      if (!confirm(t("settings.importConfirm"))) return;
      const result = replaceWorkspace(data);
      if (result.ok) toast(t("settings.importOk"), "success");
      else reject(result);
    } catch (e) {
      toast(t("settings.importUnreadable", { detail: (e as Error).message }), "error");
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  return (
    <>
      <PageHeader title={t("nav.settings")} sub={t("settings.sub", { name: ws.workspace.name, version: ws.schemaVersion })} />
      <div className="grid grid-2">
        <div className="card card-pad stack">
          <h2>{t("settings.language")}</h2>
          <p className="small muted">{t("settings.languageHint")}</p>
          <div style={{ maxWidth: 260 }}><LanguageSelect /></div>
        </div>
        <div className="card card-pad stack">
          <h2>{t("settings.backup")}</h2>
          <p className="small muted">{t("settings.backupHint")}</p>
          <div className="row">
            <button className="btn" onClick={exportJson}><Download size={15} /> {t("settings.export")}</button>
            <button className="btn" onClick={() => file.current?.click()}><Upload size={15} /> {t("settings.import")}</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
          </div>
        </div>
        <div className="card card-pad stack">
          <h2>{t("settings.storage")}</h2>
          <p className="small muted">{t("settings.storageHint", { used: fmtBytes(usage.usage), quota: fmtBytes(usage.quota) })}</p>
          <div className="row">
            <button
              className="btn danger"
              onClick={() => confirm(t("settings.resetConfirm")) && void resetDemo().then(() => toast(t("settings.resetOk"), "success"))}
            >
              <RotateCcw size={15} /> {t("settings.reset")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { Monitor, Play, Square, RefreshCw, QrCode, AlertTriangle } from "lucide-react";

export default function BrowserServicePage({ workspace }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState("");

  async function request(path, method = "GET", image = false) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Your session expired. Please sign in again.");
    const url = path + (path.includes("?") ? "&" : "?") + "workspaceId=" + encodeURIComponent(workspace?.id || "");
    const response = await fetch(url, { method, headers: { Authorization: "Bearer " + token, ...(image ? { Accept: "image/png" } : {}) } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Browser service request failed (" + response.status + ").");
    }
    return image ? response.blob() : response.json();
  }

  async function refreshStatus() {
    setBusy(true); setError("");
    try { setStatus(await request("/api/browser/status")); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function startBrowser() {
    setBusy(true); setError(""); setQrUrl("");
    try { setStatus(await request("/api/browser/start", "POST")); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function showQr() {
    setBusy(true); setError("");
    try { const blob = await request("/api/browser/qr", "GET", true); setQrUrl(URL.createObjectURL(blob)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function stopBrowser() {
    setBusy(true); setError(""); setQrUrl("");
    try { setStatus(await request("/api/browser/stop", "POST")); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { setStatus(null); setQrUrl(""); setError(""); if (workspace?.id) refreshStatus(); }, [workspace?.id]);
  useEffect(() => () => { if (qrUrl) URL.revokeObjectURL(qrUrl); }, [qrUrl]);

  const panel = { background: "var(--panel, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 14, padding: 20 };
  const button = { border: 0, borderRadius: 9, padding: "10px 14px", display: "inline-flex", alignItems: "center", gap: 8, cursor: busy ? "wait" : "pointer", fontWeight: 600, opacity: busy ? .6 : 1 };
  return <div style={{ maxWidth: 920, margin: "0 auto", display: "grid", gap: 18 }}>
    <div><div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>ONLINE BROWSER AUTOMATION</div><h1 style={{ margin: "6px 0" }}>Puppeteer Browser Service</h1><p style={{ color: "#64748b", margin: 0 }}>Manage a remote browser session from your MrSa website.</p></div>
    <section style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Monitor size={22}/><h2 style={{ fontSize: 18, margin: 0 }}>Connection</h2></div>
      <p style={{ color: "#64748b", fontSize: 14 }}>The free cloud service may take about a minute to wake after inactivity. Retry status if its first request times out.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button style={{ ...button, background: "#2563eb", color: "white" }} disabled={busy || !workspace?.id} onClick={startBrowser}><Play size={16}/> Start browser</button>
        <button style={{ ...button, background: "#e2e8f0", color: "#0f172a" }} disabled={busy || !workspace?.id} onClick={refreshStatus}><RefreshCw size={16}/> Refresh status</button>
        <button style={{ ...button, background: "#fee2e2", color: "#991b1b" }} disabled={busy} onClick={stopBrowser}><Square size={16}/> Stop browser</button>
      </div>
      {status && <p style={{ marginBottom: 0, fontSize: 14 }}>Browser: <strong>{status.running ? "Running" : "Stopped"}</strong> · Page: <strong>{status.pageOpen ? "Open" : "Closed"}</strong></p>}
      {status?.lastError && <p style={{ color: "#b91c1c" }}>{status.lastError}</p>}
      {error && <p role="alert" style={{ color: "#b91c1c", marginBottom: 0 }}>{error}</p>}
    </section>
    <section style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><QrCode size={22}/><h2 style={{ fontSize: 18, margin: 0 }}>WhatsApp Web QR sign-in</h2></div>
      <p style={{ color: "#64748b", fontSize: 14 }}>Start the browser, then request the QR preview. Scan it with your WhatsApp mobile app if sign-in is required.</p>
      <button style={{ ...button, background: "#0f172a", color: "white" }} disabled={busy || !status?.running} onClick={showQr}><QrCode size={16}/> Show QR preview</button>
      {qrUrl && <div style={{ marginTop: 16 }}><img src={qrUrl} alt="Private WhatsApp Web QR sign-in preview" style={{ maxWidth: "100%", width: 480, border: "1px solid #e2e8f0", borderRadius: 8 }}/><p style={{ color: "#64748b", fontSize: 12 }}>Private session image. Do not share or save it.</p></div>}
    </section>
    <section style={{ ...panel, background: "#fffbeb", borderColor: "#fcd34d" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><AlertTriangle size={20} color="#92400e"/><strong style={{ color: "#92400e" }}>Free hosting limitations and account safety</strong></div>
      <ul style={{ color: "#78350f", fontSize: 14, paddingLeft: 20, lineHeight: 1.7 }}>
        <li>The free service sleeps after 15 minutes without incoming traffic.</li>
        <li>Its browser profile is temporary; restarts or sleep can require a new QR sign-in.</li>
        <li>Cloud Chromium may exceed free memory limits and fail to start.</li>
        <li>This module only starts, monitors and stops a browser. It does not send messages or automate bulk messaging.</li>
      </ul>
    </section>
  </div>;
}

"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type EventRecord = { id: string; name: string; venueName: string; qrCodeValue: string; status?: "DRAFT" | "ACTIVE" | "CLOSED"; startTime?: string; endTime?: string; radiusMeters?: number };
type DashboardSummary = { students: number; activeEvents: number; totalCheckIns: number; todayCheckIns: number; attendanceRate: number; activeEvent: { name: string; venueName: string; startTime: string; endTime: string; radiusMeters: number } | null; recentAttendance: { id: string; firstName: string; secondName: string; regNo: string; subCounty: string; checkedInAt: string; event: { name: string } }[]; bySubCounty: { name: string; value: number }[] };
type ReportRow = { firstName: string; secondName: string; registrationNumber: string; phoneNumber: string; subCounty: string; event: string; checkInTime: string; latitude: number; longitude: number; distanceFromVenue: number };
type AdminRecord = { id: string; name: string; email: string; role: "ADMIN" | "SUPER_ADMIN"; approved: boolean; createdAt: string };
type EventForm = { name: string; venueName: string; latitude: string; longitude: string; radiusMeters: string; startTime: string; endTime: string; qrCodeValue: string };
const initialEventForm: EventForm = { name: "", venueName: "", latitude: "0.7785", longitude: "34.7261", radiusMeters: "100", startTime: "", endTime: "", qrCodeValue: "" };

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [dark, setDark] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [toast, setToast] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState(initialEventForm);
  const [createdEvent, setCreatedEvent] = useState<EventRecord | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const router = useRouter();
  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2800); }
  function completeCheckIn() { setCheckedIn(true); notify("Attendance recorded successfully"); }
  const loadSummary = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) { localStorage.removeItem("kubcsa_access_token"); localStorage.removeItem("kubcsa_refresh_token"); localStorage.removeItem("kubcsa_user"); router.replace("/login"); return; }
      if (!response.ok) throw new Error("Unable to load dashboard data");
      setSummary(await response.json());
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to load dashboard data"); }
  }, [router]);
  const loadAdmins = useCallback(async (token: string) => { try { const response = await fetch(`${apiUrl}/api/admins`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error("Unable to load admin accounts"); setAdmins(await response.json()); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to load admin accounts"); } }, []);
  const loadEvents = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/events`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Unable to load events");
      setEvents(await response.json());
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to load events"); }
  }, []);
  useEffect(() => {
    const token = localStorage.getItem("kubcsa_access_token");
    if (!token) { router.replace("/register"); return; }
    const timer = window.setTimeout(() => { setAuthReady(true); void loadSummary(token); void loadEvents(token); void loadAdmins(token); }, 0);
    const refresh = window.setInterval(() => void loadSummary(token), 30000);
    return () => { window.clearTimeout(timer); window.clearInterval(refresh); };
  }, [loadAdmins, loadEvents, loadSummary, router]);
  async function updateAdmin(adminId: string, approved: boolean) { try { const response = await fetch(`${apiUrl}/api/admins/${adminId}/approval`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("kubcsa_access_token") ?? ""}` }, body: JSON.stringify({ approved }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to update account"); await loadAdmins(localStorage.getItem("kubcsa_access_token") ?? ""); notify(approved ? "Admin account approved" : "Admin access revoked"); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to update account"); } }
  async function removeAdmin(adminId: string) { if (!window.confirm("Delete this admin account? This cannot be undone.")) return; try { const response = await fetch(`${apiUrl}/api/admins/${adminId}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("kubcsa_access_token") ?? ""}` } }); const body = response.status === 204 ? null : await response.json(); if (!response.ok) throw new Error(body?.error ?? "Unable to delete account"); await loadAdmins(localStorage.getItem("kubcsa_access_token") ?? ""); notify("Admin account deleted"); } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to delete account"); } }
  async function updateEventStatus(eventId: string, status: "ACTIVE" | "CLOSED") {
    try {
      const response = await fetch(`${apiUrl}/api/events/${eventId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("kubcsa_access_token") ?? ""}` }, body: JSON.stringify({ status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update event");
      const token = localStorage.getItem("kubcsa_access_token") ?? "";
      await Promise.all([loadEvents(token), loadSummary(token)]);
      notify(status === "ACTIVE" ? "Event activated" : "Event closed");
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to update event"); }
  }
  async function deleteEvent(eventId: string) {
    if (!window.confirm("Delete this event? Events with attendance records cannot be deleted.")) return;
    try {
      const response = await fetch(`${apiUrl}/api/events/${eventId}`, { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("kubcsa_access_token") ?? ""}` } });
      const body = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Unable to delete event");
      const token = localStorage.getItem("kubcsa_access_token") ?? "";
      await Promise.all([loadEvents(token), loadSummary(token)]);
      notify("Event deleted");
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to delete event"); }
  }
  async function exportAttendanceCsv() {
    try {
      const response = await fetch(`${apiUrl}/api/reports/attendance`, { headers: { Authorization: `Bearer ${localStorage.getItem("kubcsa_access_token") ?? ""}` } });
      const rows = await response.json() as ReportRow[];
      if (!response.ok) throw new Error(rows as unknown as string);
      const columns = ["First Name", "Second Name", "Registration Number", "Phone Number", "Sub County", "Event", "Check-In Time", "Latitude", "Longitude", "Distance From Venue"];
      const values = rows.map((row) => [row.firstName, row.secondName, row.registrationNumber, row.phoneNumber, row.subCounty, row.event, new Date(row.checkInTime).toISOString(), row.latitude, row.longitude, row.distanceFromVenue]);
      const csv = [columns, ...values].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "kubcsa-attendance-report.csv"; link.click(); URL.revokeObjectURL(url);
      notify(`${rows.length} attendance records exported`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to export attendance"); }
  }
  function logout() { localStorage.removeItem("kubcsa_access_token"); localStorage.removeItem("kubcsa_refresh_token"); localStorage.removeItem("kubcsa_user"); router.replace("/login"); }
  function updateEvent(field: keyof EventForm, value: string) { setEventForm((current) => ({ ...current, [field]: value })); }
  async function createEvent(event: FormEvent) {
    event.preventDefault();
    setSavingEvent(true);
    try {
      const response = await fetch(`${apiUrl}/api/events`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("kubcsa_access_token") ?? ""}` }, body: JSON.stringify({ name: eventForm.name, venueName: eventForm.venueName, latitude: Number(eventForm.latitude), longitude: Number(eventForm.longitude), radiusMeters: Number(eventForm.radiusMeters), startTime: new Date(eventForm.startTime).toISOString(), endTime: new Date(eventForm.endTime).toISOString(), qrCodeValue: eventForm.qrCodeValue.trim() || undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create event");
      setCreatedEvent(body);
      const token = localStorage.getItem("kubcsa_access_token") ?? "";
      await Promise.all([loadSummary(token), loadEvents(token)]);
      notify("Event created and QR code generated");
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Unable to create event"); } finally { setSavingEvent(false); }
  }

  if (!authReady) return null;

  return (
    <main className={dark ? "app-shell dark-shell" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">K</div><div><strong>KUBCSA</strong><span>ATTENDANCE SYSTEM</span></div></div>
        <div className="workspace-label">WORKSPACE <span>LIVE</span></div>
        <nav className="nav-list" aria-label="Main navigation">{["Overview", "Events", "Attendance", "Reports", "Admins"].map((item) => <button key={item} className={activeTab === item ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(item)}><span className="nav-icon">{item === "Overview" ? "◈" : item === "Events" ? "▣" : item === "Attendance" ? "✓" : item === "Reports" ? "▥" : "♙"}</span>{item}</button>)}</nav>
        <div className="sidebar-bottom"><button className="nav-item" onClick={() => notify("Settings are available to administrators")}>⚙ <span>Settings</span></button><div className="user-card"><div className="avatar admin-avatar">AM</div><div><strong>Admin Main</strong><span>SUPER ADMIN</span></div><button aria-label="Log out" onClick={logout}>↪</button></div></div>
      </aside>
      <section className="content-area">
        <header className="topbar"><div className="mobile-brand"><div className="brand-mark">K</div><strong>KUBCSA</strong></div><div className="topbar-actions"><span className="last-sync">● Updated just now</span><button className="icon-button" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>{dark ? "☼" : "◐"}</button><button className="icon-button notification" aria-label="Notifications">♢<i /></button></div></header>
        <div className="page-content">
          <div className="page-heading rise-in"><div><p className="eyebrow">WEDNESDAY, 16 SEPTEMBER 2026</p><h1>Good morning, Admin <span>↗</span></h1><p className="intro">Here&apos;s what&apos;s happening across KUBCSA today.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => { setCreatedEvent(null); setEventModalOpen(true); }}>＋ Create event</button><button className="primary-button" onClick={() => router.push("/check-in")}><span>＋</span> Quick check-in</button></div></div>
          {activeTab !== "Overview" && activeTab !== "Events" && <div className="section-banner rise-in"><div><span className="eyebrow">MODULE</span><h2>{activeTab}</h2><p>This workspace is ready for live API data.</p></div><button className="secondary-button" onClick={() => setActiveTab("Overview")}>Back to overview</button></div>}
          {activeTab === "Events" && <section className="panel module-panel rise-in"><div className="panel-heading"><div><p className="eyebrow">EVENT MANAGEMENT</p><h2>All events</h2></div><button className="primary-button" onClick={() => { setCreatedEvent(null); setEventModalOpen(true); }}>＋ Create event</button></div>{events.length ? <div className="event-list">{events.map((event) => <div className="event-row" key={event.id}><div><strong>{event.name}</strong><span>{event.venueName} · {event.radiusMeters}m radius</span><small>{event.startTime ? new Date(event.startTime).toLocaleString() : ""}</small></div><span className={`status-pill ${event.status?.toLowerCase()}`}>{event.status}</span><div className="event-row-actions">{event.status !== "ACTIVE" && event.status !== "CLOSED" && <button className="secondary-button" onClick={() => updateEventStatus(event.id, "ACTIVE")}>Activate</button>}{event.status === "ACTIVE" && <button className="secondary-button" onClick={() => updateEventStatus(event.id, "CLOSED")}>Close event</button>}{event.status !== "CLOSED" && <button className="text-button" onClick={() => { setCreatedEvent(event); setEventModalOpen(true); }}>View QR</button>}<button className="text-button danger-text" onClick={() => deleteEvent(event.id)}>Delete</button></div></div>)}</div> : <div className="empty-module"><h3>No events yet</h3><p>Create your first event to generate a QR code and open attendance.</p><button className="primary-button" onClick={() => { setCreatedEvent(null); setEventModalOpen(true); }}>Create event</button></div>}</section>}
          {activeTab === "Reports" && <section className="panel module-panel rise-in"><div className="panel-heading"><div><p className="eyebrow">REPORTS & EXPORTS</p><h2>Attendance report</h2></div><button className="primary-button" onClick={exportAttendanceCsv}>↓ Export CSV</button></div><div className="report-summary"><div><span>Total records</span><strong>{summary?.totalCheckIns ?? "—"}</strong></div><div><span>Students</span><strong>{summary?.students ?? "—"}</strong></div><div><span>Attendance today</span><strong>{summary?.todayCheckIns ?? "—"}</strong></div></div><p className="empty-copy">Download includes names, registration numbers, phone numbers, sub-counties, event, check-in time, coordinates, and venue distance.</p></section>}
          {activeTab === "Admins" && <section className="panel module-panel rise-in"><div className="panel-heading"><div><p className="eyebrow">ACCESS CONTROL</p><h2>Administrator accounts</h2></div><span className="live-pill">APPROVAL REQUIRED</span></div><p className="empty-copy">New administrator requests stay locked until an existing approved administrator approves them.</p><div className="admin-list">{admins.map((admin) => <div className="admin-row" key={admin.id}><div><strong>{admin.name}</strong><span>{admin.email} · {admin.role}</span><small>Requested {new Date(admin.createdAt).toLocaleDateString()}</small></div><span className={`status-pill ${admin.approved ? "active" : "draft"}`}>{admin.approved ? "APPROVED" : "PENDING"}</span><div className="event-row-actions">{!admin.approved && <button className="secondary-button" onClick={() => updateAdmin(admin.id, true)}>Approve</button>}{admin.approved && <button className="text-button" onClick={() => updateAdmin(admin.id, false)}>Revoke</button>}<button className="text-button danger-text" onClick={() => removeAdmin(admin.id)}>Delete</button></div></div>)}{!admins.length && <div className="empty-module"><h3>No administrator accounts</h3></div>}</div></section>}
          <div className="stats-grid rise-in delay-1"><StatCard label="Total check-ins" value={summary ? String(summary.totalCheckIns) : "—"} delta={summary?.totalCheckIns ? "Live database" : "No attendance yet"} note="" icon="✓" /><StatCard label="Attendance today" value={summary ? String(summary.todayCheckIns) : "—"} delta={summary?.todayCheckIns ? "Live database" : "No check-ins today"} note="" icon="◒" /><StatCard label="Active events" value={summary ? String(summary.activeEvents) : "—"} delta={summary?.activeEvents ? "Live now" : "Create your first event"} note="" icon="◷" /><StatCard label="Registered students" value={summary ? String(summary.students) : "—"} delta={summary?.students ? "Live database" : "No students yet"} note="" icon="♙" /></div>
          <div className="feature-grid rise-in delay-2"><section className="panel event-panel">{summary?.activeEvent ? <><div className="panel-heading"><div><p className="eyebrow">LIVE EVENT</p><h2>{summary.activeEvent.name}</h2></div><span className="live-pill"><i /> LIVE</span></div><div className="event-meta"><div><span>VENUE</span><strong>{summary.activeEvent.venueName}</strong></div><div><span>TIME WINDOW</span><strong>{new Date(summary.activeEvent.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {new Date(summary.activeEvent.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></div></div><div className="event-footer"><span><i className="green-dot" /> Geofence active · {summary.activeEvent.radiusMeters}m radius</span><button className="text-button" onClick={() => notify("Event controls are available in the Events module")}>Manage event <span>→</span></button></div></> : <div className="empty-panel"><p className="eyebrow">LIVE EVENT</p><h2>No active event</h2><p className="empty-copy">Create an event to start collecting attendance and generate a venue QR code.</p><button className="primary-button" onClick={() => { setCreatedEvent(null); setEventModalOpen(true); }}>Create event</button></div>}</section><section className="panel chart-panel empty-panel"><p className="eyebrow">CHECK-IN ACTIVITY</p><h2>{summary?.todayCheckIns ? `${summary.todayCheckIns} check-ins today` : "No check-in activity"}</h2><p className="empty-copy">Live attendance updates refresh automatically every 30 seconds.</p></section></div>
          <div className="lower-grid rise-in delay-3"><section className="panel table-panel">{summary?.recentAttendance.length ? <><div className="panel-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Latest check-ins</h2></div><button className="text-button" onClick={() => setActiveTab("Attendance")}>View all <span>→</span></button></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>REGISTRATION NO.</th><th>SUB-COUNTY</th><th>CHECK-IN</th></tr></thead><tbody>{summary.recentAttendance.map((record) => <tr key={record.id}><td><div className="student-cell"><strong>{record.firstName} {record.secondName}</strong></div></td><td>{record.regNo}</td><td><span className="county-tag">{record.subCounty}</span></td><td>{new Date(record.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td></tr>)}</tbody></table></div></> : <div className="empty-panel"><p className="eyebrow">RECENT ACTIVITY</p><h2>No attendance records</h2><p className="empty-copy">Student check-ins will appear here once an event is active.</p></div>}</section><section className="panel county-panel">{summary?.bySubCounty.length ? <><div className="panel-heading"><div><p className="eyebrow">DISTRIBUTION</p><h2>By sub-county</h2></div></div><div className="county-list">{summary.bySubCounty.map((item) => <div className="county-row" key={item.name}><div><span>{item.name}</span><strong>{item.value}</strong></div><div className="bar"><i style={{ width: `${Math.min(100, item.value / Math.max(...summary.bySubCounty.map((entry) => entry.value)) * 100)}%` }} /></div></div>)}</div></> : <div className="empty-panel"><p className="eyebrow">DISTRIBUTION</p><h2>No sub-county data</h2><p className="empty-copy">Sub-county distribution will appear after attendance is recorded.</p></div>}</section></div>
        </div>
      </section>
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      {eventModalOpen && <div className="modal-backdrop" onClick={() => setEventModalOpen(false)}><div className="event-modal" onClick={(event) => event.stopPropagation()}>{createdEvent ? <div className="qr-result"><div className="modal-top"><div><p className="eyebrow">EVENT QR CODE</p><h2>{createdEvent.name}</h2></div><button className="close-button" onClick={() => setEventModalOpen(false)}>×</button></div><p className="modal-copy">Display this code at the venue. Students scan it before submitting attendance.</p><div className="qr-frame"><QRCodeSVG value={createdEvent.qrCodeValue} size={190} bgColor="#ffffff" fgColor="#12392d" /></div><code className="qr-value">{createdEvent.qrCodeValue}</code><button className="primary-button qr-done" onClick={() => setEventModalOpen(false)}>Done</button></div> : <><div className="modal-top"><div><p className="eyebrow">EVENT MANAGEMENT</p><h2>Create an event</h2></div><button className="close-button" onClick={() => setEventModalOpen(false)}>×</button></div><p className="modal-copy">Set the attendance window and venue boundary. Add your own code or leave it blank for an automatic code.</p><form className="event-form" onSubmit={createEvent}><label>Event name<input required value={eventForm.name} onChange={(event) => updateEvent("name", event.target.value)} placeholder="Annual General Meeting" /></label><label>Venue name<input required value={eventForm.venueName} onChange={(event) => updateEvent("venueName", event.target.value)} placeholder="Kisii University Main Hall" /></label><div className="form-grid"><label>Latitude<input required type="number" step="any" value={eventForm.latitude} onChange={(event) => updateEvent("latitude", event.target.value)} /></label><label>Longitude<input required type="number" step="any" value={eventForm.longitude} onChange={(event) => updateEvent("longitude", event.target.value)} /></label></div><div className="form-grid"><label>Radius in meters<input required type="number" min="1" value={eventForm.radiusMeters} onChange={(event) => updateEvent("radiusMeters", event.target.value)} /></label><span /></div><div className="form-grid"><label>Starts<input required type="datetime-local" value={eventForm.startTime} onChange={(event) => updateEvent("startTime", event.target.value)} /></label><label>Ends<input required type="datetime-local" value={eventForm.endTime} onChange={(event) => updateEvent("endTime", event.target.value)} /></label></div><label>Manual event QR code<input value={eventForm.qrCodeValue} onChange={(event) => updateEvent("qrCodeValue", event.target.value)} placeholder="e.g. KUBCSA-AGM-2026" /><span className="field-hint">Students will enter this exact code, or scan the generated QR image.</span></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEventModalOpen(false)}>Cancel</button><button className="primary-button" disabled={savingEvent}>{savingEvent ? "Creating..." : "Create & generate QR"}</button></div></form></>}</div></div>}
      {checkInOpen && <div className="modal-backdrop" onClick={() => setCheckInOpen(false)}><div className="checkin-modal" onClick={(event) => event.stopPropagation()}>{checkedIn ? <div className="success-state"><div className="success-mark">✓</div><p className="eyebrow">CHECK-IN COMPLETE</p><h2>Attendance recorded<br />successfully.</h2><p>Thank you for participating in the KUBCSA event.</p><button className="primary-button" onClick={() => { setCheckInOpen(false); setCheckedIn(false); }}>Done</button></div> : <><div className="modal-top"><div><p className="eyebrow">STUDENT CHECK-IN</p><h2>Verify attendance</h2></div><button className="close-button" onClick={() => setCheckInOpen(false)}>×</button></div><p className="modal-copy">A quick venue check is required before recording your attendance.</p><div className="verification-step"><div className="step-icon">⌖</div><div><strong>Location verified</strong><span className="verified">You are within the attendance zone.</span></div><span className="check">✓</span></div><div className="verification-step"><div className="step-icon">▦</div><div><strong>Event QR code</strong><span>Ready to scan at the venue</span></div><button className="scan-button" onClick={() => notify("Camera access requested")}>Scan</button></div><div className="modal-actions"><button className="secondary-button" onClick={() => setCheckInOpen(false)}>Cancel</button><button className="primary-button" onClick={completeCheckIn}>Record attendance</button></div></>}</div></div>}
    </main>
  );
}

function StatCard({ label, value, delta, note, icon }: { label: string; value: string; delta: string; note: string; icon: string }) { return <div className="stat-card"><div className="stat-icon">{icon}</div><p>{label}</p><div className="stat-value">{value}</div><div className="stat-delta"><span>{delta}</span> {note}</div></div>; }
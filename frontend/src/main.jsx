import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Calendar,
  Archive,
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  FileDown,
  Eye,
  EyeOff,
  Gauge,
  History,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  ShoppingCart,
  Ticket,
  Trash2,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./styles.css";
import logoMark from "../images/ChatGPT Image Sep 11, 2026, 11_10_31 AM.png";
import logoWordmark from "../images/ChatGPT Image Sep 11, 2026, 11_06_56 AM - Copy.png";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const peso = (value) => `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const prettyDate = (value) => (value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
const maxTicketsPerTier = 4;

function dateInputValue(daysFromNow, hour = 19, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString().slice(0, 16);
}

const emptyConcertForm = {
  title: "",
  artist: "",
  artist_description: "",
  description: "",
  poster_url: "",
  banner_url: "",
  category: "Pop",
  status: "Draft",
  max_tickets_per_customer: 4,
  venue_id: "",
  day_count: 1,
  schedule_days: [dateInputValue(30)],
  starts_at: dateInputValue(30),
  gate_opens_at: dateInputValue(30, 17, 30),
  ends_at: dateInputValue(30, 22, 0),
  sale_opens_at: dateInputValue(0, 9),
  sale_closes_at: dateInputValue(29, 17),
  vip_price: "6500.00",
  lower_bowl_price: "3800.00",
  general_price: "1800.00",
  tier_prices: {},
  age: "Ages 13+. Minors must be accompanied by a guardian.",
  entry: "Bring a valid ID and ticket QR code.",
  allowed: "Small bags, sealed water, phones, and light sticks.",
  prohibited: "Outside food, professional cameras, sharp items, aerosols, and oversized banners.",
  refund: "Refunds are available only for cancelled shows.",
  cancellation: "Organizer cancellation notices will be sent through email.",
  terms: "Tickets are valid only for the selected seat and schedule.",
  contact: "support@ticketrush.example.com",
  rules: [
    { title: "Age Requirement", text: "Ages 13+. Minors must be accompanied by a guardian." },
    { title: "Entry Requirement", text: "Bring a valid ID and ticket QR code." },
    { title: "Allowed Items", text: "Small bags, sealed water, phones, and light sticks." },
    { title: "Prohibited Items", text: "Outside food, professional cameras, sharp items, aerosols, and oversized banners." },
    { title: "Refund Policy", text: "Refunds are available only for cancelled shows." },
  ],
};

function concertExtras(concert = {}) {
  return {
    banner: concert.banner_url || concert.poster_url,
    artistBio: `${concert.artist} is a fictional performer created for TicketRush demonstrations, known for high-energy staging and immersive arena production.`,
    theme: concert.category === "Electronic" ? "Neon pulse and synchronized light movement" : concert.category === "Rock" ? "Late-night arena rock with cinematic lighting" : "Bright pop spectacle with audience sing-alongs",
    address: `${concert.venue || "Pulse Arena"}, Entertainment District, Manila, Philippines`,
    gateOpens: "5:30 PM",
    starts: prettyDate(concert.starts_at),
    duration: "2 hours 30 minutes",
    age: "Ages 13+. Minors must be accompanied by a guardian.",
    entry: "Bring a valid ID, ticket QR code, and follow venue security checks.",
    allowed: "Small bags, sealed water, phones, and light sticks from unofficial generic vendors.",
    prohibited: "Outside food, professional cameras, sharp items, aerosols, and oversized banners.",
    refund: "Refunds are available only for cancelled shows or eligible reservations before confirmation.",
    terms: "Tickets are non-transferable in this demo and must match the customer account.",
    contact: "support@ticketrush.example.com",
  };
}

function useAuth() {
  const [auth, setAuth] = useState(() => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem("ticketrush_auth") || "null");
    } catch {
      localStorage.removeItem("ticketrush_auth");
      return null;
    }
    if (saved?.api_url && saved.api_url !== API) {
      localStorage.removeItem("ticketrush_auth");
      return null;
    }
    return saved;
  });
  const save = (value) => {
    const next = value ? { ...value, api_url: API } : null;
    setAuth(next);
    next ? localStorage.setItem("ticketrush_auth", JSON.stringify(next)) : localStorage.removeItem("ticketrush_auth");
  };
  useEffect(() => {
    const clear = () => save(null);
    window.addEventListener("ticketrush-auth-expired", clear);
    return () => window.removeEventListener("ticketrush-auth-expired", clear);
  }, []);
  return { auth, save, logout: () => save(null) };
}

async function api(path, options = {}, auth) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (auth?.access_token) headers.Authorization = `Bearer ${auth.access_token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const detail = JSON.parse(text).detail;
      message = Array.isArray(detail) ? detail.map((item) => item.msg).join(", ") : detail;
    } catch {
      message = text;
    }
    if (response.status === 401) {
      localStorage.removeItem("ticketrush_auth");
      window.dispatchEvent(new Event("ticketrush-auth-expired"));
      message = "Session expired. Please log in again.";
    }
    throw new Error(message || "Request failed");
  }
  return response.json();
}

async function downloadTicketPdf(ticketId, auth) {
  const response = await fetch(`${API}/tickets/${ticketId}/pdf`, {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  if (!response.ok) throw new Error("Ticket download failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ticketrush-${ticketId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function uploadImage(file, auth) {
  if (!auth?.access_token) throw new Error("Please log in again before uploading images.");
  const data = new FormData();
  data.append("file", file);
  const response = await fetch(`${API}/admin/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.access_token}` },
    body: data,
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      message = JSON.parse(text).detail || text;
    } catch {
      message = text;
    }
    throw new Error(message || "Image upload failed");
  }
  const result = await response.json();
  return result.url.startsWith("http") ? result.url : `${API}${result.url}`;
}

const fallbackPoster = logoMark;
const imageUploadAccept = "image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";
const maxImageUploadSize = 15 * 1024 * 1024;

function validateImageFile(file) {
  const extension = file.name?.split(".").pop()?.toLowerCase();
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  const validExtensions = ["jpg", "jpeg", "png", "webp", "gif"];
  if (!validTypes.includes(file.type) && !validExtensions.includes(extension)) {
    return "Use JPG, PNG, WebP, or GIF images only. HEIC photos need to be converted to JPG first.";
  }
  if (file.size > maxImageUploadSize) {
    return "Image must be 15 MB or smaller.";
  }
  return "";
}

function mediaUrl(value) {
  if (!value) return "";
  if (typeof value === "string" && value.startsWith("http://localhost:8000/uploads/")) return value.replace("http://localhost:8000", API);
  if (typeof value === "string" && value.startsWith("/uploads/")) return `${API}${value}`;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.url || value.src || value.path || value.image_url || value.poster_url || "";
  return "";
}

function SafeImage({ src, alt = "", className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <img className={className} src={failed ? fallbackPoster : mediaUrl(src) || fallbackPoster} alt={alt} onError={() => setFailed(true)} />;
}

function ImageUploadPreview({ label, src, uploading, onChoose, onRemove, shape = "poster" }) {
  return (
    <div className={`image-upload-card ${shape}`}>
      <div className="image-upload-preview">
        {src ? <SafeImage src={src} alt={label} /> : <span>No image selected</span>}
      </div>
      <div className="image-upload-actions">
        <label className="upload-field"><span>{uploading ? "Uploading..." : `Upload ${label}`}</span><input type="file" accept={imageUploadAccept} onChange={onChoose} /></label>
        {src && <button className="btn-small danger" type="button" onClick={async () => { if (await askConfirm(`Remove this ${label} image?`, "Remove Image")) onRemove(); }}>Remove</button>}
      </div>
    </div>
  );
}

function BrandLogo({ compact = false }) {
  return (
    <span className={`logo-lockup ${compact ? "compact" : ""}`}>
      <img src={compact ? logoMark : logoWordmark} alt="TicketRush" />
    </span>
  );
}

function Feedback({ message }) {
  if (!message) return null;
  const isError = /failed|must|required|could not|invalid|incorrect|only|smaller|convert|error|do not match|weak|expired|no longer/i.test(message);
  return <div className={isError ? "error-banner" : "success-banner"}>{message}</div>;
}

function askConfirm(message, title = "Confirm Action") {
  if (window.ticketrushConfirm) return window.ticketrushConfirm({ title, message });
  return Promise.resolve(false);
}

function useFocusScope(ref, open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = ref.current;
    const focusable = () => [...root.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((node) => node.getClientRects().length);
    (focusable()[0] || root).focus();
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0] || root;
      const last = items.at(-1) || root;
      if (!items.length || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open, ref]);
}

function Dialog({ children, onClose, label = "Confirmation" }) {
  const ref = useRef(null);
  useFocusScope(ref, true, onClose);
  return <div className="confirm-backdrop" onMouseDown={onClose}>
    <div ref={ref} className="confirm-dialog" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-btn dialog-close" type="button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
      {children}
    </div>
  </div>;
}

function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    window.ticketrushConfirm = ({ title, message }) => new Promise((resolve) => setDialog({ title, message, resolve }));
    return () => { delete window.ticketrushConfirm; };
  }, []);
  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog]);
  function close(value) {
    dialog?.resolve(value);
    setDialog(null);
  }
  return (
    <>
      {children}
      {dialog && (
        <Dialog onClose={() => close(false)} label={dialog.title}>
            <div className="confirm-icon"><ShieldCheck size={22} /></div>
            <div>
              <h2 id="confirm-title">{dialog.title}</h2>
              <p>{dialog.message}</p>
            </div>
            <div className="confirm-actions">
              <button className="btn-small" type="button" onClick={() => close(false)}>Cancel</button>
              <button className="btn" type="button" autoFocus onClick={() => close(true)}>Confirm</button>
            </div>
        </Dialog>
      )}
    </>
  );
}

function Shell({ auth, logout }) {
  const role = auth?.user?.role || "guest";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const menuRef = useRef(null);
  useFocusScope(menuRef, drawerOpen && role !== "admin", () => setDrawerOpen(false));
  useEffect(() => { setDrawerOpen(false); window.scrollTo(0, 0); }, [location.pathname]);
  const confirmLogout = async () => {
    if (await askConfirm("Log out from TicketRush?", "Log Out")) logout();
  };
  const guestLinks = [
    ["Home", "/"],
    ["Concerts", "/concerts"],
    ["About", "/about"],
    ["Help and FAQ", "/help"],
  ];
  const customerLinks = [
    ["Home", "/"],
    ["Browse Concerts", "/concerts"],
    ["My Cart", "/cart"],
    ["My Tickets", "/tickets"],
    ["Purchase History", "/history"],
    ["Notifications", "/notifications"],
    ["Profile", "/profile"],
  ];
  const links = role === "customer" ? customerLinks : guestLinks;
  if (role === "admin") {
    return (
      <div className="admin-app-shell">
        <button className="admin-menu-button" aria-expanded={drawerOpen} aria-controls="admin-navigation" onClick={() => setDrawerOpen(true)}><Menu size={18} /> Menu</button>
        <AdminSidebar auth={auth} logout={confirmLogout} open={drawerOpen} close={() => setDrawerOpen(false)} />
        <div className="admin-workspace">
          <Routes>
            <Route path="/" element={<Navigate to="/admin" />} />
            <Route path="/concerts" element={<Concerts />} />
            <Route path="/concerts/schedule/:scheduleId" element={<ConcertDetails auth={auth} />} />
            <Route path="/concerts/:id" element={<ConcertDetails auth={auth} />} />
            <Route path="/seat-selection/:scheduleId" element={<SeatSelection auth={auth} />} />
            <Route path="/admin" element={<AdminOnly auth={auth}><AdminDashboard auth={auth} /></AdminOnly>} />
            <Route path="/admin/concerts" element={<AdminOnly auth={auth}><AdminConcerts auth={auth} /></AdminOnly>} />
            <Route path="/admin/concerts/new" element={<AdminOnly auth={auth}><AdminConcertForm auth={auth} /></AdminOnly>} />
            <Route path="/admin/concerts/view/:scheduleId" element={<AdminOnly auth={auth}><ConcertDetails admin /></AdminOnly>} />
            <Route path="/admin/concerts/:concertId/edit" element={<AdminOnly auth={auth}><AdminConcertForm auth={auth} edit /></AdminOnly>} />
            <Route path="/admin/venues" element={<AdminOnly auth={auth}><AdminVenues auth={auth} /></AdminOnly>} />
            <Route path="/admin/venues/new" element={<AdminOnly auth={auth}><AdminVenueForm auth={auth} /></AdminOnly>} />
            <Route path="/admin/venues/:venueId/edit" element={<AdminOnly auth={auth}><AdminVenueForm auth={auth} edit /></AdminOnly>} />
            <Route path="/admin/venues/:venueId/seating" element={<AdminOnly auth={auth}><AdminVenueSeating auth={auth} /></AdminOnly>} />
            <Route path="/admin/archive" element={<AdminOnly auth={auth}><AdminArchive auth={auth} /></AdminOnly>} />
            <Route path="/admin/reservations" element={<AdminOnly auth={auth}><AdminReservations auth={auth} /></AdminOnly>} />
            <Route path="/admin/transactions" element={<AdminOnly auth={auth}><AdminTransactions auth={auth} /></AdminOnly>} />
            <Route path="/admin/transactions/:reservationId" element={<AdminOnly auth={auth}><AdminTransactionDetails auth={auth} /></AdminOnly>} />
            <Route path="/admin/customers" element={<AdminOnly auth={auth}><AdminCustomers auth={auth} /></AdminOnly>} />
            <Route path="/admin/reports" element={<AdminOnly auth={auth}><AdminReports auth={auth} /></AdminOnly>} />
            <Route path="/admin/profile" element={<AdminOnly auth={auth}><AdminProfile auth={auth} /></AdminOnly>} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/create-new-password" element={<CreateNewPasswordPage auth={auth} />} />
            <Route path="/admin/simulation" element={<Navigate to="/admin/reports" />} />
            <Route path="/admin/logs" element={<Navigate to="/admin/transactions" />} />
            <Route path="/access-denied" element={<AccessDenied />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <nav ref={menuRef} className={`topbar ${drawerOpen ? "menu-open" : ""}`} aria-label="Main navigation">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <BrandLogo />
          </Link>
          <button className="icon-btn mobile-menu-button" aria-label={drawerOpen ? "Close menu" : "Open menu"} aria-expanded={drawerOpen} aria-controls="customer-navigation" onClick={() => setDrawerOpen(!drawerOpen)}>{drawerOpen ? <X size={22} /> : <Menu size={22} />}</button>
          <div className="nav-links" id="customer-navigation">
            {links.map(([label, path]) => <NavLink to={path} key={path} end={path === "/"}>{label}</NavLink>)}
          </div>
          <div className="nav-actions">
            {auth ? (
              <>
                <span className="user-pill">{auth.user.role}</span>
                <button onClick={confirmLogout} className="icon-btn" title="Log out"><LogOut size={18} /></button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-small">Log In</Link>
                <Link to="/register" className="btn-small">Create Account</Link>
              </>
            )}
          </div>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/concerts" element={<Concerts />} />
        <Route path="/concerts/schedule/:scheduleId" element={<ConcertDetails auth={auth} />} />
        <Route path="/concerts/:id" element={<ConcertDetails auth={auth} />} />
        <Route path="/seat-selection/:scheduleId" element={<SeatSelection auth={auth} />} />
        <Route path="/checkout/:scheduleId" element={<CustomerOnly auth={auth}><Checkout auth={auth} /></CustomerOnly>} />
        <Route path="/confirmation/:ref" element={<Confirmation />} />
        <Route path="/cart" element={<CustomerOnly auth={auth}><Cart /></CustomerOnly>} />
        <Route path="/tickets" element={<CustomerOnly auth={auth}><Tickets auth={auth} /></CustomerOnly>} />
        <Route path="/tickets/:ticketId" element={<CustomerOnly auth={auth}><TicketDetails auth={auth} /></CustomerOnly>} />
        <Route path="/history" element={<CustomerOnly auth={auth}><HistoryPage auth={auth} /></CustomerOnly>} />
        <Route path="/notifications" element={<CustomerOnly auth={auth}><Notifications role="customer" /></CustomerOnly>} />
        <Route path="/profile" element={<CustomerOnly auth={auth}><Profile auth={auth} /></CustomerOnly>} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage register />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/create-new-password" element={<CreateNewPasswordPage auth={auth} />} />
        <Route path="/admin" element={<AdminOnly auth={auth}><AdminDashboard auth={auth} /></AdminOnly>} />
        <Route path="/admin/concerts" element={<AdminOnly auth={auth}><AdminConcerts auth={auth} /></AdminOnly>} />
        <Route path="/admin/concerts/view/:scheduleId" element={<AdminOnly auth={auth}><ConcertDetails admin /></AdminOnly>} />
        <Route path="/admin/venues" element={<AdminOnly auth={auth}><AdminVenues auth={auth} /></AdminOnly>} />
        <Route path="/admin/seats" element={<AdminOnly auth={auth}><AdminSeats /></AdminOnly>} />
        <Route path="/admin/reservations" element={<AdminOnly auth={auth}><AdminReservations auth={auth} /></AdminOnly>} />
        <Route path="/admin/transactions" element={<AdminOnly auth={auth}><AdminTransactions auth={auth} /></AdminOnly>} />
        <Route path="/admin/customers" element={<AdminOnly auth={auth}><AdminCustomers auth={auth} /></AdminOnly>} />
        <Route path="/admin/simulation" element={<Navigate to="/admin/reports" />} />
        <Route path="/admin/logs" element={<Navigate to="/admin/transactions" />} />
        <Route path="/admin/reports" element={<AdminOnly auth={auth}><AdminReports auth={auth} /></AdminOnly>} />
        <Route path="/admin/profile" element={<AdminOnly auth={auth}><AdminProfile auth={auth} /></AdminOnly>} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route path="/about" element={<Info title="About TicketRush" />} />
        <Route path="/help" element={<Info title="Help and FAQ" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <SiteFooter role={role} auth={auth} />
    </div>
  );
}

function AdminSidebar({ auth, logout, open, close }) {
  const sidebarRef = useRef(null);
  useFocusScope(sidebarRef, open, close);
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);
  const links = [
    ["Dashboard", "/admin", LayoutDashboard],
    ["Concerts", "/admin/concerts", Ticket],
    ["Venues", "/admin/venues", MapPin],
    ["Archive", "/admin/archive", Archive],
    ["Reservations", "/admin/reservations", Clock3],
    ["Transactions", "/admin/transactions", CreditCard],
    ["Customers", "/admin/customers", Users],
    ["Reports", "/admin/reports", BarChart3],
    ["Profile", "/admin/profile", User],
  ];
  return (
    <>
      {open && <button className="drawer-backdrop" onClick={close} aria-label="Close menu" />}
      <aside ref={sidebarRef} id="admin-navigation" className={`admin-sidebar ${open ? "open" : ""}`} aria-label="Admin navigation" tabIndex={-1}>
        <div className="sidebar-brand">
          <BrandLogo />
          <BrandLogo compact />
          <button className="icon-btn sidebar-close" onClick={close} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="sidebar-nav">
          {links.map(([label, path, Icon]) => (
            <NavLink to={path} key={path} end={path === "/admin"} onClick={close}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="avatar small">{auth?.user?.full_name?.[0] || "A"}</div>
          <div>
            <strong>{auth?.user?.full_name || "Admin"}</strong>
            <span>{auth?.user?.role || "admin"}</span>
          </div>
        </div>
        <button onClick={logout} className="sidebar-logout"><LogOut size={18} /><span>Log Out</span></button>
      </aside>
    </>
  );
}

function Protected({ auth, children }) {
  return auth ? children : <Navigate to="/login" />;
}

function CustomerOnly({ auth, children }) {
  if (!auth) return <Navigate to="/login" />;
  if (auth.must_change_password) return <Navigate to="/create-new-password" />;
  return auth.user.role === "customer" ? children : <AccessDenied />;
}

function AdminOnly({ auth, children }) {
  if (!auth) return <Navigate to="/login" />;
  if (auth.must_change_password) return <Navigate to="/create-new-password" />;
  return auth.user.role === "admin" ? children : <AccessDenied />;
}

function Landing() {
  const [concerts, setConcerts] = useState([]);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  useEffect(() => { api("/concerts").then(setConcerts).catch(() => {}); }, []);
  const lead = concerts[0];
  function search(event) {
    event.preventDefault();
    navigate(`/concerts${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }
  const heroImage = lead?.banner_url || lead?.poster_url || fallbackPoster;
  return (
    <main>
      <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(9, 9, 15, .96), rgba(9, 9, 15, .76) 48%, rgba(9, 9, 15, .22)), url("${heroImage}")` }}>
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow"><Zap size={16} /> Live concerts, clear seats</div>
            <h1>TicketRush</h1>
            <p>Browse upcoming concerts, compare ticket tiers, reserve your preferred seats, and keep your digital tickets ready for event day.</p>
            <form className="hero-search" onSubmit={search}>
              <Search size={20} />
              <label className="field-label">Search concerts<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Concert, artist, or venue" /></label>
              <button className="btn compact">Explore</button>
            </form>
            {lead && <Link to={`/concerts/schedule/${lead.schedule_id}`} className="hero-featured"><span className="status-pill">{lead.status}</span><strong>{lead.title}</strong><small>{lead.artist}</small><ChevronRight size={18} /></Link>}
          </div>
        </div>
      </section>
      <section className="section">
        <SectionTitle kicker="Featured" title="Upcoming Events" />
        <div className="concert-grid">
          {concerts.slice(0, 3).map((concert) => <ConcertCard concert={concert} key={concert.schedule_id} />)}
        </div>
      </section>
      <section className="section two-column">
        <div>
          <SectionTitle kicker="How it works" title="Book your concert seat" />
          <div className="steps">
            {[
              ["Browse", "Find a concert and inspect live seat availability."],
              ["Hold", "Log in to reserve selected seats while you finish checkout."],
              ["Confirm", "Complete payment and receive one digital ticket for every seat."],
            ].map(([title, text], index) => (
              <div className="step" key={title}>
                <span>{index + 1}</span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="feature-panel">
          <ShieldCheck size={32} />
          <h3>Built for confident booking</h3>
          <p>TicketRush keeps seat availability, booking details, and digital tickets organized from browsing to event entry.</p>
        </div>
      </section>
    </main>
  );
}

function Concerts() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const location = useLocation();
  useEffect(() => { api("/concerts").then(setItems); }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery(params.get("q") || "");
  }, [location.search]);
  const filtered = items.filter((c) => `${c.title} ${c.artist} ${c.category} ${c.venue}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <Page title="Concerts" icon={<Calendar />} action={<SearchField value={query} setValue={setQuery} />}>
      <div className="filter-row">
        {["All", "Pop", "Rock", "Electronic", "Indie"].map((item) => <button className="chip" key={item} onClick={() => setQuery(item === "All" ? "" : item)}>{item}</button>)}
      </div>
      <div className="concert-grid">{filtered.map((concert) => <ConcertCard concert={concert} key={concert.schedule_id} />)}</div>
    </Page>
  );
}

function ConcertCard({ concert }) {
  return (
    <Link to={`/concerts/schedule/${concert.schedule_id}`} className="concert-card">
      <div className="poster-wrap">
        <SafeImage src={concert.poster_url} />
        <span className="status-pill">{concert.status}</span>
      </div>
      <div className="concert-body">
        <div className="meta-line"><span>{concert.category}</span><span>{concert.available_seats} seats</span></div>
        <h3>{concert.title}</h3>
        <p>{concert.artist}</p>
        <div className="venue-line"><MapPin size={15} /> {concert.venue}</div>
      </div>
    </Link>
  );
}

function ConcertDetails({ admin = false, auth }) {
  const { id, scheduleId } = useParams();
  const navigate = useNavigate();
  const [concert, setConcert] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [loginPrompt, setLoginPrompt] = useState(false);
  useEffect(() => { api(scheduleId ? `/concerts/schedule/${scheduleId}` : `/concerts/${id}`).then(setConcert); }, [id, scheduleId]);
  useEffect(() => {
    if (!concert?.schedule_id) return;
    api(`/schedules/${concert.schedule_id}/seats`).then((map) => {
      const grouped = Object.values(map.seats.reduce((acc, seat) => {
        acc[seat.category] ||= { name: seat.category, price: seat.price, total: 0, sold: 0, held: 0 };
        acc[seat.category].total += 1;
        if (seat.status === "sold") acc[seat.category].sold += 1;
        if (seat.status === "held") acc[seat.category].held += 1;
        return acc;
      }, {}));
      setTiers(grouped);
    });
  }, [concert?.schedule_id]);
  if (!concert) return <Loading />;
  const details = concertExtras(concert);
  const policyRules = concert.rules?.length ? concert.rules : [
    { title: "Age restrictions", text: details.age },
    { title: "Entry requirements", text: details.entry },
    { title: "Allowed items", text: details.allowed },
    { title: "Prohibited items", text: details.prohibited },
    { title: "Refund policy", text: details.refund },
    { title: "Terms and conditions", text: details.terms },
  ];
  const notPurchasable = !["On Sale"].includes(concert.status) || concert.available_seats <= 0;
  const backTarget = admin ? "/admin/concerts" : "/concerts";
  function startPurchase() {
    if (!auth) {
      sessionStorage.setItem("ticketrush_return_to", `/seat-selection/${concert.schedule_id}`);
      setLoginPrompt(true);
      return;
    }
    navigate(`/seat-selection/${concert.schedule_id}`);
  }
  return (
    <main className="event-page">
      <LoginPromptModal open={loginPrompt} onClose={() => setLoginPrompt(false)} returnTo={`/seat-selection/${concert.schedule_id}`} />
      <section className="event-hero">
        <SafeImage className="event-hero-bg" src={details.banner} />
        <div className="event-hero-shade" />
        <div className="event-hero-content">
          <div className="event-poster"><SafeImage src={concert.poster_url} alt={`${concert.title} poster`} /></div>
          <div className="event-copy">
            <span className="status-pill">{concert.status}</span>
            <h1>{concert.title}</h1>
            <p className="artist-name">{concert.artist}</p>
            <p className="description">{concert.description}</p>
            <div className="event-actions">
              {admin ? (
                <Link to={`/admin/concerts/${concert.id}/edit`} className="btn"><Pencil size={16} /> Edit Concert</Link>
              ) : notPurchasable ? (
                <button disabled className="btn">Purchasing Unavailable</button>
              ) : (
                <button type="button" onClick={startPurchase} className="btn">Buy Tickets</button>
              )}
              <Link to={backTarget} className="btn-small"><ArrowLeft size={16} /> Back to Concerts</Link>
            </div>
          </div>
        </div>
      </section>
      <section className="page event-content">
        <div className="event-main">
          <div className="stat-grid event-stats">
            <Stat label="Venue" value={`${concert.venue}, ${concert.city}`} />
            <Stat label="Date" value={prettyDate(concert.starts_at)} />
            <Stat label="Gate opens" value={details.gateOpens} />
            <Stat label="Duration" value={details.duration} />
          </div>
          <SectionPanel title="About the Show">
            <div className="info-grid">
              <InfoTile label="Artist profile" value={details.artistBio} />
              <InfoTile label="Concert theme" value={details.theme} />
              <InfoTile label="Complete address" value={details.address} />
              <InfoTile label="Contact" value={details.contact} />
            </div>
          </SectionPanel>
          <SectionPanel title="Ticket Tiers">
            <div className="tier-list">{tiers.map((tier) => <TierCard tier={tier} key={tier.name} onSelect={startPurchase} />)}</div>
          </SectionPanel>
          <SectionPanel title="Venue Guidelines">
            <div className="info-grid">
              {policyRules.map((rule, index) => <InfoTile key={index} label={rule.title} value={rule.text} />)}
            </div>
          </SectionPanel>
        </div>
        <aside className="summary-panel event-sidebar">
          <h2>Ticket Sale</h2>
          <div className="seat-line"><span>Opens</span><strong>{prettyDate(concert.sale_opens_at)}</strong></div>
          <div className="seat-line"><span>Closes</span><strong>{prettyDate(concert.sale_closes_at)}</strong></div>
          <div className="seat-line"><span>Available</span><strong>{concert.available_seats}</strong></div>
          <div className="total-line"><span>Status</span><strong>{concert.status}</strong></div>
          {!admin && <p className="muted">Purchase limit: Maximum of {concert.max_tickets_per_customer || maxTicketsPerTier} tickets per customer for this concert.</p>}
          {notPurchasable ? <button disabled className="btn wide">Unavailable</button> : <button type="button" onClick={startPurchase} className="btn wide">Buy Tickets</button>}
        </aside>
      </section>
    </main>
  );
}

function LoginPromptModal({ open, onClose, returnTo }) {
  if (!open) return null;
  const saveReturn = (path) => {
    sessionStorage.setItem("ticketrush_return_to", returnTo);
    return path;
  };
  return (
    <Dialog onClose={onClose} label="Log in to continue">
        <div className="confirm-icon"><Lock size={22} /></div>
        <div>
          <h2>Log in to continue</h2>
          <p>Please log in or create an account before selecting seats and purchasing tickets. This allows TicketRush to secure your selected seats and save your booking.</p>
        </div>
        <div className="confirm-actions">
          <Link className="btn" to={saveReturn("/login")}>Log In</Link>
          <Link className="btn-small" to={saveReturn("/register")}>Create Account</Link>
          <button className="btn-small" type="button" onClick={onClose}>Continue Browsing</button>
        </div>
    </Dialog>
  );
}

function SeatSelection({ auth }) {
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  const [map, setMap] = useState(null);
  const [selected, setSelected] = useState([]);
  const [selectedTier, setSelectedTier] = useState("");
  const [error, setError] = useState("");
  const [loginPrompt, setLoginPrompt] = useState(!auth);
  const [seatConflict, setSeatConflict] = useState("");
  const load = () => api(`/schedules/${scheduleId}/seats`).then(setMap).catch(() => setError("Could not refresh seats."));
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [scheduleId]);
  const tiers = useMemo(() => Object.values((map?.seats || []).reduce((acc, seat) => {
    acc[seat.category] ||= { name: seat.category, price: seat.price, total: 0, available: 0 };
    acc[seat.category].total += 1;
    if (seat.status === "available") acc[seat.category].available += 1;
    return acc;
  }, {})), [map]);
  useEffect(() => { if (!selectedTier && tiers[0]) setSelectedTier(tiers[0].name); }, [tiers, selectedTier]);
  const selectedSeats = useMemo(() => (map?.seats || []).filter((seat) => selected.includes(seat.id)), [map, selected]);
  const total = selectedSeats.reduce((sum, seat) => sum + Number(seat.price), 0);
  const serviceFee = selected.length ? 120 : 0;
  function toggleSeat(seat) {
    if (!auth) {
      sessionStorage.setItem("ticketrush_return_to", `/seat-selection/${scheduleId}`);
      setLoginPrompt(true);
      return;
    }
    if (seat.status !== "available" || seat.category !== selectedTier) return;
    setSelected((old) => {
      if (old.includes(seat.id)) return old.filter((item) => item !== seat.id);
      if (old.length >= maxTicketsPerTier) {
        setError(`Maximum ${maxTicketsPerTier} tickets allowed per customer for this tier.`);
        return old;
      }
      setError("");
      return [...old, seat.id];
    });
  }
  async function hold() {
    if (!auth) {
      sessionStorage.setItem("ticketrush_return_to", `/seat-selection/${scheduleId}`);
      setLoginPrompt(true);
      return;
    }
    if (!(await askConfirm(`Reserve ${selected.length} selected seat${selected.length === 1 ? "" : "s"}?`, "Reserve Seats"))) return;
    if (!auth) return navigate("/login");
    setError("");
    try {
      await api("/holds", { method: "POST", body: JSON.stringify({ schedule_id: Number(scheduleId), seat_ids: selected }) }, auth);
      sessionStorage.setItem("ticketrush_selection", JSON.stringify({ scheduleId, selected, heldAt: Date.now(), seats: selectedSeats }));
      navigate(`/checkout/${scheduleId}`);
    } catch (error) {
      const selectedLabels = selectedSeats.map((seat) => seat.label).join(", ");
      setSeatConflict(/limit/i.test(error.message) ? error.message : `Another customer secured ${selectedLabels || "one or more seats"} before your reservation was completed. Please choose another available seat.`);
      setSelected([]);
      load();
    }
  }
  if (!map) return <Loading />;
  return (
    <Page title={`Seat Map - ${map.venue}`} icon={<Ticket />}>
      <LoginPromptModal open={loginPrompt} onClose={() => setLoginPrompt(false)} returnTo={`/seat-selection/${scheduleId}`} />
      {seatConflict && (
        <Dialog onClose={() => setSeatConflict("")} label={/limit/i.test(seatConflict) ? "Maximum ticket limit reached" : "Seat no longer available"}>
            <div className="confirm-icon"><Ticket size={22} /></div>
            <div>
              <h2>{/limit/i.test(seatConflict) ? "Maximum ticket limit reached" : "Seat no longer available"}</h2>
              <p>{/limit/i.test(seatConflict) ? "Maximum ticket limit reached. You cannot purchase more tickets for this concert." : seatConflict}</p>
            </div>
            {/limit/i.test(seatConflict) ? (
              <div className="confirm-actions single">
                <button className="btn" type="button" onClick={() => setSeatConflict("")}>Okay</button>
              </div>
            ) : (
              <div className="confirm-actions">
                <button className="btn" type="button" onClick={() => setSeatConflict("")}>Choose Another Seat</button>
                <button className="btn-small" type="button" onClick={() => { setSeatConflict(""); load(); }}>Refresh Seat Map</button>
              </div>
            )}
        </Dialog>
      )}
      <div className="seat-layout">
        <div className="seat-map-panel">
          <div className="tier-selector">
            {tiers.map((tier) => (
              <button className={`tier-choice ${selectedTier === tier.name ? "active" : ""}`} onClick={() => { setSelectedTier(tier.name); setSelected([]); }} key={tier.name}>
                <strong>{tier.name}</strong>
                <span>{tier.available}/{tier.total} available - {peso(tier.price)}</span>
              </button>
            ))}
          </div>
          <div className="stage">Stage</div>
          <div className="seat-map-scroll" tabIndex={0} role="region" aria-label="Seats"><div className="seat-grid">
            {map.seats.map((seat) => (
              <button
                key={seat.id}
                disabled={seat.status !== "available" || seat.category !== selectedTier}
                onClick={() => toggleSeat(seat)}
                className={`seat ${seat.status} ${seat.category !== selectedTier ? "dimmed" : ""} ${selected.includes(seat.id) ? "selected" : ""}`}
                title={`${seat.label} - Row ${seat.row} - ${seat.category} - ${peso(seat.price)} - ${seat.status}`}
              >
                {seat.label}
              </button>
            ))}
          </div></div>
          <div className="legend-row">{["available", "held", "sold", "selected"].map((item) => <span key={item}><i className={`legend ${item}`} />{item}</span>)}</div>
        </div>
        <aside className="summary-panel">
          <div className="summary-head"><h2>Selection</h2><span>{selectedTier || "Tier"}</span></div>
          {error && <div className="error-banner">{error}</div>}
          <div className="seat-list">
            {selectedSeats.length ? selectedSeats.map((seat) => (
              <div className="seat-line" key={seat.id}><span>{seat.label} - {seat.category}</span><button className="text-button" onClick={async () => { if (await askConfirm(`Remove seat ${seat.label} from your selection?`, "Remove Seat")) setSelected((old) => old.filter((id) => id !== seat.id)); }}>Remove</button><strong>{peso(seat.price)}</strong></div>
            )) : <p className="muted">Choose available seats from the map.</p>}
          </div>
          <div className="seat-line"><span>Service fee</span><strong>{peso(serviceFee)}</strong></div>
          <div className="total-line"><span>Total</span><strong>{peso(total + serviceFee)}</strong></div>
          <button disabled={!selected.length} onClick={hold} className="btn wide">Reserve Seats</button>
          <button className="btn-small wide-link" onClick={() => navigate(-1)}>Return to Concert</button>
        </aside>
      </div>
    </Page>
  );
}

function Checkout({ auth }) {
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  const selection = JSON.parse(sessionStorage.getItem("ticketrush_selection") || "{}");
  const [seconds, setSeconds] = useState(300);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seats = selection.seats || [];
  const subtotal = seats.reduce((sum, seat) => sum + Number(seat.price), 0);
  useEffect(() => { const id = setInterval(() => setSeconds((s) => Math.max(s - 1, 0)), 1000); return () => clearInterval(id); }, []);
  async function confirm() {
    if (!(await askConfirm("Confirm this ticket purchase?", "Confirm Purchase"))) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/checkout", { method: "POST", body: JSON.stringify({ schedule_id: Number(scheduleId), seat_ids: selection.selected || [], idempotency_key: crypto.randomUUID(), payment_method: "Simulated Card" }) }, auth);
      navigate(`/confirmation/${result.booking_reference}`);
    } catch (error) {
      setError(/limit/i.test(error.message) ? "Maximum ticket limit reached. You cannot purchase more tickets for this concert." : "Seat no longer available. Another customer secured one of these seats before your reservation was completed. Please choose another available seat.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Checkout" icon={<CreditCard />}>
      <div className="checkout-layout">
        <div className="panel">
          <div className="timer"><Clock3 size={18} /> Seat hold expires in <strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong></div>
          {error && <div className="error-banner">{error}</div>}
          <div className="seat-list">{seats.map((seat) => <div className="seat-line" key={seat.id}><span>{seat.label} - {seat.category}</span><strong>{peso(seat.price)}</strong></div>)}</div>
        </div>
        <aside className="summary-panel">
          <h2>Payment Summary</h2>
          <div className="seat-line"><span>Subtotal</span><strong>{peso(subtotal)}</strong></div>
          <div className="seat-line"><span>Service fee</span><strong>{peso(120)}</strong></div>
          <div className="total-line"><span>Total</span><strong>{peso(subtotal + 120)}</strong></div>
          <p className="muted">Payment method: Simulated Card</p>
          <button disabled={busy || seconds === 0} onClick={confirm} className="btn wide">{busy ? "Processing..." : "Confirm Purchase"}</button>
        </aside>
      </div>
    </Page>
  );
}

function Confirmation() {
  const { ref } = useParams();
  return (
    <Page title="Booking Confirmed" icon={<Sparkles />}>
      <div className="success-panel">
        <span className="status-pill">Confirmed</span>
        <h2>{ref}</h2>
        <p>Your digital tickets are ready in My Tickets.</p>
        <Link to="/tickets" className="btn">View Tickets</Link>
      </div>
    </Page>
  );
}

function Tickets({ auth }) {
  const [tickets, setTickets] = useState([]);
  useEffect(() => { api("/tickets", {}, auth).then(setTickets); }, []);
  return (
    <Page title="My Tickets" icon={<Ticket />}>
      {!tickets.length && <EmptyState title="No tickets yet" text="Purchased tickets will appear here with QR codes, download links, and ticket details." />}
      <div className="ticket-grid">
        {tickets.map((ticket) => (
          <div className="ticket-card" key={ticket.id}>
            <div>
              <span className="status-pill">Digital Ticket</span>
              <h3>{ticket.concert}</h3>
              <p>{ticket.artist} - Seat {ticket.seat}</p>
              <p className="muted">{ticket.ticket_number}</p>
            </div>
            <div className="qr-box"><QRCodeCanvas value={ticket.qr_payload} size={156} /></div>
            <div className="ticket-actions">
              <Link className="btn-small" to={`/tickets/${ticket.id}`}>View Details</Link>
              <button className="btn-small" onClick={() => downloadTicketPdf(ticket.id, auth)}><Download size={16} /> PDF</button>
              <button className="btn-small" onClick={() => window.print()}>Print</button>
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

function TicketDetails({ auth }) {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  useEffect(() => { api("/tickets", {}, auth).then((items) => setTicket(items.find((item) => String(item.id) === String(ticketId)))); }, [auth, ticketId]);
  if (!ticket) return <Loading />;
  return (
    <Page title="Ticket Details" icon={<Ticket />} action={<Link className="btn-small" to="/tickets"><ArrowLeft size={16} /> Back to Tickets</Link>}>
      <div className="ticket-detail">
        <div className="ticket-card large">
          <div>
            <span className="status-pill">Valid</span>
            <h3>{ticket.concert}</h3>
            <p>{ticket.artist}</p>
            <p className="muted">Booking {ticket.booking_reference}</p>
            <div className="info-grid compact">
              <InfoTile label="Venue" value={ticket.venue} />
              <InfoTile label="Date" value={prettyDate(ticket.starts_at)} />
              <InfoTile label="Seat" value={ticket.seat} />
              <InfoTile label="Tier" value={ticket.category} />
              <InfoTile label="Entry instructions" value="Present this QR code at the gate with a valid ID." />
              <InfoTile label="Important reminders" value="Arrive early, follow venue checks, and keep the QR code readable." />
            </div>
          </div>
          <div className="qr-box large"><QRCodeCanvas value={ticket.qr_payload} size={210} /></div>
          <div className="ticket-actions">
            <button className="btn-small" onClick={() => downloadTicketPdf(ticket.id, auth)}><Download size={16} /> Download PDF</button>
            <button className="btn-small" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </div>
    </Page>
  );
}

function Cart() {
  const selection = JSON.parse(sessionStorage.getItem("ticketrush_selection") || "{}");
  const seats = selection.seats || [];
  return (
    <Page title="My Cart" icon={<ShoppingCart />}>
      {!seats.length ? <EmptyState title="Your cart is empty" text="Held seats will appear here while they are still valid." /> : (
        <div className="summary-panel static">
          {seats.map((seat) => <div className="seat-line" key={seat.id}><span>{seat.label} - {seat.category}</span><strong>{peso(seat.price)}</strong></div>)}
          <Link className="btn wide" to={`/checkout/${selection.scheduleId}`}>Continue Checkout</Link>
        </div>
      )}
    </Page>
  );
}

function SiteFooter({ role = "guest", auth }) {
  const guestLinks = [
    ["Home", "/"],
    ["Browse Concerts", "/concerts"],
    ["About", "/about"],
    ["Help and FAQs", "/help"],
    ["Log In", "/login"],
    ["Create Account", "/register"],
  ];
  const customerLinks = [
    ["Home", "/"],
    ["Browse Concerts", "/concerts"],
    ["My Cart", "/cart"],
    ["My Tickets", "/tickets"],
    ["Purchase History", "/history"],
    ["Notifications", "/notifications"],
    ["Profile", "/profile"],
  ];
  const links = role === "customer" && auth ? customerLinks : guestLinks;
  return (
    <footer className="footer site-footer">
      <div className="footer-brand"><BrandLogo /><p>Online concert ticketing for discovering events, reserving seats, and managing digital tickets in one place.</p></div>
      <div className="footer-links">
        {links.map(([label, path]) => <NavLink to={path} key={`${label}-${path}`}>{label}</NavLink>)}
      </div>
      <div className="footer-contact"><strong>Contact</strong><span>support@ticketrush.example.com</span></div>
      <div className="footer-bottom">© 2026 TicketRush. All rights reserved.</div>
    </footer>
  );
}

function Notifications({ role }) {
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState([
    { id: 1, type: "booking", unread: true, title: "Your seat hold expires soon", text: "Complete your purchase before the five-minute hold ends to keep your selected seats.", date: new Date().toISOString(), action: "/cart" },
    { id: 2, type: "booking", unread: false, title: "Digital ticket available", text: "Your confirmed tickets are ready to view, download, or print.", date: new Date(Date.now() - 86400000).toISOString(), action: "/tickets" },
    { id: 3, type: "concert", unread: false, title: "New concert announcement", text: "Browse the latest published concerts and choose your preferred seats.", date: new Date(Date.now() - 172800000).toISOString(), action: "/concerts" },
  ]);
  const visible = items.filter((item) => tab === "all" || (tab === "unread" ? item.unread : item.type === tab));
  const markAll = () => setItems((old) => old.map((item) => ({ ...item, unread: false })));
  return (
    <Page title="Notifications" icon={<Bell />}>
      <div className="report-tabs"><button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All</button><button className={tab === "unread" ? "active" : ""} onClick={() => setTab("unread")}>Unread</button><button className={tab === "booking" ? "active" : ""} onClick={() => setTab("booking")}>Booking Updates</button><button className={tab === "concert" ? "active" : ""} onClick={() => setTab("concert")}>Concert Updates</button><button onClick={markAll}>Mark All as Read</button></div>
      {!visible.length ? <EmptyState title="You’re all caught up" text="Booking confirmations and concert updates will appear here." /> : <div className="notification-list">{visible.map((item) => <div className={`notification-item ${item.unread ? "unread" : ""}`} key={item.id}><Bell size={18} /><div><h3>{item.title}</h3><p>{item.text}</p><span>{prettyDate(item.date)}</span></div><Link className="btn-small" to={item.action} onClick={() => setItems((old) => old.map((row) => row.id === item.id ? { ...row, unread: false } : row))}>Open</Link><button className="btn-small danger" onClick={() => setItems((old) => old.filter((row) => row.id !== item.id))}>Delete</button></div>)}</div>}
    </Page>
  );
}

function HistoryPage({ auth }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/reservations", {}, auth).then(setRows); }, []);
  return <Page title="Purchase History" icon={<History />}><Table rows={rows.map((row) => ({ ...row, total_amount: peso(row.total_amount), created_at: prettyDate(row.created_at) }))} columns={["booking_reference", "status", "total_amount", "created_at"]} /></Page>;
}

function Profile({ auth }) {
  const [tab, setTab] = useState("overview");
  const [tickets, setTickets] = useState([]);
  const [history, setHistory] = useState([]);
  const [profile, setProfile] = useState({ first_name: auth.user.full_name.split(" ")[0] || "", last_name: auth.user.full_name.split(" ").slice(1).join(" "), email: auth.user.email, contact_number: "", profile_photo_url: "" });
  const [password, setPassword] = useState({ current_password: "", new_password: "", confirm: "" });
  const [message, setMessage] = useState("");
  useEffect(() => {
    api("/me", {}, auth).then((me) => {
      const names = me.full_name.split(" ");
      setProfile({ first_name: names[0] || "", last_name: names.slice(1).join(" "), email: me.email, contact_number: me.contact_number || "", profile_photo_url: me.profile_photo_url || "" });
    }).catch(() => {});
    api("/tickets", {}, auth).then(setTickets).catch(() => {});
    api("/reservations", {}, auth).then(setHistory).catch(() => {});
  }, [auth]);
  const nextTicket = tickets.slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
  async function saveProfile(event) {
    event.preventDefault();
    try {
      await api("/me", { method: "PUT", body: JSON.stringify(profile) }, auth);
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error.message || "Profile could not be updated.");
    }
  }
  async function savePassword(event) {
    event.preventDefault();
    if (password.new_password !== password.confirm) {
      setMessage("New password and confirmation must match.");
      return;
    }
    try {
      await api("/me/password", { method: "PUT", body: JSON.stringify({ current_password: password.current_password, new_password: password.new_password }) }, auth);
      setPassword({ current_password: "", new_password: "", confirm: "" });
      setMessage("Password updated.");
    } catch (error) {
      setMessage(error.message || "Password could not be updated.");
    }
  }
  return (
    <Page title="Profile" icon={<User />}>
      <div className="profile-panel">
        <div className="avatar">{auth.user.full_name.slice(0, 1)}</div>
        <div><h2>{auth.user.full_name}</h2><p>{auth.user.email}</p><span className="status-pill">Active</span></div>
      </div>
      <div className="report-tabs">
        {["overview", "personal", "tickets", "history", "security"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item.replace(/^\w/, (c) => c.toUpperCase())}</button>)}
      </div>
      <Feedback message={message} />
      {tab === "overview" && <><div className="business-metrics secondary"><Stat label="Upcoming Concerts" value={tickets.filter((ticket) => new Date(ticket.starts_at) >= new Date()).length} /><Stat label="Active Reservations" value={history.filter((row) => ["held", "pending"].includes(row.status)).length} /><Stat label="Total Tickets Purchased" value={tickets.length} /><Stat label="Completed Purchases" value={history.filter((row) => ["confirmed", "completed"].includes(row.status)).length} /></div>{nextTicket ? <div className="upcoming-card profile-next"><SafeImage src={nextTicket.poster_url} /><div><h4>{nextTicket.concert}</h4><p>{prettyDate(nextTicket.starts_at)} - {nextTicket.venue}</p><span>{nextTicket.category} - Seat {nextTicket.seat}</span><Link className="btn-small" to={`/tickets/${nextTicket.id}`}>View Ticket</Link></div></div> : <EmptyState title="No upcoming event yet" text="Your next confirmed ticket will appear here." />}</>}
      {tab === "personal" && <form className="auth-card" onSubmit={saveProfile}><Field value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} placeholder="First name" /><Field value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} placeholder="Last name" /><Field value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder="Email" /><Field value={profile.contact_number} onChange={(e) => setProfile({ ...profile, contact_number: e.target.value })} placeholder="Contact number" /><button className="btn">Save Profile</button></form>}
      {tab === "tickets" && <div className="ticket-grid">{tickets.map((ticket) => <div className="ticket-card" key={ticket.id}><div><span className="status-pill">Valid</span><h3>{ticket.concert}</h3><p>{prettyDate(ticket.starts_at)} - {ticket.venue}</p><p>{ticket.category} - Seat {ticket.seat}</p></div><div className="ticket-actions"><Link className="btn-small" to={`/tickets/${ticket.id}`}>View Ticket</Link><button className="btn-small" onClick={() => downloadTicketPdf(ticket.id, auth)}>Download</button></div></div>)}</div>}
      {tab === "history" && <Table rows={history.map((row) => ({ ...row, total_amount: peso(row.total_amount), created_at: prettyDate(row.created_at) }))} columns={["booking_reference", "status", "total_amount", "created_at"]} searchable />}
      {tab === "security" && <form className="auth-card" onSubmit={savePassword}><Field type="password" value={password.current_password} onChange={(e) => setPassword({ ...password, current_password: e.target.value })} placeholder="Current password" /><Field type="password" value={password.new_password} onChange={(e) => setPassword({ ...password, new_password: e.target.value })} placeholder="New password" /><Field type="password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} placeholder="Confirm new password" /><button className="btn">Change Password</button></form>}
    </Page>
  );
}

const passwordRules = [
  ["length", "At least eight characters", (value) => value.length >= 8],
  ["upper", "At least one uppercase letter", (value) => /[A-Z]/.test(value)],
  ["lower", "At least one lowercase letter", (value) => /[a-z]/.test(value)],
  ["number", "At least one number", (value) => /\d/.test(value)],
  ["special", "At least one special character", (value) => /[^A-Za-z0-9]/.test(value)],
];

function strongPassword(value) {
  return passwordRules.every(([, , test]) => test(value || ""));
}

function PasswordRequirements({ value }) {
  return <div className="password-rules" aria-label="Password requirements">
    {passwordRules.map(([id, text, test]) => <span key={id} className={test(value || "") ? "met" : ""}>{test(value || "") ? <ShieldCheck size={14} /> : <Lock size={14} />}{text}</span>)}
  </div>;
}

function PasswordInput({ label, value, onChange, autoComplete = "current-password", disabled = false }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-field">
    <Field label={label} type={visible ? "text" : "password"} required minLength={8} autoComplete={autoComplete} value={value} disabled={disabled} onChange={onChange} />
    <button type="button" className="icon-btn password-toggle" disabled={disabled} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  </div>;
}

function AuthPage({ register = false }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", confirm_password: "", first_name: "", last_name: "", contact_number: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (register && (!form.first_name.trim() || !form.last_name.trim() || !form.contact_number.trim())) {
      setError("Please complete all required fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (register && !strongPassword(form.password)) {
      setError("Password must satisfy all listed requirements.");
      return;
    }
    if (register && form.password !== form.confirm_password) {
      setError("Passwords do not match. Please make sure that both password fields contain the same password.");
      return;
    }
    setBusy(true);
    try {
      const email = form.email.trim().toLowerCase();
      if (register) {
        await api("/auth/register", { method: "POST", body: JSON.stringify({ ...form, email }) });
      }
      const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password: form.password }) });
      window.saveAuthBridge(result);
      if (result.must_change_password) {
        navigate("/create-new-password");
        return;
      }
      const returnTo = sessionStorage.getItem("ticketrush_return_to");
      sessionStorage.removeItem("ticketrush_return_to");
      navigate(result.user.role === "admin" ? "/admin" : returnTo || "/concerts");
    } catch (error) {
      const message = error.message || "";
      if (register && /registered|409/i.test(message)) setError("This email already has a TicketRush account. Please log in instead.");
      else if (/Temporary password expired/i.test(message)) setError("Temporary password expired. This temporary password is no longer valid. Please request a new password reset from the TicketRush administrator.");
      else if (/Temporary password no longer valid/i.test(message)) setError("Temporary password no longer valid. This one-time password has already been used or replaced. Please contact the TicketRush administrator for assistance.");
      else if (/fetch|network/i.test(message)) setError("Unable to reach TicketRush. Please wait a moment and try again.");
      else setError(message || "Could not complete your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title={register ? "Register" : "Login"} icon={<Lock />}>
      <form onSubmit={submit} className="auth-card" aria-busy={busy}>
        <div><h2>{register ? "Create your account" : "Welcome back"}</h2></div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {register && <div className="auth-split"><Field required autoComplete="given-name" label="First Name" value={form.first_name} disabled={busy} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /><Field required autoComplete="family-name" label="Last Name" value={form.last_name} disabled={busy} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>}
        <Field type="email" required autoComplete="email" placeholder="Email" value={form.email} disabled={busy} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        {register && <Field required autoComplete="tel" label="Contact Number" value={form.contact_number} disabled={busy} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} />}
        <PasswordInput label="Password" value={form.password} disabled={busy} autoComplete={register ? "new-password" : "current-password"} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {register && <><PasswordInput label="Confirm Password" value={form.confirm_password} disabled={busy} autoComplete="new-password" onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} /><PasswordRequirements value={form.password} /></>}
        <button className="btn wide" disabled={busy}>{busy ? (register ? "Creating..." : "Logging in...") : (register ? "Create Account" : "Login")}</button>
        {!register && <Link className="muted center" to="/forgot-password">Forgot Password?</Link>}
        <Link className="muted center" to={register ? "/login" : "/register"}>{register ? "Already have an account?" : "Need an account?"}</Link>
      </form>
    </Page>
  );
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setBusy(false);
    }
  }
  return <Page title="Forgot Password" icon={<KeyRound />}>
    <form className="auth-card" onSubmit={submit}>
      <div><h2>{submitted ? "Request received" : "Forgot your password?"}</h2><p>{submitted ? "If the email matches a TicketRush account, the administrator can assist with resetting its password." : "Enter the email address connected to your TicketRush account. Please contact the TicketRush administrator to request a temporary password."}</p></div>
      {!submitted && <><Feedback message={error} /><Field type="email" required autoComplete="email" label="Email Address" value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} /><button className="btn wide" disabled={busy}>{busy ? "Submitting..." : "Submit Request"}</button></>}
      {submitted && <Link className="btn wide" to="/login">Back to Login</Link>}
    </form>
  </Page>;
}

function CreateNewPasswordPage({ auth }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ new_password: "", confirm_password: "" });
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (form.new_password !== form.confirm_password) {
      setMessage("Passwords do not match. Please enter the same password in both fields.");
      return;
    }
    if (!strongPassword(form.new_password)) {
      setMessage("Password must satisfy all listed requirements.");
      return;
    }
    try {
      await api("/auth/create-new-password", { method: "POST", body: JSON.stringify(form) }, auth);
      window.saveAuthBridge(null);
      setDone(true);
    } catch (error) {
      setMessage(error.message || "Password could not be updated.");
    }
  }
  if (done) return <Page title="Password Updated" icon={<ShieldCheck />}><div className="success-panel"><h2>Password updated successfully</h2><p>Your new password has been saved. You may now log in to your TicketRush account.</p><button className="btn" onClick={() => navigate("/login")}>Continue to Login</button></div></Page>;
  if (!auth?.must_change_password) return <Navigate to="/login" />;
  return <Page title="Create New Password" icon={<KeyRound />}>
    <form className="auth-card" onSubmit={submit}>
      <div><h2>Create a new password</h2><p>For your account's security, create a new password before continuing to TicketRush.</p></div>
      <Feedback message={message} />
      <PasswordInput label="New Password" value={form.new_password} autoComplete="new-password" onChange={(event) => setForm({ ...form, new_password: event.target.value })} />
      <PasswordInput label="Confirm New Password" value={form.confirm_password} autoComplete="new-password" onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} />
      <PasswordRequirements value={form.new_password} />
      <button className="btn wide">Save New Password</button>
    </form>
  </Page>;
}

function AdminDashboard({ auth }) {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(defaultBusinessFilters());
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    return Promise.all([
      api("/admin/dashboard", {}, auth),
      api("/admin/concerts", {}, auth).catch(() => []),
    ])
      .then(([dashboard, adminConcerts]) => setData({ ...dashboard, admin_concerts: adminConcerts }))
      .catch((err) => setError(err.message || "Dashboard data could not be loaded."));
  };
  useEffect(() => { load(); }, [auth]);
  if (error) return (
    <Page title="Admin Dashboard" icon={<LayoutDashboard />}>
      <div className="error-banner">{error.includes("Could not validate") || error.includes("expired") ? "Your admin session needs a fresh login for this backend server." : `Dashboard data could not be loaded. ${error}`}</div>
      <div className="form-actions">
        <button className="btn-small" onClick={load}>Retry</button>
        <Link className="btn-small" to="/login">Back to Login</Link>
      </div>
    </Page>
  );
  if (!data) return <Loading />;
  const view = filterBusinessData(data, filters);
  const primary = [
    { label: "Total Revenue", value: peso(view.summary.total_revenue), detail: "Completed payments only", icon: CreditCard },
    { label: "Tickets Sold", value: view.summary.tickets_sold, detail: `${view.summary.available_seats} seats still available`, icon: Ticket },
    { label: "Active Concerts", value: view.summary.active_concerts, detail: `${view.summary.upcoming_concerts} upcoming published shows`, icon: Calendar },
    { label: "Active Reservations", value: view.summary.active_reservations, detail: "Held, pending, and confirmed reservations", icon: Clock3 },
  ];
  const upcoming = view.upcoming;
  return (
    <Page title="Dashboard" icon={<LayoutDashboard />}>
      <BusinessHeader title="Live overview" subtitle="Overview of TicketRush sales, concerts, and reservations" onRefresh={load} />
      <BusinessFilters data={data} filters={filters} setFilters={setFilters} compact />
      <div className="business-metrics primary">
        {primary.map((item) => <MetricCard key={item.label} {...item} />)}
      </div>
      <div className="business-metrics secondary">
        <Stat label="Total Customers" value={view.summary.total_customers} />
        <Stat label="Available Seats" value={view.summary.available_seats} />
        <Stat label="Upcoming Concerts" value={view.summary.upcoming_concerts} />
        <Stat label="Completed Transactions" value={view.summary.completed_transactions} />
      </div>
      <div className="dashboard-layout">
        <DataPanel title="Sales and Revenue Overview" className="wide">
          {view.trend.length ? <TrendChart rows={view.trend} /> : <EmptyState title="No sales data is available for this period." text="Completed ticket transactions will appear here." />}
        </DataPanel>
        <DataPanel title="Seat Occupancy">
          <SeatOccupancyCard occupancy={view.seat_occupancy} tiers={view.tiers} />
        </DataPanel>
        <DataPanel title="Ticket Sales by Concert">
          {view.concerts.length === 1 ? <ConcertPerformanceCard concert={view.concerts[0]} /> : <HorizontalBars rows={view.concerts.slice(0, 6).map((row) => ({ label: row.title, value: row.sold, detail: `${peso(row.revenue)} - ${row.occupancy}%`, to: `/admin/concerts/view/${row.schedule_id}` }))} empty="No concerts match the selected filters." />}
        </DataPanel>
        <DataPanel title="Upcoming Concert">
          {upcoming ? <UpcomingConcertCard concert={upcoming} /> : <EmptyState title="No upcoming published concert" text="Draft, archived, cancelled, and completed concerts are excluded." />}
        </DataPanel>
        <DataPanel title="Recent Transactions" className="wide">
          <Table rows={view.transactions.slice(0, 5).map(formatTransactionRow)} columns={["booking_reference", "customer", "concert", "quantity", "total_amount", "payment_status", "created_at"]} actions={(row) => <Link className="btn-small" to={`/admin/transactions/${row.id}`}><Eye size={14} /> View</Link>} />
          <Link className="btn-small wide-link" to="/admin/transactions">View All Transactions</Link>
        </DataPanel>
      </div>
    </Page>
  );
}

function AdminLinks() {
  return null;
}

function defaultBusinessFilters() {
  return { range: "30", concert: "", venue: "", tier: "", reservation_status: "", transaction_status: "" };
}

function isWithinRange(value, range) {
  if (!value || !range) return true;
  const date = new Date(value);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(range));
  return date >= cutoff;
}

function filterBusinessData(data, filters) {
  const matchConcert = (row) => !filters.concert || String(row.schedule_id) === String(filters.concert);
  const matchVenue = (row) => !filters.venue || String(row.venue_id) === String(filters.venue);
  const matchTier = (row) => !filters.tier || String(row.tiers || row.tier || "").includes(filters.tier);
  const matchTransactionStatus = (row) => !filters.transaction_status || row.payment_status === filters.transaction_status;
  const matchReservationStatus = (row) => !filters.reservation_status || row.status === filters.reservation_status;
  const sourceTransactions = Array.isArray(data.transactions) ? data.transactions : [];
  const sourceConcerts = Array.isArray(data.concerts)
    ? data.concerts
    : Array.isArray(data.admin_concerts)
      ? data.admin_concerts.map((row) => ({
          ...row,
          concert: row.title,
          sold: Math.max(Number(row.total_seats || 0) - Number(row.available_seats || 0), 0),
          revenue: 0,
          occupancy: Math.round((Math.max(Number(row.total_seats || 0) - Number(row.available_seats || 0), 0) / Math.max(Number(row.total_seats || 0), 1)) * 1000) / 10,
        }))
    : Array.isArray(data.sales_by_concert)
      ? data.sales_by_concert.map((row, index) => ({
          schedule_id: row.schedule_id || `legacy-${index}`,
          title: row.concert,
          concert: row.concert,
          artist: "",
          venue: "",
          status: "On Sale",
          starts_at: new Date().toISOString(),
          total_seats: Number(row.sold || 0) + Number(row.available || 0),
          available_seats: Number(row.available || 0),
          held_seats: 0,
          sold: Number(row.sold || 0),
          revenue: 0,
          occupancy: Math.round((Number(row.sold || 0) / Math.max(Number(row.sold || 0) + Number(row.available || 0), 1)) * 1000) / 10,
        }))
      : [];
  const sourceTiers = Array.isArray(data.tiers) ? data.tiers : [];
  const sourceReservations = Array.isArray(data.reservations) ? data.reservations : [];
  const transactions = sourceTransactions.filter((row) => isWithinRange(row.created_at, filters.range) && matchConcert(row) && matchVenue(row) && matchTier(row) && matchTransactionStatus(row));
  const completed = transactions.filter((row) => ["paid", "completed"].includes(row.payment_status));
  const concerts = sourceConcerts.filter((row) => isWithinRange(row.starts_at, filters.range) && matchConcert(row) && matchVenue(row));
  const tiers = sourceTiers.filter((row) => matchConcert(row) && matchTier(row));
  const reservations = sourceReservations.filter((row) => isWithinRange(row.created_at, filters.range) && matchConcert(row) && matchReservationStatus(row));
  const customers = Array.isArray(data.customer_rows) ? data.customer_rows : Array.isArray(data.customers) ? data.customers : [];
  const trendMap = {};
  completed.forEach((row) => {
    const day = String(row.created_at || "").slice(0, 10);
    if (!day) return;
    trendMap[day] ||= { date: day, tickets: 0, revenue: 0 };
    trendMap[day].tickets += Number(row.quantity || 0);
    trendMap[day].revenue += Number(row.total_amount || 0);
  });
  const revenue = completed.length ? completed.reduce((sum, row) => sum + Number(row.total_amount || 0), 0) : Number(data.summary?.total_revenue ?? data.summary?.completed_revenue ?? data.revenue ?? 0);
  const tickets = completed.length ? completed.reduce((sum, row) => sum + Number(row.quantity || 0), 0) : Number(data.summary?.tickets_sold ?? data.tickets ?? 0);
  const totalSeats = concerts.reduce((sum, row) => sum + Number(row.total_seats || 0), 0);
  const availableSeats = concerts.length ? concerts.reduce((sum, row) => sum + Number(row.available_seats || 0), 0) : Number(data.summary?.available_seats ?? data.available_seats ?? 0);
  const heldSeats = concerts.reduce((sum, row) => sum + Number(row.held_seats || 0), 0);
  const completedCount = completed.length || Number(data.summary?.completed_transactions ?? data.completed_transactions ?? 0);
  return {
    summary: {
      total_revenue: revenue,
      completed_revenue: revenue,
      tickets_sold: tickets,
      active_concerts: concerts.length ? concerts.filter((row) => ["On Sale", "Upcoming"].includes(row.status)).length : Number(data.summary?.active_concerts ?? data.active_concerts ?? 0),
      active_reservations: reservations.length ? reservations.filter((row) => ["held", "pending", "confirmed"].includes(row.status)).length : Number(data.summary?.active_reservations ?? data.active_reservations ?? 0),
      total_customers: customers.length || Number(data.summary?.total_customers ?? data.customers ?? 0),
      available_seats: availableSeats,
      upcoming_concerts: concerts.length ? concerts.filter((row) => ["On Sale", "Upcoming"].includes(row.status) && new Date(row.starts_at) >= new Date()).length : Number(data.summary?.upcoming_concerts ?? data.upcoming_concerts ?? 0),
      completed_transactions: completedCount,
      average_transaction_value: revenue / Math.max(completedCount, 1),
    },
    seat_occupancy: { sold: tickets, held: heldSeats, available: availableSeats, total: totalSeats, occupancy: Math.round((tickets / Math.max(totalSeats, 1)) * 1000) / 10 },
    trend: Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date)),
    concerts,
    tiers,
    transactions,
    reservations,
    customers,
    upcoming: concerts.filter((row) => ["On Sale", "Upcoming"].includes(row.status) && new Date(row.starts_at) >= new Date()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0],
  };
}

function formatTransactionRow(row) {
  return { ...row, total_amount: peso(row.total_amount), payment_status: <StatusBadge status={row.payment_status} />, created_at: prettyDate(row.created_at) };
}

function BusinessHeader({ title, subtitle, onRefresh, action }) {
  return (
    <div className="business-header">
      <div>
        {title && <span className="business-kicker">{title}</span>}
        <p>{subtitle}</p>
      </div>
      <div className="business-header-actions">
        <span>{new Date().toLocaleDateString([], { dateStyle: "medium" })}</span>
        {action}
        {onRefresh && <button className="btn-small" onClick={onRefresh}><RefreshCcw size={14} /> Refresh</button>}
        {onRefresh && <button className="icon-btn" title="Notifications"><Bell size={18} /></button>}
      </div>
    </div>
  );
}

function BusinessFilters({ data, filters, setFilters, reports = false }) {
  const concerts = Array.isArray(data.concerts) ? data.concerts : [];
  const venues = [...new Map(concerts.map((row) => [row.venue_id, row])).values()];
  const tiers = [...new Set((Array.isArray(data.tiers) ? data.tiers : []).map((row) => row.tier))];
  const reset = () => setFilters(defaultBusinessFilters());
  return (
    <div className="business-filters">
      <Field as="select" label="Date range" value={filters.range} onChange={(e) => setFilters({ ...filters, range: e.target.value })}>
        <option value="7">Last 7 Days</option>
        <option value="30">Last 30 Days</option>
        <option value="90">Last 90 Days</option>
        <option value="">All Dates</option>
      </Field>
      <Field as="select" label="Concert" value={filters.concert} onChange={(e) => setFilters({ ...filters, concert: e.target.value })}>
        <option value="">All concerts</option>
        {concerts.map((concert) => <option value={concert.schedule_id} key={concert.schedule_id}>{concert.title}</option>)}
      </Field>
      <Field as="select" label="Venue" value={filters.venue} onChange={(e) => setFilters({ ...filters, venue: e.target.value })}>
        <option value="">All venues</option>
        {venues.map((venue) => <option value={venue.venue_id} key={venue.venue_id}>{venue.venue}</option>)}
      </Field>
      <Field as="select" label="Ticket tier" value={filters.tier} onChange={(e) => setFilters({ ...filters, tier: e.target.value })}>
        <option value="">All tiers</option>
        {tiers.map((tier) => <option value={tier} key={tier}>{tier}</option>)}
      </Field>
      {reports && <Field as="select" label="Reservation status" value={filters.reservation_status} onChange={(e) => setFilters({ ...filters, reservation_status: e.target.value })}><option value="">All reservations</option><option value="held">Active</option><option value="confirmed">Confirmed</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></Field>}
      {reports && <Field as="select" label="Transaction status" value={filters.transaction_status} onChange={(e) => setFilters({ ...filters, transaction_status: e.target.value })}><option value="">All transactions</option><option value="paid">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></Field>}
      <button className="btn-small" onClick={reset}>Reset Filters</button>
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon }) {
  return <div className="metric-card"><div className="metric-icon"><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><p>{detail}</p></div>;
}

function DataPanel({ title, children, className = "" }) {
  return <section className={`data-panel ${className}`}><h3>{title}</h3>{children}</section>;
}

function TrendChart({ rows }) {
  if (!rows.length) return <EmptyState title="No sales yet" text="Sales will appear here when tickets are purchased." />;
  const maxRevenue = Math.max(...rows.map((row) => Number(row.revenue || 0)), 1);
  const maxTickets = Math.max(...rows.map((row) => Number(row.tickets || 0)), 1);
  return (
    <div className="trend-chart">
      <div className="chart-legend"><span><i className="revenue-key" /> Revenue</span><span><i className="ticket-key" /> Tickets</span></div>
      {rows.map((row) => (
        <div className="trend-row" key={row.date} title={`${row.date}: ${peso(row.revenue)} - ${row.tickets} tickets`}>
          <span>{row.date}</span>
          <div><i className="revenue-bar" style={{ width: `${Math.max((Number(row.revenue || 0) / maxRevenue) * 100, 3)}%` }} /><i className="ticket-bar" style={{ width: `${Math.max((Number(row.tickets || 0) / maxTickets) * 100, 3)}%` }} /></div>
          <strong>{peso(row.revenue)}</strong>
        </div>
      ))}
    </div>
  );
}

function HorizontalBars({ rows, money = false, empty }) {
  if (!rows.length) return <EmptyState title={empty || "No data available"} text="Try changing the active filters." />;
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1);
  return <div className="horizontal-bars">{rows.map((row, index) => {
    const content = <><span>{row.label}</span><i aria-hidden="true"><b style={{ width: `${(Number(row.value || 0) / max) * 100}%` }} /></i><strong>{money ? peso(row.value) : row.value}</strong><small>{row.detail}</small></>;
    const key = row.key || row.to || `${row.label}-${index}`;
    return row.to ? <Link className="horizontal-bar" to={row.to} key={key}>{content}</Link> : <div className="horizontal-bar" key={key}>{content}</div>;
  })}</div>;
}

function SeatOccupancyCard({ occupancy, tiers }) {
  const sold = Number(occupancy?.sold || 0);
  const held = Number(occupancy?.held || 0);
  const available = Number(occupancy?.available || 0);
  const total = Math.max(Number(occupancy?.total || 0), 1);
  return (
    <div className="occupancy-card">
      <div className="donut" style={{ background: `conic-gradient(#ff3d4f 0 ${(sold / total) * 100}%, #8b5cf6 ${(sold / total) * 100}% ${((sold + held) / total) * 100}%, rgb(255 255 255 / .12) ${((sold + held) / total) * 100}% 100%)` }}><strong>{occupancy?.occupancy || 0}%</strong><span>occupied</span></div>
      <div className="occupancy-lines">
        <div><span>Sold seats</span><strong>{sold}</strong></div>
        <div><span>Temporarily held</span><strong>{held}</strong></div>
        <div><span>Available seats</span><strong>{available}</strong></div>
        <div><span>Total sellable seats</span><strong>{occupancy?.total || 0}</strong></div>
      </div>
      <div className="tier-summary">{tiers.slice(0, 6).map((tier, index) => <span key={`${tier.concert || "concert"}-${tier.tier || "tier"}-${index}`}>{tier.tier}: {tier.tickets_sold} sold</span>)}</div>
    </div>
  );
}

function ConcertPerformanceCard({ concert }) {
  return <div className="performance-card"><SafeImage src={concert.poster_url} alt={`${concert.title} poster`} /><div><StatusBadge status={concert.performance_status || concert.status} /><h4>{concert.title}</h4><p>{concert.artist}</p><div className="info-grid compact"><InfoTile label="Tickets sold" value={concert.sold} /><InfoTile label="Available" value={concert.available_seats} /><InfoTile label="Occupancy" value={`${concert.occupancy}%`} /><InfoTile label="Revenue" value={peso(concert.revenue)} /></div></div></div>;
}

function UpcomingConcertCard({ concert }) {
  return <div className="upcoming-card"><SafeImage src={concert.poster_url} /><div><StatusBadge status={concert.status} /><h4>{concert.title}</h4><p>{concert.artist}</p><span><MapPin size={14} /> {concert.venue}</span><span><Calendar size={14} /> {prettyDate(concert.starts_at)}</span><div className="meta-line"><span>{concert.days_remaining ?? 0} days left</span><span>{concert.sold} sold - {concert.available_seats} left</span></div><Link className="btn-small" to={`/admin/concerts/view/${concert.schedule_id}`}><Eye size={14} /> View Concert</Link></div></div>;
}

function StatusBadge({ status }) {
  return <span className={`status-pill status-${String(status || "").toLowerCase().replaceAll(" ", "-")}`}>{status || "Unknown"}</span>;
}

function AdminConcerts({ auth }) {
  const [concerts, setConcerts] = useState([]);
  const [venues, setVenues] = useState([]);
  const [filters, setFilters] = useState({ q: "", status: "", venue: "", date: "", sort: "starts_at" });
  const [message, setMessage] = useState("");
  const loadConcerts = () => api("/admin/concerts", {}, auth).then(setConcerts);
  useEffect(() => { loadConcerts(); api("/admin/venues", {}, auth).then(setVenues); }, [auth]);
  const filtered = concerts
    .filter((concert) => !filters.q || `${concert.title} ${concert.artist} ${concert.venue}`.toLowerCase().includes(filters.q.toLowerCase()))
    .filter((concert) => !filters.status || concert.status === filters.status)
    .filter((concert) => !filters.venue || String(concert.venue_id) === String(filters.venue))
    .filter((concert) => !filters.date || String(concert.starts_at || "").startsWith(filters.date))
    .sort((a, b) => String(a[filters.sort] ?? "").localeCompare(String(b[filters.sort] ?? "")));
  async function changeStatus(concert, status) {
    if (!(await askConfirm(`Set ${concert.title} to ${status}?`, "Update Concert Status"))) return;
    try {
      await api(`/admin/concerts/${concert.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...concert, status, venue_id: concert.venue_id }),
      }, auth);
      setMessage(`Concert set to ${status}.`);
      loadConcerts();
    } catch (error) {
      setMessage(error.message || "Concert status could not be updated.");
    }
  }
  async function archiveConcert(concert) {
    if (!(await askConfirm(`Archive ${concert.title}? It will move out of the active concerts list.`, "Archive Concert"))) return;
    try {
      await api(`/admin/concerts/${concert.id}/archive`, { method: "PUT" }, auth);
      setMessage("Concert archived.");
      loadConcerts();
    } catch (error) {
      setMessage(error.message || "Concert could not be archived.");
    }
  }
  function clearFilters() {
    setFilters({ q: "", status: "", venue: "", date: "", sort: "starts_at" });
  }
  return (
    <Page title="Concerts" icon={<Ticket />} action={<div className="page-actions"><Link className="btn-small" to="/admin/archive"><Archive size={16} /> Archive</Link><Link className="btn" to="/admin/concerts/new"><Plus size={18} /> Add Concert</Link></div>}>
      <div className="admin-toolbar">
        <SearchField value={filters.q} setValue={(q) => setFilters({ ...filters, q })} />
        <Field as="select" label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option>Draft</option><option>Upcoming</option><option>On Sale</option><option>Sold Out</option><option>Cancelled</option></Field>
        <Field as="select" label="Venue" value={filters.venue} onChange={(e) => setFilters({ ...filters, venue: e.target.value })}><option value="">All venues</option>{venues.map((venue) => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</Field>
        <Field label="Concert date" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        <Field as="select" label="Sort by" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="starts_at">Sort by date</option><option value="title">Sort by title</option><option value="status">Sort by status</option><option value="venue">Sort by venue</option></Field>
        <button className="btn-small" onClick={clearFilters}>Clear Filters</button>
      </div>
      <Feedback message={message} />
      {filtered.length ? (
        <div className="admin-concert-grid">
          {filtered.map((concert) => (
            <AdminConcertCard
              concert={concert}
              key={concert.schedule_id || concert.id}
              onArchive={archiveConcert}
              onStatus={changeStatus}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No concerts found" text="Concerts that match your filters will appear here." />
      )}
    </Page>
  );
}

function AdminConcertCard({ concert, onArchive, onStatus }) {
  const sold = Math.max(0, Number(concert.total_seats || 0) - Number(concert.available_seats || 0));
  const total = Number(concert.total_seats || 0);
  const nextStatus = concert.status === "On Sale" ? "Draft" : "On Sale";
  return (
    <article className="admin-concert-card">
      <Link className="admin-concert-poster" to={`/admin/concerts/view/${concert.schedule_id}`} aria-label={`View ${concert.title}`}>
        <SafeImage src={concert.poster_url} alt={`${concert.title} poster`} />
        <span className={`status-pill status-${String(concert.status || "").toLowerCase().replaceAll(" ", "-")}`}>{concert.status}</span>
      </Link>
      <div className="admin-concert-info">
        <div className="meta-line"><span>{concert.category || "Concert"}</span><span>{concert.available_seats || 0} seats left</span></div>
        <div>
          <h3>{concert.title}</h3>
          <p>{concert.artist}</p>
        </div>
        <div className="admin-concert-meta">
          <span><MapPin size={15} /> {concert.venue || "No venue"}</span>
          <span><Calendar size={15} /> {prettyDate(concert.starts_at)}</span>
        </div>
        <AvailabilityMeter sold={sold} total={total} left={concert.available_seats} />
        <div className="admin-card-actions">
          <Link className="btn-small icon-action" aria-label={`View ${concert.title}`} title="View" to={`/admin/concerts/view/${concert.schedule_id}`}><Eye size={14} /> View</Link>
          <Link className="btn-small icon-action" aria-label={`Edit ${concert.title}`} title="Edit" to={`/admin/concerts/${concert.id}/edit`}><Pencil size={14} /> Edit</Link>
          <button className="btn-small icon-action" title={nextStatus === "On Sale" ? "Publish" : "Unpublish"} onClick={() => onStatus(concert, nextStatus)}><RefreshCcw size={14} /> {nextStatus === "On Sale" ? "Publish" : "Unpublish"}</button>
          <button className="btn-small danger" onClick={() => onStatus(concert, "Cancelled")}>Cancel</button>
          <button className="btn-small" title="Archive" onClick={() => onArchive(concert)}><Archive size={14} /> Archive</button>
        </div>
      </div>
    </article>
  );
}

function AdminConcertForm({ auth, edit = false }) {
  const { concertId } = useParams();
  const navigate = useNavigate();
  const storageKey = edit ? `ticketrush_concert_edit_${concertId}` : "ticketrush_concert_new";
  const [step, setStep] = useState(0);
  const [venues, setVenues] = useState([]);
  const [form, setForm] = useState(emptyConcertForm);
  const [seatMap, setSeatMap] = useState(null);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const selectedVenue = venues.find((venue) => String(venue.id) === String(form.venue_id));
  useEffect(() => {
    api("/admin/venues", {}, auth).then(setVenues);
    const saved = localStorage.getItem(storageKey);
    if (saved) setForm({ ...emptyConcertForm, ...JSON.parse(saved) });
    if (edit) {
      api(`/concerts/${concertId}`).then((concert) => setForm({
        ...emptyConcertForm,
        ...concert,
        rules: concert.rules?.length ? concert.rules : emptyConcertForm.rules,
        venue_id: concert.venue_id || "",
        starts_at: concert.starts_at?.slice(0, 16) || emptyConcertForm.starts_at,
        day_count: 1,
        schedule_days: [concert.starts_at?.slice(0, 16) || emptyConcertForm.starts_at],
        sale_opens_at: concert.sale_opens_at?.slice(0, 16) || emptyConcertForm.sale_opens_at,
        sale_closes_at: concert.sale_closes_at?.slice(0, 16) || emptyConcertForm.sale_closes_at,
      }));
    }
  }, [auth, concertId, edit, storageKey]);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(form)); }, [form, storageKey]);
  useEffect(() => {
    if (!form.venue_id) return;
    api(`/admin/venues/${form.venue_id}/seating`, {}, auth).then((data) => {
      setSeatMap(data);
      setForm((old) => ({
        ...old,
        tier_prices: data.tiers.reduce((prices, tier) => ({ ...prices, [tier.name]: old.tier_prices?.[tier.name] || "" }), old.tier_prices || {}),
      }));
    }).catch(() => setSeatMap(null));
  }, [auth, form.venue_id]);
  async function chooseImage(event, field) {
    const file = event.target.files?.[0];
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    const previous = form[field];
    setForm((old) => ({ ...old, [field]: URL.createObjectURL(file) }));
    setUploading(true);
    setMessage("");
    try {
      const url = await uploadImage(file, auth);
      setForm((old) => ({ ...old, [field]: url }));
      setMessage("Image uploaded.");
    } catch (error) {
      setForm((old) => ({ ...old, [field]: previous }));
      setMessage(error.message || "Image upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }
  function setDayCount(value) {
    const count = Math.max(1, Math.min(14, Number(value) || 1));
    setForm((old) => {
      const days = [...(old.schedule_days || [])];
      while (days.length < count) days.push(dateInputValue(30 + days.length));
      return { ...old, day_count: count, schedule_days: days.slice(0, count), starts_at: days[0] || old.starts_at };
    });
  }
  function setScheduleDay(index, value) {
    setForm((old) => {
      const days = [...(old.schedule_days || [old.starts_at])];
      days[index] = value;
      return { ...old, schedule_days: days, starts_at: index === 0 ? value : old.starts_at };
    });
  }
  function updateRule(index, patch) {
    setForm((old) => ({ ...old, rules: (old.rules || []).map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule) }));
  }
  function addRule() {
    setForm((old) => ({ ...old, rules: [...(old.rules || []), { title: "", text: "" }] }));
  }
  async function removeRule(index) {
    if (!(await askConfirm("Remove this rule?", "Remove Rule"))) return;
    setForm((old) => ({ ...old, rules: (old.rules || []).filter((_, ruleIndex) => ruleIndex !== index) }));
  }
  function validateStep(index) {
    if (index === 0 && (!form.title.trim() || !form.artist.trim())) return "Concert title and artist are required before continuing.";
    if (index === 1 && (!form.venue_id || !(form.schedule_days || []).filter(Boolean).length || !form.sale_opens_at || !form.sale_closes_at)) return "Select a venue, concert day, and ticket selling dates before continuing.";
    if (index === 2 && tierRows.some((tier) => !Number(form.tier_prices?.[tier.name] ?? (tier.name === "VIP" ? form.vip_price : tier.name === "Lower Bowl" ? form.lower_bowl_price : form.general_price)))) return "Add a ticket price for every enabled tier.";
    if (index === 3 && !(form.rules || []).some((rule) => rule.title.trim() && rule.text.trim())) return "Add at least one complete rule before continuing.";
    return "";
  }
  function goNext() {
    const error = validateStep(step);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("");
    setStep((old) => Math.min(old + 1, steps.length - 1));
  }
  function goToStep(index) {
    if (index <= step) {
      setStep(index);
      return;
    }
    for (let current = 0; current < index; current += 1) {
      const error = validateStep(current);
      if (error) {
        setMessage(error);
        setStep(current);
        return;
      }
    }
    setMessage("");
    setStep(index);
  }
  function validatePublish(payload) {
    const rules = (form.rules || []).filter((rule) => rule.title.trim() && rule.text.trim());
    if (!payload.title || !payload.artist || !payload.description || !payload.poster_url) return "Complete the title, artist, description, and poster before publishing.";
    if (!payload.venue_id || !payload.schedule_days.length || !payload.sale_opens_at || !payload.sale_closes_at) return "Complete the venue, concert day, and ticket selling dates before publishing.";
    if (!rules.length) return "Add at least one rule or regulation before publishing.";
    if (tierRows.some((tier) => !Number(payload.tier_prices?.[tier.name] ?? 0) && !["VIP", "Lower Bowl", "General"].includes(tier.name))) return "Set prices for every venue tier before publishing.";
    return "";
  }
  async function saveConcert(event) {
    event.preventDefault();
    setMessage("");
    const requestedStatus = event.nativeEvent.submitter?.dataset.status;
    const payload = {
      ...form,
      status: requestedStatus || form.status,
      poster_url: form.poster_url || `https://picsum.photos/seed/${encodeURIComponent(form.title || "ticketrush")}/900/1200`,
      description: form.description || "A TicketRush concert listing ready for schedule and seat setup.",
      venue_id: form.venue_id ? Number(form.venue_id) : selectedVenue?.id,
      starts_at: (form.schedule_days?.[0] || form.starts_at) ? new Date(form.schedule_days?.[0] || form.starts_at).toISOString() : null,
      schedule_days: (form.schedule_days || [form.starts_at]).filter(Boolean).map((day) => new Date(day).toISOString()),
      sale_opens_at: form.sale_opens_at ? new Date(form.sale_opens_at).toISOString() : null,
      sale_closes_at: form.sale_closes_at ? new Date(form.sale_closes_at).toISOString() : null,
      max_tickets_per_customer: Number(form.max_tickets_per_customer || 4),
      tier_prices: Object.fromEntries(Object.entries(form.tier_prices || {}).filter(([, value]) => value !== "").map(([name, value]) => [name, Number(value)])),
      rules: completeRules,
    };
    if (!payload.title || !payload.artist) {
      setMessage("Concert title and artist are required.");
      return;
    }
    if (requestedStatus === "On Sale") {
      const publishError = validatePublish(payload);
      if (publishError) {
        setMessage(publishError);
        return;
      }
    }
    const actionLabel = edit ? "save changes to this concert" : requestedStatus === "On Sale" ? "publish this concert" : "save this concert as draft";
    if (!(await askConfirm(`Are you sure you want to ${actionLabel}?`, "Save Concert"))) return;
    try {
    if (edit) {
      await api(`/admin/concerts/${concertId}`, { method: "PUT", body: JSON.stringify(payload) }, auth);
      setMessage("Concert updated.");
    } else {
      await api("/admin/concerts", { method: "POST", body: JSON.stringify(payload) }, auth);
      setMessage("Concert created.");
      }
    } catch (error) {
      setMessage(error.message || "Concert could not be saved. Please check the venue, schedule, and prices.");
      return;
    }
    localStorage.removeItem(storageKey);
    navigate("/admin/concerts");
  }
  const steps = ["Basic Information", "Venue and Schedule", "Pricing", "Policies", "Review"];
  const tierRows = seatMap?.tiers?.length ? seatMap.tiers : [
    { name: "VIP", seats: selectedVenue ? Math.ceil(selectedVenue.capacity * .25) : 0 },
    { name: "Lower Bowl", seats: selectedVenue ? Math.ceil(selectedVenue.capacity * .35) : 0 },
    { name: "General", seats: selectedVenue ? Math.floor(selectedVenue.capacity * .4) : 0 },
  ];
  const completeRules = (form.rules || []).filter((rule) => rule.title.trim() && rule.text.trim());
  const publishReady = Boolean(
    form.title.trim() &&
    form.artist.trim() &&
    form.description.trim() &&
    form.poster_url &&
    form.venue_id &&
    (form.schedule_days || []).filter(Boolean).length &&
    form.sale_opens_at &&
    form.sale_closes_at &&
    completeRules.length
  );
  return (
    <Page title={edit ? "Edit Concert" : "Add Concert"} backTo="/admin/concerts">
      <nav className="stepper" aria-label="Concert setup progress">{steps.map((label, index) => <button type="button" aria-current={step === index ? "step" : undefined} className={step === index ? "active" : ""} key={label} onClick={() => goToStep(index)}>{index + 1}. {label}</button>)}</nav>
      <form className="admin-form wizard-form" onSubmit={saveConcert}>
        {step === 0 && <>
          <Field value={form.title} placeholder="Concert title" onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Field value={form.artist} placeholder="Artist or performer" onChange={(e) => setForm({ ...form, artist: e.target.value })} />
          <Field value={form.artist_description} placeholder="Short artist description" onChange={(e) => setForm({ ...form, artist_description: e.target.value })} />
          <Field as="select" label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Pop</option><option>Rock</option><option>Electronic</option><option>Indie</option><option>OPM</option></Field>
          <label className="field-label">Maximum tickets per customer<input className="field" type="number" min="1" max="20" value={form.max_tickets_per_customer || 4} onChange={(e) => setForm({ ...form, max_tickets_per_customer: e.target.value })} /></label>
          <ImageUploadPreview label="poster" src={form.poster_url} uploading={uploading} onChoose={(e) => chooseImage(e, "poster_url")} onRemove={() => setForm({ ...form, poster_url: "" })} />
          <ImageUploadPreview label="banner" src={form.banner_url} uploading={uploading} onChoose={(e) => chooseImage(e, "banner_url")} onRemove={() => setForm({ ...form, banner_url: "" })} shape="banner" />
          <Field as="textarea" value={form.description} placeholder="Complete concert description" onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </>}
        {step === 1 && <>
          <label className="field-label">Venue<select className="field" value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })}><option value="">Select venue</option>{venues.map((venue) => <option value={venue.id} key={venue.id}>{venue.name} - {venue.city} ({venue.capacity} seats)</option>)}</select></label>
          <label className="field-label">Number of concert days<input className="field" type="number" min="1" max="14" value={form.day_count || 1} onChange={(e) => setDayCount(e.target.value)} /></label>
          <div className="concert-days-grid">
            {Array.from({ length: Number(form.day_count || 1) }).map((_, index) => <label className="field-label" key={index}>Day {index + 1} date and start time<input className="field" type="datetime-local" value={(form.schedule_days || [form.starts_at])[index] || ""} onChange={(e) => setScheduleDay(index, e.target.value)} /></label>)}
          </div>
          <label className="field-label">Gate-opening time<input className="field" type="datetime-local" value={form.gate_opens_at} onChange={(e) => setForm({ ...form, gate_opens_at: e.target.value })} /></label>
          <label className="field-label">Estimated ending time<input className="field" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label>
          <label className="field-label">Ticket selling opens<input className="field" type="datetime-local" value={form.sale_opens_at} onChange={(e) => setForm({ ...form, sale_opens_at: e.target.value })} /></label>
          <label className="field-label">Ticket selling closes<input className="field" type="datetime-local" value={form.sale_closes_at} onChange={(e) => setForm({ ...form, sale_closes_at: e.target.value })} /></label>
          <VenuePreview venue={selectedVenue} seatMap={seatMap} />
        </>}
        {step === 2 && <div className="tier-pricing-grid">
          <div className="pricing-table-head"><span>Tier</span><span>Venue Seats</span><span>Concert Price</span><span>Ticket Limit</span><span>Customer Access</span></div>
          {tierRows.map((tier) => {
          const value = form.tier_prices?.[tier.name] ?? (tier.name === "VIP" ? form.vip_price : tier.name === "Lower Bowl" ? form.lower_bowl_price : form.general_price);
          return <div className="tier-price-row" key={tier.name}><strong>{tier.name}</strong><span>{tier.seats} seats</span><label className="field-label compact-label">Concert Price<input className="field" type="number" min="0" step="0.01" value={value} placeholder="PHP 0.00" onChange={(e) => setForm({ ...form, tier_prices: { ...(form.tier_prices || {}), [tier.name]: e.target.value } })} /></label><span>{form.max_tickets_per_customer || 4} tickets per customer</span><span>{tier.name} section access</span></div>;
        })}</div>}
        {step === 3 && <div className="rules-editor">
          <div className="rules-head"><div><h3>Rules and Regulations</h3><p>Set customer-facing entry, safety, refund, and venue policies for this concert.</p></div><button type="button" className="btn-small" onClick={addRule}><Plus size={16} /> Add Rule</button></div>
          {(form.rules || []).map((rule, index) => <div className="rule-card" key={index}>
            <label className="field-label">Rule title<input className="field" value={rule.title} placeholder="Example: Entry Requirement" onChange={(e) => updateRule(index, { title: e.target.value })} /></label>
            <label className="field-label">Details<textarea className="field textarea" value={rule.text} placeholder="Write the full rule customers need to follow." onChange={(e) => updateRule(index, { text: e.target.value })} /></label>
            <button className="btn-small danger" type="button" onClick={() => removeRule(index)} disabled={(form.rules || []).length === 1}>Remove</button>
          </div>)}
        </div>}
        {step === 4 && <div className="admin-preview review-preview"><div className="preview-poster">{form.poster_url ? <SafeImage src={form.poster_url} /> : <span>No poster</span>}</div><div><span className="status-pill">{form.status}</span><h3>{form.title || "Concert title preview"}</h3><p>{form.artist}</p><p>{selectedVenue ? `${selectedVenue.name}, ${selectedVenue.city} - ${selectedVenue.capacity} seats` : "No venue selected"}</p><div className="tier-summary">{(form.schedule_days || [form.starts_at]).filter(Boolean).map((day, index) => <span key={index}>Day {index + 1}: {prettyDate(day)}</span>)}</div><p>{form.description}</p><div className="rules-preview">{completeRules.map((rule, index) => <span key={index}>{rule.title}</span>)}</div>{form.banner_url && <SafeImage className="banner-preview" src={form.banner_url} />}</div></div>}
        <div className="form-actions">
          {step > 0 && <button type="button" className="btn-small" onClick={() => setStep(step - 1)}>Previous</button>}
          {step < steps.length - 1 && <button type="button" className="btn" onClick={goNext}>Next</button>}
          <button type="submit" className="btn-small" data-status={edit ? form.status : "Draft"} disabled={uploading}>{edit ? "Save Changes" : "Save as Draft"}</button>
          <button type="button" className="btn-small" onClick={() => window.open("/concerts", "_blank")}>Preview as Customer</button>
          <button type="submit" className="btn" data-status="On Sale" disabled={uploading || !publishReady} title={publishReady ? "Publish Concert" : "Complete all required concert information first"}>Publish Concert</button>
        </div>
      </form>
      <Feedback message={message} />
    </Page>
  );
}

function AdminVenues({ auth }) {
  const [venues, setVenues] = useState([]);
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [message, setMessage] = useState("");
  const loadVenues = () => api("/admin/venues", {}, auth).then(setVenues);
  useEffect(() => { loadVenues(); }, [auth]);
  async function archiveVenue(venue) {
    if (!(await askConfirm(`Archive ${venue.name}? It will move out of the active venues list.`, "Archive Venue"))) return;
    try {
      await api(`/admin/venues/${venue.id}/archive`, { method: "PUT" }, auth);
      setMessage("Venue archived.");
      loadVenues();
    } catch (error) {
      setMessage(error.message || "Venue could not be archived.");
    }
  }
  function clearFilters() {
    setFilters({ q: "", status: "" });
  }
  const rows = venues
    .filter((venue) => !filters.q || `${venue.name} ${venue.city}`.toLowerCase().includes(filters.q.toLowerCase()))
    .filter((venue) => !filters.status || venue.status === filters.status)
    .map((venue) => ({ ...venue, location: venue.city, tiers: "Configured", status: venue.status || "Active" }));
  return (
    <Page title="Venues" icon={<MapPin />} action={<div className="page-actions"><Link className="btn-small" to="/admin/archive"><Archive size={16} /> Archive</Link><Link className="btn" to="/admin/venues/new"><Plus size={18} /> Add Venue</Link></div>}>
      <div className="admin-toolbar">
        <SearchField value={filters.q} setValue={(q) => setFilters({ ...filters, q })} />
        <Field as="select" label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option>Active</option></Field>
        <button className="btn-small" onClick={clearFilters}>Clear Filters</button>
      </div>
      <Feedback message={message} />
      <Table rows={rows} columns={["name", "location", "capacity", "tiers", "status"]} actions={(venue) => (
        <>
          <Link className="btn-small" title="View" to={`/admin/venues/${venue.id}/seating`}><Eye size={14} /> View</Link>
          <Link className="btn-small" title="Edit" to={`/admin/venues/${venue.id}/edit`}><Pencil size={14} /> Edit</Link>
          <Link className="btn-small" title="Manage seats" to={`/admin/venues/${venue.id}/seating`}><Ticket size={14} /> Seats</Link>
          <button className="btn-small" title="Archive" onClick={() => archiveVenue(venue)}><Archive size={14} /> Archive</button>
        </>
      )} />
    </Page>
  );
}

function AdminArchive({ auth }) {
  const [tab, setTab] = useState("concerts");
  const [concerts, setConcerts] = useState([]);
  const [venues, setVenues] = useState([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const load = () => {
    api("/admin/concerts?archived=true", {}, auth).then(setConcerts);
    api("/admin/venues?archived=true", {}, auth).then(setVenues);
  };
  useEffect(() => { load(); }, [auth]);
  async function restore(type, row) {
    if (!(await askConfirm(`Restore ${row.title || row.name}?`, "Restore Record"))) return;
    await api(`/admin/${type}/${row.id}/restore`, { method: "PUT" }, auth);
    setMessage("Record restored.");
    load();
  }
  async function permanentDelete(type, row) {
    if (!(await askConfirm(`Permanently delete ${row.title || row.name}? This cannot be undone.`, "Permanent Delete"))) return;
    try {
      await api(`/admin/${type}/${row.id}`, { method: "DELETE" }, auth);
      setMessage("Record permanently deleted.");
      load();
    } catch (error) {
      setMessage(error.message || "This record cannot be deleted because it has protected records.");
    }
  }
  const source = tab === "concerts" ? concerts : venues;
  const rows = source
    .filter((row) => !query || `${row.title || row.name} ${row.artist || ""} ${row.venue || row.city || ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => String(b.archived_at || "").localeCompare(String(a.archived_at || "")))
    .map((row) => tab === "concerts"
      ? { ...row, poster: <SafeImage className="table-poster" src={row.poster_url} alt={`${row.title} poster`} />, starts_at: prettyDate(row.starts_at), archived_at: prettyDate(row.archived_at), safe: row.safe_to_delete ? "Yes" : row.delete_block_reason || "Protected" }
      : { ...row, location: row.city, archived_at: prettyDate(row.archived_at), safe: row.safe_to_delete ? "Yes" : "Used by concerts" });
  return (
    <Page title="Archive" icon={<Archive />}>
      <div className="profile-tabs">
        <button className={tab === "concerts" ? "active" : ""} onClick={() => setTab("concerts")}>Archived Concerts</button>
        <button className={tab === "venues" ? "active" : ""} onClick={() => setTab("venues")}>Archived Venues</button>
      </div>
      <div className="admin-toolbar compact-toolbar">
        <SearchField value={query} setValue={setQuery} />
      </div>
      <Feedback message={message} />
      <Table
        rows={rows}
        columns={tab === "concerts" ? ["poster", "title", "artist", "venue", "starts_at", "archived_at", "safe"] : ["name", "location", "capacity", "archived_at", "safe"]}
        actions={(row) => (
          <>
            {tab === "concerts" && <Link className="btn-small" to={`/concerts/schedule/${row.schedule_id}`}><Eye size={14} /> View</Link>}
            {tab === "venues" && <Link className="btn-small" to={`/admin/venues/${row.id}/seating`}><Eye size={14} /> View</Link>}
            <button className="btn-small" onClick={() => restore(tab, row)}><RefreshCcw size={14} /> Restore</button>
            <button className="btn-small danger" disabled={!row.safe_to_delete} title={row.safe_to_delete ? "Permanently delete" : row.safe} onClick={() => permanentDelete(tab, row)}><Trash2 size={14} /> Delete</button>
          </>
        )}
      />
    </Page>
  );
}

function AdminVenueForm({ auth, edit = false }) {
  const { venueId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    city: "Manila",
    description: "",
    status: "Active",
    tiers: [
      { name: "VVIP", seats: "" },
      { name: "VIP", seats: "" },
      { name: "General Admission", seats: "" },
    ],
  });
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!edit) return;
    api(`/admin/venues/${venueId}`, {}, auth).then((venue) => {
      setForm((old) => ({
        ...old,
        name: venue.name,
        city: venue.city,
      }));
    }).catch((error) => setMessage(error.message || "Venue could not be loaded."));
  }, [auth, edit, venueId]);
  const totalSeats = form.tiers.reduce((sum, tier) => sum + Number(tier.seats || 0), 0);
  const layoutSeatsPerRow = Math.min(50, Math.max(1, Math.ceil(totalSeats / 30)));
  const rowsNeeded = Math.max(1, Math.ceil(totalSeats / layoutSeatsPerRow));
  function updateTier(index, patch) {
    setForm((old) => ({ ...old, tiers: old.tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier) }));
  }
  function addTier() {
    setForm((old) => ({ ...old, tiers: [...old.tiers, { name: "", seats: "" }] }));
  }
  async function removeTier(index) {
    if (!(await askConfirm("Remove this tier from the venue setup?", "Remove Tier"))) return;
    setForm((old) => ({ ...old, tiers: old.tiers.filter((_, tierIndex) => tierIndex !== index) }));
  }
  async function saveVenue(event) {
    event.preventDefault();
    setMessage("");
    const tierSeats = form.tiers.map((tier) => ({ name: tier.name.trim(), seats: Number(tier.seats) })).filter((tier) => tier.name && tier.seats > 0);
    if (!form.name || (!edit && (!tierSeats.length || totalSeats < 1))) {
      setMessage(edit ? "Venue name is required." : "Venue name and at least one tier with seats are required.");
      return;
    }
    if (!edit && new Set(tierSeats.map((tier) => tier.name.toLowerCase())).size !== tierSeats.length) {
      setMessage("Tier names must be unique.");
      return;
    }
    if (!edit && totalSeats > 1500) {
      setMessage("Maximum venue capacity is 1,500 seats for this demo database.");
      return;
    }
    if (!(await askConfirm(edit ? "Save changes to this venue?" : "Create this venue and generate seats by tier?", edit ? "Save Venue" : "Create Venue"))) return;
    try {
      const venue = await api(edit ? `/admin/venues/${venueId}` : "/admin/venues", {
        method: edit ? "PUT" : "POST",
        body: JSON.stringify({ name: form.name, city: form.city, image_url: null, rows: rowsNeeded, seats_per_row: layoutSeatsPerRow, tier_seats: tierSeats }),
      }, auth);
      navigate(edit ? "/admin/venues" : `/admin/venues/${venue.id}/seating`);
    } catch (error) {
      setMessage(error.message || "Venue could not be saved. Please check the required fields.");
    }
  }
  return (
    <Page title={edit ? "Edit Venue" : "Add Venue"} backTo="/admin/venues">
      <form className="admin-form venue-create-form" onSubmit={saveVenue}>
        <label className="field-label">Venue name<input className="field" value={form.name} placeholder="SM Seaside Arena" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="field-label">Complete address / city<input className="field" value={form.city} placeholder="Cebu City" onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <Field as="textarea" value={form.description} placeholder="Venue description" onChange={(e) => setForm({ ...form, description: e.target.value })} />
        {!edit && <div className="tier-seat-editor">
          <div className="tier-table-head"><span>Tier</span><span>Seats in this tier</span><span>Action</span></div>
          {form.tiers.map((tier, index) => <div className="tier-seat-row" key={index}>
            <Field label="Tier name" value={tier.name} placeholder="Example: VVIP" onChange={(e) => updateTier(index, { name: e.target.value })} />
            <Field label="Number of seats" type="number" min="1" max="1500" value={tier.seats} placeholder="Example: 100" onChange={(e) => updateTier(index, { seats: e.target.value })} />
            <button className="btn-small danger" type="button" onClick={() => removeTier(index)} disabled={form.tiers.length === 1}>Remove</button>
          </div>)}
          <div className="form-actions"><button className="btn-small" type="button" onClick={addTier}><Plus size={16} /> Add Tier</button></div>
        </div>}
        {!edit && <div className="capacity-hint">Total venue capacity: {totalSeats} seats. Layout rows are generated automatically after saving.</div>}
        <button className="btn">{edit ? "Save Venue" : "Create Venue"}</button>
      </form>
      <Feedback message={message} />
    </Page>
  );
}

function VenuePreview({ venue, seatMap }) {
  if (!venue) return <div className="feature-panel"><MapPin size={28} /><h3>Select a venue</h3><p>The configured sections, tiers, capacity, and layout preview load automatically.</p></div>;
  const seats = seatMap?.seats || [];
  const tiers = seatMap?.tiers || [];
  return (
    <div className="venue-preview">
      <div className="venue-preview-head">
        <div><strong>{venue.name}</strong><span>{venue.city}</span></div>
        <span className="status-pill">{venue.capacity} seats</span>
      </div>
      <div className="mini-stage">Stage</div>
      <div className="mini-seat-map">
        {seats.slice(0, 144).map((seat) => <span className={`mini-seat-dot tier-${seat.tier?.length % 4}`} title={`${seat.label} ${seat.tier}`} key={seat.id} />)}
      </div>
      <div className="tier-summary">{tiers.map((tier) => <span key={tier.name}><i className={`tier-dot tier-${tier.name?.length % 4}`} />{tier.name}: {tier.seats}</span>)}</div>
    </div>
  );
}

function AdminVenueSeating({ auth }) {
  const { venueId } = useParams();
  const [layout, setLayout] = useState(null);
  const [form, setForm] = useState({ seats_per_row: 12, tiers: [{ name: "VIP", seats: 100 }, { name: "General Admission", seats: 300 }] });
  const [message, setMessage] = useState("");
  const load = () => api(`/admin/venues/${venueId}/seating`, {}, auth).then((data) => {
    setLayout(data);
    setForm({
      seats_per_row: data.venue.seats_per_row,
      tiers: data.tiers.length ? data.tiers.map((tier) => ({ name: tier.name, seats: tier.seats })) : [{ name: "VIP", seats: 100 }, { name: "General Admission", seats: 300 }],
    });
  });
  useEffect(() => { load(); }, [venueId, auth]);
  const totalSeats = form.tiers.reduce((sum, tier) => sum + Number(tier.seats || 0), 0);
  const layoutSeatsPerRow = Math.min(50, Math.max(Number(form.seats_per_row || 1), Math.ceil(totalSeats / 30), 1));
  const rowsNeeded = Math.max(1, Math.ceil(totalSeats / layoutSeatsPerRow));
  function updateTier(index, patch) {
    setForm((old) => ({ ...old, tiers: old.tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier) }));
  }
  function addTier() {
    setForm((old) => ({ ...old, tiers: [...old.tiers, { name: "", seats: 50 }] }));
  }
  async function removeTier(index) {
    if (!(await askConfirm("Remove this tier from the seating layout?", "Remove Tier"))) return;
    setForm((old) => ({ ...old, tiers: old.tiers.filter((_, tierIndex) => tierIndex !== index) }));
  }
  async function save(event) {
    event.preventDefault();
    setMessage("");
    if (!(await askConfirm("Save this venue seating layout? Existing seat setup may be regenerated.", "Save Seating Layout"))) return;
    try {
      await api(`/admin/venues/${venueId}/seating`, {
        method: "PUT",
        body: JSON.stringify({
          rows: rowsNeeded,
          seats_per_row: layoutSeatsPerRow,
          tier_seats: form.tiers.map((tier) => ({ name: tier.name.trim(), seats: Number(tier.seats) })).filter((tier) => tier.name && tier.seats > 0),
        }),
      }, auth);
      setMessage("Venue layout saved.");
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }
  if (!layout) return <Loading />;
  return (
    <Page title={`${layout.venue.name} Seating`} backTo="/admin/venues">
      <form className="admin-form seating-form" onSubmit={save}>
        <div className="capacity-hint">Set a tier first, then enter how many seats belong to that tier. Total venue capacity: {totalSeats} seats.</div>
        <div className="tier-seat-editor">
          <div className="tier-table-head"><span>Tier</span><span>Seats in this tier</span><span>Action</span></div>
          {form.tiers.map((tier, index) => <div className="tier-seat-row" key={index}>
            <Field label="Tier name" value={tier.name} placeholder="Example: VIP" onChange={(e) => updateTier(index, { name: e.target.value })} />
            <Field label="Number of seats" type="number" min="1" max="1500" value={tier.seats} placeholder="Example: 100" onChange={(e) => updateTier(index, { seats: e.target.value })} />
            <button className="btn-small danger" type="button" onClick={() => removeTier(index)} disabled={form.tiers.length === 1}>Remove</button>
          </div>)}
        </div>
        <div className="form-actions">
          <button className="btn-small" type="button" onClick={addTier}><Plus size={16} /> Add Tier</button>
          <button className="btn">Save Seats by Tier</button>
        </div>
      </form>
      <Feedback message={message} />
      <div className="tier-list">{layout.tiers.map((tier) => <div className="tier-card" key={tier.name}><h3>{tier.name}</h3><p>{tier.rows} rows</p><strong>{tier.seats} seats</strong><span>{tier.percent}% capacity</span><span className="status-pill">{tier.status}</span></div>)}</div>
      <VenuePreview venue={layout.venue} seatMap={layout} />
    </Page>
  );
}

function AdminSeats() {
  const [tiers, setTiers] = useState([
    { name: "VVIP", benefits: "Closest section, priority entrance, exclusive merchandise, soundcheck access", price: "6500.00", active: true },
    { name: "VIP", benefits: "Lower-front section with premium sight lines", price: "5200.00", active: true },
    { name: "Premium", benefits: "Balanced center views", price: "3800.00", active: true },
    { name: "General Admission", benefits: "Open seating allocation", price: "1800.00", active: true },
  ]);
  const [tierForm, setTierForm] = useState({ name: "", benefits: "", price: "" });
  const [editingTier, setEditingTier] = useState("");
  async function saveTier(event) {
    event.preventDefault();
    if (!tierForm.name || Number(tierForm.price) < 0) return;
    if (!(await askConfirm(editingTier ? "Update this ticket tier?" : "Add this ticket tier?", editingTier ? "Update Tier" : "Add Tier"))) return;
    setTiers((old) => {
      if (editingTier) return old.map((tier) => tier.name === editingTier ? { ...tier, ...tierForm, active: tier.active } : tier);
      return [...old, { ...tierForm, active: true }];
    });
    setTierForm({ name: "", benefits: "", price: "" });
    setEditingTier("");
  }
  function editTier(tier) {
    setEditingTier(tier.name);
    setTierForm({ name: tier.name, benefits: tier.benefits, price: tier.price });
  }
  async function toggleTier(name) {
    if (!(await askConfirm("Change this ticket tier status?", "Update Tier Status"))) return;
    setTiers((old) => old.map((tier) => tier.name === name ? { ...tier, active: !tier.active } : tier));
  }
  async function removeTier(name) {
    if (!(await askConfirm(`Remove ${name}? Purchased seats should not be deleted in production.`, "Remove Tier"))) return;
    setTiers((old) => old.filter((tier) => tier.name !== name));
  }
  return (
    <Page title="Manage Seats and Ticket Tiers" icon={<Ticket />}>
      <AdminLinks />
      <form className="admin-form compact-form" onSubmit={saveTier}>
        <Field value={tierForm.name} placeholder="Tier name" onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} />
        <Field value={tierForm.price} type="number" min="0" step="0.01" placeholder="Ticket price" onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })} />
        <Field value={tierForm.benefits} placeholder="Benefits and inclusions" onChange={(e) => setTierForm({ ...tierForm, benefits: e.target.value })} />
        <button className="btn">{editingTier ? "Update Tier" : "Add Tier"}</button>
      </form>
      <div className="tier-list admin-tier-list">{tiers.map((tier) => <div className={`tier-card ${tier.active ? "" : "inactive"}`} key={tier.name}><h3>{tier.name}</h3><p>{tier.benefits}</p><strong>{peso(tier.price)}</strong><span className="status-pill">{tier.active ? "Active" : "Inactive"}</span><div className="ticket-actions"><button className="btn-small" onClick={() => editTier(tier)}>Edit</button><button className="btn-small" onClick={() => toggleTier(tier.name)}>{tier.active ? "Deactivate" : "Activate"}</button><button className="btn-small danger" onClick={() => removeTier(tier.name)}>Remove</button></div></div>)}</div>
      <div className="seat-editor"><div className="stage">Stage</div>{Array.from({ length: 48 }).map((_, index) => <span className={`editor-seat tier-${index % 4}`} key={index}>{index + 1}</span>)}</div>
    </Page>
  );
}

function AdminReservations({ auth }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/admin/reservations", {}, auth).then(setRows); }, [auth]);
  return <Page title="Reservations"><AdminLinks /><Table rows={rows} columns={["booking_reference", "customer", "concert", "status", "total_amount", "created_at"]} searchable /></Page>;
}

function AdminCustomers({ auth }) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ q: "", status: "", reset: "" });
  const [message, setMessage] = useState("");
  const [tempPassword, setTempPassword] = useState(null);
  const loadRows = () => api("/admin/customers", {}, auth).then(setRows).catch((error) => setMessage(error.message || "Customers could not be loaded."));
  useEffect(() => { loadRows(); }, [auth]);
  const filtered = rows.filter((row) =>
    (!filters.q || `${row.full_name} ${row.email} ${row.contact_number}`.toLowerCase().includes(filters.q.toLowerCase())) &&
    (!filters.status || row.account_status === filters.status) &&
    (!filters.reset || row.reset_request_status === filters.reset)
  );
  async function openCustomer(row) {
    setMessage("");
    try {
      setSelected(await api(`/admin/customers/${row.id}`, {}, auth));
    } catch (error) {
      setMessage(error.message || "Customer details could not be loaded.");
    }
  }
  async function resetPassword(customer = selected) {
    if (!customer) return;
    const ok = await askConfirm(
      `This will create a temporary password for ${customer.full_name}. The customer's current password will no longer work, and the customer must create a new password during the next login.`,
      "Reset customer password?"
    );
    if (!ok) return;
    try {
      const result = await api(`/admin/customers/${customer.id}/reset-password`, { method: "POST" }, auth);
      setTempPassword(result);
      setSelected(null);
      loadRows();
    } catch (error) {
      setMessage(error.message || "Temporary password could not be generated.");
    }
  }
  async function updateRequest(request, status) {
    try {
      await api(`/admin/password-reset-requests/${request.id}`, { method: "PUT", body: JSON.stringify({ status }) }, auth);
      setSelected(await api(`/admin/customers/${selected.id}`, {}, auth));
      loadRows();
    } catch (error) {
      setMessage(error.message || "Request could not be updated.");
    }
  }
  return <Page title="Customers" icon={<Users />}>
    <AdminLinks />
    <Feedback message={message} />
    <div className="admin-toolbar">
      <SearchField value={filters.q} setValue={(q) => setFilters({ ...filters, q })} />
      <Field as="select" label="Account Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option>Active</option><option>Suspended</option></Field>
      <Field as="select" label="Password Reset" value={filters.reset} onChange={(e) => setFilters({ ...filters, reset: e.target.value })}><option value="">All reset requests</option><option>Pending</option><option>Processed</option><option>Cancelled</option><option>None</option></Field>
      <button className="btn-small" onClick={() => setFilters({ q: "", status: "", reset: "" })}>Clear Filters</button>
    </div>
    <Table rows={filtered.map((row) => ({ ...row, created_at: prettyDate(row.created_at), reset_request_status: <StatusBadge status={row.reset_request_status} />, account_status: <StatusBadge status={row.account_status} /> }))} columns={["full_name", "email", "contact_number", "account_status", "reset_request_status", "created_at"]} actions={(row) => <button className="btn-small" onClick={() => openCustomer(row)}><Eye size={14} /> View Customer</button>} />
    {selected && <Dialog label="Customer Details" onClose={() => setSelected(null)}>
      <div className="customer-detail-modal">
        <div className="modal-headline"><div><span className="business-kicker">Customer Account</span><h2>{selected.full_name}</h2><p>{selected.email}</p></div><button className="btn" onClick={() => resetPassword(selected)}><KeyRound size={16} /> Reset Password</button></div>
        <div className="info-grid compact">
          <InfoTile label="Contact" value={selected.contact_number || "Not provided"} />
          <InfoTile label="Account Status" value={selected.account_status} />
          <InfoTile label="Password Change" value={selected.force_password_change ? "Required" : "Not required"} />
          <InfoTile label="Last Login" value={prettyDate(selected.last_login_at) || "No login yet"} />
        </div>
        <SectionPanel title="Password Reset Requests">
          {selected.reset_requests.length ? selected.reset_requests.map((request) => <div className="request-row" key={request.id}><div><strong>{request.status}</strong><span>{prettyDate(request.created_at)}{request.processed_by ? ` by ${request.processed_by}` : ""}</span></div><div className="row-actions">{request.status === "Pending" && <><button className="btn-small" onClick={() => resetPassword(selected)}>Generate</button><button className="btn-small danger" onClick={() => updateRequest(request, "Cancelled")}>Cancel</button></>}<button className="btn-small" disabled={request.status === "Processed"} onClick={() => updateRequest(request, "Processed")}>Processed</button></div></div>) : <EmptyState title="No reset requests" text="Customer forgot-password requests will appear here." />}
        </SectionPanel>
        <SectionPanel title="Account Security History">
          {selected.security_history.length ? selected.security_history.map((event) => <Notice key={event.id} title={event.event_type} text={`${prettyDate(event.created_at)}${event.administrator ? ` - ${event.administrator}` : ""}${event.details ? ` - ${event.details}` : ""}`} />) : <EmptyState title="No security activity" text="Password reset and change events will appear here." />}
        </SectionPanel>
      </div>
    </Dialog>}
    {tempPassword && <Dialog label="Temporary Password Generated" onClose={() => setTempPassword(null)}>
      <div className="temp-password-modal">
        <div className="confirm-icon"><ShieldCheck size={22} /></div>
        <h2>Temporary password generated</h2>
        <p>A one-time temporary password has been created for {tempPassword.customer_name}. Provide it securely to the customer. The customer will be required to create a new password after logging in.</p>
        <div className="info-grid compact"><InfoTile label="Customer name" value={tempPassword.customer_name} /><InfoTile label="Customer email" value={tempPassword.customer_email} /><InfoTile label="Expiration" value={prettyDate(tempPassword.expires_at)} /></div>
        <div className="copy-box"><code>{tempPassword.temporary_password}</code><button className="btn-small" onClick={() => navigator.clipboard?.writeText(tempPassword.temporary_password)}>Copy Password</button></div>
        <div className="confirm-actions single"><button className="btn" onClick={() => setTempPassword(null)}>Done</button></div>
      </div>
    </Dialog>}
  </Page>;
}

function AdminReports({ auth }) {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(defaultBusinessFilters());
  const [tab, setTab] = useState("sales");
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    return api("/admin/reports", {}, auth).then(setData).catch((err) => setError(err.message || "Reports could not be loaded."));
  };
  useEffect(() => { load(); }, [auth]);
  if (error) return <Page title="Reports" icon={<BarChart3 />}><div className="error-banner">Reports could not be loaded. {error}</div><button className="btn-small" onClick={load}>Retry</button></Page>;
  if (!data) return <Loading />;
  const view = filterBusinessData(data, filters);
  const filteredTransactions = view.transactions;
  const transactionRows = filteredTransactions.map(formatTransactionRow);
  const hasExportData = transactionRows.length > 0;
  function exportCsv() {
    if (!hasExportData) return;
    const headers = ["booking_reference", "customer", "concert", "quantity", "tiers", "total_amount", "payment_status", "created_at"];
    const title = [`TicketRush Reports`, `Date range: Last ${filters.range} days`, `Exported: ${new Date().toLocaleString()}`, ""].join("\n");
    const csv = title + [headers.join(","), ...transactionRows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ticketrush-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Page title="Reports" icon={<BarChart3 />}>
      <BusinessHeader
        title="Report center"
        subtitle="Analyze ticket sales, revenue, reservations, and concert performance"
        action={<><button className="btn-small" disabled={!hasExportData} onClick={exportCsv}><FileDown size={14} /> Export CSV</button><button className="btn-small" disabled={!hasExportData} onClick={() => window.print()}><Download size={14} /> Export PDF</button></>}
      />
      <BusinessFilters data={data} filters={filters} setFilters={setFilters} reports />
      {!hasExportData && <div className="muted">No report data is available for export.</div>}
      <div className="report-tabs">
        {[
          ["sales", "Sales Overview"],
          ["concerts", "Concert Performance"],
          ["tiers", "Ticket Tiers"],
          ["reservations", "Reservations"],
          ["customers", "Customers"],
        ].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === "sales" && (
        <>
          <div className="business-metrics primary">
            <MetricCard label="Total Revenue" value={peso(view.summary.completed_revenue)} detail="Completed payments only" icon={CreditCard} />
            <MetricCard label="Tickets Sold" value={view.summary.tickets_sold} detail="Confirmed ticket records" icon={Ticket} />
            <MetricCard label="Completed Transactions" value={view.summary.completed_transactions} detail="Paid or completed payments" icon={ShieldCheck} />
            <MetricCard label="Average Transaction Value" value={peso(view.summary.average_transaction_value)} detail="Revenue divided by completed transactions" icon={Gauge} />
          </div>
          <div className="reports-grid">
            <DataPanel title="Revenue and Ticket Sales Trend">{view.trend.length ? <TrendChart rows={view.trend} /> : <EmptyState title="No sales data is available for this period." text="Completed transactions will appear here." />}</DataPanel>
            <DataPanel title="Revenue by Concert"><HorizontalBars rows={view.concerts.map((row) => ({ label: row.title, value: row.revenue, detail: `${row.sold} sold`, to: `/admin/concerts/view/${row.schedule_id}` }))} money empty="No completed transactions are available." /></DataPanel>
          </div>
          <Table rows={transactionRows} columns={["booking_reference", "customer", "concert", "tiers", "quantity", "total_amount", "payment_status", "created_at"]} actions={(row) => <Link className="btn-small" to={`/admin/transactions/${row.id}`}><Eye size={14} /> View</Link>} />
        </>
      )}
      {tab === "concerts" && <Table rows={view.concerts.map((row) => ({ ...row, poster: <SafeImage className="table-poster" src={row.poster_url} />, revenue: peso(row.revenue), occupancy: `${row.occupancy}%`, performance_status: <StatusBadge status={row.performance_status} /> }))} columns={["poster", "title", "artist", "venue", "starts_at", "total_seats", "sold", "available_seats", "occupancy", "revenue", "performance_status"]} actions={(row) => <Link className="btn-small" to={`/admin/concerts/view/${row.schedule_id}`}><Eye size={14} /> View</Link>} />}
      {tab === "tiers" && <><DataPanel title="Ticket Sales by Tier"><HorizontalBars rows={view.tiers.map((row) => ({ label: `${row.tier} - ${row.concert}`, value: row.tickets_sold, detail: peso(row.revenue) }))} empty="No tier sales match the selected filters." /></DataPanel><Table rows={view.tiers.map((row) => ({ ...row, price: peso(row.price), revenue: peso(row.revenue), occupancy: `${row.occupancy}%` }))} columns={["tier", "concert", "venue_section", "price", "allocated_seats", "tickets_sold", "available_seats", "occupancy", "revenue"]} /></>}
      {tab === "reservations" && <><div className="business-metrics secondary"><Stat label="Active Reservations" value={view.reservations.filter((row) => row.status === "active" || row.status === "held").length} /><Stat label="Confirmed Reservations" value={view.reservations.filter((row) => row.status === "confirmed").length} /><Stat label="Expired Holds" value={view.reservations.filter((row) => row.status === "expired").length} /><Stat label="Cancelled Reservations" value={view.reservations.filter((row) => row.status === "cancelled").length} /></div><Table rows={view.reservations.map((row) => ({ ...row, total_amount: peso(row.total_amount), hold_expiration: prettyDate(row.hold_expiration), created_at: prettyDate(row.created_at) }))} columns={["booking_reference", "customer", "concert", "reserved_seats", "quantity", "total_amount", "status", "hold_expiration", "created_at"]} /></>}
      {tab === "customers" && <><div className="business-metrics secondary"><Stat label="Total Customers" value={view.customers.length} /><Stat label="New Customers" value={view.customers.filter((row) => row.total_bookings <= 1).length} /><Stat label="Returning Customers" value={view.customers.filter((row) => row.total_bookings > 1).length} /><Stat label="Completed Purchasers" value={view.customers.filter((row) => row.tickets_purchased > 0).length} /></div><Table rows={view.customers.map((row) => ({ ...row, total_spent: peso(row.total_spent), last_purchase: prettyDate(row.last_purchase) }))} columns={["customer", "email", "total_bookings", "tickets_purchased", "total_spent", "last_purchase", "account_status"]} /></>}
    </Page>
  );
}

function AdminTransactions({ auth }) {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ q: "", concert: "", status: "", date: "" });
  useEffect(() => { api("/admin/transactions", {}, auth).then(setRows); }, [auth]);
  const concerts = [...new Set(rows.map((row) => row.concert))];
  const filtered = rows.filter((row) =>
    (!filters.q || `${row.booking_reference} ${row.customer} ${row.customer_name}`.toLowerCase().includes(filters.q.toLowerCase())) &&
    (!filters.concert || row.concert === filters.concert) &&
    (!filters.status || row.payment_status === filters.status) &&
    (!filters.date || String(row.created_at || "").startsWith(filters.date))
  );
  return (
    <Page title="Transactions" icon={<CreditCard />}>
      <div className="admin-toolbar">
        <SearchField value={filters.q} setValue={(q) => setFilters({ ...filters, q })} />
        <Field as="select" label="Concert" value={filters.concert} onChange={(e) => setFilters({ ...filters, concert: e.target.value })}><option value="">All concerts</option>{concerts.map((concert) => <option key={concert}>{concert}</option>)}</Field>
        <Field as="select" label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option value="paid">Paid</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></Field>
        <Field label="Concert date" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        <button className="btn-small" onClick={() => setFilters({ q: "", concert: "", status: "", date: "" })}>Clear Filters</button>
      </div>
      <Table rows={filtered.map((row) => ({ ...row, total_amount: peso(row.total_amount), created_at: prettyDate(row.created_at) }))} columns={["booking_reference", "customer", "concert", "quantity", "tiers", "total_amount", "payment_method", "payment_status", "created_at"]} actions={(row) => <Link className="btn-small" to={`/admin/transactions/${row.id}`}><Eye size={14} /> View</Link>} />
    </Page>
  );
}

function AdminTransactionDetails({ auth }) {
  const { reservationId } = useParams();
  const [item, setItem] = useState(null);
  useEffect(() => { api(`/admin/transactions/${reservationId}`, {}, auth).then(setItem); }, [auth, reservationId]);
  if (!item) return <Loading />;
  return (
    <Page title="Transaction Details" icon={<CreditCard />} backTo="/admin/transactions">
      <div className="details-layout">
        <SectionPanel title="Booking">
          <InfoTile label="Reference" value={item.booking_reference} />
          <InfoTile label="Status" value={item.status} />
          <InfoTile label="Purchased" value={prettyDate(item.created_at)} />
          <InfoTile label="Total" value={peso(item.payment.amount)} />
        </SectionPanel>
        <SectionPanel title="Customer and Concert">
          <InfoTile label="Customer" value={`${item.customer.name} (${item.customer.email})`} />
          <InfoTile label="Concert" value={`${item.concert.title} by ${item.concert.artist}`} />
          <InfoTile label="Venue" value={item.concert.venue} />
          <InfoTile label="Date" value={prettyDate(item.concert.date)} />
        </SectionPanel>
      </div>
      <Table rows={item.seats.map((seat) => ({ ...seat, price: peso(seat.price) }))} columns={["label", "tier", "price"]} />
      <Table rows={item.tickets.map((ticket) => ({ ...ticket, issued_at: prettyDate(ticket.issued_at) }))} columns={["ticket_number", "seat_id", "issued_at"]} />
    </Page>
  );
}

function AdminProfile({ auth }) {
  const [tab, setTab] = useState("personal");
  const [profile, setProfile] = useState({
    profile_photo_url: "",
    photo: "",
    first_name: auth?.user?.full_name?.split(" ")[0] || "",
    last_name: auth?.user?.full_name?.split(" ").slice(1).join(" ") || "",
    email: auth?.user?.email || "",
    contact_number: "",
    role: "admin",
    account_status: "Active",
    created_at: "",
    last_login_at: "",
  });
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" });
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    api("/me", {}, auth).then((me) => {
      const names = me.full_name.split(" ");
      setProfile({
        profile_photo_url: me.profile_photo_url || "",
        photo: me.profile_photo_url || "",
        first_name: names[0] || "",
        last_name: names.slice(1).join(" "),
        email: me.email,
        contact_number: me.contact_number || "",
        role: me.role,
        account_status: me.account_status,
        created_at: me.created_at,
        last_login_at: me.last_login_at,
      });
    });
  }, [auth]);
  async function chooseProfilePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setUploading(true);
    setProfile((old) => ({ ...old, photo: URL.createObjectURL(file) }));
    if (!(await askConfirm("Save these profile changes?", "Save Profile"))) return;
    try {
      const url = await uploadImage(file, auth);
      setProfile((old) => ({ ...old, profile_photo_url: url, photo: url }));
      setMessage("Profile photo uploaded.");
    } catch (error) {
      setMessage(error.message || "Profile photo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }
  async function saveProfile(event) {
    event.preventDefault();
    if (!profile.email.includes("@")) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (profile.contact_number && !/^[0-9+() -]{7,20}$/.test(profile.contact_number)) {
      setMessage("Enter a valid contact number.");
      return;
    }
    if (!(await askConfirm("Change your password now?", "Change Password"))) return;
    try {
      const updated = await api("/me", {
        method: "PUT",
        body: JSON.stringify({
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          contact_number: profile.contact_number,
          profile_photo_url: profile.profile_photo_url,
        }),
      }, auth);
      window.saveAuthBridge({ ...auth, user: { ...auth.user, email: updated.email, full_name: updated.full_name, profile_photo_url: updated.profile_photo_url } });
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error.message || "Profile could not be updated.");
    }
  }
  async function changePassword(event) {
    event.preventDefault();
    if (!password.current || password.next.length < 8 || password.next !== password.confirm) {
      setMessage("Password must match and be at least 8 characters.");
      return;
    }
    try {
      await api("/me/password", { method: "PUT", body: JSON.stringify({ current_password: password.current, new_password: password.next }) }, auth);
      setPassword({ current: "", next: "", confirm: "" });
      setMessage("Password changed.");
    } catch (error) {
      setMessage(error.message || "Password could not be changed.");
    }
  }
  return (
    <Page title="Admin Profile" icon={<User />}>
      <div className="profile-panel">
        <div className="avatar">{profile.photo ? <SafeImage src={profile.photo} alt="Admin profile" /> : (profile.first_name[0] || "A")}</div>
        <div><h2>{`${profile.first_name} ${profile.last_name}`.trim() || "Administrator"}</h2><p>{profile.email}</p><span className="status-pill">{profile.role}</span><span className="status-pill">{profile.account_status}</span></div>
      </div>
      <div className="profile-tabs"><button className={tab === "personal" ? "active" : ""} onClick={() => setTab("personal")}>Personal Information</button><button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}>Security</button><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Account Activity</button></div>
      {tab === "personal" && <form className="admin-form" onSubmit={saveProfile}><ImageUploadPreview label="profile photo" src={profile.photo} uploading={uploading} onChoose={chooseProfilePhoto} onRemove={() => setProfile({ ...profile, profile_photo_url: "", photo: "" })} /><label className="field-label">First name<input className="field" value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} /></label><label className="field-label">Last name<input className="field" value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} /></label><label className="field-label">Email address<input className="field" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></label><label className="field-label">Contact number<input className="field" value={profile.contact_number} onChange={(e) => setProfile({ ...profile, contact_number: e.target.value })} /></label><button className="btn" disabled={uploading}>Save Profile</button></form>}
      {tab === "security" && <form className="admin-form" onSubmit={changePassword}><label className="field-label">Current password<input className="field" type="password" value={password.current} onChange={(e) => setPassword({ ...password, current: e.target.value })} /></label><label className="field-label">New password<input className="field" type="password" value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} /></label><label className="field-label">Confirm new password<input className="field" type="password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} /></label><button className="btn">Change Password</button></form>}
      {tab === "activity" && <div className="notice-list"><Notice title="Account created" text={prettyDate(profile.created_at)} /><Notice title="Last login" text={prettyDate(profile.last_login_at) || "Current session"} /></div>}
      <Feedback message={message} />
    </Page>
  );
}

function Simulation({ auth }) {
  const [concerts, setConcerts] = useState([]);
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ mode: "safe", attempts: 10, schedule_id: "", seat_id: "" });
  useEffect(() => { api("/concerts").then(setConcerts); }, []);
  async function run() {
    const seats = await api(`/schedules/${form.schedule_id}/seats`);
    const seat_id = form.seat_id || seats.seats[0].id;
    setResult(await api("/admin/simulations", { method: "POST", body: JSON.stringify({ ...form, schedule_id: Number(form.schedule_id), seat_id: Number(seat_id), attempts: Number(form.attempts) }) }, auth));
  }
  return (
    <Page title="Multithreading Simulation" icon={<Gauge />}>
      <div className="control-panel">
        <Field as="select" label="Mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}><option value="safe">Safe mode</option><option value="unsafe">Unsafe demo</option></Field>
        <Field as="select" label="Attempts" value={form.attempts} onChange={(e) => setForm({ ...form, attempts: e.target.value })}>{[5, 10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}</Field>
        <Field as="select" label="Schedule" value={form.schedule_id} onChange={(e) => setForm({ ...form, schedule_id: e.target.value })}><option value="">Schedule</option>{concerts.map((c) => <option key={c.schedule_id} value={c.schedule_id}>{c.title}</option>)}</Field>
        <button className="btn" onClick={run} disabled={!form.schedule_id}>Run</button>
      </div>
      {result && <div className="results-block"><div className="stat-grid"><Stat label="Successful attempts" value={result.success_count} /><Stat label="Failed attempts" value={result.failure_count} /><Stat label="Mode" value={result.mode} /><Stat label="Workers" value={result.attempts} /></div><Table rows={result.results} columns={["attempt", "thread_name", "thread_id", "waiting_ms", "duration_ms", "result", "details"]} /></div>}
    </Page>
  );
}

function Logs({ auth, title = "Concurrency Logs" }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/admin/logs", {}, auth).then(setRows); }, []);
  return <Page title={title}><AdminLinks /><Table rows={rows} columns={["created_at", "thread_id", "operation", "result", "seat", "waiting_ms", "duration_ms", "details"]} searchable /></Page>;
}

function Info({ title }) {
  if (title.includes("Help")) return <HelpPage />;
  return <AboutPage />;
}

function AboutPage() {
  return (
    <main className="page info-page">
      <section className="info-hero">
        <div>
          <span className="eyebrow"><Ticket size={16} /> About TicketRush</span>
          <h1>Concert tickets made clear, quick, and convenient.</h1>
          <p>TicketRush is an online concert ticketing platform designed to make discovering events and securing seats simple and convenient.</p>
        </div>
        <SafeImage src="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1100&q=80" alt="Concert audience" />
      </section>
      <section className="info-flow">
        <InfoTile label="What TicketRush is" value="A concert-ticketing platform where customers can browse upcoming shows, compare ticket tiers, choose available seats, and manage bookings." />
        <InfoTile label="Reservations" value="Selected seats are held temporarily during checkout so customers have time to complete their purchase." />
        <InfoTile label="Digital tickets" value="Confirmed purchases create digital tickets with unique QR codes that customers can view, download, or print." />
        <InfoTile label="Our commitment" value="TicketRush keeps event details, seat availability, and booking updates organized so concertgoers can prepare with confidence." />
      </section>
    </main>
  );
}

function HelpPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState("");
  const groups = [
    ["Account", [["How do I create an account?", "Open Create Account, enter your name, email, and password, then log in to start booking."], ["What should I do if I forget my password?", "Contact TicketRush support so your account can be reviewed and updated."], ["How can I update my profile?", "Log in, open Profile, then update your personal information or password."]]],
    ["Booking and Seats", [["How do I select a ticket tier?", "Open a concert, choose Buy Tickets, then select from the available tier options on the seat map."], ["How long will my selected seats be held?", "Selected seats are held for five minutes while you complete checkout."], ["Why did my selected seat become unavailable?", "A seat can become unavailable when another completed reservation secures it first or your hold expires."], ["How many tickets can I purchase?", "Each concert shows its purchase limit before seat selection. The system enforces that limit during booking."]]],
    ["Payment and Tickets", [["Where can I find my purchased tickets?", "Open My Tickets after a confirmed purchase."], ["How can I print or download my ticket?", "Open a ticket and use Print Ticket or Download PDF."], ["What should I do if a payment does not continue?", "Return to your cart or seat map and refresh availability before trying again."], ["Can I cancel or request a refund?", "Refund availability follows the event rules shown on the concert details page."]]],
  ];
  const visible = groups.map(([group, items]) => [group, items.filter(([question]) => question.toLowerCase().includes(query.toLowerCase()))]).filter(([, items]) => items.length);
  return (
    <Page title="Help and FAQs" icon={<ShieldCheck />}>
      <div className="help-search"><h2>How can we help you?</h2><SearchField value={query} setValue={setQuery} /></div>
      <div className="faq-list">{visible.map(([group, items]) => <section key={group}><h3>{group}</h3>{items.map(([question, answer]) => <button className="faq-item" key={question} onClick={() => setOpen(open === question ? "" : question)}><strong>{question}</strong>{open === question && <p>{answer}</p>}</button>)}</section>)}</div>
      <div className="support-panel"><h3>Contact Support</h3><p>Need help with a booking or ticket? Email support@ticketrush.example.com with your booking reference.</p></div>
    </Page>
  );
}

function NotFound() {
  return <Page title="404"><div className="feature-panel"><Ticket size={30} /><h3>Page not found</h3><p>That route is not on the setlist.</p></div></Page>;
}

function Page({ title, icon, action, backTo, children }) {
  return (
    <main className="page">
      <div className="page-head">
        <div className="title-row">
          {backTo && <Link className="back-arrow" to={backTo} aria-label="Go back"><ArrowLeft size={22} /></Link>}
          <h1>{icon}{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}

function SectionTitle({ kicker, title }) {
  return <div className="section-title"><span>{kicker}</span><h2>{title}</h2></div>;
}

function SectionPanel({ title, children }) {
  return <section className="section-panel"><h2>{title}</h2>{children}</section>;
}

function SearchField({ value, setValue }) {
  return <label className="field-label">Search<div className="search-field"><Search size={18} /><input type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Search and filter" /></div></label>;
}

function Field({ label, as: Control = "input", error, className = "field", ...props }) {
  const id = useId();
  return <div className={`field-label ${Control === "textarea" ? "field-wide" : ""}`}>
    <label htmlFor={id}>{label || props.placeholder}</label>
    <Control {...props} className={className} id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <span id={`${id}-error`} role="alert">{error}</span>}
  </div>;
}

function MiniMetric({ label, value }) {
  return <div className="mini-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function Stat({ label, value }) {
  return <div className="stat-card"><p>{label}</p><strong>{value}</strong></div>;
}

function AvailabilityMeter({ sold, total, left }) {
  const percent = total ? Math.min(100, Math.round((sold / total) * 100)) : 0;
  return (
    <div className="availability-meter">
      <div><strong>{sold} sold</strong><span>{left} left</span></div>
      <i><b style={{ width: `${percent}%` }} /></i>
    </div>
  );
}

function Table({ rows, columns, searchable = false, actions }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(columns[0]);
  const [page, setPage] = useState(1);
  const filtered = rows.filter((row) => !query || columns.some((column) => String(row[column] ?? "").toLowerCase().includes(query.toLowerCase())));
  const sorted = [...filtered].sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")));
  const pageSize = 8;
  const pages = Math.max(Math.ceil(sorted.length / pageSize), 1);
  const currentPage = Math.min(page, pages);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const tableClass = columns.includes("poster") || columns.includes("image") ? "table-wrap media-table" : "table-wrap";
  return (
    <>
      {searchable && <div className="table-tools"><SearchField value={query} setValue={(value) => { setQuery(value); setPage(1); }} /><span>{filtered.length} results</span></div>}
      <div className={tableClass} tabIndex={0} role="region" aria-label="Records">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}><button onClick={() => setSortKey(column)}>{column.replaceAll("_", " ")}</button></th>)}{actions && <th>Actions</th>}</tr></thead>
          <tbody>{pageRows.map((row, index) => <tr key={row.id || index}>{columns.map((column) => {
            const value = row[column];
            return <td data-label={column.replaceAll("_", " ")} key={column}>{React.isValidElement(value) ? value : String(value ?? "")}</td>;
          })}{actions && <td data-label="Actions"><div className="row-actions">{actions(row)}</div></td>}</tr>)}</tbody>
        </table>
        {!pageRows.length && <EmptyState title="No records found" text="Try another search or filter." />}
      </div>
      {(searchable || pages > 1) && <div className="pagination"><button className="btn-small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages}</span><button className="btn-small" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    </>
  );
}

function InfoTile({ label, value }) {
  return <div className="info-tile"><span>{label}</span><p>{value}</p></div>;
}

function TierCard({ tier, onSelect }) {
  const sold = tier.sold || 0;
  const available = Math.max(tier.total - sold - (tier.held || 0), 0);
  return (
    <div className={`tier-card ${available <= 0 ? "inactive" : ""}`}>
      <div className="meta-line"><h3>{tier.name}</h3><StatusBadge status={available > 0 ? "Available" : "Sold Out"} /></div>
      <p>{tier.name === "VIP" ? "Priority entrance and premium section access." : tier.name === "VVIP" ? "Closest section, exclusive merchandise, soundcheck access, and commemorative pass." : "Assigned section seating with standard venue benefits."}</p>
      <div className="tier-price"><span>Price per ticket</span><strong>{peso(tier.price)}</strong></div>
      <div className="seat-line"><span>Seats</span><strong>{available} / {tier.total} available</strong></div>
      {onSelect && <button className="btn-small" disabled={available <= 0} onClick={onSelect}>Select Tier</button>}
    </div>
  );
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><Sparkles size={26} /><h3>{title}</h3><p>{text}</p></div>;
}

function Notice({ title, text }) {
  return <div className="notice"><Bell size={18} /><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function Chart({ title, rows }) {
  const max = Math.max(...rows.map((row) => Number(row[1] || 0)), 1);
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      {rows.map(([label, value]) => <div className="bar-row" key={label}><span>{label}</span><i style={{ width: `${Math.max((Number(value || 0) / max) * 100, 4)}%` }} /><strong>{value}</strong></div>)}
    </div>
  );
}

function AccessDenied() {
  return (
    <Page title="Access Denied" icon={<ShieldCheck />}>
      <div className="feature-panel">
        <h3>This page is protected</h3>
        <p>Your current role does not have permission to access this area. TicketRush uses route guards in the frontend and role authorization in the FastAPI backend.</p>
        <Link className="btn" to="/">Return Home</Link>
      </div>
    </Page>
  );
}

function Loading() {
  return <Page title="Loading"><div className="panel">Loading...</div></Page>;
}

function Root() {
  const authTools = useAuth();
  window.saveAuthBridge = authTools.save;
  return <ConfirmProvider><BrowserRouter><Shell auth={authTools.auth} logout={authTools.logout} /></BrowserRouter></ConfirmProvider>;
}

createRoot(document.getElementById("root")).render(<Root />);

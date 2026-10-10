import { useState } from "react";

const transactions = [
  { type: "in", title: "Simpanan wajib", date: "10 Okt 2026", amount: 100000, status: "Berhasil" },
  { type: "in", title: "Simpanan sukarela", date: "5 Okt 2026", amount: 250000, status: "Berhasil" },
  { type: "out", title: "Angsuran pinjaman", date: "2 Okt 2026", amount: 300000, status: "Berhasil" },
  { type: "in", title: "Simpanan wajib", date: "10 Sep 2026", amount: 100000, status: "Berhasil" },
];

const rupiah = (number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(number);

const css = `
  * { box-sizing: border-box; }
  :root { color-scheme: light; }
  html { min-width: 320px; }
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f4f7f5; color: #172b3a; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible { outline: 3px solid #8ad0b5; outline-offset: 3px; }

  /* Halaman login sementara */
  .login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top right, #e2f1e8 0, transparent 36%), #f4f7f5; }
  .login-card { width: min(100%, 410px); padding: 34px; background: white; border: 1px solid #e0e9e3; border-radius: 22px; box-shadow: 0 18px 55px #194b3510; text-align: center; }
  .login-logo { width: 62px; height: 62px; margin: 0 auto 17px; display: grid; place-items: center; border-radius: 18px; color: white; background: #145648; font-size: 30px; box-shadow: 0 8px 20px #14564824; }
  .login-card .brand-name { color: #173e32; font-size: 19px; font-weight: 800; }
  .login-label { margin-top: 5px; color: #7a8b82; font-size: 12px; }
  .login-card h1 { margin: 28px 0 10px; color: #173e32; font-size: 27px; letter-spacing: -.7px; }
  .login-card p { margin: 0; color: #728179; font-size: 14px; line-height: 1.75; }
  .login-button { width: 100%; min-height: 50px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; margin-top: 25px; padding: 0 18px; border: 0; border-radius: 11px; background: #145648; color: white; font-size: 14px; font-weight: 750; box-shadow: 0 8px 18px #14564820; transition: background .15s ease, transform .15s ease; }
  .login-button:hover { background: #0f473a; transform: translateY(-1px); }
  .login-note { margin-top: 15px; color: #89978f; font-size: 11px; line-height: 1.6; }
  .login-footer { margin-top: 25px; color: #94a099; font-size: 11px; }

  /* Dashboard anggota */
  .app { min-height: 100vh; }
  .sidebar { position: fixed; inset: 0 auto 0 0; width: 245px; padding: 26px 18px; background: #103f38; color: white; display: flex; flex-direction: column; z-index: 1001; overflow-y: auto; }
  .brand { display: flex; align-items: center; gap: 12px; padding: 0 8px 32px; min-width: 0; }
  .brand-icon { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 13px; background: #d9f3e8; color: #145b49; display: grid; place-items: center; font-size: 23px; }
  .brand strong { display: block; font-size: 16px; white-space: nowrap; }
  .brand small { display: block; color: #b7d4cb; margin-top: 5px; font-size: 12px; white-space: nowrap; }
  .drawer-close { display: none; }
  .menu-label { color: #a4c7bc; font-size: 11px; font-weight: 700; letter-spacing: 1.4px; padding: 12px; }
  .nav { display: flex; flex-direction: column; gap: 7px; }
  .nav button { border: 0; text-align: left; color: #d1e3dc; background: transparent; border-radius: 10px; padding: 13px 12px; display: flex; gap: 12px; align-items: center; width: 100%; }
  .nav button.active { background: #246657; color: white; font-weight: 700; }
  .nav button:hover { background: #1b594b; }
  .nav-icon { width: 20px; flex: 0 0 20px; text-align: center; }
  .side-note { margin-top: auto; padding: 15px; border: 1px solid #397467; border-radius: 12px; font-size: 12px; color: #d5e8e1; line-height: 1.6; }
  .main { margin-left: 245px; padding: 30px 34px; max-width: 1600px; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-bottom: 30px; }
  .topbar-menu-toggle { display: none; }
  .eyebrow { color: #6c7d89; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; }
  .page-title { font-size: 27px; margin: 7px 0; letter-spacing: -.7px; color: #172b3a; }
  .subtitle { color: #778693; font-size: 14px; }
  .topbar-actions { display: flex; align-items: center; gap: 10px; }
  .profile { display: flex; align-items: center; gap: 10px; background: white; padding: 8px 13px; border: 1px solid #e6ebef; border-radius: 12px; }
  .avatar { height: 38px; width: 38px; display: grid; place-items: center; flex: 0 0 38px; border-radius: 50%; background: #d9eee6; color: #185a48; font-weight: 800; }
  .profile strong { display: block; font-size: 13px; }
  .profile small { color: #7a8994; font-size: 11px; }
  .logout-btn { border: 1px solid #dce7e1; border-radius: 10px; background: white; color: #2a6752; padding: 10px 12px; font-size: 12px; font-weight: 700; }
  .logout-btn:hover { background: #edf6f0; }
  .demo { background: #fff7df; color: #815c13; border: 1px solid #f0dfa6; border-radius: 9px; padding: 10px 13px; font-size: 12px; margin-bottom: 22px; line-height: 1.6; }
  .balance { background: linear-gradient(120deg, #145648, #20745d); color: white; padding: 27px; border-radius: 19px; position: relative; overflow: hidden; }
  .balance:after { content: ""; position: absolute; right: -45px; top: -95px; width: 240px; height: 240px; border: 1px solid #ffffff25; border-radius: 50%; box-shadow: 0 0 0 28px #ffffff08, 0 0 0 58px #ffffff08; pointer-events: none; }
  .balance-label { color: #d0e6dc; font-size: 13px; }
  .balance-number { font-size: clamp(26px, 3vw, 36px); font-weight: 750; margin: 12px 0 22px; letter-spacing: -.6px; }
  .balance-bottom { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: end; }
  .member-id { color: #d0e6dc; font-size: 12px; line-height: 1.8; }
  .member-id strong { color: white; font-size: 14px; }
  .balance-btn { border: 1px solid #ffffff70; border-radius: 9px; background: #ffffff12; color: white; padding: 11px 15px; position: relative; z-index: 1; }
  .section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 28px 0 15px; }
  h2 { margin: 0; font-size: 17px; }
  .muted { color: #84919c; font-size: 12px; }
  .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .card { background: white; border: 1px solid #e8edf1; border-radius: 14px; padding: 20px; min-width: 0; }
  .card-top { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
  .card-icon { background: #e7f5ef; color: #24745a; height: 39px; width: 39px; flex: 0 0 39px; border-radius: 11px; display: grid; place-items: center; font-size: 20px; }
  .card:nth-child(2) .card-icon { background: #eaf0ff; color: #4467b0; }
  .card:nth-child(3) .card-icon { background: #fff1df; color: #b47924; }
  .card-value { font-size: clamp(17px, 2vw, 23px); font-weight: 750; margin: 10px 0 8px; overflow-wrap: anywhere; }
  .card-foot { font-size: 11px; color: #7e8b96; line-height: 1.5; }
  .lower { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(230px, 1fr); gap: 18px; margin-top: 25px; align-items: start; }
  .panel { background: white; border: 1px solid #e8edf1; border-radius: 14px; padding: 22px; min-width: 0; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 15px; text-align: left; }
  th { color: #84919c; font-size: 11px; font-weight: 600; padding: 12px 8px; border-bottom: 1px solid #edf0f3; }
  td { font-size: 12px; padding: 15px 8px; border-bottom: 1px solid #f0f2f5; white-space: nowrap; }
  tr:last-child td { border-bottom: 0; }
  .tx-title { font-weight: 700; color: #314550; }
  .money-in { color: #218260; font-weight: 700; }
  .money-out { color: #bd654d; font-weight: 700; }
  .pill { display: inline-block; color: #218260; background: #e7f6ef; border-radius: 20px; padding: 5px 8px; font-size: 10px; }
  .detail-link { color: #21745d; border: 0; background: transparent; font-size: 12px; font-weight: 700; }
  .loan-box { background: #f5f8fb; border-radius: 12px; padding: 16px; margin-top: 17px; }
  .loan-label { color: #71818d; font-size: 12px; }
  .loan-amount { font-size: 23px; font-weight: 750; margin: 9px 0 14px; }
  .progress { background: #e0e7e9; height: 7px; border-radius: 9px; overflow: hidden; }
  .progress > div { height: 100%; width: 65%; background: #258267; border-radius: 9px; }
  .progress-text { display: flex; justify-content: space-between; gap: 8px; margin-top: 9px; font-size: 11px; color: #71818d; }
  .action { display: block; width: 100%; padding: 12px; background: white; border: 1px solid #dce6e2; border-radius: 9px; color: #23654f; margin-top: 14px; font-weight: 700; }
  .action:hover { background: #eef7f2; }
  .footer { text-align: center; color: #9aa5ad; font-size: 11px; margin: 30px 0 5px; }
  .mobile-menu-backdrop { display: none; }

  @media (max-width: 1050px) {
    .sidebar { width: 205px; padding: 24px 14px; }
    .main { margin-left: 205px; padding: 24px 20px; }
    .cards { gap: 10px; }
    .card { padding: 15px; }
    .lower { grid-template-columns: 1fr; }
  }
  @media (max-width: 700px) {
    .login-page { padding: 18px; }
    .login-card { padding: 30px 23px; border-radius: 20px; }
    .login-card h1 { font-size: 25px; }
    .sidebar {
      position: fixed; inset: 0 auto 0 0; width: min(290px, 86vw); max-width: 86vw; height: 100dvh;
      padding: 22px 16px; transform: translateX(-105%); transition: transform .24s ease;
      z-index: 1001; overflow-y: auto; box-shadow: none;
    }
    .sidebar.mobile-open { transform: translateX(0); box-shadow: 15px 0 45px #08271e26; }
    .brand { padding: 0 4px 24px; gap: 10px; }
    .brand strong { font-size: 15px; }
    .drawer-close { display: grid; place-items: center; margin-left: auto; width: 40px; height: 40px; flex: 0 0 40px; padding: 0; border: 1px solid #397467; border-radius: 10px; background: #ffffff08; color: white; font-size: 21px; }
    .menu-label { padding: 10px 10px 12px; }
    .nav { display: flex; flex-direction: column; gap: 6px; overflow: visible; }
    .nav button { padding: 13px 12px; font-size: 14px; }
    .side-note { margin-top: auto; }
    .mobile-menu-backdrop { display: block; position: fixed; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: #102f27a3; z-index: 1000; }
    .main { margin-left: 0; width: 100%; padding: 22px 14px; }
    .topbar { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: start; gap: 9px; margin-bottom: 22px; }
    .topbar-menu-toggle { display: grid; place-items: center; width: 42px; height: 42px; padding: 0; border: 1px solid #d8e4dc; border-radius: 11px; background: white; color: #145648; font-size: 23px; }
    .page-title { font-size: 21px; line-height: 1.2; }
    .eyebrow { font-size: 10px; letter-spacing: .8px; }
    .subtitle { font-size: 12px; line-height: 1.5; }
    .topbar-actions { gap: 6px; }
    .profile { padding: 3px; border-radius: 11px; }
    .profile .profile-info { display: none; }
    .avatar { width: 34px; height: 34px; flex-basis: 34px; }
    .logout-btn { padding: 8px 9px; font-size: 11px; }
    .demo { font-size: 11px; margin-bottom: 16px; }
    .balance { padding: 22px; border-radius: 17px; }
    .balance-number { font-size: clamp(25px, 7vw, 33px); margin: 12px 0 20px; }
    .balance-bottom { align-items: flex-start; }
    .balance-btn { padding: 10px 11px; font-size: 11px; }
    .section-head { margin-top: 23px; }
    .cards { grid-template-columns: 1fr; gap: 10px; }
    .card { padding: 17px; }
    .card-value { font-size: 22px; }
    .lower { grid-template-columns: minmax(0, 1fr); gap: 14px; margin-top: 18px; }
    .panel { padding: 15px; }
    th { font-size: 10px; padding: 10px 7px; }
    td { font-size: 11px; padding: 13px 7px; }
    .footer { margin-top: 25px; line-height: 1.6; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
`;

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeMenu, setActiveMenu] = useState("Dashboard");
  const [showBalance, setShowBalance] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuItems = [
    ["▦", "Dashboard"],
    ["◷", "Riwayat Transaksi"],
    ["◎", "Simpanan Saya"],
    ["▤", "Pinjaman"],
    ["♙", "Profil Anggota"],
  ];

  const logout = () => {
    setIsLoggedIn(false);
    setActiveMenu("Dashboard");
    setMobileMenuOpen(false);
    setShowBalance(true);
  };

  if (!isLoggedIn) {
    return (
      <>
        <style>{css}</style>
        <main className="login-page">
          <section className="login-card" aria-labelledby="login-title">
            <div className="login-logo" aria-hidden="true">⌂</div>
            <div className="brand-name">Koperasi B4T</div>
            <div className="login-label">Portal Anggota</div>
            <h1 id="login-title">Selamat datang</h1>
            <p>Masuk ke portal anggota untuk melihat informasi simpanan, riwayat transaksi, dan pinjaman koperasi Anda.</p>
            <button className="login-button" type="button" onClick={() => setIsLoggedIn(true)}>
              Login Anggota <span aria-hidden="true">→</span>
            </button>
            <div className="login-note">Login sementara untuk demo.</div>
            <div className="login-footer">© 2026 Koperasi B4T</div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`} aria-label="Menu utama">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">⌂</div>
            <div>
              <strong>Koperasi B4T</strong>
              <small>Portal Anggota</small>
            </div>
            <button className="drawer-close" type="button" aria-label="Tutup menu" onClick={() => setMobileMenuOpen(false)}>×</button>
          </div>
          <div className="menu-label">MENU UTAMA</div>
          <nav className="nav">
            {menuItems.map(([icon, label]) => (
              <button
                key={label}
                type="button"
                className={activeMenu === label ? "active" : ""}
                onClick={() => {
                  setActiveMenu(label);
                  setMobileMenuOpen(false);
                }}
              >
                <span className="nav-icon" aria-hidden="true">{icon}</span>{label}
              </button>
            ))}
          </nav>
          <div className="side-note">
            <strong>Portal Anggota</strong><br />
            Informasi simpanan dan transaksi Anda dalam satu tempat.
          </div>
        </aside>

        {mobileMenuOpen && (
          <button className="mobile-menu-backdrop" type="button" aria-label="Tutup menu" onClick={() => setMobileMenuOpen(false)} />
        )}

        <main className="main">
          <header className="topbar">
            <button className="topbar-menu-toggle" type="button" aria-label="Buka menu" onClick={() => setMobileMenuOpen(true)}>☰</button>
            <div>
              <div className="eyebrow">AREA ANGGOTA</div>
              <h1 className="page-title">{activeMenu === "Dashboard" ? "Dashboard Saya" : activeMenu}</h1>
              <div className="subtitle">Selamat datang kembali di portal koperasi.</div>
            </div>
            <div className="topbar-actions">
              <div className="profile">
                <div className="avatar">A</div>
                <div className="profile-info">
                  <strong>Anggota Contoh</strong>
                  <small>AGT-0001</small>
                </div>
              </div>
              <button className="logout-btn" type="button" onClick={logout}>Keluar</button>
            </div>
          </header>

          <div className="demo"><strong>MODE DEMO:</strong> Semua nominal dan identitas di halaman ini merupakan data contoh, bukan data keuangan sebenarnya.</div>

          <section className="balance">
            <div className="balance-label">Total Simpanan Saya</div>
            <div className="balance-number">{showBalance ? rupiah(2450000) : "Rp •••••••"}</div>
            <div className="balance-bottom">
              <div className="member-id">NOMOR ANGGOTA<br /><strong>AGT-0001</strong></div>
              <button className="balance-btn" type="button" onClick={() => setShowBalance((shown) => !shown)}>
                {showBalance ? "Sembunyikan saldo" : "Tampilkan saldo"}
              </button>
            </div>
          </section>

          <div className="section-head">
            <h2>Ringkasan Keuangan</h2>
            <span className="muted">Data contoh</span>
          </div>

          <section className="cards">
            <div className="card">
              <div className="card-top"><span className="muted">Simpanan Wajib</span><div className="card-icon">↗</div></div>
              <div className="card-value">{rupiah(1200000)}</div>
              <div className="card-foot">Akumulasi simpanan wajib</div>
            </div>
            <div className="card">
              <div className="card-top"><span className="muted">Simpanan Sukarela</span><div className="card-icon">▤</div></div>
              <div className="card-value">{rupiah(1250000)}</div>
              <div className="card-foot">Akumulasi simpanan sukarela</div>
            </div>
            <div className="card">
              <div className="card-top"><span className="muted">Sisa Pinjaman</span><div className="card-icon">⌁</div></div>
              <div className="card-value">{rupiah(1750000)}</div>
              <div className="card-foot">Sisa pinjaman contoh</div>
            </div>
          </section>

          <section className="lower">
            <div className="panel">
              <div className="section-head" style={{ marginTop: 0 }}>
                <div><h2>Transaksi Terakhir</h2><div className="muted" style={{ marginTop: 6 }}>Ringkasan aktivitas keuangan</div></div>
                <button className="detail-link" type="button" onClick={() => setActiveMenu("Riwayat Transaksi")}>Lihat semua →</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>TRANSAKSI</th><th>TANGGAL</th><th>NOMINAL</th><th>STATUS</th></tr></thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={`${tx.date}-${i}`}>
                        <td className="tx-title">{tx.title}</td>
                        <td>{tx.date}</td>
                        <td className={tx.type === "in" ? "money-in" : "money-out"}>{tx.type === "in" ? "+" : "−"} {rupiah(tx.amount)}</td>
                        <td><span className="pill">{tx.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <h2>Pinjaman Saya</h2>
              <div className="muted" style={{ marginTop: 6 }}>Ringkasan pinjaman contoh</div>
              <div className="loan-box">
                <div className="loan-label">Sisa pinjaman</div>
                <div className="loan-amount">{rupiah(1750000)}</div>
                <div className="progress"><div /></div>
                <div className="progress-text"><span>Sudah dibayar</span><strong>65%</strong></div>
              </div>
              <button className="action" type="button" onClick={() => setActiveMenu("Pinjaman")}>Lihat detail pinjaman →</button>
            </div>
          </section>

          <div className="footer">© 2026 Koperasi B4T · Portal Informasi Anggota</div>
        </main>
      </div>
    </>
  );
}

export default App;

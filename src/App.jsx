import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import './App.css';

const STORAGE_KEY = 'koperasi-b4t-prototype-v3';
const AUTH_STORAGE_KEY = 'koperasi-b4t-demo-auth-v1';
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (value) => value === null || value === undefined || value === ''
  ? 'Belum diinput'
  : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const uid = () => globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const labelType = (type) => ({
  simpanan_wajib: 'Setoran simpanan wajib',
  simpanan_sukarela: 'Setoran simpanan sukarela',
  penarikan_sukarela: 'Penarikan simpanan sukarela',
  angsuran_pinjaman: 'Pembayaran angsuran pinjaman',
  pencairan_pinjaman: 'Pencairan pinjaman',
  pengajuan_pinjaman_disetujui: 'Pengajuan pinjaman disetujui (menunggu pencairan)',
}[type] || type);

function seedData() {
  return {
    members: [
      { id: 'demo-bayu', memberNo: 'KBT-000001', name: 'Bayu', status: 'Aktif', monthlyMandatory: 50000, mandatoryBalance: null, voluntaryBalance: 45000000, phone: '' },
      { id: 'demo-sukiman', memberNo: 'KBT-000002', name: 'Sukiman', status: 'Aktif', monthlyMandatory: 50000, mandatoryBalance: null, voluntaryBalance: 0, phone: '' },
    ],
    loans: [
      { id: 'loan-bayu', memberId: 'demo-bayu', principal: 10000000, remainingBalance: null, termMonths: 12, monthlyInstallment: 833500, loanType: 'Sosial', collateral: '', status: 'Aktif', startDate: today() },
      { id: 'loan-sukiman', memberId: 'demo-sukiman', principal: 5000000, remainingBalance: null, termMonths: 12, monthlyInstallment: 417000, loanType: 'Sosial', collateral: '', status: 'Aktif', startDate: today() },
    ],
    transactions: [], shuRecords: [], loanApplications: [],
  };
}
function normalizeLogin(value) { return String(value || '').trim().toUpperCase(); }
function generateTempPassword() {
  const part = Math.random().toString(36).slice(2, 6).toUpperCase();
  const digits = String(Math.floor(10 + Math.random() * 90));
  return `${part}B4T!${digits}`;
}
function demoDefaultPassword(member) {
  if (member.id === 'demo-bayu') return 'BayuB4T!001';
  if (member.id === 'demo-sukiman') return 'SukimanB4T!002';
  return generateTempPassword();
}
function loadDemoAccounts(members) {
  const adminDefault = { id: 'demo-admin', username: 'admin', role: 'admin', memberId: null, password: 'DemoAdmin2026!', mustChangePassword: false, active: true };
  let saved = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) saved = parsed;
  } catch (e) { console.warn('Akun demo belum dapat dibaca.', e); }
  const savedAdmin = saved.find((a) => a.role === 'admin');
  const admin = savedAdmin ? { ...adminDefault, ...savedAdmin, username: 'admin' } : adminDefault;
  const memberAccounts = [];
  for (const member of members) {
    const existing = saved.find((a) => a.role === 'member' && a.memberId === member.id);
    if (existing) {
      memberAccounts.push({ ...existing, username: member.memberNo });
    } else if (['demo-bayu', 'demo-sukiman'].includes(member.id)) {
      memberAccounts.push({ id: `demo-account-${member.id}`, username: member.memberNo, role: 'member', memberId: member.id, password: demoDefaultPassword(member), mustChangePassword: true, active: true });
    }
  }
  return [admin, ...memberAccounts];
}
function normalizeSeedMemberNumbers(members) {
  return members.map((member) => {
    if (member.id === 'demo-bayu' && /^AGT-0*1$/i.test(member.memberNo || '')) return { ...member, memberNo: 'KBT-000001' };
    if (member.id === 'demo-sukiman' && /^AGT-0*2$/i.test(member.memberNo || '')) return { ...member, memberNo: 'KBT-000002' };
    return member;
  });
}

function readLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.members)) return { members: normalizeSeedMemberNumbers(parsed.members), loans: parsed.loans || [], transactions: parsed.transactions || [], shuRecords: parsed.shuRecords || [], loanApplications: parsed.loanApplications || [] };
    }
  } catch (err) { console.warn('Data demo lokal tidak dapat dibaca', err); }
  return seedData();
}
const n = (v) => v === '' || v === null || v === undefined ? null : Number(v);
function moneyValue(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text || text === '-' || text === '—') return text === '-' || text === '—' ? 0 : null;
  const parsed = Number(text.replace(/Rp/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.'));
  return Number.isFinite(parsed) ? parsed : null;
}
function norm(v) { return String(v ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, ''); }
function nextMemberNo(members) {
  const max = members.reduce((current, m) => {
    const digits = String(m.memberNo || '').match(/(\d+)$/);
    return digits ? Math.max(current, Number(digits[1])) : current;
  }, 0);
  return `KBT-${String(max + 1).padStart(6, '0')}`;
}

// Parser untuk format blok vertikal pada Excel contoh (kolom B = label, kolom C = nilai),
// juga menerima format tabel biasa yang menggunakan satu baris per anggota.
async function parseExcel(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Sheet Excel tidak ditemukan.');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  const headers = (rows[0] || []).map(norm);
  const nameCol = headers.findIndex((h) => ['anggota', 'nama', 'namaanggota'].includes(h));
  if (nameCol >= 0) {
    const col = (aliases) => headers.findIndex((h) => aliases.includes(h));
    return rows.slice(1).filter((r) => r[nameCol]).map((r) => ({
      memberNo: String(r[col(['noanggota', 'nomoranggota', 'memberno'])] || '').trim(),
      name: String(r[nameCol]).trim(), status: String(r[col(['status'])] || 'Aktif').trim(),
      monthlyMandatory: moneyValue(r[col(['simpananwajib', 'simpananwajibperbulan', 'iuranwajib'])]) ?? 0,
      mandatoryBalance: moneyValue(r[col(['saldosimpananwajib', 'saldoawalsimpananwajib'])]),
      voluntaryBalance: moneyValue(r[col(['simpanansukarela', 'saldosimpanansukarela'])]) ?? 0,
      loanPrincipal: moneyValue(r[col(['pinjaman', 'pinjamanawal', 'nilaipinjaman'])]),
      remainingBalance: moneyValue(r[col(['sisapinjaman', 'saldopinjaman'])]),
      termMonths: moneyValue(r[col(['lamapinjaman', 'tenor'])]),
      monthlyInstallment: moneyValue(r[col(['cicilanperbulan', 'angsuranperbulan'])]),
      loanType: String(r[col(['jenispinjaman'])] || ''), collateral: String(r[col(['jaminanberupa', 'jaminan'])] || ''),
    }));
  }
  const map = {
    anggota: 'name', namaanggota: 'name', noanggota: 'memberNo', nomoranggota: 'memberNo',
    simpananwajib: 'monthlyMandatory', simpananwajibperbulan: 'monthlyMandatory', iuranwajib: 'monthlyMandatory',
    saldoawalsimpananwajib: 'mandatoryBalance', saldosimpananwajib: 'mandatoryBalance',
    simpanansukarela: 'voluntaryBalance', saldosimpanansukarela: 'voluntaryBalance',
    pinjaman: 'loanPrincipal', pinjamanawal: 'loanPrincipal', lamapinjaman: 'termMonths', tenor: 'termMonths',
    cicilanperbulan: 'monthlyInstallment', angsuranperbulan: 'monthlyInstallment', jenispinjaman: 'loanType',
    sisapinjaman: 'remainingBalance', saldopinjam: 'remainingBalance', jaminanberupa: 'collateral', jaminan: 'collateral', status: 'status',
  };
  const result = [];
  let current = null;
  for (const row of rows) {
    const labelAtB = norm(row?.[1]);
    const labelAtA = norm(row?.[0]);
    if (['anggota', 'namaanggota'].includes(labelAtB) || ['anggota', 'namaanggota'].includes(labelAtA)) {
      if (current?.name) result.push(current);
      const value = ['anggota', 'namaanggota'].includes(labelAtB) ? row?.[2] : row?.[1];
      current = { memberNo: '', name: String(value ?? '').trim(), status: 'Aktif', monthlyMandatory: 0, mandatoryBalance: null, voluntaryBalance: 0, loanPrincipal: null, remainingBalance: null, termMonths: null, monthlyInstallment: null, loanType: '', collateral: '' };
      continue;
    }
    if (!current) continue;
    const label = labelAtB || labelAtA;
    const value = labelAtB ? row?.[2] : row?.[1];
    const key = map[label];
    if (!key || value === undefined) continue;
    if (['monthlyMandatory', 'mandatoryBalance', 'voluntaryBalance', 'loanPrincipal', 'remainingBalance', 'monthlyInstallment', 'termMonths'].includes(key)) {
      const v = moneyValue(value);
      if (v !== null) current[key] = key === 'termMonths' ? Math.round(v) : v;
    } else if (String(value ?? '').trim()) current[key] = String(value).trim();
  }
  if (current?.name) result.push(current);
  if (!result.length) throw new Error('Format tidak dikenali. Gunakan blok “Anggota / Simpanan wajib / Simpanan Sukarela / Pinjaman...” atau tabel dengan header.');
  return result;
}

function mapMember(row) { return { id: row.id, memberNo: row.member_no, name: row.name, status: row.status || 'Aktif', monthlyMandatory: Number(row.monthly_mandatory || 0), mandatoryBalance: row.mandatory_balance == null ? null : Number(row.mandatory_balance), voluntaryBalance: Number(row.voluntary_balance || 0), phone: row.phone || '' }; }
function mapLoan(row) { return { id: row.id, memberId: row.member_id, principal: Number(row.principal || 0), remainingBalance: row.remaining_balance == null ? null : Number(row.remaining_balance), termMonths: Number(row.term_months || 0), monthlyInstallment: Number(row.monthly_installment || 0), loanType: row.loan_type || 'Sosial', collateral: row.collateral || '', status: row.status || 'Aktif', startDate: row.start_date || today() }; }
function mapTx(row) { return { id: row.id, memberId: row.member_id, loanId: row.loan_id, type: row.type, amount: Number(row.amount || 0), principalPaid: Number(row.principal_paid || 0), date: row.transaction_date, notes: row.notes || '', status: row.status || 'Berhasil' }; }
function mapShu(row) { return { id: row.id, memberId: row.member_id, year: Number(row.year), amount: Number(row.amount || 0), status: row.status || 'Belum dibayar', paidAt: row.paid_at || '', notes: row.notes || '' }; }
function mapLoanApplication(row) {
  return {
    id: row.id, applicationNo: row.application_no, memberId: row.member_id, memberNo: row.member_no || '',
    applicantName: row.applicant_name || '', address: row.address || '', phone: row.phone || '', ktpNo: row.ktp_no || '',
    purpose: row.loan_purpose || '', otherPurpose: row.other_purpose || '', termMonths: Number(row.term_months || 0),
    marginLabel: row.margin_label || '', loanAmount: Number(row.loan_amount || 0), bankAccount: row.bank_account || '',
    collateralDescription: row.collateral_description || '', collateralPhotoPath: row.collateral_photo_path || '',
    collateralPhotoName: row.collateral_photo_name || '', collateralPhotoData: '', collateralPhotoUrl: '',
    otherNotes: row.other_notes || '', status: row.status || 'Diajukan', adminNotes: row.admin_notes || '',
    submittedAt: row.created_at || row.submitted_at || '', reviewedAt: row.reviewed_at || '',
  };
}
async function fetchCloudData() {
  const responses = await Promise.all([
    supabase.from('members').select('*').order('member_no'),
    supabase.from('loans').select('*').order('created_at', { ascending: false }),
    supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(500),
    supabase.from('shu_distributions').select('*').order('year', { ascending: false }),
    supabase.from('loan_applications').select('*').order('created_at', { ascending: false }),
  ]);
  const problem = responses.find((r) => r.error);
  if (problem) throw problem.error;
  const loanApplications = await Promise.all(responses[4].data.map(async (row) => {
    const application = mapLoanApplication(row);
    if (application.collateralPhotoPath) {
      const { data } = await supabase.storage.from('loan-application-collateral').createSignedUrl(application.collateralPhotoPath, 30 * 60);
      application.collateralPhotoUrl = data?.signedUrl || '';
    }
    return application;
  }));
  return { members: responses[0].data.map(mapMember), loans: responses[1].data.map(mapLoan), transactions: responses[2].data.map(mapTx), shuRecords: responses[3].data.map(mapShu), loanApplications };
}

function Stat({ icon, label, value, hint }) {
  return <article className="stat-card"><div className="stat-head"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{hint}</small></article>;
}
function TxTable({ rows, members }) {
  const name = (id) => members.find((m) => m.id === id)?.name || '—';
  return <div className="table-scroll"><table><thead><tr><th>Tanggal</th><th>Anggota</th><th>Jenis transaksi</th><th>Nominal</th><th>Catatan</th></tr></thead><tbody>
    {rows.map((t) => <tr key={t.id}><td>{t.date || '—'}</td><td>{name(t.memberId)}</td><td>{labelType(t.type)}</td><td className={['simpanan_wajib', 'simpanan_sukarela'].includes(t.type) ? 'positive' : t.type === 'pengajuan_pinjaman_disetujui' ? '' : 'negative'}>{fmt(t.amount)}</td><td>{t.notes || '—'}{t.type === 'angsuran_pinjaman' && t.principalPaid > 0 && <small className="cell-note">Pengurang pokok: {fmt(t.principalPaid)}</small>}</td></tr>)}
    {!rows.length && <tr><td className="empty" colSpan="5">Belum ada transaksi.</td></tr>}
  </tbody></table></div>;
}
function LoanTableRow({ loan, memberName, onSave }) {
  const [value, setValue] = useState(loan.remainingBalance == null ? '' : String(loan.remainingBalance));
  useEffect(() => setValue(loan.remainingBalance == null ? '' : String(loan.remainingBalance)), [loan.remainingBalance]);
  return <tr><td>{memberName}</td><td>{loan.loanType}</td><td>{fmt(loan.principal)}</td><td>{fmt(loan.remainingBalance)}</td><td>{fmt(loan.monthlyInstallment)}</td><td>{loan.status}</td><td><div className="inline-edit"><input aria-label={`Sisa pinjaman ${memberName}`} type="number" min="0" max={loan.principal} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Sisa pinjaman"/><button type="button" className="small-btn" onClick={() => onSave(loan.id, value)}>Simpan</button></div></td></tr>;
}
function NavItem({ icon, label, active, onClick }) {
  return <button type="button" className={`nav-item ${active ? 'selected' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{label}</span></button>;
}

export default function App() {
  const initial = useMemo(() => isSupabaseConfigured ? { members: [], loans: [], transactions: [], shuRecords: [] } : readLocal(), []);
  const [members, setMembers] = useState(initial.members);
  const [loans, setLoans] = useState(initial.loans);
  const [transactions, setTransactions] = useState(initial.transactions);
  const [shuRecords, setShuRecords] = useState(initial.shuRecords);
  const [loanApplications, setLoanApplications] = useState(initial.loanApplications || []);
  const [role, setRole] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginMode, setLoginMode] = useState('choose');
  const [demoAccounts, setDemoAccounts] = useState(() => isSupabaseConfigured ? [] : loadDemoAccounts(initial.members));
  const [currentDemoAccountId, setCurrentDemoAccountId] = useState('');
  const [pendingDemoAccount, setPendingDemoAccount] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [loginSuccessRole, setLoginSuccessRole] = useState('member');
  const [firstNewPassword, setFirstNewPassword] = useState('');
  const [firstConfirmPassword, setFirstConfirmPassword] = useState('');
  const [ownCurrentPassword, setOwnCurrentPassword] = useState('');
  const [ownNewPassword, setOwnNewPassword] = useState('');
  const [ownConfirmPassword, setOwnConfirmPassword] = useState('');
  const [issuedCredential, setIssuedCredential] = useState(null);
  const [activeMemberId, setActiveMemberId] = useState(initial.members[0]?.id || '');
  const [activeMenu, setActiveMenu] = useState('Dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hideBalances, setHideBalances] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cloudSession, setCloudSession] = useState(null);
  const [cloudProfile, setCloudProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [memberForm, setMemberForm] = useState({ name: '', phone: '', status: 'Aktif', monthlyMandatory: '50000', mandatoryBalance: '', voluntaryBalance: '0' });
  const [txForm, setTxForm] = useState({ memberId: '', type: 'simpanan_sukarela', amount: '', principalPaid: '', date: today(), notes: '', loanId: '' });
  const [loanForm, setLoanForm] = useState({ memberId: '', principal: '', remainingBalance: '', termMonths: '12', monthlyInstallment: '', loanType: 'Sosial', collateral: '', startDate: today() });
  const [shuForm, setShuForm] = useState({ memberId: '', year: String(new Date().getFullYear()), amount: '', status: 'Belum dibayar', paidAt: '', notes: '' });
  const [loanApplicationForm, setLoanApplicationForm] = useState({ applicantName: '', address: '', phone: '', ktpNo: '', purpose: 'Pembelian Barang', otherPurpose: '', termChoice: '12', customTermMonths: '', loanAmount: '', bankAccount: '', collateralDescription: '', otherNotes: '' });
  const [loanPhotoFile, setLoanPhotoFile] = useState(null);
  const [loanPhotoData, setLoanPhotoData] = useState('');
  const [loanPhotoName, setLoanPhotoName] = useState('');
  const [loanPhotoPreview, setLoanPhotoPreview] = useState('');
  const [selectedLoanApplicationId, setSelectedLoanApplicationId] = useState('');
  const [applicationReviewStatus, setApplicationReviewStatus] = useState('Sedang ditinjau');
  const [applicationReviewNotes, setApplicationReviewNotes] = useState('');
  const [excelPreview, setExcelPreview] = useState([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [importReport, setImportReport] = useState(null);

  const memberId = role === 'member' ? (cloudProfile?.member_id || activeMemberId) : activeMemberId;
  const activeMember = members.find((m) => m.id === memberId) || (role === 'member' ? members[0] : null);
  const memberLoans = loans.filter((l) => l.memberId === activeMember?.id);
  const approvedApplicationHistory = loanApplications
    .filter((application) => application.memberId === activeMember?.id && application.status === 'Disetujui')
    .map((application) => ({
      id: `approved-app-${application.id}`,
      memberId: application.memberId,
      type: 'pengajuan_pinjaman_disetujui',
      amount: Number(application.loanAmount || 0),
      date: String(application.reviewedAt || application.submittedAt || '').slice(0, 10),
      notes: `No. ${application.applicationNo}. Disetujui Admin; dana belum dianggap cair sampai pencairan dicatat.`,
      status: 'Disetujui',
    }));
  const memberTransactions = [...transactions.filter((t) => t.memberId === activeMember?.id), ...approvedApplicationHistory]
    .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const memberShu = shuRecords.filter((s) => s.memberId === activeMember?.id).slice().sort((a, b) => Number(b.year) - Number(a.year));
  const unresolvedLoans = memberLoans.some((l) => l.remainingBalance == null && l.status !== 'Lunas');
  const totalSavings = activeMember ? Number(activeMember.voluntaryBalance || 0) : null;
  const myLoanApplications = loanApplications.filter((application) => application.memberId === activeMember?.id).slice().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const selectedLoanApplication = loanApplications.find((application) => application.id === selectedLoanApplicationId) || null;
  const localBanner = isSupabaseConfigured
    ? 'Database online aktif; akses data diatur oleh peran akun.'
    : 'Demo lokal: data tersimpan di browser ini saja dan belum tersinkron ke perangkat lain.';

  useEffect(() => {
    if (!loginSuccess) return undefined;
    const timer = window.setTimeout(() => setLoginSuccess(false), 1900);
    return () => window.clearTimeout(timer);
  }, [loginSuccess]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ members, loans, transactions, shuRecords, loanApplications })); }
    catch (e) { console.warn('Data demo tidak dapat disimpan', e); setError('Penyimpanan demo di browser penuh. Kecilkan/hapus lampiran foto demo atau bersihkan data demo sebelum melanjutkan.'); }
  }, [members, loans, transactions, shuRecords, loanApplications]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(demoAccounts)); }
    catch (e) { console.warn('Akun demo tidak dapat disimpan.', e); }
  }, [demoAccounts]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let alive = true;
    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!alive || sessionError || !data.session) return;
      await hydrateSession(data.session, () => alive);
    })();
    return () => { alive = false; };
  }, []);

  async function hydrateSession(session, isAlive = () => true, showSuccessAnimation = false) {
    setBusy(true);
    setError('');
    try {
      const { data: profile, error: profileError } = await supabase.from('profiles').select('id,role,member_id,display_name').eq('id', session.user.id).single();
      if (profileError) throw profileError;
      if (!['admin', 'member'].includes(profile.role)) throw new Error('Peran akun belum diatur sebagai admin atau anggota.');
      const data = await fetchCloudData();
      if (!isAlive()) return;
      setCloudSession(session);
      setCloudProfile(profile);
      setRole(profile.role);
      setMembers(data.members); setLoans(data.loans); setTransactions(data.transactions); setShuRecords(data.shuRecords); setLoanApplications(data.loanApplications || []);
      setActiveMemberId(profile.member_id || data.members[0]?.id || '');
      const profileMember = data.members.find((m) => m.id === profile.member_id);
      if (profileMember) setLoanApplicationForm((prev) => ({ ...prev, applicantName: profileMember.name || '', phone: profileMember.phone || '' }));
      setActiveMenu(profile.role === 'admin' ? 'Ringkasan Admin' : 'Dashboard');
      setIsLoggedIn(true);
      if (showSuccessAnimation) { setLoginSuccessRole(profile.role); setLoginSuccess(true); }
    } catch (e) {
      setError(`Tidak dapat memuat akun atau database: ${e.message}`);
    } finally { setBusy(false); }
  }
  async function refreshCloud() {
    const data = await fetchCloudData();
    setMembers(data.members); setLoans(data.loans); setTransactions(data.transactions); setShuRecords(data.shuRecords); setLoanApplications(data.loanApplications || []);
  }
  function chooseLoginMode(mode) {
    setLoginMode(mode);
    setLoginUsername(''); setLoginPassword(''); setShowLoginPassword(false); setEmail(''); setPassword('');
    setError(''); setNotice('');
  }
  async function cloudLogin(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      const { data: authProfile, error: profileError } = await supabase
        .from('profiles').select('role').eq('id', data.session.user.id).single();
      if (profileError) throw profileError;
      if (authProfile.role !== loginMode) {
        await supabase.auth.signOut();
        setPassword('');
        throw new Error(loginMode === 'admin'
          ? 'Akun ini bukan akun Admin. Gunakan login anggota atau hubungi pengurus.'
          : 'Akun ini bukan akun anggota. Jika Anda pengurus, gunakan Login Admin.');
      }
      await hydrateSession(data.session, () => true, true);
    } catch (e) { setError(e.message || 'Login gagal.'); }
    finally { setBusy(false); }
  }
  function enterDemoAccount(account, customNotice = '') {
    const nextRole = account.role;
    const id = account.memberId || members[0]?.id || '';
    const chosenMember = members.find((m) => m.id === id) || members[0];
    setLoanApplicationForm({ applicantName: chosenMember?.name || '', address: '', phone: chosenMember?.phone || '', ktpNo: '', purpose: 'Pembelian Barang', otherPurpose: '', termChoice: '12', customTermMonths: '', loanAmount: '', bankAccount: '', collateralDescription: '', otherNotes: '' });
    setRole(nextRole); setActiveMemberId(id); setCloudProfile(null); setCloudSession(null);
    setCurrentDemoAccountId(account.id); setPendingDemoAccount(null); setIsLoggedIn(true);
    setLoginSuccessRole(nextRole); setLoginSuccess(true);
    setActiveMenu(nextRole === 'admin' ? 'Ringkasan Admin' : 'Dashboard');
    setNotice(customNotice || 'Mode demo aktif. Data hanya tersimpan di browser ini, bukan di database online.'); setError('');
    setLoginPassword(''); setFirstNewPassword(''); setFirstConfirmPassword('');
  }
  function handleDemoLogin(event) {
    event.preventDefault(); setError(''); setNotice('');
    const username = normalizeLogin(loginUsername);
    const account = demoAccounts.find((a) => normalizeLogin(a.username) === username && a.active !== false);
    if (!account || account.password !== loginPassword) {
      setError('Username/nomor anggota atau password tidak cocok. Periksa kembali data login.');
      return;
    }
    if (account.role !== loginMode) {
      setError(loginMode === 'admin'
        ? 'Akun ini adalah akun anggota, bukan Admin. Silakan gunakan Login Anggota.'
        : 'Akun ini bukan akun anggota. Jika Anda Admin, gunakan Login Admin.');
      setLoginPassword('');
      return;
    }
    if (account.role === 'member') {
      const member = members.find((m) => m.id === account.memberId);
      if (!member || member.status !== 'Aktif') {
        setError('Akun anggota tidak ditemukan atau berstatus nonaktif. Hubungi Admin koperasi.');
        return;
      }
    }
    if (account.mustChangePassword) {
      setPendingDemoAccount(account); setLoginPassword('');
      setNotice('Ini login pertama atau password baru dari Admin. Buat password pribadi sebelum melanjutkan.');
      return;
    }
    enterDemoAccount(account);
  }
  function finishFirstPasswordChange(event) {
    event.preventDefault(); setError(''); setNotice('');
    if (!pendingDemoAccount) return setError('Sesi aktivasi tidak ditemukan. Silakan login lagi.');
    if (firstNewPassword.length < 8) return setError('Password baru minimal 8 karakter.');
    if (firstNewPassword !== firstConfirmPassword) return setError('Konfirmasi password belum sama.');
    if (firstNewPassword === pendingDemoAccount.password) return setError('Password baru harus berbeda dari password sementara.');
    const updated = { ...pendingDemoAccount, password: firstNewPassword, mustChangePassword: false };
    setDemoAccounts((prev) => prev.map((a) => a.id === updated.id ? updated : a));
    enterDemoAccount(updated, 'Password berhasil diganti. Anda sudah masuk ke portal demo.');
  }
  function issueMemberTempPassword(member) {
    if (!member || member.status !== 'Aktif') return setError('Akun hanya bisa disiapkan untuk anggota yang berstatus Aktif.');
    const existing = demoAccounts.find((a) => a.role === 'member' && a.memberId === member.id);
    const tempPassword = generateTempPassword();
    const account = { id: existing?.id || `demo-account-${member.id}`, username: member.memberNo, role: 'member', memberId: member.id, password: tempPassword, mustChangePassword: true, active: true };
    setDemoAccounts((prev) => existing ? prev.map((a) => a.id === existing.id ? account : a) : [...prev, account]);
    setIssuedCredential({ memberId: member.id, username: member.memberNo, password: tempPassword });
    setError(''); setNotice(`Password sementara dibuat untuk ${member.name}. Berikan secara pribadi dan minta anggota menggantinya saat login pertama.`);
  }
  async function changeOwnPassword(event) {
    event.preventDefault(); setError(''); setNotice('');
    if (ownNewPassword.length < 8) return setError('Password baru minimal 8 karakter.');
    if (ownNewPassword !== ownConfirmPassword) return setError('Konfirmasi password belum sama.');
    setBusy(true);
    try {
      if (isSupabaseConfigured) {
        const { error: updateError } = await supabase.auth.updateUser({ password: ownNewPassword });
        if (updateError) throw updateError;
      } else {
        const account = demoAccounts.find((a) => a.id === currentDemoAccountId);
        if (!account || account.password !== ownCurrentPassword) throw new Error('Password saat ini tidak benar.');
        if (account.password === ownNewPassword) throw new Error('Password baru harus berbeda dari password saat ini.');
        setDemoAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, password: ownNewPassword, mustChangePassword: false } : a));
      }
      setOwnCurrentPassword(''); setOwnNewPassword(''); setOwnConfirmPassword('');
      setNotice('Password berhasil diperbarui.');
    } catch (e) { setError(e.message || 'Tidak dapat mengubah password.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (isSupabaseConfigured && cloudSession) await supabase.auth.signOut();
    setIsLoggedIn(false); setRole(''); setLoginMode('choose'); setCloudSession(null); setCloudProfile(null); setCurrentDemoAccountId(''); setPendingDemoAccount(null); setLoginUsername(''); setLoginPassword(''); setEmail(''); setPassword(''); setActiveMenu('Dashboard'); setMobileOpen(false); setHideBalances(false); setNotice(''); setError('');
  }
  function navigate(label) { setActiveMenu(label); setMobileOpen(false); setNotice(''); setError(''); }
  function patchMemberLocal(id, patch) { setMembers((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m)); }

  async function addMember(event) {
    event.preventDefault(); setError(''); setNotice('');
    if (!memberForm.name.trim()) return setError('Nama anggota wajib diisi.');
    setBusy(true);
    const data = { memberNo: nextMemberNo(members), name: memberForm.name.trim(), phone: memberForm.phone.trim(), status: memberForm.status, monthlyMandatory: Number(memberForm.monthlyMandatory || 0), mandatoryBalance: memberForm.mandatoryBalance === '' ? null : Number(memberForm.mandatoryBalance), voluntaryBalance: Number(memberForm.voluntaryBalance || 0) };
    try {
      if (isSupabaseConfigured) {
        const { data: row, error: e } = await supabase.from('members').insert({ member_no: data.memberNo, name: data.name, phone: data.phone || null, status: data.status, monthly_mandatory: data.monthlyMandatory, mandatory_balance: data.mandatoryBalance, voluntary_balance: data.voluntaryBalance }).select('*').single();
        if (e) throw e;
        setMembers((prev) => [...prev, mapMember(row)].sort((a, b) => a.memberNo.localeCompare(b.memberNo)));
      } else setMembers((prev) => [...prev, { ...data, id: uid() }].sort((a, b) => a.memberNo.localeCompare(b.memberNo)));
      setMemberForm({ name: '', phone: '', status: 'Aktif', monthlyMandatory: '50000', mandatoryBalance: '', voluntaryBalance: '0' });
      setNotice(isSupabaseConfigured ? `Anggota ${data.name} berhasil ditambahkan (${data.memberNo}). Akun login perlu dibuat melalui proses administrasi Supabase.` : `Anggota ${data.name} berhasil ditambahkan (${data.memberNo}). Buka menu Akun Anggota untuk membuat password sementara.`);
    } catch (e) { setError(`Gagal menambah anggota: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function readExcel(file) {
    if (!file) return;
    setError(''); setNotice(''); setImportReport(null);
    try {
      const parsed = await parseExcel(file);
      const seenNames = new Set(members.map((m) => norm(m.name)));
      const seenNos = new Set(members.map((m) => norm(m.memberNo)));
      const preview = parsed.map((row, i) => {
        const nameKey = norm(row.name);
        const noKey = norm(row.memberNo);
        const duplicate = seenNames.has(nameKey) || Boolean(noKey && seenNos.has(noKey));
        if (nameKey) seenNames.add(nameKey);
        if (noKey) seenNos.add(noKey);
        return { ...row, previewId: `${i}-${nameKey}`, duplicate, warnings: [
          ...(row.mandatoryBalance == null ? ['Saldo total simpanan wajib tidak ada; iuran bulanan bukan saldo akumulasi.'] : []),
          ...(Number(row.loanPrincipal || 0) > 0 && row.remainingBalance == null ? ['Sisa pinjaman kosong; perlu diverifikasi sebelum mencatat angsuran.'] : []),
        ] };
      });
      setExcelPreview(preview); setExcelFileName(file.name); setNotice(`${parsed.length} baris/blok anggota terbaca. Periksa sebelum mengimpor.`);
    } catch (e) { setExcelPreview([]); setError(`Gagal membaca file: ${e.message}`); }
  }

  async function importExcel() {
    setBusy(true); setError(''); setNotice('');
    const added = []; const addedLoans = []; const skipped = []; const failures = [];
    try {
      for (const row of excelPreview) {
        if (row.duplicate) { skipped.push(row.name); continue; }
        const newNo = row.memberNo || nextMemberNo([...members, ...added]);
        const normalizedStatus = norm(row.status) === 'nonaktif' ? 'Nonaktif' : 'Aktif';
        let member;
        try {
          if (isSupabaseConfigured) {
            const { data, error: e } = await supabase.from('members').insert({ member_no: newNo, name: row.name, status: normalizedStatus, monthly_mandatory: Number(row.monthlyMandatory || 0), mandatory_balance: row.mandatoryBalance == null ? null : Number(row.mandatoryBalance), voluntary_balance: Number(row.voluntaryBalance || 0) }).select('*').single();
            if (e) throw e;
            member = mapMember(data);
          } else member = { id: uid(), memberNo: newNo, name: row.name, status: normalizedStatus, monthlyMandatory: Number(row.monthlyMandatory || 0), mandatoryBalance: row.mandatoryBalance == null ? null : Number(row.mandatoryBalance), voluntaryBalance: Number(row.voluntaryBalance || 0), phone: '' };
          added.push(member);
          if (Number(row.loanPrincipal || 0) > 0) {
            const loan = { id: uid(), memberId: member.id, principal: Number(row.loanPrincipal), remainingBalance: row.remainingBalance == null ? null : Number(row.remainingBalance), termMonths: Number(row.termMonths || 0), monthlyInstallment: Number(row.monthlyInstallment || 0), loanType: row.loanType || 'Belum ditentukan', collateral: row.collateral || '', status: row.remainingBalance === 0 ? 'Lunas' : 'Aktif', startDate: today() };
            if (isSupabaseConfigured) {
              const { data, error: loanError } = await supabase.from('loans').insert({ member_id: member.id, principal: loan.principal, remaining_balance: loan.remainingBalance, term_months: loan.termMonths, monthly_installment: loan.monthlyInstallment, loan_type: loan.loanType, collateral: loan.collateral || null, status: loan.status, start_date: loan.startDate }).select('*').single();
              if (loanError) throw loanError;
              loan.id = data.id;
            }
            addedLoans.push(loan);
          }
        } catch (e) { failures.push(`${row.name}: ${e.message}`); }
      }
      if (isSupabaseConfigured) await refreshCloud();
      else { setMembers((prev) => [...prev, ...added]); setLoans((prev) => [...prev, ...addedLoans]); }
      setImportReport({ imported: added.length, loans: addedLoans.length, skipped, failures });
      setExcelPreview([]); setExcelFileName('');
      setNotice(`Impor selesai: ${added.length} anggota baru; ${skipped.length} duplikat dilewati.`);
    } catch (e) { setError(`Impor belum selesai: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function saveTransaction(event) {
    event.preventDefault(); setError(''); setNotice('');
    const amount = Number(txForm.amount); const principalPaid = Number(txForm.principalPaid || 0);
    const member = members.find((m) => m.id === txForm.memberId);
    const loan = loans.find((l) => l.id === txForm.loanId && l.memberId === txForm.memberId);
    if (!member) return setError('Pilih anggota.');
    if (!(amount > 0)) return setError('Nominal harus lebih dari nol.');
    if (txForm.type === 'simpanan_wajib' && member.mandatoryBalance == null) return setError('Saldo awal simpanan wajib belum diinput. Tetapkan saldo dari pembukuan sebelum mencatat setoran agar saldo tidak salah.');
    if (txForm.type === 'penarikan_sukarela' && Number(member.voluntaryBalance || 0) < amount) return setError('Saldo simpanan sukarela tidak mencukupi.');
    if (txForm.type === 'angsuran_pinjaman') {
      if (!loan) return setError('Pilih pinjaman.');
      if (loan.remainingBalance == null) return setError('Sisa pinjaman belum diverifikasi oleh Admin.');
      if (principalPaid < 0 || principalPaid > amount || principalPaid > loan.remainingBalance) return setError('Porsi pengurang pokok tidak valid.');
    }
    setBusy(true);
    try {
      if (isSupabaseConfigured) {
        const { error: e } = await supabase.rpc('record_member_transaction', { p_member_id: member.id, p_type: txForm.type, p_amount: amount, p_transaction_date: txForm.date || today(), p_notes: txForm.notes || null, p_loan_id: txForm.type === 'angsuran_pinjaman' ? txForm.loanId : null, p_principal_paid: txForm.type === 'angsuran_pinjaman' ? principalPaid : 0 });
        if (e) throw e;
        await refreshCloud();
      } else {
        if (txForm.type === 'simpanan_wajib') patchMemberLocal(member.id, { mandatoryBalance: Number(member.mandatoryBalance || 0) + amount });
        if (txForm.type === 'simpanan_sukarela') patchMemberLocal(member.id, { voluntaryBalance: Number(member.voluntaryBalance || 0) + amount });
        if (txForm.type === 'penarikan_sukarela') patchMemberLocal(member.id, { voluntaryBalance: Number(member.voluntaryBalance || 0) - amount });
        if (txForm.type === 'angsuran_pinjaman') setLoans((prev) => prev.map((l) => l.id === loan.id ? { ...l, remainingBalance: Math.max(0, Number(l.remainingBalance) - principalPaid), status: Number(l.remainingBalance) - principalPaid <= 0 ? 'Lunas' : l.status } : l));
        setTransactions((prev) => [{ id: uid(), memberId: member.id, loanId: txForm.loanId || null, type: txForm.type, amount, principalPaid: txForm.type === 'angsuran_pinjaman' ? principalPaid : 0, date: txForm.date || today(), notes: txForm.notes.trim(), status: 'Berhasil' }, ...prev]);
      }
      setNotice('Transaksi berhasil disimpan dan akan tampil pada riwayat anggota.');
      setTxForm((prev) => ({ ...prev, amount: '', principalPaid: '', notes: '', loanId: '' }));
    } catch (e) { setError(`Transaksi gagal disimpan: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function createLoan(event) {
    event.preventDefault(); setError(''); setNotice('');
    const principal = Number(loanForm.principal); const remaining = loanForm.remainingBalance === '' ? principal : Number(loanForm.remainingBalance);
    if (!loanForm.memberId) return setError('Pilih anggota.');
    if (!(principal > 0) || !(remaining >= 0) || remaining > principal) return setError('Nominal pinjaman dan sisa pinjaman tidak valid.');
    setBusy(true);
    try {
      if (isSupabaseConfigured) {
        const { error: e } = await supabase.rpc('create_loan_with_disbursement', { p_member_id: loanForm.memberId, p_principal: principal, p_remaining_balance: remaining, p_term_months: Number(loanForm.termMonths || 0), p_monthly_installment: Number(loanForm.monthlyInstallment || 0), p_loan_type: loanForm.loanType || 'Sosial', p_collateral: loanForm.collateral || null, p_start_date: loanForm.startDate || today() });
        if (e) throw e; await refreshCloud();
      } else {
        const loan = { id: uid(), memberId: loanForm.memberId, principal, remainingBalance: remaining, termMonths: Number(loanForm.termMonths || 0), monthlyInstallment: Number(loanForm.monthlyInstallment || 0), loanType: loanForm.loanType || 'Sosial', collateral: loanForm.collateral, status: remaining === 0 ? 'Lunas' : 'Aktif', startDate: loanForm.startDate || today() };
        setLoans((prev) => [loan, ...prev]);
        setTransactions((prev) => [{ id: uid(), memberId: loan.memberId, loanId: loan.id, type: 'pencairan_pinjaman', amount: principal, principalPaid: 0, date: loan.startDate, notes: 'Pencairan pinjaman baru', status: 'Berhasil' }, ...prev]);
      }
      setLoanForm({ memberId: '', principal: '', remainingBalance: '', termMonths: '12', monthlyInstallment: '', loanType: 'Sosial', collateral: '', startDate: today() }); setNotice('Pinjaman dan pencairannya berhasil dicatat.');
    } catch (e) { setError(`Gagal mencatat pinjaman: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function saveLoanBalance(id, raw) {
    const loan = loans.find((l) => l.id === id); const value = raw === '' ? null : Number(raw);
    if (!loan) return;
    if (value !== null && (!(value >= 0) || value > loan.principal)) return setError('Sisa pinjaman harus antara nol dan pinjaman awal.');
    setBusy(true); setError(''); setNotice('');
    try {
      if (isSupabaseConfigured) { const { error: e } = await supabase.from('loans').update({ remaining_balance: value, status: value === 0 ? 'Lunas' : 'Aktif' }).eq('id', id); if (e) throw e; await refreshCloud(); }
      else setLoans((prev) => prev.map((l) => l.id === id ? { ...l, remainingBalance: value, status: value === 0 ? 'Lunas' : 'Aktif' } : l));
      setNotice('Sisa pinjaman diperbarui. Pastikan sesuai pembukuan resmi.');
    } catch (e) { setError(`Gagal memperbarui sisa pinjaman: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function deleteMember(member) {
    if (!member) return;
    const linkedLoans = loans.filter((item) => item.memberId === member.id);
    const linkedTransactions = transactions.filter((item) => item.memberId === member.id);
    const linkedShu = shuRecords.filter((item) => item.memberId === member.id);
    const linkedApplications = loanApplications.filter((item) => item.memberId === member.id);

    if (linkedLoans.length || linkedTransactions.length || linkedShu.length || linkedApplications.length) {
      setError(`Anggota ${member.name} tidak bisa dihapus karena masih memiliki riwayat pinjaman (${linkedLoans.length}), transaksi (${linkedTransactions.length}), SHU (${linkedShu.length}), atau pengajuan pinjaman (${linkedApplications.length}). Ubah status menjadi Nonaktif agar riwayat keuangan tetap tersimpan.`);
      setNotice('');
      return;
    }

    const confirmed = window.confirm(
      `Hapus anggota ${member.name} (${member.memberNo})? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (isSupabaseConfigured) {
        const { error: deleteError } = await supabase.from('members').delete().eq('id', member.id);
        if (deleteError) throw deleteError;
        await refreshCloud();
      } else {
        setMembers((prev) => prev.filter((item) => item.id !== member.id));
        setDemoAccounts((prev) => prev.filter((account) => account.memberId !== member.id));
        if (activeMemberId === member.id) {
          const nextMember = members.find((item) => item.id !== member.id);
          setActiveMemberId(nextMember?.id || '');
        }
        if (issuedCredential?.memberId === member.id) setIssuedCredential(null);
      }
      setNotice(`Anggota ${member.name} (${member.memberNo}) berhasil dihapus.`);
    } catch (e) {
      setError(`Gagal menghapus anggota: ${e.message}. Jika akun masih terhubung ke profil login database, lepaskan hubungan akun tersebut terlebih dahulu.`);
    } finally {
      setBusy(false);
    }
  }

  async function saveMemberBalance(id, patch) {
    const clean = { monthlyMandatory: Number(patch.monthlyMandatory || 0), mandatoryBalance: patch.mandatoryBalance === '' ? null : Number(patch.mandatoryBalance), voluntaryBalance: Number(patch.voluntaryBalance || 0), status: patch.status || 'Aktif' };
    setBusy(true); setError(''); setNotice('');
    try {
      if (isSupabaseConfigured) {
        const { error: e } = await supabase.from('members').update({ monthly_mandatory: clean.monthlyMandatory, mandatory_balance: clean.mandatoryBalance, voluntary_balance: clean.voluntaryBalance, status: clean.status }).eq('id', id);
        if (e) throw e; await refreshCloud();
      } else patchMemberLocal(id, clean);
      setNotice('Data anggota diperbarui. Perubahan saldo awal harus sesuai hasil rekonsiliasi.');
    } catch (e) { setError(`Gagal memperbarui anggota: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function saveShu(event) {
    event.preventDefault(); setError(''); setNotice('');
    const amount = Number(shuForm.amount);
    if (!shuForm.memberId || !(amount >= 0)) return setError('Pilih anggota dan masukkan nominal SHU yang benar.');
    const row = { memberId: shuForm.memberId, year: Number(shuForm.year), amount, status: shuForm.status, paidAt: shuForm.status === 'Sudah dibayar' ? (shuForm.paidAt || today()) : '', notes: shuForm.notes.trim() };
    setBusy(true);
    try {
      if (isSupabaseConfigured) {
        const { error: e } = await supabase.from('shu_distributions').upsert({ member_id: row.memberId, year: row.year, amount: row.amount, status: row.status, paid_at: row.paidAt || null, notes: row.notes || null, created_by: cloudSession?.user?.id }, { onConflict: 'member_id,year' });
        if (e) throw e; await refreshCloud();
      } else setShuRecords((prev) => { const current = prev.find((s) => s.memberId === row.memberId && Number(s.year) === row.year); return current ? prev.map((s) => s.id === current.id ? { ...s, ...row } : s) : [{ ...row, id: uid() }, ...prev]; });
      setNotice('Hasil pembagian SHU berhasil disimpan.'); setShuForm((prev) => ({ ...prev, amount: '', notes: '' }));
    } catch (e) { setError(`Gagal menyimpan SHU: ${e.message}`); }
    finally { setBusy(false); }
  }
  async function toggleShu(record) {
    const status = record.status === 'Sudah dibayar' ? 'Belum dibayar' : 'Sudah dibayar'; const paidAt = status === 'Sudah dibayar' ? today() : '';
    try {
      if (isSupabaseConfigured) { const { error: e } = await supabase.from('shu_distributions').update({ status, paid_at: paidAt || null }).eq('id', record.id); if (e) throw e; await refreshCloud(); }
      else setShuRecords((prev) => prev.map((r) => r.id === record.id ? { ...r, status, paidAt } : r));
      setNotice(`Status SHU menjadi ${status}.`); setError('');
    } catch (e) { setError(`Gagal mengubah status SHU: ${e.message}`); }
  }


  async function chooseLoanPhoto(file) {
    setError(''); setNotice('');
    if (!file) {
      setLoanPhotoFile(null); setLoanPhotoData(''); setLoanPhotoName(''); setLoanPhotoPreview('');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setError('Foto jaminan harus JPG, PNG, atau WEBP.');
    if (isSupabaseConfigured && file.size > 2 * 1024 * 1024) return setError('Ukuran foto maksimum 2 MB.');
    if (!isSupabaseConfigured && file.size > 700 * 1024) return setError('Untuk mode demo lokal, ukuran foto maksimum 700 KB agar penyimpanan browser tidak cepat penuh.');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Foto tidak dapat dibaca.'));
        reader.readAsDataURL(file);
      });
      setLoanPhotoFile(file); setLoanPhotoData(dataUrl); setLoanPhotoName(file.name); setLoanPhotoPreview(dataUrl);
    } catch (e) { setError(e.message || 'Foto tidak dapat dibaca.'); }
  }

  function resetLoanApplicationForm() {
    setLoanApplicationForm({ applicantName: activeMember?.name || '', address: '', phone: activeMember?.phone || '', ktpNo: '', purpose: 'Pembelian Barang', otherPurpose: '', termChoice: '12', customTermMonths: '', loanAmount: '', bankAccount: '', collateralDescription: '', otherNotes: '' });
    setLoanPhotoFile(null); setLoanPhotoData(''); setLoanPhotoName(''); setLoanPhotoPreview('');
  }

  async function submitLoanApplication(event) {
    event.preventDefault(); setError(''); setNotice('');
    if (!activeMember) return setError('Akun ini belum terhubung ke data anggota. Hubungi Admin.');
    const applicantName = (loanApplicationForm.applicantName || activeMember.name || '').trim();
    const address = loanApplicationForm.address.trim();
    const phone = loanApplicationForm.phone.trim() || activeMember.phone || '';
    const ktpNo = loanApplicationForm.ktpNo.trim();
    const purpose = loanApplicationForm.purpose;
    const otherPurpose = loanApplicationForm.otherPurpose.trim();
    const termMonths = loanApplicationForm.termChoice === 'lainnya' ? Number(loanApplicationForm.customTermMonths) : Number(loanApplicationForm.termChoice);
    const marginLabel = loanApplicationForm.termChoice === '12' ? '12 bulan (14% margin)' : loanApplicationForm.termChoice === '24' ? '24 bulan (16,5% margin)' : 'Tenor khusus';
    const loanAmount = Number(loanApplicationForm.loanAmount);
    if (!applicantName || !address || !phone || !ktpNo) return setError('Nama, alamat, nomor HP, dan nomor KTP wajib diisi.');
    if (purpose === 'Lainnya' && !otherPurpose) return setError('Jelaskan tujuan pinjaman lainnya.');
    if (!(termMonths >= 1 && termMonths <= 360)) return setError('Tenor pinjaman harus antara 1 sampai 360 bulan.');
    if (!(loanAmount > 0)) return setError('Nominal pinjaman harus lebih dari nol.');
    if (!loanApplicationForm.bankAccount.trim()) return setError('Isi nomor rekening beserta nama pemilik dan nama bank.');
    setBusy(true);
    const applicationNo = `PJG-${today().replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const row = {
      id: uid(), applicationNo, memberId: activeMember.id, memberNo: activeMember.memberNo,
      applicantName, address, phone, ktpNo, purpose, otherPurpose,
      termMonths, marginLabel, loanAmount, bankAccount: loanApplicationForm.bankAccount.trim(),
      collateralDescription: loanApplicationForm.collateralDescription.trim(), collateralPhotoName: loanPhotoName,
      collateralPhotoData: loanPhotoData, collateralPhotoPath: '', collateralPhotoUrl: '',
      otherNotes: loanApplicationForm.otherNotes.trim(), status: 'Diajukan', adminNotes: '', submittedAt: new Date().toISOString(), reviewedAt: '',
    };
    try {
      if (isSupabaseConfigured) {
        let photoPath = '';
        if (loanPhotoFile) {
          const ext = loanPhotoFile.type === 'image/png' ? 'png' : loanPhotoFile.type === 'image/webp' ? 'webp' : 'jpg';
          photoPath = `${activeMember.id}/${applicationNo}.${ext}`;
          const { error: uploadError } = await supabase.storage.from('loan-application-collateral').upload(photoPath, loanPhotoFile, { contentType: loanPhotoFile.type, upsert: false });
          if (uploadError) throw uploadError;
        }
        const payload = {
          application_no: applicationNo, member_id: activeMember.id, member_no: activeMember.memberNo,
          applicant_name: applicantName, address, phone, ktp_no: ktpNo, loan_purpose: purpose,
          other_purpose: otherPurpose || null, term_months: termMonths, margin_label: marginLabel,
          loan_amount: loanAmount, bank_account: loanApplicationForm.bankAccount.trim(),
          collateral_description: loanApplicationForm.collateralDescription.trim() || null,
          collateral_photo_path: photoPath || null, collateral_photo_name: loanPhotoName || null,
          other_notes: loanApplicationForm.otherNotes.trim() || null, status: 'Diajukan', created_by: cloudSession?.user?.id,
        };
        const { error: insertError } = await supabase.from('loan_applications').insert(payload);
        if (insertError) {
          if (photoPath) await supabase.storage.from('loan-application-collateral').remove([photoPath]);
          throw insertError;
        }
        await refreshCloud();
      } else {
        setLoanApplications((prev) => [row, ...prev]);
      }
      resetLoanApplicationForm();
      setNotice(`Pengajuan ${applicationNo} berhasil dikirim ke panel Admin. Status awal: Diajukan.`);
    } catch (e) { setError(`Pengajuan tidak dapat disimpan: ${e.message}. Jika database online aktif, pastikan migration loan_applications dan bucket lampiran sudah dipasang.`); }
    finally { setBusy(false); }
  }

  async function saveLoanApplicationReview(event) {
    event.preventDefault();
    if (!selectedLoanApplication) return;
    setError(''); setNotice(''); setBusy(true);
    const reviewedAt = ['Disetujui', 'Ditolak'].includes(applicationReviewStatus) ? new Date().toISOString() : '';
    try {
      if (isSupabaseConfigured) {
        const { error: updateError } = await supabase.from('loan_applications').update({ status: applicationReviewStatus, admin_notes: applicationReviewNotes.trim() || null, reviewed_at: reviewedAt || null, reviewed_by: cloudSession?.user?.id || null }).eq('id', selectedLoanApplication.id);
        if (updateError) throw updateError;
        await refreshCloud();
      } else {
        setLoanApplications((prev) => prev.map((app) => app.id === selectedLoanApplication.id ? { ...app, status: applicationReviewStatus, adminNotes: applicationReviewNotes.trim(), reviewedAt } : app));
      }
      setNotice(`Status pengajuan ${selectedLoanApplication.applicationNo} diperbarui menjadi “${applicationReviewStatus}”.`);
    } catch (e) { setError(`Gagal memperbarui pengajuan: ${e.message}`); }
    finally { setBusy(false); }
  }

  function openLoanApplication(application) {
    setSelectedLoanApplicationId(application.id);
    setApplicationReviewStatus(application.status || 'Sedang ditinjau');
    setApplicationReviewNotes(application.adminNotes || '');
    setError(''); setNotice('');
  }

  const nameFor = (id) => members.find((m) => m.id === id)?.name || '—';
  if (!isLoggedIn && pendingDemoAccount && !isSupabaseConfigured) return <main className="login-page"><section className="login-card"><div className="login-logo">⌂</div><div className="login-brand">Koperasi B4T</div><div className="login-subbrand">Aktivasi Akun Demo</div><h1>Ganti password sementara</h1><p className="login-desc">Akun <strong>{pendingDemoAccount.username}</strong> harus memakai password pribadi sebelum masuk ke portal.</p><form className="form-stack" onSubmit={finishFirstPasswordChange}><label>Password baru<input type="password" required minLength={8} autoComplete="new-password" value={firstNewPassword} onChange={(e) => setFirstNewPassword(e.target.value)} placeholder="Minimal 8 karakter"/></label><label>Ulangi password baru<input type="password" required minLength={8} autoComplete="new-password" value={firstConfirmPassword} onChange={(e) => setFirstConfirmPassword(e.target.value)} placeholder="Ketik ulang password"/></label><button className="primary-btn full" disabled={busy}>Simpan password dan masuk</button></form>{notice && <div className="alert success">{notice}</div>}{error && <div className="alert error">{error}</div>}<button type="button" className="text-btn login-back" onClick={() => { setPendingDemoAccount(null); setFirstNewPassword(''); setFirstConfirmPassword(''); setNotice(''); setError(''); }}>Kembali ke login</button><p className="demo-note">Simulasi lokal: password disimpan di browser ini dan bukan sistem keamanan untuk data asli.</p></section></main>;

  if (!isLoggedIn && loginMode === 'choose') return <main className="login-page"><section className="login-card login-choice-card"><div className="login-logo">⌂</div><div className="login-brand">Koperasi B4T</div><div className="login-subbrand">Portal Digital Koperasi</div><h1>Selamat datang</h1><p className="login-desc">Silakan pilih portal sesuai peran Anda.</p><div className="login-role-options"><button type="button" className="primary-btn full role-option" onClick={() => chooseLoginMode('member')}><span className="role-option-icon">♙</span><span><strong>Login Anggota</strong><small>Saldo, simpanan, pinjaman, dan SHU</small></span><span className="role-option-arrow">→</span></button><button type="button" className="secondary-btn full role-option" onClick={() => chooseLoginMode('admin')}><span className="role-option-icon">▣</span><span><strong>Login Admin / Pengurus</strong><small>Kelola anggota dan operasional koperasi</small></span><span className="role-option-arrow">→</span></button></div><p className="demo-note">Ini prototype demo. Gunakan akun fiktif; login belum menjadi pengaman untuk data keuangan asli.</p><div className="login-footer">© {new Date().getFullYear()} Koperasi B4T</div></section></main>;

  if (!isLoggedIn) return <main className="login-page"><section className="login-card"><div className="login-logo">⌂</div><div className="login-brand">Koperasi B4T</div><div className="login-subbrand">{loginMode === 'admin' ? 'Panel Admin / Pengurus' : 'Portal Anggota'}</div><h1>{loginMode === 'admin' ? 'Login Admin' : 'Login Anggota'}</h1><p className="login-desc">{loginMode === 'admin' ? 'Masuk khusus pengurus untuk mengelola anggota, transaksi, pinjaman, pengajuan, dan SHU.' : 'Masuk menggunakan nomor anggota untuk melihat informasi keuangan pribadi Anda.'}</p>
    {isSupabaseConfigured ? <form className="form-stack" onSubmit={cloudLogin}><label>{loginMode === 'admin' ? 'Email Admin' : 'Email anggota terdaftar'}<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={loginMode === 'admin' ? 'admin@koperasi.id' : 'email-terdaftar@contoh.id'}/></label><label>Password<div className="password-input-wrap"><input type={showLoginPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password"/><button type="button" className="password-toggle" onClick={() => setShowLoginPassword((v) => !v)} aria-label={showLoginPassword ? 'Sembunyikan password' : 'Lihat password'}>{showLoginPassword ? 'Sembunyikan' : 'Lihat'}</button></div></label><button className="primary-btn full" disabled={busy}>{busy ? 'Memproses...' : loginMode === 'admin' ? 'Masuk ke Panel Admin' : 'Masuk ke Portal Anggota'}</button><p className="muted">Akun online harus memiliki peran yang sesuai di database. Portal ini akan menolak akun anggota pada login Admin, dan sebaliknya.</p></form> : <form className="form-stack" onSubmit={handleDemoLogin}><label>{loginMode === 'admin' ? 'Username Admin' : 'Nomor Anggota'}<input required autoComplete="username" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder={loginMode === 'admin' ? 'admin' : 'KBT-000001'}/></label><label>Password{loginMode === 'member' && <span className="field-hint">Password sementara harus diganti pada login pertama.</span>}<div className="password-input-wrap"><input required type={showLoginPassword ? 'text' : 'password'} autoComplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Masukkan password"/><button type="button" className="password-toggle" onClick={() => setShowLoginPassword((v) => !v)} aria-label={showLoginPassword ? 'Sembunyikan password' : 'Lihat password'}>{showLoginPassword ? 'Sembunyikan' : 'Lihat'}</button></div></label><button className="primary-btn full" disabled={busy}>{busy ? 'Memproses...' : loginMode === 'admin' ? 'Masuk ke Panel Admin' : 'Masuk ke Portal Anggota'}</button><p className="demo-note">Mode demo lokal: data akun tersimpan di browser ini saja. Gunakan kredensial uji dari dokumentasi demo. Jangan gunakan data asli.</p></form>}
    {notice && <div className="alert success">{notice}</div>}{error && <div className="alert error">{error}</div>}<button type="button" className="text-btn login-back" onClick={() => chooseLoginMode('choose')}>← Kembali ke pilihan login</button><div className="login-footer">© {new Date().getFullYear()} Koperasi B4T · Prototype Demo</div></section></main>;

  const adminMenu = [['▦', 'Ringkasan Admin'], ['♙', 'Data Anggota'], ['⚿', 'Akun Anggota'], ['⇧', 'Impor Excel'], ['＋', 'Input Transaksi'], ['▤', 'Pinjaman'], ['✉', 'Pengajuan Pinjaman'], ['◎', 'SHU Tahunan'], ['◷', 'Riwayat Transaksi'], ['♧', 'Keamanan Akun']];
  const memberMenu = [['▦', 'Dashboard'], ['◷', 'Riwayat Transaksi'], ['◎', 'Simpanan Saya'], ['▤', 'Pinjaman Saya'], ['＋', 'Ajukan Pinjaman'], ['✧', 'SHU Saya'], ['♙', 'Profil Anggota'], ['♧', 'Keamanan Akun']];
  const isAdmin = role === 'admin';
  const menu = isAdmin ? adminMenu : memberMenu;
  const recentTx = transactions.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const memberTotalVoluntary = members.reduce((sum, m) => sum + Number(m.voluntaryBalance || 0), 0);
  const knownMandatoryTotal = members.reduce((sum, m) => sum + (m.mandatoryBalance == null ? 0 : Number(m.mandatoryBalance)), 0);

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}><div className="brand"><div className="brand-icon">⌂</div><div><strong>Koperasi B4T</strong><small>{isAdmin ? 'Panel Admin' : 'Portal Anggota'}</small></div><button className="drawer-close" onClick={() => setMobileOpen(false)} aria-label="Tutup menu">×</button></div><div className="menu-label">{isAdmin ? 'ADMINISTRASI' : 'MENU ANGGOTA'}</div><nav className="nav">{menu.map(([icon, label]) => <NavItem key={label} icon={icon} label={label} active={activeMenu === label} onClick={() => navigate(label)}/>)}</nav><div className="sidebar-footer"><strong>{isAdmin ? 'Akses Pengurus' : 'Portal Anggota'}</strong><span>{isAdmin ? 'Kelola data secara tertib dan tercatat.' : 'Informasi keuangan anggota dalam satu tempat.'}</span></div></aside>
    {mobileOpen && <button className="drawer-backdrop" aria-label="Tutup menu" onClick={() => setMobileOpen(false)}/>}
    <main className="main-content"><header className="topbar"><button className="mobile-toggle" aria-label="Buka menu" onClick={() => setMobileOpen(true)}>☰</button><div className="heading-block"><div className="eyebrow">{isAdmin ? 'PANEL ADMINISTRATOR' : 'AREA ANGGOTA'}</div><h1>{activeMenu}</h1><p className="subtitle">{isAdmin ? 'Kelola anggota, transaksi, pinjaman, dan SHU.' : 'Selamat datang di portal informasi koperasi.'}</p></div><div className="top-actions"><div className="profile-chip"><div className="avatar">{isAdmin ? 'A' : (activeMember?.name?.[0] || 'A').toUpperCase()}</div><div className="profile-info"><strong>{isAdmin ? cloudProfile?.display_name || 'Admin Demo' : activeMember?.name || 'Anggota'}</strong><small>{isAdmin ? 'Pengurus' : activeMember?.memberNo || 'Anggota'}</small></div></div><button className="logout-btn" onClick={logout}>Keluar</button></div></header>
      <div className="mode-banner"><strong>{isSupabaseConfigured ? 'DATABASE ONLINE' : 'MODE DEMO'}:</strong> {localBanner}</div>{notice && <div className="alert success" role="status">{notice}</div>}{error && <div className="alert error" role="alert">{error}</div>}

      {isAdmin && activeMenu === 'Ringkasan Admin' && <><section className="stats-grid"><Stat icon="♙" label="Jumlah anggota" value={members.length} hint="Anggota terdaftar"/><Stat icon="◈" label="Total simpanan sukarela" value={fmt(memberTotalVoluntary)} hint="Saldo dari data yang tersimpan"/><Stat icon="◎" label="Saldo wajib tercatat" value={fmt(knownMandatoryTotal)} hint="Tidak termasuk saldo yang belum diketahui"/><Stat icon="▤" label="Pinjaman perlu verifikasi" value={loans.filter((l) => l.remainingBalance == null && l.status !== 'Lunas').length} hint="Sisa pinjaman perlu dicek"/></section><section className="panel section-panel"><div className="section-title-row"><div><h2>Transaksi terbaru</h2><p className="muted">Aktivitas yang sudah dicatat.</p></div><button className="text-btn" onClick={() => navigate('Riwayat Transaksi')}>Lihat semua →</button></div><TxTable rows={recentTx.slice(0, 8)} members={members}/></section></>}

      {isAdmin && activeMenu === 'Data Anggota' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Data anggota</h2><p className="muted">Iuran bulanan dibedakan dari saldo simpanan wajib akumulatif.</p></div></div><form className="form-grid" onSubmit={addMember}><label>Nama anggota<input required value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} placeholder="Nama lengkap"/></label><label>Nomor HP (opsional)<input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} placeholder="08..."/></label><label>Iuran wajib per bulan (Rp)<input type="number" min="0" value={memberForm.monthlyMandatory} onChange={(e) => setMemberForm({ ...memberForm, monthlyMandatory: e.target.value })}/></label><label>Saldo awal simpanan wajib (Rp)<input type="number" min="0" value={memberForm.mandatoryBalance} onChange={(e) => setMemberForm({ ...memberForm, mandatoryBalance: e.target.value })} placeholder="Kosong = belum diketahui"/></label><label>Saldo simpanan sukarela (Rp)<input required type="number" min="0" value={memberForm.voluntaryBalance} onChange={(e) => setMemberForm({ ...memberForm, voluntaryBalance: e.target.value })}/></label><label>Status<select value={memberForm.status} onChange={(e) => setMemberForm({ ...memberForm, status: e.target.value })}><option>Aktif</option><option>Nonaktif</option></select></label><div className="form-actions"><button className="primary-btn" disabled={busy}>{busy ? 'Menyimpan...' : '＋ Tambah anggota'}</button></div></form><div className="table-scroll"><table><thead><tr><th>No. anggota</th><th>Nama</th><th>Iuran/bulan</th><th>Saldo wajib</th><th>Saldo sukarela</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{members.map((m) => <MemberEditRow key={m.id} member={m} onSave={saveMemberBalance} onDelete={deleteMember} busy={busy}/>) }{!members.length && <tr><td className="empty" colSpan="8">Belum ada anggota.</td></tr>}</tbody></table></div><p className="help-text">Untuk anggota impor yang saldo wajibnya belum tercatat, masukkan saldo yang telah direkonsiliasi sebelum mencatat setoran baru.</p></section>}

      {isAdmin && activeMenu === 'Akun Anggota' && <section className="panel section-panel">
        <div className="section-title-row"><div><h2>Akun login anggota</h2><p className="muted">Admin dapat membuat atau mengatur ulang password sementara. Anggota diwajibkan menggantinya saat login pertama.</p></div></div>
        {isSupabaseConfigured ? <div className="callout"><strong>Mode database online</strong><p>Akun online harus dibuat melalui alur Supabase Auth yang aman. Panel reset password demo lokal dinonaktifkan untuk mencegah perubahan akun yang tidak benar-benar tersinkron.</p></div> : <>
          <div className="callout"><strong>Simulasi lokal</strong><p>Password disimpan di browser ini untuk keperluan presentasi saja. Jangan gunakan password atau data asli. Di sistem final, pembuatan akun dan reset password harus ditangani backend autentikasi.</p></div>
          {issuedCredential && <div className="import-report"><strong>Password sementara dibuat</strong><p>Anggota: {members.find((m) => m.id === issuedCredential.memberId)?.name || '—'}</p><p>Username: <code>{issuedCredential.username}</code></p><p>Password sementara: <code>{issuedCredential.password}</code></p><p>Berikan password ini secara pribadi. Hasil akan kembali tersembunyi saat halaman dimuat ulang.</p><button type="button" className="small-btn" onClick={() => setIssuedCredential(null)}>Sembunyikan kredensial</button></div>}
          <div className="table-scroll"><table><thead><tr><th>Nomor anggota</th><th>Nama</th><th>Status anggota</th><th>Status akun</th><th>Aksi</th></tr></thead><tbody>{members.map((member) => { const account = demoAccounts.find((a) => a.role === 'member' && a.memberId === member.id); return <tr key={member.id}><td>{member.memberNo}</td><td><strong>{member.name}</strong></td><td>{member.status}</td><td>{!account ? <span className="status status-neutral">Belum dibuat</span> : account.mustChangePassword ? <span className="status pending-status">Password sementara</span> : <span className="status success-status">Aktif</span>}</td><td><button type="button" className="small-btn" disabled={member.status !== 'Aktif'} onClick={() => issueMemberTempPassword(member)}>{account ? 'Reset password' : 'Buat akun / password'}</button></td></tr>; })}{!members.length && <tr><td colSpan="5" className="empty">Belum ada anggota.</td></tr>}</tbody></table></div>
          <p className="help-text">Nomor anggota baru dibuat otomatis dengan format KBT-000001 dan seterusnya. Nomor anggota dari Excel yang sudah ada tetap dipertahankan.</p>
        </>}
      </section>}

      {activeMenu === 'Keamanan Akun' && <section className="panel section-panel security-panel"><div className="section-title-row"><div><h2>Ganti password</h2><p className="muted">Gunakan password pribadi dan jangan bagikan kepada orang lain.</p></div></div><form className="form-grid" onSubmit={changeOwnPassword}>{!isSupabaseConfigured && <label className="span-two">Password saat ini<input required type="password" autoComplete="current-password" value={ownCurrentPassword} onChange={(e) => setOwnCurrentPassword(e.target.value)} placeholder="Masukkan password saat ini"/></label>}<label>Password baru<input required minLength={8} type="password" autoComplete="new-password" value={ownNewPassword} onChange={(e) => setOwnNewPassword(e.target.value)} placeholder="Minimal 8 karakter"/></label><label>Ulangi password baru<input required minLength={8} type="password" autoComplete="new-password" value={ownConfirmPassword} onChange={(e) => setOwnConfirmPassword(e.target.value)} placeholder="Ketik ulang password baru"/></label><div className="form-actions"><button className="primary-btn" disabled={busy}>Simpan password baru</button></div></form>{!isSupabaseConfigured && <div className="callout"><strong>Catatan demo</strong><p>Perubahan password hanya berlaku pada browser ini. Di aplikasi final, password dikelola layanan autentikasi dan tidak disimpan sebagai teks biasa.</p></div>}</section>}

      {isAdmin && activeMenu === 'Impor Excel' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Impor Excel</h2><p className="muted">Membaca format blok vertikal seperti Excel contoh dan tabel satu baris per anggota.</p></div></div><div className="callout"><strong>Aturan impor aman</strong><p>Impor hanya menambahkan anggota baru. Nama yang sudah ada dilewati untuk mencegah file yang sama menggandakan anggota atau menimpa saldo yang sudah berjalan.</p><p>“Simpanan wajib Rp50.000 per bulan” dianggap sebagai besaran iuran, bukan saldo akumulasi. Sisa pinjaman kosong tetap kosong dan perlu diverifikasi Admin.</p></div><label className="file-drop"><span className="file-symbol">⇧</span><span><strong>Pilih file Excel (.xlsx, .xls) atau CSV</strong><small>{excelFileName || 'File dibaca di browser, lalu tampilkan pratinjau.'}</small></span><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => readExcel(e.target.files?.[0])}/></label>{excelPreview.length > 0 && <><div className="section-title-row preview-heading"><div><h3>Pratinjau — {excelPreview.length} baris anggota</h3><p className="muted">Periksa peringatan sebelum menyimpan.</p></div><button className="secondary-btn" onClick={() => { setExcelPreview([]); setExcelFileName(''); }}>Batalkan</button></div><div className="table-scroll"><table><thead><tr><th>Nama</th><th>Iuran/bln</th><th>Simpanan sukarela</th><th>Pinjaman awal</th><th>Sisa pinjaman</th><th>Catatan</th></tr></thead><tbody>{excelPreview.map((r) => <tr key={r.previewId} className={r.duplicate ? 'duplicate' : ''}><td><strong>{r.name}</strong><small className="cell-note">{r.duplicate ? 'Duplikat — dilewati' : r.memberNo || 'Nomor otomatis'}</small></td><td>{fmt(r.monthlyMandatory)}</td><td>{fmt(r.voluntaryBalance)}</td><td>{fmt(r.loanPrincipal)}</td><td>{fmt(r.remainingBalance)}</td><td>{[...(r.warnings || []), ...(r.duplicate ? ['Nama/nomor sudah ada.'] : [])].join(' ') || '—'}</td></tr>)}</tbody></table></div><button className="primary-btn" disabled={busy} onClick={importExcel}>{busy ? 'Mengimpor...' : 'Konfirmasi impor anggota baru'}</button></>}{importReport && <div className="import-report"><strong>Hasil impor</strong><p>{importReport.imported} anggota ditambahkan · {importReport.loans} pinjaman · {importReport.skipped.length} duplikat dilewati · {importReport.failures.length} gagal.</p>{importReport.skipped.length > 0 && <p>Dilewati: {importReport.skipped.join(', ')}</p>}{importReport.failures.map((f) => <p key={f} className="danger-text">{f}</p>)}</div>}</section>}

      {isAdmin && activeMenu === 'Input Transaksi' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Input transaksi</h2><p className="muted">Untuk angsuran, masukkan total pembayaran dan porsi yang benar-benar mengurangi pokok secara terpisah.</p></div></div><form className="form-grid" onSubmit={saveTransaction}><label>Anggota<select required value={txForm.memberId} onChange={(e) => setTxForm({ ...txForm, memberId: e.target.value, loanId: '' })}><option value="">Pilih anggota</option>{members.map((m) => <option key={m.id} value={m.id}>{m.memberNo} — {m.name}</option>)}</select></label><label>Jenis transaksi<select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}><option value="simpanan_wajib">Setoran simpanan wajib</option><option value="simpanan_sukarela">Setoran simpanan sukarela</option><option value="penarikan_sukarela">Penarikan simpanan sukarela</option><option value="angsuran_pinjaman">Pembayaran angsuran pinjaman</option></select></label><label>Nominal transaksi (Rp)<input required min="1" type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}/></label><label>Tanggal transaksi<input required type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}/></label>{txForm.type === 'angsuran_pinjaman' && <><label>Pinjaman<select required value={txForm.loanId} onChange={(e) => setTxForm({ ...txForm, loanId: e.target.value })}><option value="">Pilih pinjaman</option>{loans.filter((l) => l.memberId === txForm.memberId && l.status !== 'Lunas').map((l) => <option key={l.id} value={l.id}>{l.loanType} — sisa {fmt(l.remainingBalance)}</option>)}</select></label><label>Porsi pengurang pokok (Rp)<input required min="0" type="number" value={txForm.principalPaid} onChange={(e) => setTxForm({ ...txForm, principalPaid: e.target.value })}/><small>Tidak otomatis sama dengan total cicilan.</small></label></>}<label className="span-two">Catatan<textarea rows="2" value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} placeholder="Contoh: setoran bulan Oktober"/></label><div className="form-actions"><button className="primary-btn" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan transaksi'}</button></div></form></section>}

      {isAdmin && activeMenu === 'Pinjaman' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Data pinjaman</h2><p className="muted">Saldo sisa yang kosong harus diverifikasi dari pembukuan resmi.</p></div></div><div className="table-scroll"><table><thead><tr><th>Anggota</th><th>Jenis</th><th>Pinjaman awal</th><th>Sisa pinjaman</th><th>Cicilan/bln</th><th>Status</th><th>Perbarui sisa</th></tr></thead><tbody>{loans.map((l) => <LoanTableRow key={l.id} loan={l} memberName={nameFor(l.memberId)} onSave={saveLoanBalance} />)}{!loans.length && <tr><td colSpan="7" className="empty">Belum ada pinjaman.</td></tr>}</tbody></table></div><div className="section-title-row subsection"><div><h3>Catat pinjaman baru</h3><p className="muted">Pencairan pinjaman akan tercatat dalam riwayat transaksi.</p></div></div><form className="form-grid" onSubmit={createLoan}><label>Anggota<select required value={loanForm.memberId} onChange={(e) => setLoanForm({ ...loanForm, memberId: e.target.value })}><option value="">Pilih anggota</option>{members.map((m) => <option key={m.id} value={m.id}>{m.memberNo} — {m.name}</option>)}</select></label><label>Pinjaman awal (Rp)<input required min="1" type="number" value={loanForm.principal} onChange={(e) => setLoanForm({ ...loanForm, principal: e.target.value, remainingBalance: e.target.value })}/></label><label>Sisa pinjaman (Rp)<input required min="0" type="number" value={loanForm.remainingBalance} onChange={(e) => setLoanForm({ ...loanForm, remainingBalance: e.target.value })}/></label><label>Tenor (bulan)<input type="number" min="1" value={loanForm.termMonths} onChange={(e) => setLoanForm({ ...loanForm, termMonths: e.target.value })}/></label><label>Cicilan per bulan (Rp)<input type="number" min="0" value={loanForm.monthlyInstallment} onChange={(e) => setLoanForm({ ...loanForm, monthlyInstallment: e.target.value })}/></label><label>Jenis pinjaman<input value={loanForm.loanType} onChange={(e) => setLoanForm({ ...loanForm, loanType: e.target.value })}/></label><label>Jaminan<input value={loanForm.collateral} onChange={(e) => setLoanForm({ ...loanForm, collateral: e.target.value })}/></label><label>Tanggal pencairan<input type="date" value={loanForm.startDate} onChange={(e) => setLoanForm({ ...loanForm, startDate: e.target.value })}/></label><div className="form-actions"><button className="primary-btn" disabled={busy}>＋ Catat pinjaman</button></div></form></section>}


      {isAdmin && activeMenu === 'Pengajuan Pinjaman' && <section className="panel section-panel">
        <div className="section-title-row"><div><h2>Pengajuan pinjaman anggota</h2><p className="muted">Formulir anggota masuk ke sini. Pilih “Detail & cetak” untuk melihat dokumen lengkap dan mencetak atau menyimpan sebagai PDF.</p></div></div>
        <div className="callout"><strong>Privasi</strong><p>Data seperti alamat dan nomor KTP termasuk data pribadi. Mode demo hanya memakai data contoh. Pada database online, akses halaman ini dibatasi untuk Admin melalui RLS.</p></div>
        <div className="table-scroll"><table><thead><tr><th>No. pengajuan</th><th>Tanggal</th><th>Anggota</th><th>Tujuan</th><th>Nominal</th><th>Tenor</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {loanApplications.map((app) => <tr key={app.id}><td><strong>{app.applicationNo}</strong></td><td>{app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('id-ID') : '—'}</td><td>{app.applicantName}<small className="cell-note">{app.memberNo}</small></td><td>{app.purpose === 'Lainnya' ? app.otherPurpose : app.purpose}</td><td>{fmt(app.loanAmount)}</td><td>{app.termMonths} bulan</td><td><span className={`status ${app.status === 'Disetujui' ? 'success-status' : app.status === 'Ditolak' ? 'pending-status' : 'status-neutral'}`}>{app.status}</span></td><td><button className="small-btn" type="button" onClick={() => openLoanApplication(app)}>Detail & cetak</button></td></tr>)}
          {!loanApplications.length && <tr><td colSpan="8" className="empty">Belum ada pengajuan pinjaman.</td></tr>}
        </tbody></table></div>
        {selectedLoanApplication && <div className="application-detail-area">
          <div className="section-title-row detail-title"><div><h3>Detail pengajuan {selectedLoanApplication.applicationNo}</h3><p className="muted">Pastikan data diperiksa sebelum memberi keputusan.</p></div><button className="secondary-btn" type="button" onClick={() => setSelectedLoanApplicationId('')}>Tutup detail</button></div>
          <div className="application-summary-grid"><div><span>Nama pemohon</span><strong>{selectedLoanApplication.applicantName}</strong></div><div><span>No. anggota</span><strong>{selectedLoanApplication.memberNo || '—'}</strong></div><div><span>No. HP</span><strong>{selectedLoanApplication.phone}</strong></div><div><span>No. KTP</span><strong>{selectedLoanApplication.ktpNo}</strong></div><div className="span-all"><span>Alamat</span><strong>{selectedLoanApplication.address}</strong></div><div><span>Tujuan pinjaman</span><strong>{selectedLoanApplication.purpose === 'Lainnya' ? selectedLoanApplication.otherPurpose : selectedLoanApplication.purpose}</strong></div><div><span>Nominal pinjaman</span><strong>{fmt(selectedLoanApplication.loanAmount)}</strong></div><div><span>Tenor yang diminta</span><strong>{selectedLoanApplication.termMonths} bulan · {selectedLoanApplication.marginLabel}</strong></div><div className="span-all"><span>Rekening pencairan</span><strong>{selectedLoanApplication.bankAccount || '—'}</strong></div><div className="span-all"><span>Jaminan</span><strong>{selectedLoanApplication.collateralDescription || 'Tidak dicantumkan'}</strong></div><div className="span-all"><span>Keterangan lain</span><strong>{selectedLoanApplication.otherNotes || '—'}</strong></div></div>
          {(selectedLoanApplication.collateralPhotoUrl || selectedLoanApplication.collateralPhotoData) && <div className="application-photo-preview"><span>Foto jaminan</span><img src={selectedLoanApplication.collateralPhotoUrl || selectedLoanApplication.collateralPhotoData} alt="Foto jaminan yang diunggah"/><small>{selectedLoanApplication.collateralPhotoName}</small></div>}
          <form className="form-grid review-form" onSubmit={saveLoanApplicationReview}><label>Status pengajuan<select value={applicationReviewStatus} onChange={(e) => setApplicationReviewStatus(e.target.value)}><option>Diajukan</option><option>Sedang ditinjau</option><option>Perlu dilengkapi</option><option>Disetujui</option><option>Ditolak</option></select></label><label className="span-two">Catatan Admin untuk pemohon<textarea rows="3" value={applicationReviewNotes} onChange={(e) => setApplicationReviewNotes(e.target.value)} placeholder="Misalnya dokumen tambahan yang diperlukan..."/></label><div className="form-actions"><button className="primary-btn" disabled={busy}>Simpan status</button><button className="secondary-btn" type="button" onClick={() => window.print()}>Cetak / Simpan PDF</button></div></form>
          <article className="print-sheet">
            <header className="print-header"><div className="print-logo">K</div><div><h1>KOPERASI B4T</h1><p>FORMULIR PENGAJUAN PINJAMAN ANGGOTA</p></div></header>
            <div className="print-meta"><div><b>No. Pengajuan</b><span>{selectedLoanApplication.applicationNo}</span></div><div><b>Tanggal Pengajuan</b><span>{selectedLoanApplication.submittedAt ? new Date(selectedLoanApplication.submittedAt).toLocaleString('id-ID') : '—'}</span></div><div><b>Status</b><span>{selectedLoanApplication.status}</span></div></div>
            <h2>A. IDENTITAS PEMOHON</h2><table className="print-table"><tbody><tr><th>Nomor Anggota</th><td>{selectedLoanApplication.memberNo || '—'}</td><th>Nama</th><td>{selectedLoanApplication.applicantName}</td></tr><tr><th>Alamat</th><td colSpan="3">{selectedLoanApplication.address}</td></tr><tr><th>No. Telepon/HP</th><td>{selectedLoanApplication.phone}</td><th>No. KTP</th><td>{selectedLoanApplication.ktpNo}</td></tr></tbody></table>
            <h2>B. RINCIAN PENGAJUAN</h2><table className="print-table"><tbody><tr><th>Tujuan Pinjaman</th><td>{selectedLoanApplication.purpose === 'Lainnya' ? selectedLoanApplication.otherPurpose : selectedLoanApplication.purpose}</td></tr><tr><th>Lama Pinjaman</th><td>{selectedLoanApplication.termMonths} bulan ({selectedLoanApplication.marginLabel})</td></tr><tr><th>Nominal Pinjaman</th><td>{fmt(selectedLoanApplication.loanAmount)}</td></tr><tr><th>No. Rekening (nama & bank)</th><td>{selectedLoanApplication.bankAccount || '—'}</td></tr><tr><th>Jaminan Berupa</th><td>{selectedLoanApplication.collateralDescription || 'Tidak dicantumkan'}</td></tr><tr><th>Lain-lain</th><td>{selectedLoanApplication.otherNotes || '—'}</td></tr></tbody></table>
            {(selectedLoanApplication.collateralPhotoUrl || selectedLoanApplication.collateralPhotoData) && <div className="print-photo"><h2>C. FOTO JAMINAN</h2><img src={selectedLoanApplication.collateralPhotoUrl || selectedLoanApplication.collateralPhotoData} alt="Foto jaminan"/><p>{selectedLoanApplication.collateralPhotoName}</p></div>}
            <div className="print-admin-notes"><b>Catatan Admin:</b><p>{selectedLoanApplication.adminNotes || '—'}</p></div>
            <div className="signature-grid"><div><p>Pemohon,</p><div className="signature-space"/><b>{selectedLoanApplication.applicantName}</b></div><div><p>Petugas Koperasi,</p><div className="signature-space"/><b>________________________</b></div></div>
            <footer>Dokumen dibuat dari input portal koperasi. Periksa kelengkapan dan dokumen pendukung sesuai prosedur koperasi.</footer>
          </article>
        </div>}
      </section>}

      {isAdmin && activeMenu === 'SHU Tahunan' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Input hasil pembagian SHU</h2><p className="muted">Admin memasukkan nilai yang sudah ditetapkan koperasi; sistem tidak menghitung pembagian otomatis.</p></div></div><form className="form-grid" onSubmit={saveShu}><label>Anggota<select required value={shuForm.memberId} onChange={(e) => setShuForm({ ...shuForm, memberId: e.target.value })}><option value="">Pilih anggota</option>{members.map((m) => <option key={m.id} value={m.id}>{m.memberNo} — {m.name}</option>)}</select></label><label>Tahun buku<input required type="number" min="2000" max="2100" value={shuForm.year} onChange={(e) => setShuForm({ ...shuForm, year: e.target.value })}/></label><label>Nominal SHU (Rp)<input required min="0" type="number" value={shuForm.amount} onChange={(e) => setShuForm({ ...shuForm, amount: e.target.value })}/></label><label>Status<select value={shuForm.status} onChange={(e) => setShuForm({ ...shuForm, status: e.target.value, paidAt: e.target.value === 'Sudah dibayar' ? (shuForm.paidAt || today()) : ''})}><option>Belum dibayar</option><option>Sudah dibayar</option></select></label>{shuForm.status === 'Sudah dibayar' && <label>Tanggal pembayaran<input type="date" value={shuForm.paidAt} onChange={(e) => setShuForm({ ...shuForm, paidAt: e.target.value })}/></label>}<label className="span-two">Catatan<textarea rows="2" value={shuForm.notes} onChange={(e) => setShuForm({ ...shuForm, notes: e.target.value })}/></label><div className="form-actions"><button className="primary-btn" disabled={busy}>Simpan hasil SHU</button></div></form><div className="table-scroll"><table><thead><tr><th>Anggota</th><th>Tahun</th><th>Nominal</th><th>Status</th><th>Tanggal bayar</th><th>Aksi</th></tr></thead><tbody>{shuRecords.map((s) => <tr key={s.id}><td>{nameFor(s.memberId)}</td><td>{s.year}</td><td>{fmt(s.amount)}</td><td><span className={`status ${s.status === 'Sudah dibayar' ? 'success-status' : 'pending-status'}`}>{s.status}</span></td><td>{s.paidAt || '—'}</td><td><button className="text-btn" type="button" onClick={() => toggleShu(s)}>{s.status === 'Sudah dibayar' ? 'Tandai belum dibayar' : 'Tandai dibayar'}</button></td></tr>)}{!shuRecords.length && <tr><td colSpan="6" className="empty">Belum ada data SHU.</td></tr>}</tbody></table></div></section>}

      {isAdmin && activeMenu === 'Riwayat Transaksi' && <section className="panel section-panel"><h2>Riwayat transaksi koperasi</h2><p className="muted">Transaksi dicatat tanpa menghapus riwayat sebelumnya.</p><TxTable rows={recentTx} members={members}/></section>}


      {!isAdmin && activeMenu === 'Ajukan Pinjaman' && activeMember && <section className="panel section-panel">
        <div className="section-title-row"><div><h2>Formulir pengajuan pinjaman</h2><p className="muted">Isi data dengan benar. Pengajuan akan diterima oleh Admin untuk ditinjau, bukan langsung menjadi pinjaman aktif.</p></div></div>
        <div className="callout"><strong>Informasi untuk demo</strong><p>Gunakan data fiktif ketika mencoba. Formulir memuat nomor KTP, alamat, dan informasi rekening. Jangan memasukkan data asli sebelum database dan keamanan akun siap.</p><p>Margin 14%/16,5% mengikuti pilihan pada formulir contoh dan harus tetap diverifikasi terhadap kebijakan resmi koperasi.</p></div>
        <form className="form-grid loan-application-form" onSubmit={submitLoanApplication}>
          <label><span>Nama lengkap <b className="required-mark">*</b></span><input required autoComplete="name" value={loanApplicationForm.applicantName} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, applicantName: e.target.value })} placeholder="Nama sesuai identitas"/></label>
          <label><span>No. Telepon/HP <b className="required-mark">*</b></span><input required autoComplete="tel" inputMode="tel" value={loanApplicationForm.phone} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, phone: e.target.value })} placeholder="08xxxxxxxxxx"/></label>
          <label className="span-two"><span>Alamat lengkap <b className="required-mark">*</b></span><textarea required rows="2" autoComplete="street-address" value={loanApplicationForm.address} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, address: e.target.value })} placeholder="Alamat sesuai identitas"/></label>
          <label><span>No. KTP <b className="required-mark">*</b></span><input required inputMode="numeric" autoComplete="off" maxLength="32" value={loanApplicationForm.ktpNo} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, ktpNo: e.target.value })} placeholder="Masukkan nomor KTP"/></label>
          <label><span>Tujuan pinjaman <b className="required-mark">*</b></span><select required value={loanApplicationForm.purpose} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, purpose: e.target.value })}><option>Pembelian Barang</option><option>Renovasi Rumah/Perbaikan Kendaraan</option><option>Sosial (Sakit & Musibah)</option><option>Pembayaran Kontrakan</option><option>Lainnya</option></select></label>
          {loanApplicationForm.purpose === 'Lainnya' && <label className="span-two"><span>Jelaskan tujuan lainnya <b className="required-mark">*</b></span><input required value={loanApplicationForm.otherPurpose} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, otherPurpose: e.target.value })} placeholder="Jelaskan kebutuhan pinjaman"/></label>}
          <label><span>Lama pinjaman <b className="required-mark">*</b></span><select required value={loanApplicationForm.termChoice} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, termChoice: e.target.value })}><option value="12">12 bulan (14% margin)</option><option value="24">24 bulan (16,5% margin)</option><option value="lainnya">Lainnya</option></select></label>
          {loanApplicationForm.termChoice === 'lainnya' && <label><span>Jumlah bulan <b className="required-mark">*</b></span><input required type="number" min="1" max="360" value={loanApplicationForm.customTermMonths} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, customTermMonths: e.target.value })} placeholder="Contoh: 18"/></label>}
          <label><span>Nominal pinjaman (Rp) <b className="required-mark">*</b></span><input required type="number" min="1" step="1" value={loanApplicationForm.loanAmount} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, loanAmount: e.target.value })} placeholder="Contoh: 5000000"/></label>
          <label className="span-two"><span>No. rekening (nomor rekening, nama pemilik, dan nama bank) <b className="required-mark">*</b></span><input required value={loanApplicationForm.bankAccount} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, bankAccount: e.target.value })} placeholder="1234567890 — Nama Pemilik — Nama Bank"/></label>
          <label className="span-two">Jaminan berupa <textarea rows="3" value={loanApplicationForm.collateralDescription} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, collateralDescription: e.target.value })} placeholder="Tuliskan jenis dan keterangan jaminan secara lengkap. Untuk kategori anggota tertentu, lengkapi sesuai persyaratan koperasi."/><small>Masukkan keterangan jaminan selengkap mungkin. Ketentuan dokumen berbeda sesuai kategori keanggotaan dan aturan koperasi.</small></label>
          <div className="span-two"><label>Foto jaminan (opsional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => chooseLoanPhoto(e.target.files?.[0])}/><small>Format JPG, PNG, atau WEBP. Maksimum 2 MB untuk database online; maksimum 700 KB untuk demo lokal.</small></label>{loanPhotoPreview && <div className="upload-preview"><img src={loanPhotoPreview} alt="Pratinjau foto jaminan"/><div><strong>{loanPhotoName}</strong><button type="button" className="text-btn danger-text" onClick={() => chooseLoanPhoto(null)}>Hapus foto</button></div></div>}</div>
          <label className="span-two">Lain-lain / keterangan tambahan<textarea rows="3" value={loanApplicationForm.otherNotes} onChange={(e) => setLoanApplicationForm({ ...loanApplicationForm, otherNotes: e.target.value })} placeholder="Informasi tambahan bila ada"/></label>
          <div className="form-actions"><button className="primary-btn" disabled={busy}>{busy ? 'Mengirim pengajuan...' : 'Kirim pengajuan pinjaman'}</button></div>
        </form>
        <div className="subsection"><div className="section-title-row"><div><h3>Pengajuan saya</h3><p className="muted">Status dan catatan Admin dari pengajuan sebelumnya.</p></div></div><div className="table-scroll"><table><thead><tr><th>No. pengajuan</th><th>Tanggal</th><th>Nominal</th><th>Tenor</th><th>Status</th><th>Catatan Admin</th></tr></thead><tbody>{myLoanApplications.map((app) => <tr key={app.id}><td>{app.applicationNo}</td><td>{app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('id-ID') : '—'}</td><td>{fmt(app.loanAmount)}</td><td>{app.termMonths} bulan</td><td><span className={`status ${app.status === 'Disetujui' ? 'success-status' : app.status === 'Ditolak' ? 'pending-status' : 'status-neutral'}`}>{app.status}</span></td><td>{app.adminNotes || '—'}</td></tr>)}{!myLoanApplications.length && <tr><td colSpan="6" className="empty">Anda belum mengirim pengajuan pinjaman.</td></tr>}</tbody></table></div></div>
      </section>}

      {!isAdmin && activeMenu === 'Dashboard' && activeMember && <><section className="member-balance"><div className="balance-label">Total simpanan yang diketahui</div><div className="balance-number">{hideBalances ? 'Rp •••••••' : totalSavings == null ? `${fmt(activeMember.voluntaryBalance)} + saldo wajib belum diverifikasi` : fmt(totalSavings)}</div><div className="member-balance-bottom"><div>Nomor anggota<br/><strong>{activeMember.memberNo}</strong></div><button className="balance-button" onClick={() => setHideBalances((v) => !v)}>{hideBalances ? 'Tampilkan saldo' : 'Sembunyikan saldo'}</button></div></section><section className="stats-grid member-stats"><Stat icon="↗" label="Iuran wajib per bulan" value={fmt(activeMember.monthlyMandatory)} hint={activeMember.mandatoryBalance == null ? 'Saldo akumulasi belum diinput' : `Saldo wajib: ${fmt(activeMember.mandatoryBalance)}`}/><Stat icon="◈" label="Simpanan sukarela" value={hideBalances ? 'Rp •••••••' : fmt(activeMember.voluntaryBalance)} hint="Saldo berdasarkan data yang tercatat"/><Stat icon="▤" label="Sisa pinjaman" value={hideBalances ? 'Rp •••••••' : unresolvedLoans ? 'Perlu verifikasi' : fmt(memberLoans.reduce((a, l) => a + Number(l.remainingBalance || 0), 0))} hint={`${memberLoans.length} pinjaman terdaftar`}/></section><section className="content-grid"><div className="panel"><div className="section-title-row"><div><h2>Transaksi terakhir</h2><p className="muted">Riwayat akun anggota.</p></div><button className="text-btn" onClick={() => navigate('Riwayat Transaksi')}>Lihat semua →</button></div><TxTable rows={memberTransactions.slice(0, 5)} members={members}/></div><div className="panel"><h2>SHU tahunan</h2><p className="muted">Hasil yang sudah diinput Admin.</p>{memberShu.length ? memberShu.slice(0, 3).map((s) => <div className="shu-list-item" key={s.id}><div><strong>SHU {s.year}</strong><small>{s.status}{s.paidAt ? ` · ${s.paidAt}` : ''}</small></div><b>{fmt(s.amount)}</b></div>) : <div className="empty-state">Belum ada pembagian SHU.</div>}</div></section></>}
      {!isAdmin && activeMenu === 'Riwayat Transaksi' && <section className="panel section-panel"><h2>Riwayat transaksi saya</h2><p className="muted">Hanya transaksi milik akun anggota ini.</p><TxTable rows={memberTransactions} members={members}/></section>}
      {!isAdmin && activeMenu === 'Simpanan Saya' && activeMember && <section className="panel section-panel"><h2>Rincian simpanan saya</h2><section className="stats-grid member-stats"><Stat icon="↗" label="Iuran wajib per bulan" value={fmt(activeMember.monthlyMandatory)} hint="Besaran iuran, bukan saldo akumulasi."/><Stat icon="▦" label="Saldo simpanan wajib" value={fmt(activeMember.mandatoryBalance)} hint={activeMember.mandatoryBalance == null ? 'Perlu verifikasi dari pembukuan.' : 'Saldo tercatat.'}/><Stat icon="◈" label="Saldo simpanan sukarela" value={hideBalances ? 'Rp •••••••' : fmt(activeMember.voluntaryBalance)} hint="Berubah melalui transaksi yang sah."/></section><TxTable rows={memberTransactions.filter((t) => ['simpanan_wajib', 'simpanan_sukarela', 'penarikan_sukarela'].includes(t.type))} members={members}/></section>}
      {!isAdmin && activeMenu === 'Pinjaman Saya' && activeMember && <section className="panel section-panel"><h2>Pinjaman saya</h2><div className="table-scroll"><table><thead><tr><th>Jenis</th><th>Pinjaman awal</th><th>Sisa pinjaman</th><th>Tenor</th><th>Cicilan/bln</th><th>Status</th></tr></thead><tbody>{memberLoans.map((l) => <tr key={l.id}><td>{l.loanType}</td><td>{fmt(l.principal)}</td><td>{fmt(l.remainingBalance)}</td><td>{l.termMonths} bulan</td><td>{fmt(l.monthlyInstallment)}</td><td>{l.remainingBalance == null ? 'Perlu verifikasi' : l.status}</td></tr>)}{!memberLoans.length && <tr><td colSpan="6" className="empty">Tidak ada pinjaman.</td></tr>}</tbody></table></div></section>}
      {!isAdmin && activeMenu === 'SHU Saya' && activeMember && <section className="panel section-panel"><h2>SHU saya</h2><p className="muted">Nominal berasal dari input Admin sesuai keputusan koperasi.</p><div className="table-scroll"><table><thead><tr><th>Tahun buku</th><th>Nominal</th><th>Status</th><th>Tanggal bayar</th></tr></thead><tbody>{memberShu.map((s) => <tr key={s.id}><td>{s.year}</td><td>{fmt(s.amount)}</td><td>{s.status}</td><td>{s.paidAt || '—'}</td></tr>)}{!memberShu.length && <tr><td colSpan="4" className="empty">Belum ada SHU yang dicatat.</td></tr>}</tbody></table></div></section>}
      {!isAdmin && activeMenu === 'Profil Anggota' && activeMember && <section className="panel profile-panel"><div className="profile-large"><div className="avatar large">{activeMember.name?.[0] || 'A'}</div><div><h2>{activeMember.name}</h2><p className="muted">Nomor anggota {activeMember.memberNo}</p></div></div><div className="profile-details"><div><span>Status</span><strong>{activeMember.status}</strong></div><div><span>Iuran wajib/bulan</span><strong>{fmt(activeMember.monthlyMandatory)}</strong></div><div><span>Nomor HP</span><strong>{activeMember.phone || 'Belum dicatat'}</strong></div></div></section>}
      <footer className="app-footer">© {new Date().getFullYear()} Koperasi B4T · {isSupabaseConfigured ? 'Database online' : 'Prototipe demo lokal'}</footer>
    </main>
    {loginSuccess && <div className="login-success-overlay" role="status" aria-live="polite"><div className="login-success-card"><div className="login-success-check"><span>✓</span></div><h2>Login berhasil!</h2><p>{loginSuccessRole === 'admin' ? 'Selamat datang di Panel Admin Koperasi B4T.' : `Selamat datang, ${activeMember?.name || 'Anggota'}!`}</p></div></div>}
  </div>;
}

function MemberEditRow({ member, onSave, onDelete, busy }) {
  const [values, setValues] = useState({ monthlyMandatory: String(member.monthlyMandatory ?? 0), mandatoryBalance: member.mandatoryBalance == null ? '' : String(member.mandatoryBalance), voluntaryBalance: String(member.voluntaryBalance ?? 0), status: member.status || 'Aktif' });
  useEffect(() => setValues({ monthlyMandatory: String(member.monthlyMandatory ?? 0), mandatoryBalance: member.mandatoryBalance == null ? '' : String(member.mandatoryBalance), voluntaryBalance: String(member.voluntaryBalance ?? 0), status: member.status || 'Aktif' }), [member]);
  return <tr><td>{member.memberNo}</td><td><strong>{member.name}</strong></td><td><input className="table-input" aria-label={`Iuran bulanan ${member.name}`} type="number" min="0" value={values.monthlyMandatory} onChange={(e) => setValues({ ...values, monthlyMandatory: e.target.value })}/></td><td><input className="table-input" aria-label={`Saldo wajib ${member.name}`} type="number" min="0" placeholder="Belum diinput" value={values.mandatoryBalance} onChange={(e) => setValues({ ...values, mandatoryBalance: e.target.value })}/></td><td><input className="table-input" aria-label={`Saldo sukarela ${member.name}`} type="number" min="0" value={values.voluntaryBalance} onChange={(e) => setValues({ ...values, voluntaryBalance: e.target.value })}/></td><td><select className="table-select" value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value })}><option>Aktif</option><option>Nonaktif</option></select></td><td><div className="inline-edit"><button type="button" className="small-btn" disabled={busy} onClick={() => onSave(member.id, values)}>Simpan</button><button type="button" className="small-btn danger-btn" disabled={busy} onClick={() => onDelete(member)}>Hapus</button></div></td></tr>;
}

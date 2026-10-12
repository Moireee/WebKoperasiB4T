import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import './App.css';

const STORAGE_KEY = 'koperasi-b4t-prototype-v3';
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
}[type] || type);

function seedData() {
  return {
    members: [
      { id: 'demo-bayu', memberNo: 'AGT-0001', name: 'Bayu', status: 'Aktif', monthlyMandatory: 50000, mandatoryBalance: null, voluntaryBalance: 45000000, phone: '' },
      { id: 'demo-sukiman', memberNo: 'AGT-0002', name: 'Sukiman', status: 'Aktif', monthlyMandatory: 50000, mandatoryBalance: null, voluntaryBalance: 0, phone: '' },
    ],
    loans: [
      { id: 'loan-bayu', memberId: 'demo-bayu', principal: 10000000, remainingBalance: null, termMonths: 12, monthlyInstallment: 833500, loanType: 'Sosial', collateral: '', status: 'Aktif', startDate: today() },
      { id: 'loan-sukiman', memberId: 'demo-sukiman', principal: 5000000, remainingBalance: null, termMonths: 12, monthlyInstallment: 417000, loanType: 'Sosial', collateral: '', status: 'Aktif', startDate: today() },
    ],
    transactions: [], shuRecords: [],
  };
}
function readLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.members)) return { members: parsed.members, loans: parsed.loans || [], transactions: parsed.transactions || [], shuRecords: parsed.shuRecords || [] };
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
  return `AGT-${String(max + 1).padStart(4, '0')}`;
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
async function fetchCloudData() {
  const responses = await Promise.all([
    supabase.from('members').select('*').order('member_no'),
    supabase.from('loans').select('*').order('created_at', { ascending: false }),
    supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(500),
    supabase.from('shu_distributions').select('*').order('year', { ascending: false }),
  ]);
  const problem = responses.find((r) => r.error);
  if (problem) throw problem.error;
  return { members: responses[0].data.map(mapMember), loans: responses[1].data.map(mapLoan), transactions: responses[2].data.map(mapTx), shuRecords: responses[3].data.map(mapShu) };
}

function Stat({ icon, label, value, hint }) {
  return <article className="stat-card"><div className="stat-head"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{hint}</small></article>;
}
function TxTable({ rows, members }) {
  const name = (id) => members.find((m) => m.id === id)?.name || '—';
  return <div className="table-scroll"><table><thead><tr><th>Tanggal</th><th>Anggota</th><th>Jenis transaksi</th><th>Nominal</th><th>Catatan</th></tr></thead><tbody>
    {rows.map((t) => <tr key={t.id}><td>{t.date || '—'}</td><td>{name(t.memberId)}</td><td>{labelType(t.type)}</td><td className={['simpanan_wajib', 'simpanan_sukarela'].includes(t.type) ? 'positive' : 'negative'}>{fmt(t.amount)}</td><td>{t.notes || '—'}{t.type === 'angsuran_pinjaman' && t.principalPaid > 0 && <small className="cell-note">Pengurang pokok: {fmt(t.principalPaid)}</small>}</td></tr>)}
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
  const [role, setRole] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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
  const [excelPreview, setExcelPreview] = useState([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [importReport, setImportReport] = useState(null);

  const memberId = role === 'member' ? (cloudProfile?.member_id || activeMemberId) : activeMemberId;
  const activeMember = members.find((m) => m.id === memberId) || (role === 'member' ? members[0] : null);
  const memberLoans = loans.filter((l) => l.memberId === activeMember?.id);
  const memberTransactions = transactions.filter((t) => t.memberId === activeMember?.id).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const memberShu = shuRecords.filter((s) => s.memberId === activeMember?.id).slice().sort((a, b) => Number(b.year) - Number(a.year));
  const unresolvedLoans = memberLoans.some((l) => l.remainingBalance == null && l.status !== 'Lunas');
  const totalSavings = activeMember && activeMember.mandatoryBalance != null ? Number(activeMember.mandatoryBalance) + Number(activeMember.voluntaryBalance || 0) : null;
  const localBanner = isSupabaseConfigured
    ? 'Database online aktif; akses data diatur oleh peran akun.'
    : 'Demo lokal: data tersimpan di browser ini saja dan belum tersinkron ke perangkat lain.';

  useEffect(() => {
    if (isSupabaseConfigured) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ members, loans, transactions, shuRecords })); }
    catch (e) { console.warn('Data demo tidak dapat disimpan', e); }
  }, [members, loans, transactions, shuRecords]);

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

  async function hydrateSession(session, isAlive = () => true) {
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
      setMembers(data.members); setLoans(data.loans); setTransactions(data.transactions); setShuRecords(data.shuRecords);
      setActiveMemberId(profile.member_id || data.members[0]?.id || '');
      setActiveMenu(profile.role === 'admin' ? 'Ringkasan Admin' : 'Dashboard');
      setIsLoggedIn(true);
    } catch (e) {
      setError(`Tidak dapat memuat akun atau database: ${e.message}`);
    } finally { setBusy(false); }
  }
  async function refreshCloud() {
    const data = await fetchCloudData();
    setMembers(data.members); setLoans(data.loans); setTransactions(data.transactions); setShuRecords(data.shuRecords);
  }
  async function cloudLogin(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      await hydrateSession(data.session);
    } catch (e) { setError(e.message || 'Login gagal.'); }
    finally { setBusy(false); }
  }
  function demoLogin(nextRole, id = members[0]?.id) {
    setRole(nextRole); setActiveMemberId(id || ''); setCloudProfile(null); setCloudSession(null);
    setIsLoggedIn(true); setActiveMenu(nextRole === 'admin' ? 'Ringkasan Admin' : 'Dashboard');
    setNotice('Mode demo aktif. Semua perubahan hanya tersimpan di browser ini.'); setError('');
  }
  async function logout() {
    if (isSupabaseConfigured && cloudSession) await supabase.auth.signOut();
    setIsLoggedIn(false); setRole(''); setCloudSession(null); setCloudProfile(null); setActiveMenu('Dashboard'); setMobileOpen(false); setHideBalances(false); setNotice(''); setError('');
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
      setNotice(`Anggota ${data.name} berhasil ditambahkan (${data.memberNo}).`);
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

  const nameFor = (id) => members.find((m) => m.id === id)?.name || '—';
  if (!isLoggedIn) return <main className="login-page"><section className="login-card"><div className="login-logo">⌂</div><div className="login-brand">Koperasi B4T</div><div className="login-subbrand">Portal Digital Koperasi</div><h1>Selamat datang</h1><p className="login-desc">Lihat informasi simpanan, pinjaman, riwayat transaksi, dan SHU dalam satu portal.</p>
    {isSupabaseConfigured ? <form className="form-stack" onSubmit={cloudLogin}><label>Email akun<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@koperasi.id"/></label><label>Kata sandi<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Kata sandi"/></label><button className="primary-btn full" disabled={busy}>{busy ? 'Memproses...' : 'Login'}</button><p className="muted">Database online aktif. Akun dan peran harus dibuat melalui Supabase.</p></form> : <div className="demo-entry"><button className="primary-btn full" onClick={() => demoLogin('admin')}>Masuk sebagai Admin Demo <span>→</span></button><label className="demo-member-select">Anggota demo<select value={activeMemberId || members[0]?.id || ''} onChange={(e) => setActiveMemberId(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.memberNo} — {m.name}</option>)}</select></label><button className="secondary-btn full" onClick={() => demoLogin('member', activeMemberId || members[0]?.id)}>Masuk sebagai Anggota Demo <span>→</span></button><p className="demo-note">Demo lokal: data perubahan tersimpan di browser ini saja, belum tersinkron ke perangkat lain.</p></div>}
    {error && <div className="alert error">{error}</div>}<div className="login-footer">© {new Date().getFullYear()} Koperasi B4T</div></section></main>;

  const adminMenu = [['▦', 'Ringkasan Admin'], ['♙', 'Data Anggota'], ['⇧', 'Impor Excel'], ['＋', 'Input Transaksi'], ['▤', 'Pinjaman'], ['◎', 'SHU Tahunan'], ['◷', 'Riwayat Transaksi']];
  const memberMenu = [['▦', 'Dashboard'], ['◷', 'Riwayat Transaksi'], ['◎', 'Simpanan Saya'], ['▤', 'Pinjaman Saya'], ['✧', 'SHU Saya'], ['♙', 'Profil Anggota']];
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

      {isAdmin && activeMenu === 'Data Anggota' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Data anggota</h2><p className="muted">Iuran bulanan dibedakan dari saldo simpanan wajib akumulatif.</p></div></div><form className="form-grid" onSubmit={addMember}><label>Nama anggota<input required value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} placeholder="Nama lengkap"/></label><label>Nomor HP (opsional)<input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} placeholder="08..."/></label><label>Iuran wajib per bulan (Rp)<input type="number" min="0" value={memberForm.monthlyMandatory} onChange={(e) => setMemberForm({ ...memberForm, monthlyMandatory: e.target.value })}/></label><label>Saldo awal simpanan wajib (Rp)<input type="number" min="0" value={memberForm.mandatoryBalance} onChange={(e) => setMemberForm({ ...memberForm, mandatoryBalance: e.target.value })} placeholder="Kosong = belum diketahui"/></label><label>Saldo simpanan sukarela (Rp)<input required type="number" min="0" value={memberForm.voluntaryBalance} onChange={(e) => setMemberForm({ ...memberForm, voluntaryBalance: e.target.value })}/></label><label>Status<select value={memberForm.status} onChange={(e) => setMemberForm({ ...memberForm, status: e.target.value })}><option>Aktif</option><option>Nonaktif</option></select></label><div className="form-actions"><button className="primary-btn" disabled={busy}>{busy ? 'Menyimpan...' : '＋ Tambah anggota'}</button></div></form><div className="table-scroll"><table><thead><tr><th>No. anggota</th><th>Nama</th><th>Iuran/bulan</th><th>Saldo wajib</th><th>Saldo sukarela</th><th>Status</th><th>Saldo awal</th></tr></thead><tbody>{members.map((m) => <MemberEditRow key={m.id} member={m} onSave={saveMemberBalance}/>) }{!members.length && <tr><td className="empty" colSpan="7">Belum ada anggota.</td></tr>}</tbody></table></div><p className="help-text">Untuk anggota impor yang saldo wajibnya belum tercatat, masukkan saldo yang telah direkonsiliasi sebelum mencatat setoran baru.</p></section>}

      {isAdmin && activeMenu === 'Impor Excel' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Impor Excel</h2><p className="muted">Membaca format blok vertikal seperti Excel contoh dan tabel satu baris per anggota.</p></div></div><div className="callout"><strong>Aturan impor aman</strong><p>Impor hanya menambahkan anggota baru. Nama yang sudah ada dilewati untuk mencegah file yang sama menggandakan anggota atau menimpa saldo yang sudah berjalan.</p><p>“Simpanan wajib Rp50.000 per bulan” dianggap sebagai besaran iuran, bukan saldo akumulasi. Sisa pinjaman kosong tetap kosong dan perlu diverifikasi Admin.</p></div><label className="file-drop"><span className="file-symbol">⇧</span><span><strong>Pilih file Excel (.xlsx, .xls) atau CSV</strong><small>{excelFileName || 'File dibaca di browser, lalu tampilkan pratinjau.'}</small></span><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => readExcel(e.target.files?.[0])}/></label>{excelPreview.length > 0 && <><div className="section-title-row preview-heading"><div><h3>Pratinjau — {excelPreview.length} baris anggota</h3><p className="muted">Periksa peringatan sebelum menyimpan.</p></div><button className="secondary-btn" onClick={() => { setExcelPreview([]); setExcelFileName(''); }}>Batalkan</button></div><div className="table-scroll"><table><thead><tr><th>Nama</th><th>Iuran/bln</th><th>Simpanan sukarela</th><th>Pinjaman awal</th><th>Sisa pinjaman</th><th>Catatan</th></tr></thead><tbody>{excelPreview.map((r) => <tr key={r.previewId} className={r.duplicate ? 'duplicate' : ''}><td><strong>{r.name}</strong><small className="cell-note">{r.duplicate ? 'Duplikat — dilewati' : r.memberNo || 'Nomor otomatis'}</small></td><td>{fmt(r.monthlyMandatory)}</td><td>{fmt(r.voluntaryBalance)}</td><td>{fmt(r.loanPrincipal)}</td><td>{fmt(r.remainingBalance)}</td><td>{[...(r.warnings || []), ...(r.duplicate ? ['Nama/nomor sudah ada.'] : [])].join(' ') || '—'}</td></tr>)}</tbody></table></div><button className="primary-btn" disabled={busy} onClick={importExcel}>{busy ? 'Mengimpor...' : 'Konfirmasi impor anggota baru'}</button></>}{importReport && <div className="import-report"><strong>Hasil impor</strong><p>{importReport.imported} anggota ditambahkan · {importReport.loans} pinjaman · {importReport.skipped.length} duplikat dilewati · {importReport.failures.length} gagal.</p>{importReport.skipped.length > 0 && <p>Dilewati: {importReport.skipped.join(', ')}</p>}{importReport.failures.map((f) => <p key={f} className="danger-text">{f}</p>)}</div>}</section>}

      {isAdmin && activeMenu === 'Input Transaksi' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Input transaksi</h2><p className="muted">Untuk angsuran, masukkan total pembayaran dan porsi yang benar-benar mengurangi pokok secara terpisah.</p></div></div><form className="form-grid" onSubmit={saveTransaction}><label>Anggota<select required value={txForm.memberId} onChange={(e) => setTxForm({ ...txForm, memberId: e.target.value, loanId: '' })}><option value="">Pilih anggota</option>{members.map((m) => <option key={m.id} value={m.id}>{m.memberNo} — {m.name}</option>)}</select></label><label>Jenis transaksi<select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}><option value="simpanan_wajib">Setoran simpanan wajib</option><option value="simpanan_sukarela">Setoran simpanan sukarela</option><option value="penarikan_sukarela">Penarikan simpanan sukarela</option><option value="angsuran_pinjaman">Pembayaran angsuran pinjaman</option></select></label><label>Nominal transaksi (Rp)<input required min="1" type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}/></label><label>Tanggal transaksi<input required type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}/></label>{txForm.type === 'angsuran_pinjaman' && <><label>Pinjaman<select required value={txForm.loanId} onChange={(e) => setTxForm({ ...txForm, loanId: e.target.value })}><option value="">Pilih pinjaman</option>{loans.filter((l) => l.memberId === txForm.memberId && l.status !== 'Lunas').map((l) => <option key={l.id} value={l.id}>{l.loanType} — sisa {fmt(l.remainingBalance)}</option>)}</select></label><label>Porsi pengurang pokok (Rp)<input required min="0" type="number" value={txForm.principalPaid} onChange={(e) => setTxForm({ ...txForm, principalPaid: e.target.value })}/><small>Tidak otomatis sama dengan total cicilan.</small></label></>}<label className="span-two">Catatan<textarea rows="2" value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} placeholder="Contoh: setoran bulan Oktober"/></label><div className="form-actions"><button className="primary-btn" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan transaksi'}</button></div></form></section>}

      {isAdmin && activeMenu === 'Pinjaman' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Data pinjaman</h2><p className="muted">Saldo sisa yang kosong harus diverifikasi dari pembukuan resmi.</p></div></div><div className="table-scroll"><table><thead><tr><th>Anggota</th><th>Jenis</th><th>Pinjaman awal</th><th>Sisa pinjaman</th><th>Cicilan/bln</th><th>Status</th><th>Perbarui sisa</th></tr></thead><tbody>{loans.map((l) => <LoanTableRow key={l.id} loan={l} memberName={nameFor(l.memberId)} onSave={saveLoanBalance} />)}{!loans.length && <tr><td colSpan="7" className="empty">Belum ada pinjaman.</td></tr>}</tbody></table></div><div className="section-title-row subsection"><div><h3>Catat pinjaman baru</h3><p className="muted">Pencairan pinjaman akan tercatat dalam riwayat transaksi.</p></div></div><form className="form-grid" onSubmit={createLoan}><label>Anggota<select required value={loanForm.memberId} onChange={(e) => setLoanForm({ ...loanForm, memberId: e.target.value })}><option value="">Pilih anggota</option>{members.map((m) => <option key={m.id} value={m.id}>{m.memberNo} — {m.name}</option>)}</select></label><label>Pinjaman awal (Rp)<input required min="1" type="number" value={loanForm.principal} onChange={(e) => setLoanForm({ ...loanForm, principal: e.target.value, remainingBalance: e.target.value })}/></label><label>Sisa pinjaman (Rp)<input required min="0" type="number" value={loanForm.remainingBalance} onChange={(e) => setLoanForm({ ...loanForm, remainingBalance: e.target.value })}/></label><label>Tenor (bulan)<input type="number" min="1" value={loanForm.termMonths} onChange={(e) => setLoanForm({ ...loanForm, termMonths: e.target.value })}/></label><label>Cicilan per bulan (Rp)<input type="number" min="0" value={loanForm.monthlyInstallment} onChange={(e) => setLoanForm({ ...loanForm, monthlyInstallment: e.target.value })}/></label><label>Jenis pinjaman<input value={loanForm.loanType} onChange={(e) => setLoanForm({ ...loanForm, loanType: e.target.value })}/></label><label>Jaminan<input value={loanForm.collateral} onChange={(e) => setLoanForm({ ...loanForm, collateral: e.target.value })}/></label><label>Tanggal pencairan<input type="date" value={loanForm.startDate} onChange={(e) => setLoanForm({ ...loanForm, startDate: e.target.value })}/></label><div className="form-actions"><button className="primary-btn" disabled={busy}>＋ Catat pinjaman</button></div></form></section>}

      {isAdmin && activeMenu === 'SHU Tahunan' && <section className="panel section-panel"><div className="section-title-row"><div><h2>Input hasil pembagian SHU</h2><p className="muted">Admin memasukkan nilai yang sudah ditetapkan koperasi; sistem tidak menghitung pembagian otomatis.</p></div></div><form className="form-grid" onSubmit={saveShu}><label>Anggota<select required value={shuForm.memberId} onChange={(e) => setShuForm({ ...shuForm, memberId: e.target.value })}><option value="">Pilih anggota</option>{members.map((m) => <option key={m.id} value={m.id}>{m.memberNo} — {m.name}</option>)}</select></label><label>Tahun buku<input required type="number" min="2000" max="2100" value={shuForm.year} onChange={(e) => setShuForm({ ...shuForm, year: e.target.value })}/></label><label>Nominal SHU (Rp)<input required min="0" type="number" value={shuForm.amount} onChange={(e) => setShuForm({ ...shuForm, amount: e.target.value })}/></label><label>Status<select value={shuForm.status} onChange={(e) => setShuForm({ ...shuForm, status: e.target.value, paidAt: e.target.value === 'Sudah dibayar' ? (shuForm.paidAt || today()) : ''})}><option>Belum dibayar</option><option>Sudah dibayar</option></select></label>{shuForm.status === 'Sudah dibayar' && <label>Tanggal pembayaran<input type="date" value={shuForm.paidAt} onChange={(e) => setShuForm({ ...shuForm, paidAt: e.target.value })}/></label>}<label className="span-two">Catatan<textarea rows="2" value={shuForm.notes} onChange={(e) => setShuForm({ ...shuForm, notes: e.target.value })}/></label><div className="form-actions"><button className="primary-btn" disabled={busy}>Simpan hasil SHU</button></div></form><div className="table-scroll"><table><thead><tr><th>Anggota</th><th>Tahun</th><th>Nominal</th><th>Status</th><th>Tanggal bayar</th><th>Aksi</th></tr></thead><tbody>{shuRecords.map((s) => <tr key={s.id}><td>{nameFor(s.memberId)}</td><td>{s.year}</td><td>{fmt(s.amount)}</td><td><span className={`status ${s.status === 'Sudah dibayar' ? 'success-status' : 'pending-status'}`}>{s.status}</span></td><td>{s.paidAt || '—'}</td><td><button className="text-btn" type="button" onClick={() => toggleShu(s)}>{s.status === 'Sudah dibayar' ? 'Tandai belum dibayar' : 'Tandai dibayar'}</button></td></tr>)}{!shuRecords.length && <tr><td colSpan="6" className="empty">Belum ada data SHU.</td></tr>}</tbody></table></div></section>}

      {isAdmin && activeMenu === 'Riwayat Transaksi' && <section className="panel section-panel"><h2>Riwayat transaksi koperasi</h2><p className="muted">Transaksi dicatat tanpa menghapus riwayat sebelumnya.</p><TxTable rows={recentTx} members={members}/></section>}

      {!isAdmin && activeMenu === 'Dashboard' && activeMember && <><section className="member-balance"><div className="balance-label">Total simpanan yang diketahui</div><div className="balance-number">{hideBalances ? 'Rp •••••••' : totalSavings == null ? `${fmt(activeMember.voluntaryBalance)} + saldo wajib belum diverifikasi` : fmt(totalSavings)}</div><div className="member-balance-bottom"><div>Nomor anggota<br/><strong>{activeMember.memberNo}</strong></div><button className="balance-button" onClick={() => setHideBalances((v) => !v)}>{hideBalances ? 'Tampilkan saldo' : 'Sembunyikan saldo'}</button></div></section><section className="stats-grid member-stats"><Stat icon="↗" label="Iuran wajib per bulan" value={fmt(activeMember.monthlyMandatory)} hint={activeMember.mandatoryBalance == null ? 'Saldo akumulasi belum diinput' : `Saldo wajib: ${fmt(activeMember.mandatoryBalance)}`}/><Stat icon="◈" label="Simpanan sukarela" value={hideBalances ? 'Rp •••••••' : fmt(activeMember.voluntaryBalance)} hint="Saldo berdasarkan data yang tercatat"/><Stat icon="▤" label="Sisa pinjaman" value={hideBalances ? 'Rp •••••••' : unresolvedLoans ? 'Perlu verifikasi' : fmt(memberLoans.reduce((a, l) => a + Number(l.remainingBalance || 0), 0))} hint={`${memberLoans.length} pinjaman terdaftar`}/></section><section className="content-grid"><div className="panel"><div className="section-title-row"><div><h2>Transaksi terakhir</h2><p className="muted">Riwayat akun anggota.</p></div><button className="text-btn" onClick={() => navigate('Riwayat Transaksi')}>Lihat semua →</button></div><TxTable rows={memberTransactions.slice(0, 5)} members={members}/></div><div className="panel"><h2>SHU tahunan</h2><p className="muted">Hasil yang sudah diinput Admin.</p>{memberShu.length ? memberShu.slice(0, 3).map((s) => <div className="shu-list-item" key={s.id}><div><strong>SHU {s.year}</strong><small>{s.status}{s.paidAt ? ` · ${s.paidAt}` : ''}</small></div><b>{fmt(s.amount)}</b></div>) : <div className="empty-state">Belum ada pembagian SHU.</div>}</div></section></>}
      {!isAdmin && activeMenu === 'Riwayat Transaksi' && <section className="panel section-panel"><h2>Riwayat transaksi saya</h2><p className="muted">Hanya transaksi milik akun anggota ini.</p><TxTable rows={memberTransactions} members={members}/></section>}
      {!isAdmin && activeMenu === 'Simpanan Saya' && activeMember && <section className="panel section-panel"><h2>Rincian simpanan saya</h2><section className="stats-grid member-stats"><Stat icon="↗" label="Iuran wajib per bulan" value={fmt(activeMember.monthlyMandatory)} hint="Besaran iuran, bukan saldo akumulasi."/><Stat icon="▦" label="Saldo simpanan wajib" value={fmt(activeMember.mandatoryBalance)} hint={activeMember.mandatoryBalance == null ? 'Perlu verifikasi dari pembukuan.' : 'Saldo tercatat.'}/><Stat icon="◈" label="Saldo simpanan sukarela" value={hideBalances ? 'Rp •••••••' : fmt(activeMember.voluntaryBalance)} hint="Berubah melalui transaksi yang sah."/></section><TxTable rows={memberTransactions.filter((t) => ['simpanan_wajib', 'simpanan_sukarela', 'penarikan_sukarela'].includes(t.type))} members={members}/></section>}
      {!isAdmin && activeMenu === 'Pinjaman Saya' && activeMember && <section className="panel section-panel"><h2>Pinjaman saya</h2><div className="table-scroll"><table><thead><tr><th>Jenis</th><th>Pinjaman awal</th><th>Sisa pinjaman</th><th>Tenor</th><th>Cicilan/bln</th><th>Status</th></tr></thead><tbody>{memberLoans.map((l) => <tr key={l.id}><td>{l.loanType}</td><td>{fmt(l.principal)}</td><td>{fmt(l.remainingBalance)}</td><td>{l.termMonths} bulan</td><td>{fmt(l.monthlyInstallment)}</td><td>{l.remainingBalance == null ? 'Perlu verifikasi' : l.status}</td></tr>)}{!memberLoans.length && <tr><td colSpan="6" className="empty">Tidak ada pinjaman.</td></tr>}</tbody></table></div></section>}
      {!isAdmin && activeMenu === 'SHU Saya' && activeMember && <section className="panel section-panel"><h2>SHU saya</h2><p className="muted">Nominal berasal dari input Admin sesuai keputusan koperasi.</p><div className="table-scroll"><table><thead><tr><th>Tahun buku</th><th>Nominal</th><th>Status</th><th>Tanggal bayar</th></tr></thead><tbody>{memberShu.map((s) => <tr key={s.id}><td>{s.year}</td><td>{fmt(s.amount)}</td><td>{s.status}</td><td>{s.paidAt || '—'}</td></tr>)}{!memberShu.length && <tr><td colSpan="4" className="empty">Belum ada SHU yang dicatat.</td></tr>}</tbody></table></div></section>}
      {!isAdmin && activeMenu === 'Profil Anggota' && activeMember && <section className="panel profile-panel"><div className="profile-large"><div className="avatar large">{activeMember.name?.[0] || 'A'}</div><div><h2>{activeMember.name}</h2><p className="muted">Nomor anggota {activeMember.memberNo}</p></div></div><div className="profile-details"><div><span>Status</span><strong>{activeMember.status}</strong></div><div><span>Iuran wajib/bulan</span><strong>{fmt(activeMember.monthlyMandatory)}</strong></div><div><span>Nomor HP</span><strong>{activeMember.phone || 'Belum dicatat'}</strong></div></div></section>}
      <footer className="app-footer">© {new Date().getFullYear()} Koperasi B4T · {isSupabaseConfigured ? 'Database online' : 'Prototipe demo lokal'}</footer>
    </main>
  </div>;
}

function MemberEditRow({ member, onSave }) {
  const [values, setValues] = useState({ monthlyMandatory: String(member.monthlyMandatory ?? 0), mandatoryBalance: member.mandatoryBalance == null ? '' : String(member.mandatoryBalance), voluntaryBalance: String(member.voluntaryBalance ?? 0), status: member.status || 'Aktif' });
  useEffect(() => setValues({ monthlyMandatory: String(member.monthlyMandatory ?? 0), mandatoryBalance: member.mandatoryBalance == null ? '' : String(member.mandatoryBalance), voluntaryBalance: String(member.voluntaryBalance ?? 0), status: member.status || 'Aktif' }), [member]);
  return <tr><td>{member.memberNo}</td><td><strong>{member.name}</strong></td><td><input className="table-input" aria-label={`Iuran bulanan ${member.name}`} type="number" min="0" value={values.monthlyMandatory} onChange={(e) => setValues({ ...values, monthlyMandatory: e.target.value })}/></td><td><input className="table-input" aria-label={`Saldo wajib ${member.name}`} type="number" min="0" placeholder="Belum diinput" value={values.mandatoryBalance} onChange={(e) => setValues({ ...values, mandatoryBalance: e.target.value })}/></td><td><input className="table-input" aria-label={`Saldo sukarela ${member.name}`} type="number" min="0" value={values.voluntaryBalance} onChange={(e) => setValues({ ...values, voluntaryBalance: e.target.value })}/></td><td><select className="table-select" value={values.status} onChange={(e) => setValues({ ...values, status: e.target.value })}><option>Aktif</option><option>Nonaktif</option></select></td><td><button className="small-btn" onClick={() => onSave(member.id, values)}>Simpan</button></td></tr>;
}

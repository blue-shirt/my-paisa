'use strict';

// My Paisa: a standalone personal money dashboard.
// No dependencies. Runs on Node.js 18+. Data lives in data/paisa.json.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1'; // only this computer can reach the app
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'paisa.json');
const INDEX_FILE = path.join(__dirname, 'public', 'index.html');
const COOKIE = 'paisa_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

// type: 'in' = income, 'out' = spending (budgetable), 'emi' = loan payment, 'invest' = savings/investments
const CATEGORIES = {
  other_income:  { label: 'Other income',     type: 'in' },
  rent:          { label: 'Rent',             type: 'out' },
  food:          { label: 'Food',             type: 'out' },
  transport:     { label: 'Transport',        type: 'out' },
  utilities:     { label: 'Utilities',        type: 'out' },
  shopping:      { label: 'Shopping',         type: 'out' },
  entertainment: { label: 'Entertainment',    type: 'out' },
  health:        { label: 'Health',           type: 'out' },
  other:         { label: 'Other',            type: 'out' },
  emi:           { label: 'Loan EMI',         type: 'emi' },
  sip:           { label: 'SIP / Investment', type: 'invest' },
  fixed_deposit: { label: 'Fixed deposit',    type: 'invest' },
};

const EMPTY = () => ({
  auth: null,
  settings: { salary: 0, emi: 0, loanOriginal: 0, loanPaid: 0, loanRate: 0 },
  transactions: [],
  budgets: {},
  goals: [],
});

// ── Storage ────────────────────────────────────────────────────────
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return EMPTY();
  // A corrupt file throws here, so the app refuses to start instead of overwriting it.
  return { ...EMPTY(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
}

function saveData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE); // replace the file in one step
}

let db = loadData();

// ── Validation ─────────────────────────────────────────────────────
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const text = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function amount(v, max = 1e12) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function cleanTx(t) {
  const amt = amount(t.amt);
  if (!isDate(t.date) || !CATEGORIES[t.cat] || !(amt > 0)) return null;
  return {
    id: String(t.id || crypto.randomUUID()),
    date: t.date,
    desc: text(t.desc),
    cat: t.cat,
    amt,
  };
}

const SETTING_KEYS = ['salary', 'emi', 'loanOriginal', 'loanPaid', 'loanRate'];
function cleanSettings(src, base) {
  const out = { ...base };
  for (const k of SETTING_KEYS) {
    if (src[k] === undefined) continue;
    const n = amount(src[k], k === 'loanRate' ? 100 : 1e12);
    if (n === null) return null;
    out[k] = n;
  }
  return out;
}

function cleanBudgets(src) {
  const out = {};
  for (const [cat, value] of Object.entries(src || {})) {
    if (!CATEGORIES[cat] || CATEGORIES[cat].type !== 'out') continue;
    const n = amount(value);
    if (n === null) return null;
    if (n > 0) out[cat] = n;
  }
  return out;
}

function cleanGoal(g) {
  const target = amount(g.target);
  const saved = amount(g.saved ?? 0);
  const name = text(g.name, 80);
  if (!name || !(target > 0) || saved === null) return null;
  return {
    id: String(g.id || crypto.randomUUID()),
    name,
    target,
    saved,
    note: text(g.note, 120),
    icon: text(g.icon, 4) || '🎯',
  };
}

// ── Password and sessions ──────────────────────────────────────────
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function checkPassword(pw, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(pw ?? ''), Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sessions = new Map(); // token -> expiry timestamp

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map(c => c.trim())
      .filter(c => c.includes('='))
      .map(c => {
        const i = c.indexOf('=');
        return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
      })
  );
}

function isSignedIn(req) {
  const token = cookies(req)[COOKIE];
  const expires = token ? sessions.get(token) : undefined;
  if (!expires) return false;
  if (expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function startSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`);
}

// ── HTTP helpers ───────────────────────────────────────────────────
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 20e6) {
        reject(httpError(413, 'Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(httpError(400, 'Invalid request body'));
      }
    });
    req.on('error', reject);
  });
}

// What the browser is allowed to see: everything except the password hash.
function publicView() {
  const { auth, ...rest } = db;
  return { ...rest, categories: CATEGORIES };
}

// ── API ────────────────────────────────────────────────────────────
async function handleApi(req, res, pathname) {
  const method = req.method;
  const ok = (body = { ok: true }) => send(res, 200, body);

  if (pathname === '/api/status' && method === 'GET') {
    return send(res, 200, { setup: !db.auth, signedIn: isSignedIn(req) });
  }

  if (pathname === '/api/setup' && method === 'POST') {
    if (db.auth) return send(res, 409, { error: 'A password is already set' });
    const { password } = await readBody(req);
    if (typeof password !== 'string' || password.length < 8) {
      return send(res, 400, { error: 'Use at least 8 characters' });
    }
    db.auth = hashPassword(password);
    saveData();
    startSession(res);
    return ok();
  }

  if (pathname === '/api/login' && method === 'POST') {
    const { password } = await readBody(req);
    if (!db.auth || !checkPassword(password, db.auth)) {
      await new Promise(r => setTimeout(r, 500)); // slow down guessing
      return send(res, 401, { error: 'Wrong password' });
    }
    startSession(res);
    return ok();
  }

  if (pathname === '/api/logout' && method === 'POST') {
    sessions.delete(cookies(req)[COOKIE]);
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return ok();
  }

  // Everything below requires a signed-in session.
  if (!isSignedIn(req)) return send(res, 401, { error: 'Please sign in' });

  if (pathname === '/api/data' && method === 'GET') {
    return send(res, 200, publicView());
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    const next = cleanSettings(await readBody(req), db.settings);
    if (!next) return send(res, 400, { error: 'Enter valid numbers (loan rate between 0 and 100)' });
    db.settings = next;
    saveData();
    return ok(next);
  }

  if (pathname === '/api/transactions' && method === 'POST') {
    const body = await readBody(req);
    const tx = cleanTx(body);
    // Loan payments go through /api/loan/payment so the loan balance stays correct.
    if (!tx || tx.cat === 'emi' || !tx.desc) {
      return send(res, 400, { error: 'Fill in a description, a valid amount, a category and a date' });
    }
    db.transactions.push(tx);
    saveData();
    return send(res, 201, tx);
  }

  const txMatch = pathname.match(/^\/api\/transactions\/([\w-]+)$/);
  if (txMatch && method === 'DELETE') {
    db.transactions = db.transactions.filter(t => t.id !== txMatch[1]);
    saveData();
    return ok();
  }

  if (pathname === '/api/loan/payment' && method === 'POST') {
    const body = await readBody(req);
    const amt = amount(body.amount);
    if (!(amt > 0) || !isDate(body.date)) {
      return send(res, 400, { error: 'Enter an amount and a date' });
    }
    db.settings.loanPaid += amt;
    db.transactions.push({ id: crypto.randomUUID(), date: body.date, desc: 'Loan EMI payment', cat: 'emi', amt });
    saveData();
    return ok(db.settings);
  }

  if (pathname === '/api/budgets' && method === 'PUT') {
    const budgets = cleanBudgets(await readBody(req));
    if (!budgets) return send(res, 400, { error: 'Enter valid budget amounts' });
    db.budgets = budgets;
    saveData();
    return ok(budgets);
  }

  if (pathname === '/api/goals' && method === 'POST') {
    const goal = cleanGoal(await readBody(req));
    if (!goal) return send(res, 400, { error: 'Enter a name and a target above zero' });
    db.goals.push(goal);
    saveData();
    return send(res, 201, goal);
  }

  const goalMatch = pathname.match(/^\/api\/goals\/([\w-]+)$/);
  if (goalMatch && method === 'PUT') {
    const goal = db.goals.find(g => g.id === goalMatch[1]);
    if (!goal) return send(res, 404, { error: 'Goal not found' });
    const saved = amount((await readBody(req)).saved);
    if (saved === null) return send(res, 400, { error: 'Enter a valid amount' });
    goal.saved = saved;
    saveData();
    return ok(goal);
  }
  if (goalMatch && method === 'DELETE') {
    db.goals = db.goals.filter(g => g.id !== goalMatch[1]);
    saveData();
    return ok();
  }

  if (pathname === '/api/export' && method === 'GET') {
    const stamp = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="my-paisa-${stamp}.json"`,
      'Cache-Control': 'no-store',
    });
    return res.end(JSON.stringify(publicView(), null, 2));
  }

  if (pathname === '/api/import' && method === 'POST') {
    const src = (await readBody(req)).data;
    if (!src || !Array.isArray(src.transactions)) {
      return send(res, 400, { error: 'This is not a My Paisa backup file' });
    }
    const settings = cleanSettings(src.settings || {}, EMPTY().settings);
    const budgets = cleanBudgets(src.budgets);
    if (!settings || !budgets) return send(res, 400, { error: 'The backup contains invalid values' });
    db = {
      ...db,
      settings,
      budgets,
      transactions: src.transactions.map(cleanTx).filter(Boolean),
      goals: (Array.isArray(src.goals) ? src.goals : []).map(cleanGoal).filter(Boolean),
    };
    saveData();
    return ok();
  }

  return send(res, 404, { error: 'Not found' });
}

// ── Server ─────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return fs.createReadStream(INDEX_FILE).pipe(res);
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    if (res.headersSent) return;
    if (err.status) {
      send(res, err.status, { error: err.message });
    } else {
      console.error(err);
      send(res, 500, { error: 'Something went wrong. Check the terminal for details.' });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`My Paisa is running at http://127.0.0.1:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
  console.log('Press Ctrl+C in this window to stop.');
});

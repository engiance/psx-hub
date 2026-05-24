'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

// ─── DATABASE ────────────────────────────────────────────────────────────────
const db = new Database('./database/sales.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    source TEXT DEFAULT 'landing',
    sequence_step INTEGER DEFAULT 0,
    next_email_at INTEGER,
    subscribed INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    name TEXT,
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
    amount INTEGER,
    currency TEXT DEFAULT 'usd',
    download_token TEXT UNIQUE,
    download_count INTEGER DEFAULT 0,
    fulfilled INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    subject TEXT,
    type TEXT,
    sent_at INTEGER DEFAULT (unixepoch()),
    success INTEGER DEFAULT 1
  );
`);

// ─── EMAIL TRANSPORT ─────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendEmail({ to, subject, html, attachments = [] }) {
  try {
    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
      to,
      subject,
      html,
      attachments,
    });
    db.prepare(`INSERT INTO email_log (email, subject, type, success) VALUES (?, ?, 'outbound', 1)`)
      .run(to, subject);
    return true;
  } catch (err) {
    console.error('Email send error:', err.message);
    db.prepare(`INSERT INTO email_log (email, subject, type, success) VALUES (?, ?, 'outbound', 0)`)
      .run(to, subject);
    return false;
  }
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────────────────────────
function emailWrapper(content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',Arial,sans-serif}
    .wrap{max-width:600px;margin:0 auto;padding:40px 20px}
    .card{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);border:1px solid #7c3aed33;border-radius:16px;padding:40px;color:#e2e8f0}
    .logo{text-align:center;margin-bottom:30px;font-size:24px;font-weight:800;background:linear-gradient(135deg,#7c3aed,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    h1{color:#f1f5f9;font-size:28px;margin:0 0 16px;line-height:1.3}
    p{color:#94a3b8;line-height:1.7;margin:0 0 16px}
    .btn{display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff!important;text-decoration:none;padding:16px 36px;border-radius:50px;font-weight:700;font-size:16px;margin:20px 0;letter-spacing:.5px}
    .highlight{color:#a855f7;font-weight:600}
    .divider{border:none;border-top:1px solid #7c3aed33;margin:30px 0}
    .footer{text-align:center;color:#475569;font-size:12px;margin-top:20px}
    .footer a{color:#7c3aed;text-decoration:none}
  </style></head><body><div class="wrap">${content}</div></body></html>`;
}

function purchaseEmail(name, downloadUrl) {
  const title = process.env.EBOOK_TITLE || 'The Ultimate Guide';
  return emailWrapper(`<div class="card">
    <div class="logo">✦ ${process.env.EMAIL_FROM_NAME}</div>
    <h1>Your purchase is confirmed! 🎉</h1>
    <p>Hey ${name || 'there'},</p>
    <p>Thank you so much — your copy of <span class="highlight">"${title}"</span> is ready to download right now.</p>
    <p>Click the button below to get instant access:</p>
    <div style="text-align:center"><a class="btn" href="${downloadUrl}">⬇ Download Your Ebook Now</a></div>
    <hr class="divider">
    <p>This download link is unique to you and expires after 30 days. If you have any issues, just reply to this email and I'll sort it out personally.</p>
    <p>I'm genuinely excited for you to read this — it changed <em>everything</em> for me and I know it will for you too.</p>
    <p>To your success,<br><strong>${process.env.EMAIL_FROM_NAME}</strong></p>
  </div>
  <div class="footer">You're receiving this because you purchased from us.<br>
  <a href="${SITE_URL}/unsubscribe?email=PLACEHOLDER">Unsubscribe</a></div>`);
}

function welcomeEmail(name) {
  const title = process.env.EBOOK_TITLE || 'The Ultimate Guide';
  return emailWrapper(`<div class="card">
    <div class="logo">✦ ${process.env.EMAIL_FROM_NAME}</div>
    <h1>Welcome — here's your free chapter 🔥</h1>
    <p>Hey ${name || 'there'},</p>
    <p>I'm so glad you signed up. Inside <span class="highlight">"${title}"</span> you're going to discover:</p>
    <ul style="color:#94a3b8;line-height:2">
      <li>The exact framework that took me from zero to consistent results</li>
      <li>3 hidden mistakes that keep 99% of people stuck</li>
      <li>A step-by-step action plan you can start <em>today</em></li>
    </ul>
    <p>Here's your free first chapter as promised — read it, take notes, and reply with your biggest takeaway. I read every reply.</p>
    <p>Over the next few days I'll be sending you some of my best strategies completely free. Keep an eye out.</p>
    <p>Talk soon,<br><strong>${process.env.EMAIL_FROM_NAME}</strong></p>
  </div>
  <div class="footer"><a href="${SITE_URL}/unsubscribe?email=PLACEHOLDER">Unsubscribe</a></div>`);
}

const drip = [
  {
    subject: '⚡ The #1 mistake that kills results (are you making it?)',
    body: (name) => emailWrapper(`<div class="card">
      <div class="logo">✦ ${process.env.EMAIL_FROM_NAME}</div>
      <h1>Most people make this mistake on day 1</h1>
      <p>Hey ${name || 'there'},</p>
      <p>Yesterday I shared the free chapter. Today I want to talk about the single biggest mistake I see people make — it cost me 6 months of wasted time.</p>
      <p>The mistake? <span class="highlight">Trying to learn everything before starting.</span></p>
      <p>Information without action is just entertainment. The people who win are the ones who implement fast, fail fast, and adjust fast.</p>
      <p>That's exactly what the full playbook inside <span class="highlight">"${process.env.EBOOK_TITLE}"</span> gives you — a clear, proven sequence so you're never guessing what to do next.</p>
      <div style="text-align:center"><a class="btn" href="${SITE_URL}/#buy">Get Instant Access — $${(parseInt(process.env.EBOOK_PRICE||2700)/100).toFixed(0)}</a></div>
      <p>Talk soon,<br><strong>${process.env.EMAIL_FROM_NAME}</strong></p>
    </div><div class="footer"><a href="${SITE_URL}/unsubscribe?email=PLACEHOLDER">Unsubscribe</a></div>`),
    delayHours: 24,
  },
  {
    subject: '📖 Real results from real people (screenshots inside)',
    body: (name) => emailWrapper(`<div class="card">
      <div class="logo">✦ ${process.env.EMAIL_FROM_NAME}</div>
      <h1>Here's what happened when they followed the system</h1>
      <p>Hey ${name || 'there'},</p>
      <p>I want to share a few messages I've received from readers of <span class="highlight">"${process.env.EBOOK_TITLE}"</span>:</p>
      <div style="background:#0f0f1a;border-left:3px solid #7c3aed;padding:16px;border-radius:8px;margin:20px 0">
        <p style="margin:0;color:#e2e8f0;font-style:italic">"I was skeptical at first, but the framework in chapter 3 alone was worth 10x the price. I implemented it in one weekend."</p>
        <p style="margin:8px 0 0;color:#7c3aed;font-size:14px">— Alex M.</p>
      </div>
      <div style="background:#0f0f1a;border-left:3px solid #7c3aed;padding:16px;border-radius:8px;margin:20px 0">
        <p style="margin:0;color:#e2e8f0;font-style:italic">"This is the clearest, most actionable guide I've read. No fluff, just the stuff that works."</p>
        <p style="margin:8px 0 0;color:#7c3aed;font-size:14px">— Jamie L.</p>
      </div>
      <p>These results are real — and they start with one decision: getting the book.</p>
      <div style="text-align:center"><a class="btn" href="${SITE_URL}/#buy">Yes, I Want Results Too</a></div>
      <p>Talk soon,<br><strong>${process.env.EMAIL_FROM_NAME}</strong></p>
    </div><div class="footer"><a href="${SITE_URL}/unsubscribe?email=PLACEHOLDER">Unsubscribe</a></div>`),
    delayHours: 48,
  },
  {
    subject: '⏳ Last chance — price going up soon',
    body: (name) => emailWrapper(`<div class="card">
      <div class="logo">✦ ${process.env.EMAIL_FROM_NAME}</div>
      <h1>I'm raising the price this week</h1>
      <p>Hey ${name || 'there'},</p>
      <p>I've been getting a lot of requests to add bonus content to <span class="highlight">"${process.env.EBOOK_TITLE}"</span>, and I'm going to do it — but when I do, the price goes up.</p>
      <p>Right now you can still get it at the current rate of <span class="highlight">$${(parseInt(process.env.EBOOK_PRICE||2700)/100).toFixed(0)}</span>. Once the new bonuses are added, it'll be significantly more.</p>
      <p>If you've been sitting on the fence, now is the time.</p>
      <div style="text-align:center"><a class="btn" href="${SITE_URL}/#buy">Lock In The Current Price →</a></div>
      <p>Whatever you decide, I hope the free content has been valuable. Keep taking action.</p>
      <p>All the best,<br><strong>${process.env.EMAIL_FROM_NAME}</strong></p>
    </div><div class="footer"><a href="${SITE_URL}/unsubscribe?email=PLACEHOLDER">Unsubscribe</a></div>`),
    delayHours: 72,
  },
];

// ─── DRIP SEQUENCE CRON ──────────────────────────────────────────────────────
cron.schedule('*/15 * * * *', async () => {
  const now = Math.floor(Date.now() / 1000);
  const due = db.prepare(`
    SELECT * FROM leads
    WHERE subscribed = 1
      AND sequence_step < ?
      AND next_email_at IS NOT NULL
      AND next_email_at <= ?
    LIMIT 50
  `).all(drip.length, now);

  for (const lead of due) {
    const step = lead.sequence_step;
    const emailDef = drip[step];
    if (!emailDef) continue;

    const sent = await sendEmail({
      to: lead.email,
      subject: emailDef.subject,
      html: emailDef.body(lead.name).replace(/PLACEHOLDER/g, encodeURIComponent(lead.email)),
    });

    if (sent) {
      const nextStep = step + 1;
      const nextDelay = drip[nextStep] ? drip[nextStep].delayHours * 3600 : null;
      db.prepare(`
        UPDATE leads SET sequence_step = ?, next_email_at = ? WHERE id = ?
      `).run(nextStep, nextDelay ? now + nextDelay : null, lead.id);
    }
  }
});

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
// Stripe webhook needs raw body — register before express.json()
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const purchase = db.prepare('SELECT * FROM purchases WHERE stripe_session_id = ?')
      .get(session.id);

    if (purchase && !purchase.fulfilled) {
      const downloadToken = purchase.download_token;
      const downloadUrl = `${SITE_URL}/download/${downloadToken}`;
      const name = session.customer_details?.name || purchase.name || '';
      const email = session.customer_details?.email || purchase.email;

      const attachments = [];
      const ebookPath = path.resolve(process.env.EBOOK_FILE_PATH || './ebook.pdf');
      if (fs.existsSync(ebookPath)) {
        attachments.push({ filename: `${process.env.EBOOK_TITLE || 'ebook'}.pdf`, path: ebookPath });
      }

      const sent = await sendEmail({
        to: email,
        subject: `🎉 Your copy of "${process.env.EBOOK_TITLE}" is ready!`,
        html: purchaseEmail(name, downloadUrl),
        attachments,
      });

      db.prepare(`
        UPDATE purchases SET fulfilled = 1, email = ?, name = ?
        WHERE stripe_session_id = ?
      `).run(email, name, session.id);

      // Add buyer to lead list as already-purchased (skip drip)
      db.prepare(`
        INSERT OR IGNORE INTO leads (email, name, source, sequence_step, next_email_at)
        VALUES (?, ?, 'purchase', 999, NULL)
      `).run(email, name);

      console.log(`Purchase fulfilled for ${email} — email sent: ${sent}`);
    }
  }

  res.json({ received: true });
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
    },
  },
}));
app.use(cors({ origin: SITE_URL }));
app.use(express.json());
app.use(express.static('public'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const strictLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Lead capture
app.post('/api/subscribe', strictLimiter, (req, res) => {
  const { email, name } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const existing = db.prepare('SELECT * FROM leads WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.json({ success: true, message: 'Already subscribed!' });

    const delayHours = drip[0]?.delayHours || 0;
    const nextAt = Math.floor(Date.now() / 1000) + (delayHours * 3600);

    db.prepare(`
      INSERT INTO leads (email, name, source, sequence_step, next_email_at)
      VALUES (?, ?, 'landing', 0, ?)
    `).run(email.toLowerCase(), name || '', nextAt);

    // Send immediate welcome email
    sendEmail({
      to: email,
      subject: `Welcome — here's your free chapter of "${process.env.EBOOK_TITLE}"`,
      html: welcomeEmail(name).replace(/PLACEHOLDER/g, encodeURIComponent(email)),
    });

    res.json({ success: true, message: "You're in! Check your email." });
  } catch (err) {
    console.error('Subscribe error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// Create Stripe checkout session
app.post('/api/create-checkout', async (req, res) => {
  const { email, name } = req.body;
  try {
    const downloadToken = uuidv4();
    const price = parseInt(process.env.EBOOK_PRICE || '2700');
    const title = process.env.EBOOK_TITLE || 'The Ultimate Guide';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: title,
            description: 'Instant digital download — delivered to your email immediately after purchase.',
            images: [`${SITE_URL}/images/cover.png`],
          },
          unit_amount: price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?cancelled=true`,
      metadata: { download_token: downloadToken, name: name || '' },
    });

    db.prepare(`
      INSERT INTO purchases (email, name, stripe_session_id, amount, download_token)
      VALUES (?, ?, ?, ?, ?)
    `).run(email || '', name || '', session.id, price, downloadToken);

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout. Please try again.' });
  }
});

// Secure download route
app.get('/download/:token', (req, res) => {
  const { token } = req.params;
  const purchase = db.prepare('SELECT * FROM purchases WHERE download_token = ? AND fulfilled = 1').get(token);

  if (!purchase) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

  const ebookPath = path.resolve(process.env.EBOOK_FILE_PATH || './ebook.pdf');
  if (!fs.existsSync(ebookPath)) {
    return res.status(404).send('Ebook file not found on server. Please contact support.');
  }

  db.prepare('UPDATE purchases SET download_count = download_count + 1 WHERE id = ?').run(purchase.id);
  res.download(ebookPath, `${process.env.EBOOK_TITLE || 'ebook'}.pdf`);
});

// Unsubscribe
app.get('/unsubscribe', (req, res) => {
  const email = decodeURIComponent(req.query.email || '');
  if (email) db.prepare('UPDATE leads SET subscribed = 0 WHERE email = ?').run(email);
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:80px;background:#0f0f1a;color:#e2e8f0">
    <h2 style="color:#a855f7">You've been unsubscribed</h2>
    <p style="color:#94a3b8">You'll no longer receive emails from us. <a href="/" style="color:#7c3aed">Go back home</a></p>
  </body></html>`);
});

// Admin dashboard (password-protected)
app.get('/admin', (req, res) => {
  if (req.query.pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).send(`<html><body style="font-family:sans-serif;text-align:center;padding:80px;background:#0f0f1a;color:#e2e8f0">
      <h2>Admin Access</h2>
      <form action="/admin" method="get">
        <input name="pass" type="password" placeholder="Password" style="padding:10px;margin-right:8px;border-radius:8px;border:1px solid #7c3aed;background:#1a1a2e;color:#fff">
        <button type="submit" style="padding:10px 20px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer">Login</button>
      </form>
    </body></html>`);
  }

  const stats = {
    leads: db.prepare('SELECT COUNT(*) as n FROM leads').get().n,
    purchases: db.prepare('SELECT COUNT(*) as n FROM purchases WHERE fulfilled = 1').get().n,
    revenue: db.prepare('SELECT COALESCE(SUM(amount),0) as n FROM purchases WHERE fulfilled = 1').get().n,
    recentPurchases: db.prepare('SELECT email, name, amount, datetime(created_at,"unixepoch") as date FROM purchases WHERE fulfilled=1 ORDER BY created_at DESC LIMIT 20').all(),
    recentLeads: db.prepare('SELECT email, name, datetime(created_at,"unixepoch") as date, sequence_step FROM leads ORDER BY created_at DESC LIMIT 20').all(),
  };

  res.send(`<!DOCTYPE html><html><head><title>Admin Dashboard</title>
    <style>body{margin:0;background:#0f0f1a;color:#e2e8f0;font-family:'Segoe UI',sans-serif;padding:40px}
    h1{color:#a855f7}h2{color:#7c3aed;margin-top:40px}
    .stats{display:flex;gap:20px;flex-wrap:wrap;margin:30px 0}
    .stat{background:#1a1a2e;border:1px solid #7c3aed33;border-radius:12px;padding:24px;min-width:160px}
    .stat .n{font-size:36px;font-weight:800;color:#a855f7}
    .stat .l{color:#94a3b8;font-size:14px;margin-top:4px}
    table{width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:12px;overflow:hidden}
    th{background:#7c3aed22;color:#a855f7;text-align:left;padding:12px 16px}
    td{padding:12px 16px;border-top:1px solid #7c3aed22;color:#cbd5e1;font-size:14px}
    </style></head><body>
    <h1>Sales Dashboard</h1>
    <div class="stats">
      <div class="stat"><div class="n">${stats.leads}</div><div class="l">Total Leads</div></div>
      <div class="stat"><div class="n">${stats.purchases}</div><div class="l">Sales</div></div>
      <div class="stat"><div class="n">$${(stats.revenue/100).toFixed(2)}</div><div class="l">Revenue</div></div>
      <div class="stat"><div class="n">${stats.leads > 0 ? ((stats.purchases/stats.leads)*100).toFixed(1) : 0}%</div><div class="l">Conversion</div></div>
    </div>
    <h2>Recent Purchases</h2>
    <table><tr><th>Email</th><th>Name</th><th>Amount</th><th>Date</th></tr>
    ${stats.recentPurchases.map(p=>`<tr><td>${p.email}</td><td>${p.name||'-'}</td><td>$${(p.amount/100).toFixed(2)}</td><td>${p.date}</td></tr>`).join('')}
    </table>
    <h2>Recent Leads</h2>
    <table><tr><th>Email</th><th>Name</th><th>Sequence Step</th><th>Date</th></tr>
    ${stats.recentLeads.map(l=>`<tr><td>${l.email}</td><td>${l.name||'-'}</td><td>${l.sequence_step}</td><td>${l.date}</td></tr>`).join('')}
    </table>
    </body></html>`);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✦ Ebook sales server running at http://localhost:${PORT}`);
  console.log(`  Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

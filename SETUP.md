# Ebook Sales Platform — Setup Guide

A fully automated ebook sales platform. Collects leads, runs email sequences, processes payments via Stripe, and delivers your ebook automatically — no manual work required after setup.

---

## Quick Start (5 Steps)

### 1. Copy environment file
```bash
cp .env.example .env
```

### 2. Fill in your `.env` file
Open `.env` and fill in all values. Key ones:

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) |
| `STRIPE_PUBLISHABLE_KEY` | Same page |
| `STRIPE_WEBHOOK_SECRET` | After setting up webhook (step 4) |
| `SMTP_HOST` | `smtp.gmail.com` for Gmail |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | [Gmail App Password](https://myaccount.google.com/apppasswords) |
| `EBOOK_FILE_PATH` | `./ebook.pdf` (put your PDF here) |
| `SITE_URL` | Your live domain, e.g. `https://yourdomain.com` |

### 3. Add your ebook PDF
Place your PDF file at the path you set in `EBOOK_FILE_PATH` (default: `./ebook.pdf`).

### 4. Set up Stripe Webhook
1. Go to [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. URL: `https://yourdomain.com/webhook`
4. Events to listen for: `checkout.session.completed`
5. Copy the **Signing secret** → paste as `STRIPE_WEBHOOK_SECRET` in `.env`

### 5. Customize the landing page
Edit `public/index.html` — search for these placeholders:
- `YourBrand` → your brand name
- `Your Name` / `YN` → your name
- `$27` / `$97` → your pricing (update `EBOOK_PRICE` in `.env` too)
- `The Ultimate Guide` → your ebook title
- `yourdomain.com` → your domain
- Testimonials, chapter descriptions, problem bullets → customize to match your ebook

### 6. Run setup check
```bash
npm run setup
```
This will tell you if anything is missing before you launch.

### 7. Start the server
```bash
npm start
```

---

## How It Works (Fully Automated)

```
Visitor lands on page
    │
    ├─→ Enters email for free chapter
    │       └─→ Welcome email sent immediately
    │           └─→ 3-email drip sequence over 72 hours
    │               (urging purchase, with scarcity + social proof)
    │
    └─→ Clicks "Buy Now" → Stripe Checkout
            └─→ Payment confirmed via webhook
                └─→ Confirmation email sent with PDF attached + download link
                    └─→ Buyer added to database (skips drip)
```

**Drip sequence timing:**
- Email 1 (Welcome): Immediately on signup
- Email 2 (Mistake email): 24 hours later
- Email 3 (Testimonials): 48 hours later  
- Email 4 (Urgency/price increase): 72 hours later

---

## Admin Dashboard

Visit `/admin?pass=YOUR_ADMIN_PASSWORD` to see:
- Total leads, sales, revenue, conversion rate
- Recent purchases and leads table

---

## Deploying to Production

### Option A: Railway (easiest, ~$5/month)
1. Push this repo to GitHub
2. Connect to [railway.app](https://railway.app)
3. Add all environment variables in Railway dashboard
4. Deploy

### Option B: DigitalOcean / VPS
```bash
# On your server:
git clone your-repo
cd your-repo
cp .env.example .env
# Fill in .env
npm install
npm start

# Use PM2 to keep it running:
npm install -g pm2
pm2 start server.js --name ebook-store
pm2 save
pm2 startup
```

### Option C: Heroku
Standard Node.js deployment. Set all env vars in Heroku Config Vars.

---

## Files Overview

```
├── server.js           Main server (Express + Stripe + email + cron)
├── public/
│   ├── index.html      Sales landing page
│   ├── success.html    Post-purchase thank you page
│   ├── css/styles.css  All styling (dark, modern design)
│   ├── js/main.js      Frontend JS (forms, FAQ, popup)
│   ├── privacy.html    Privacy policy
│   ├── terms.html      Terms of service
│   └── 404.html        Error page
├── scripts/setup.js    Pre-launch checklist script
├── database/           SQLite database (auto-created)
├── .env.example        Template for your config
└── package.json        Dependencies
```

---

## Customizing Email Sequences

Edit the `drip` array in `server.js` to change:
- Number of emails
- Timing (change `delayHours`)
- Subject lines and body copy

---

## Support

If you have any issues, check:
1. `SITE_URL` matches your actual domain (Stripe redirects depend on this)
2. Stripe webhook is pointing to `https://yourdomain.com/webhook`
3. Your SMTP credentials work (test with `nodemailer` docs)
4. Your ebook PDF exists at the path in `EBOOK_FILE_PATH`

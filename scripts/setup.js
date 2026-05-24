'use strict';
// Run with: node scripts/setup.js
// Verifies all required environment variables are set before launch

const required = [
  ['STRIPE_SECRET_KEY', 'sk_live_ or sk_test_ from Stripe dashboard'],
  ['STRIPE_PUBLISHABLE_KEY', 'pk_live_ or pk_test_ from Stripe dashboard'],
  ['STRIPE_WEBHOOK_SECRET', 'whsec_ from Stripe webhook settings'],
  ['SMTP_HOST', 'e.g. smtp.gmail.com'],
  ['SMTP_USER', 'Your email address'],
  ['SMTP_PASS', 'App password or SMTP password'],
  ['EMAIL_FROM_NAME', 'Your name or brand name'],
  ['EMAIL_FROM_ADDRESS', 'The "from" email address'],
  ['EBOOK_FILE_PATH', 'Path to your PDF file, e.g. ./ebook.pdf'],
  ['EBOOK_TITLE', 'Title of your ebook'],
  ['SITE_URL', 'Your live domain, e.g. https://yourdomain.com'],
  ['ADMIN_PASSWORD', 'Password for the /admin dashboard'],
];

require('dotenv').config();
const fs = require('fs');
const path = require('path');

let ok = true;

console.log('\n────────────────────────────────────────');
console.log('  Ebook Platform — Setup Check');
console.log('────────────────────────────────────────\n');

for (const [key, hint] of required) {
  const val = process.env[key];
  if (!val) {
    console.log(`  ✗ MISSING  ${key}`);
    console.log(`            ${hint}\n`);
    ok = false;
  } else {
    const display = val.length > 20 ? val.slice(0, 8) + '...' + val.slice(-4) : val;
    console.log(`  ✓ OK       ${key} = ${display}`);
  }
}

// Check ebook file exists
const ebookPath = path.resolve(process.env.EBOOK_FILE_PATH || './ebook.pdf');
if (!fs.existsSync(ebookPath)) {
  console.log(`\n  ⚠ EBOOK FILE NOT FOUND at: ${ebookPath}`);
  console.log(`    Place your PDF at this location before going live.`);
} else {
  const size = (fs.statSync(ebookPath).size / 1024).toFixed(0);
  console.log(`\n  ✓ Ebook PDF found (${size} KB)`);
}

console.log('\n────────────────────────────────────────');
if (ok) {
  console.log('  ✓ All checks passed. Run: npm start\n');
} else {
  console.log('  ✗ Fix missing values in your .env file then run this again.\n');
  process.exit(1);
}

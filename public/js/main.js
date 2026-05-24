'use strict';

// ─── FAQ TOGGLE ───────────────────────────────────────────────────────────────
function toggleFaq(el) {
  const item = el.closest('.faq-item');
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

// ─── POPUP ────────────────────────────────────────────────────────────────────
let popupShown = false;
function closePopup() {
  document.getElementById('popup').classList.add('hidden');
  sessionStorage.setItem('popupDismissed', '1');
}

function maybeShowPopup() {
  if (popupShown || sessionStorage.getItem('popupDismissed')) return;
  document.getElementById('popup').classList.remove('hidden');
  popupShown = true;
}

// Show popup on exit intent (desktop)
document.addEventListener('mouseleave', (e) => {
  if (e.clientY <= 0) maybeShowPopup();
});

// Show popup after 45 seconds (mobile fallback)
setTimeout(maybeShowPopup, 45000);

// Close popup clicking backdrop
document.getElementById('popup').addEventListener('click', (e) => {
  if (e.target === document.getElementById('popup')) closePopup();
});

// ─── SHARED SUBSCRIBE FUNCTION ────────────────────────────────────────────────
async function subscribeEmail(email, name) {
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  });
  return res.json();
}

// ─── LEAD FORM ────────────────────────────────────────────────────────────────
document.getElementById('leadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('leadSubmitBtn');
  const email = form.email.value.trim();
  const name = form.name?.value?.trim() || '';

  removeError(form);
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const data = await subscribeEmail(email, name);
    if (data.success) {
      form.classList.add('hidden');
      document.getElementById('leadSuccess').classList.remove('hidden');
      sessionStorage.setItem('popupDismissed', '1');
    } else {
      showError(form, data.error || 'Something went wrong. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Send Me the Free Chapter →';
    }
  } catch {
    showError(form, 'Network error. Please check your connection and try again.');
    btn.disabled = false;
    btn.textContent = 'Send Me the Free Chapter →';
  }
});

// ─── POPUP FORM ───────────────────────────────────────────────────────────────
document.getElementById('popupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button');
  const email = form.email.value.trim();

  removeError(form);
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const data = await subscribeEmail(email, '');
    if (data.success) {
      closePopup();
      sessionStorage.setItem('popupDismissed', '1');
    } else {
      showError(form, data.error || 'Try again.');
      btn.disabled = false;
      btn.textContent = 'Send Me The Free Chapter';
    }
  } catch {
    showError(form, 'Network error. Try again.');
    btn.disabled = false;
    btn.textContent = 'Send Me The Free Chapter';
  }
});

// ─── CHECKOUT FORM ────────────────────────────────────────────────────────────
document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('buyBtn');
  const btnText = document.getElementById('buyBtnText');
  const email = form.email.value.trim();
  const name = form.name?.value?.trim() || '';

  if (!email) {
    showError(form, 'Please enter your email address to receive the ebook.');
    return;
  }

  removeError(form);
  btn.disabled = true;
  btnText.textContent = 'Redirecting to secure checkout...';

  try {
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      showError(form, data.error || 'Failed to start checkout. Please try again.');
      btn.disabled = false;
      btnText.textContent = 'Get Instant Access — $27 →';
    }
  } catch {
    showError(form, 'Network error. Please check your connection and try again.');
    btn.disabled = false;
    btnText.textContent = 'Get Instant Access — $27 →';
  }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function showError(form, msg) {
  removeError(form);
  const el = document.createElement('div');
  el.className = 'error-msg';
  el.textContent = msg;
  form.prepend(el);
}

function removeError(form) {
  const existing = form.querySelector('.error-msg');
  if (existing) existing.remove();
}

// ─── CANCELLED PURCHASE ───────────────────────────────────────────────────────
if (new URLSearchParams(window.location.search).get('cancelled') === 'true') {
  const buySection = document.getElementById('buy');
  if (buySection) {
    const notice = document.createElement('div');
    notice.style.cssText = 'background:#1e0a0a;border:1px solid #7f1d1d55;color:#fca5a5;padding:16px 20px;border-radius:12px;margin-bottom:20px;text-align:center;font-size:15px';
    notice.textContent = 'Your order was not completed. No charge was made — you can try again below.';
    buySection.querySelector('.pricing-card').prepend(notice);
    buySection.scrollIntoView({ behavior: 'smooth' });
  }
  window.history.replaceState({}, '', '/');
}

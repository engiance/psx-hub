// ── Navbar scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

// ── Mobile hamburger menu
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');
hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});
// Close nav when a link is clicked
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

// ── Scroll-reveal animation
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(
  '.service-card, .why-card, .gallery-card, .testimonial-card, .city-item, .process-step'
).forEach(el => observer.observe(el));

// ── Quote form submit
const quoteForm   = document.getElementById('quoteForm');
const formSuccess = document.getElementById('formSuccess');
quoteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  quoteForm.style.display = 'none';
  formSuccess.classList.add('visible');
});

// ── Floating CTA — hide once user reaches the contact section
const floatingCta   = document.getElementById('floatingCta');
const contactSection = document.getElementById('contact');
const ctaObserver = new IntersectionObserver(([entry]) => {
  floatingCta.style.display = entry.isIntersecting ? 'none' : '';
}, { threshold: 0.1 });
ctaObserver.observe(contactSection);

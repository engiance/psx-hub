# Angle Lab

A small, private, on-device dashboard for exploring your facial proportions and
finding camera angles / lighting that work well for you. Built as a static web
app — no server, no accounts, no uploads.

## How it works

1. **New Scan** — take or choose a photo.
2. **Mark landmarks** — tap 16 guided points on the photo (hairline, eye
   corners, nose, mouth, cheekbones, jaw). A magnifier follows your finger for
   precision on small screens; you can drag before releasing to fine-tune.
3. **Results** — the app computes a few classic proportion/symmetry ratios
   (facial thirds, facial fifths, left/right balance, canthal tilt, jaw/cheek
   width, length/width ratio) from the points you placed, and turns them into
   plain-language, actionable angle and lighting suggestions.
4. **Dashboard** — past scans are listed with a trend sparkline so you can see
   how your numbers compare over repeat photos/lighting setups.

## Privacy

Everything runs in this page, in your browser. The photo is only ever drawn to
an on-screen `<canvas>` — it is never uploaded or sent anywhere. Only the
computed numbers and a small low-resolution thumbnail are saved, in
`localStorage` on your own device, so history persists between visits. Clearing
your browser data for this site removes everything.

## Framing

The measurements are a rough geometric estimate from points you tap on a single
2D photo — not a scientific or medical assessment. Nearly every face is
naturally asymmetric to some degree; that's normal anatomy, not a defect. The
suggestions are about photography (angle, light, styling) — a practical,
reversible way to like your photos more, not a checklist of things to "fix."

## Running it

This is a static site — three files (`index.html`, `style.css`, `app.js`) plus
a manifest/icon. Open `index.html` directly, or serve the folder with any
static file server, e.g.:

```
npx serve .
```

### Using it from your phone

The simplest path is GitHub Pages:

1. In this repo's **Settings → Pages**, set the source to the `main` branch
   (root).
2. Merge this branch into `main`.
3. Open the resulting `https://<user>.github.io/<repo>/` URL on your phone and
   optionally "Add to Home Screen" — the included `manifest.json` gives it an
   app icon and standalone (no browser chrome) window.

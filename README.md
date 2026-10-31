# Ramez Gamel — portfolio

Personal site of Ramez Gamel, front-end developer in Egypt.
Live at **https://ramezgamel01.github.io**.

A static site (HTML, CSS and plain JavaScript, no build step) with:

- English and Arabic versions with a right-to-left layout (`i18n.js` holds the Arabic text)
- A lamp-lit dark theme and a "lights on" light theme, switched by a pull cord
- Case studies for WorkLedger, CineScope, TaskFlow and Rihla
- A Ctrl+K command menu, smooth scrolling and 3D scroll effects that respect reduced-motion settings

## Run locally

Serve the folder with any static server, for example:

```bash
python -m http.server 5500
```

## Editing

- Page text: the `.html` files (English) and `i18n.js` (Arabic, keyed by `data-i18n`).
- CVs: edit `cv/cv-en.html` and `cv/cv-ar.html`, then print each to PDF (A4, background graphics on) and save over `assets/cv/`.
- Case study screenshots live in `assets/case/` (1400 × 914 JPEG).
- Working hours used on the Contact page: `CAIRO_HOURS` in `script.js`.

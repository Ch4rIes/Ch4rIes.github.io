# Charles Zuo — personal website

A standalone React + Vite personal website. Runs locally without an internet connection and publishes to GitHub Pages. No Sites, ChatGPT, Cloudflare, authentication, or analytics integration.

## Run locally

Dependencies are already installed in this checkout. Run:

```sh
npm run dev
```

Open http://127.0.0.1:3000 in your browser. The server only binds to your own computer.

## Build

```sh
npm run build
npm run preview
```

The static output is in `dist/`. Preview it at http://127.0.0.1:4173.

Fonts and company logos are stored locally. The page and animation work without internet access; email and external profile links naturally need their respective applications or services. A fresh checkout needs `npm ci` once to install dependencies.

## Edit

- `src/Home.tsx`: introduction and contact links
- `src/Experience.tsx`: internships and education
- `src/Particles.tsx`: background animation
- `src/styles.css`: layout and typography
- `public/`: local fonts, logos, and favicon

## GitHub Pages

Repository: https://github.com/Ch4rIes/Ch4rIes.github.io

Website: https://ch4ries.github.io/

The workflow in `.github/workflows/pages.yml` builds and deploys pushes to `main`. GitHub Pages must use **GitHub Actions** as its publishing source. Only the static `dist/` output is served; no application server is needed.

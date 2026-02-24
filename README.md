# Arandu Website

Static landing page for the Arandu project.

## 🌐 Access URLs

### Primary (Cloudflare Pages)
- **URL:** https://arandu.app
- **CDN:** Cloudflare global network
- **Deploy:** Automatic via GitHub Actions

### Fallback (GitHub Pages)
- **URL:** https://devitools.github.io/arandu/
- **CDN:** GitHub CDN
- **Deploy:** Automatic via GitHub Actions (same workflow)

## 🚀 Deployment

Both deployments happen automatically on push to `main` when `website/**` changes:

1. **Cloudflare Pages** - Primary deployment
2. **GitHub Pages** - Fallback deployment (via `gh-pages` branch)

If Cloudflare experiences issues, use the GitHub Pages URL as an alternative.

## 🛠️ Local Development

```bash
cd website
python -m http.server 8000
# or
npx serve .
```

Access: http://localhost:8000

## 📁 Structure

```
website/
├── index.html          # Main page
├── css/
│   └── site.css       # Styles
├── js/
│   └── theme.js       # Dark/light theme toggle
├── favicon-32x32.png
├── apple-touch-icon.png
└── icon.svg
```

## ⚡ Performance

- Size: ~20KB (minified HTML + CSS + JS)
- Load time: <100ms (with CDN)
- 100% static (no build step)

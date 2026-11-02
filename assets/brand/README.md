# Deer Panel brand images

Logos, banners and promo images for GitHub, Patreon and social media. Every PNG here is rendered from the HTML pages in `src/`, so text and layout can be changed and rendered again.

| Folder | File | Size | Use |
|---|---|---|---|
| `logo/` | `icon-1024.png`, `icon-512.png` | square | App icon (same drawing as `panel/assets/icon.png`) |
| | `deer.png` | 1024² | The coloured deer alone, transparent |
| | `mark-white/green/black.png` | 1024² | Deer silhouette, one colour, transparent |
| | `line-white/black.png` | 1024² | Outline version, transparent |
| | `wordmark-on-dark.png`, `wordmark-on-light.png` | 1400×400 | Icon + "Deer Panel", transparent |
| `github/` | `social-preview.png` | 1280×640 | Repo → Settings → Social preview |
| | `readme-banner.png` | 1600×480 | Top of the README |
| | `overview.png` | 1600×1000 | README hero image |
| `patreon/` | `cover.png` | 1600×400 | Page cover |
| | `avatar.png` | 1024² | Profile picture (safe to crop to a circle) |
| | `tier-fawn/stag/grove.png` | 1200×675 | Tier images |
| `social/` | `post-square.png` | 1080² | Announcement post |
| | `story.png` | 1080×1920 | Story / reel cover |
| | `discord-banner.png` | 960×540 | Discord server banner |
| `screens/` | `*.png` | | Panel screenshots used by the pages above |

## Rendering
From the repo root (uses the panel's Electron):

```
panel\node_modules\.bin\electron assets/brand/src/render.cjs          # all
panel\node_modules\.bin\electron assets/brand/src/render.cjs tier     # only names containing "tier"
```

Sizes and file names are listed in `src/render.cjs`. The deer drawing is in `src/deer.js`, colours in `src/brand.css` (forest green `#2f5b4c`, warm gold, caramel deer).

The panel's own icon (`panel/assets/icon.png` and `icon.ico`) comes from the same drawing:

```
panel\node_modules\.bin\electron assets/brand/src/app-icon.cjs
```

The packaged `Deer Panel.exe` only shows a new icon after `npm run package` in `panel/`.

## Screenshots
`screens/` holds panel screenshots with demo data: English UI, made-up member names (Juniper, Rowan…), generated avatars, a fake member ID and demo counts. When retaking them, never show a real server address, token, member name or ID.

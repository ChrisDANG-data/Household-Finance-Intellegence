# Screenshots for GitHub README

These PNGs appear in the root [README.md](../../README.md).

## What is a “hero image”?

The **hero** is the large screenshot at the **top** of the README (right under the live app link). Recruiters see it first — usually the landing page or the most impressive screen.

In this repo the hero is:

```markdown
![Home — Household Financial Intelligence](docs/images/home.png)
```

The **gallery** is the smaller 2×2 grid under **Feature tour** (ledger, documents, forecast, n8n).

## Files in this folder

| File | Used as | Capture |
|------|---------|---------|
| `home.png` | Hero (top of README) | Landing page (`/`) |
| `ledger.png` | Gallery | Ledger with Partner A/B (`/ledger`) |
| `documents-review.png` | Gallery | Upload / review documents (`/documents`) |
| `scenario-chat.png` | Gallery | Forecast + Ask AI (`/simulation` or `/scenario`) |
| `n8n.png` | Gallery | n8n / Telegram automation workflow |

## How to update a screenshot

1. Open the live app (or `npm run dev`) with **sanitized** demo data.
2. Capture the screen (Windows: `Win+Shift+S`, or full window screenshot).
3. Overwrite the matching file above (keep the same filename).
4. Commit and push — GitHub README updates automatically.

## Tips

- Prefer ~1280–1440px wide; avoid huge files (>1 MB if possible).
- Use one theme (light or dark) consistently.
- Never include real account numbers, SSNs, or personal bills.
- A 60–90s Loom/YouTube demo linked from the README is even stronger than static shots alone.

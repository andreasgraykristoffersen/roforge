# RoForge

AI that builds Roblox games (Luau scripts + maps made of parts), 3D meshes, and game thumbnails. **Works free with no API key.**

## Features
- **Game builder** – describe a game (obby, tycoon, simulator, arena…) and get server/client scripts, RemoteEvents, UI and a map, all ready to install.
- **Add onto what you made** – "make 10 more stages", "add a shop", "add a boss". New parts and changed scripts merge into your current project.
- **Fix errors** – paste an error from the Studio Output window and get the fixed scripts.
- **Free AI 3D meshes** – text-to-3D via [Shap-E](https://huggingface.co/spaces/hysts/Shap-E) on Hugging Face. Export a .glb and use Studio's 3D Importer.
- **Free thumbnails + icons** – 1920×1080 thumbnail and 512×512 icon via [Pollinations](https://pollinations.ai).
- **3D preview** in the browser, plus a **Studio installer** (paste into the Command Bar), **.rbxmx** and **.glb** export.

## Runs fully online
Everything runs in the browser, with no backend. Host the `public/` folder on any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

To try it locally: `node server.js`, then open http://localhost:3000.

### AI keys (click ⚙ AI key in the app; stored only in your browser)
| Feature | Needs |
|---|---|
| 3D meshes (Shap-E) | nothing. Free Hugging Face GPU quota, resets over time. |
| Thumbnails / icons | nothing. Free tier allows 1 image per 45s. |
| Game builder | a **free** Pollinations key from https://enter.pollinations.ai, **or** an Anthropic key (`sk-ant-…`) for the best games. |

## Using it in Roblox Studio
1. **Export → Copy installer**, then in Studio open View → Command Bar, paste, and press Enter.
2. Press Play to test.

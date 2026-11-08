# RoForge

AI that builds Roblox games (Luau scripts + maps made of parts), 3D meshes, and game thumbnails. **Works free with no API key.**

## Features
- **Game builder** – describe a game (obby, tycoon, simulator, arena…) and get server/client scripts, RemoteEvents, UI and a map, all ready to install.
- **Add onto what you made** – "make 10 more stages", "add a shop", "add a boss". New parts and changed scripts merge into your current project.
- **Fix errors** – paste an error from the Studio Output window and get the fixed scripts.
- **Free AI 3D meshes** – text-to-3D via [Shap-E](https://huggingface.co/spaces/hysts/Shap-E) on Hugging Face. Export a .glb and use Studio's 3D Importer.
- **Free thumbnails + icons** – 1920×1080 thumbnail and 512×512 icon via [Pollinations](https://pollinations.ai).
- **3D preview** in the browser, plus a **Studio installer** (paste into the Command Bar), **.rbxmx** and **.glb** export.

## Run

Needs [Node.js](https://nodejs.org) 18+.

```bash
node server.js
```

Open http://localhost:3000.

### AI backends
| Mode | Setup | Notes |
|---|---|---|
| Free (default) | nothing | Pollinations text AI. Smaller games; limited to 1 reply every 45s. |
| Claude (best) | `$env:ANTHROPIC_API_KEY = "sk-ant-..."` | Much bigger, better games. Optional `$env:MODEL = "claude-opus-5-5"`. |

The 3D meshes and thumbnails are always free.

## Using it in Roblox Studio
1. **Export → Copy installer**, then in Studio open View → Command Bar, paste, and press Enter.
2. Press Play to test.

// RoForge AI — runs fully in the browser. Free by default; optional Claude key stored only in this browser.
const ls = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const anyKey = () => ls("roforge_key").trim();
const getKey = () => (anyKey().startsWith("sk-ant-") ? anyKey() : "");
const getPollenKey = () => (anyKey() && !anyKey().startsWith("sk-ant-") ? anyKey() : "");
const getModel = () => ls("roforge_model") || "claude-sonnet-5-5";

const SYSTEM = `You are RoForge, a senior Roblox game developer, game designer and 3D modeler.
You turn the user's idea into a COMPLETE, PLAYABLE Roblox game that works the moment it is installed in an empty baseplate. Always answer by calling the build_game tool.

## How to design
1. First write a short design plan: core loop, win/lose conditions, progression, what the player sees on screen.
2. Make it fun out of the box: clear goal, feedback (sounds via rbxassetid only if certain, otherwise skip; tweens, particles, UI popups), rewards, restart/round flow.
3. Build the map/props as the "model" so the game has something to play on. Place SpawnLocation-like features with a part named "Spawn" if needed (scripts can convert it).

## Code architecture (follow strictly)
- Server-authoritative: all currency, damage, purchases, round state live on the server. Never trust the client — validate every RemoteEvent argument (type, range, cooldown, distance).
- Declare every RemoteEvent / RemoteFunction in "remotes"; the installer creates them in ReplicatedStorage.Remotes. Scripts get them with ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Name").
- Shared config/constants go in a ModuleScript in ReplicatedStorage ("Config"). Server-only modules in ServerScriptService.
- leaderstats folder for visible stats. Save data with DataStoreService wrapped in pcall, with retries, saving on PlayerRemoving and game:BindToClose. Use UpdateAsync where data could race.
- Build all UI in code from a LocalScript (ScreenGui with ResetOnSpawn=false, UICorner, UIStroke, scale-based sizes so it works on mobile). No reliance on pre-made StarterGui objects.
- Workspace objects the scripts need must exist in the model with EXACTLY the names the scripts use. Scripts find them via workspace:WaitForChild(<ModelName>):WaitForChild(<PartName>). Repeated objects (checkpoints, droppers, coins) use numbered names like "Checkpoint1".
- Modern Luau only: task.wait/task.spawn/task.delay, :Connect, Players.PlayerAdded (and handle players already in game), CharacterAdded, Humanoid.Died, Debris, TweenService, CollectionService tags where helpful. No wait(), spawn(), delay(), deprecated APIs, or loadstring.
- Handle edge cases: player leaves mid-round, character respawn, touched events firing many times (debounce per player), nil checks.
- Use --!strict-friendly code with type annotations where simple. Comment sections briefly.

## Before calling the tool, self-check
- Every referenced remote, module, part name and service exists.
- No syntax errors, every 'end' matches, no undefined variables.
- The game can actually be started, played, won/lost, and restarted.

## 3D models
Built from parts (Block, Ball, Cylinder, Wedge). Units are studs, Y up, resting on y=0, rotation in degrees XYZ. Cylinder axis is X. Use 20-200 parts with good proportions, varied colors and materials. Game maps should be sized for Roblox characters (~5 studs tall, jumps ~7 studs high, ~12 studs gap max).

## Part-model quality rules (when building a 3D model from parts)
- Start from real-world proportions and a reference size (a character is ~5 studs, a door ~7x4, a car ~14x6x7).
- Block out big shapes first, then add secondary forms, then small details (trims, bolts, windows, handles, eyes).
- Keep it symmetrical where the real object is: mirror X positions exactly.
- Parts must touch or overlap slightly — no floating gaps. Nothing below y=0.
- Use Wedges for slopes/roofs/noses, Cylinders for wheels/pipes/trunks, Balls for heads/round tips, rotated Blocks for angled detail.
- Use 3-6 harmonious colors plus 1 accent; Neon only for glowing bits; Glass with transparency 0.3-0.6 for windows.
- Give parts descriptive names (Body, WheelFL, WindowL…).
- Silhouette must be recognizable from any angle.

## Iteration / adding on
The user can keep building on what you made ("make 10 more stages", "add a shop", "add a boss").
- Set "update" to "add" when extending: return ONLY the NEW parts (continue existing numbering and positions, e.g. Stage11 starts where the last stage ended) and ONLY scripts that are new or changed (changed scripts in full, same name to replace). Existing parts/scripts you omit are kept.
- Make scripts data-driven (e.g. count "Checkpoint" parts at runtime) so adding parts needs no script changes.
- Set "update" to "replace" only for a brand-new game or full rebuild; then return everything.
- When the user pastes an error from Studio Output, find the root cause and return the fixed scripts in full (update "add").
The latest message may include a CURRENT PROJECT summary listing existing part names/positions and script names — build from that.`;

const TOOL = {
  name: "build_game",
  description: "Return the complete Roblox game/model.",
  input_schema: {
    type: "object",
    required: ["message", "scripts"],
    properties: {
      update: { type: "string", enum: ["replace", "add"], description: "replace = new game; add = merge into current project" },
      plan: { type: "string", description: "Short game design plan: core loop, goals, progression, controls." },
      message: { type: "string", description: "Friendly summary of what was built and how to play/test it." },
      remotes: {
        type: "array",
        items: {
          type: "object", required: ["name", "type"],
          properties: { name: { type: "string" }, type: { type: "string", enum: ["RemoteEvent", "RemoteFunction", "BindableEvent"] } },
        },
      },
      scripts: {
        type: "array",
        items: {
          type: "object", required: ["name", "type", "parent", "source"],
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["Script", "LocalScript", "ModuleScript"] },
            parent: { type: "string", enum: ["ServerScriptService", "ReplicatedStorage", "StarterPlayerScripts", "StarterCharacterScripts", "StarterGui", "Workspace", "ServerStorage"] },
            source: { type: "string", description: "Full Luau source." },
          },
        },
      },
      model: {
        type: "object",
        properties: {
          name: { type: "string" },
          parts: {
            type: "array",
            items: {
              type: "object", required: ["name", "size", "position"],
              properties: {
                name: { type: "string" },
                shape: { type: "string", enum: ["Block", "Ball", "Cylinder", "Wedge"] },
                size: { type: "array", items: { type: "number" } },
                position: { type: "array", items: { type: "number" } },
                rotation: { type: "array", items: { type: "number" } },
                color: { type: "string" },
                material: { type: "string", enum: ["Plastic", "SmoothPlastic", "Wood", "Metal", "Neon", "Glass", "Grass", "Brick", "Concrete"] },
                transparency: { type: "number" },
                canCollide: { type: "boolean" },
              },
            },
          },
        },
      },
      testSteps: { type: "array", items: { type: "string" }, description: "How to test in Studio (Play / multi-player Test)." },
    },
  },
};

// ---------- FREE: text-to-3D mesh via Shap-E on Hugging Face (no key needed) ----------
const SHAPE_SPACE = "https://hysts-shap-e.hf.space/gradio_api";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// keeps going: waits out free-tier limits and retries instead of failing
async function generateMesh(prompt, onWait = () => {}) {
  for (let n = 0; ; n++) {
    try { return await generateMeshOnce(prompt); }
    catch (e) {
      if (n >= 5 || !/quota|busy|429|queue/i.test(e.message)) throw e;
      const m = e.message.match(/Try again in (\d+):(\d+):(\d+)/);
      const ms = m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + 5000 : 60000;
      onWait(Math.round(ms / 1000)); await sleep(ms);
    }
  }
}
async function generateMeshOnce(prompt) {
  const start = await fetch(`${SHAPE_SPACE}/call/text-to-3d`, {
    method: "POST", headers: { "content-type": "application/json", ...authH() },
    body: JSON.stringify({ data: [prompt, Math.floor(Math.random() * 1e6), 15, 64] }),
  });
  if (!start.ok) throw new Error(`3D generator busy (${start.status}). Try again in a minute.`);
  const { event_id } = await start.json();
  const stream = await (await fetch(`${SHAPE_SPACE}/call/text-to-3d/${event_id}`, { headers: authH() })).text();
  const m = stream.match(/event: complete\s*data: (.*)/);
  if (!m) throw new Error("3D generator failed: " + (stream.match(/data: (.*)/)?.[1] || "no result"));
  const file = JSON.parse(m[1])[0];
  const glb = await fetch(file.url);
  return await glb.arrayBuffer();
}

// ---------- FREE: text AI via Pollinations (used when no ANTHROPIC_API_KEY) ----------
async function callFree(messages, onWait) {
  const example = {
    update: "replace", plan: "...", message: "...", remotes: [{ name: "CoinCollected", type: "RemoteEvent" }],
    scripts: [{ name: "GameServer", type: "Script", parent: "ServerScriptService", source: "-- full Luau code" }],
    model: { name: "Map", parts: [{ name: "Floor", shape: "Block", size: [100, 1, 100], position: [0, 0.5, 0], rotation: [0, 0, 0], color: "#4caf50", material: "Grass", transparency: 0, canCollide: true }] },
    testSteps: ["..."],
  };
  const sys = SYSTEM.replace("Always answer by calling the build_game tool.", "") +
    `\n\nRespond with ONLY the filled-in JSON data (NOT a JSON schema, no markdown fences), shaped exactly like this example:\n` + JSON.stringify(example) +
    `\nIMPORTANT (free mode, short output limit): keep it compact — max 3 scripts, max 25 parts, total code under 5000 characters, plan and message 1-2 sentences. EXCEPTION: if the request starts with [MODEL ONLY], return no scripts and 40-80 parts. To save space, OMIT any part field equal to its default (shape Block, rotation [0,0,0], material Plastic, transparency 0, canCollide true) and round numbers to 2 decimals.`;
  const send = () => fetch("https://text.pollinations.ai/openai", {
    method: "POST", headers: { "content-type": "application/json", ...(getPollenKey() ? { authorization: "Bearer " + getPollenKey() } : {}) },
    body: JSON.stringify({ model: "openai", max_tokens: 16000, reasoning_effort: "low", messages: [{ role: "system", content: sys }, ...messages], response_format: { type: "json_object" } }),
  });
  let res = await send();
  for (let i = 0; i < 6 && (res.status === 402 || res.status === 429); i++) { // free tier limit: wait and keep going
    onWait?.(46); await sleep(46000); res = await send();
  }
  if (res.status === 403) throw new Error("The free text AI needs a free key when used from a website. Get one at https://enter.pollinations.ai (free sign-up), then click ⚙ AI key and paste it. Or paste an Anthropic key (sk-ant-...) for the best games.");
  if (!res.ok) throw new Error(`Free AI error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = (await res.json()).choices?.[0]?.message?.content || "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    let r = JSON.parse(json);
    if (r.properties && !r.scripts) { // model echoed the schema: unwrap values
      const p = r.properties; r = {};
      for (const k in p) r[k] = p[k]?.value ?? p[k]?.items ?? p[k]?.default ?? (typeof p[k]?.description === "string" && p[k].type === "string" ? p[k].description : p[k]);
    }
    // free model sometimes nests the real JSON as a string inside a field
    for (let i = 0; i < 3 && !r.scripts?.length; i++) {
      const inner = Object.values(r).find((v) => typeof v === "string" && v.trim().startsWith("{"));
      if (!inner) break;
      try { r = JSON.parse(inner.slice(inner.indexOf("{"), inner.lastIndexOf("}") + 1)); } catch { break; }
    }
    return { result: r };
  }
  catch { return { result: salvage(text) }; }
}

async function callClaude(messages, onWait) {
  const API_KEY = getKey(); if (!API_KEY) return callFree(messages, onWait);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({
      model: getModel(), max_tokens: 32000, system: SYSTEM, messages,
      tools: [TOOL], tool_choice: { type: "tool", name: "build_game" },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `API error ${res.status}`);
  const use = data.content.find((c) => c.type === "tool_use");
  if (!use) throw new Error("Model did not return a build.");
  if (data.stop_reason === "max_tokens") throw new Error("Output too long and got cut off — ask for a smaller game or fewer parts.");
  return { result: use.input };
}


export { generateMesh };

// ---------- HIGH QUALITY 3D: text -> image (FLUX) -> textured 3D mesh (TRELLIS), free on Hugging Face ----------
// Uses free ZeroGPU quota. A free Hugging Face token (hf_...) gives much more quota.
const hfToken = () => ls("roforge_hf").trim();
const authH = () => (hfToken() ? { authorization: "Bearer " + hfToken() } : {});
const FLUX = "https://black-forest-labs-flux-1-schnell.hf.space";
const TRELLIS = "https://trellis-community-trellis.hf.space";

async function gradioSimple(base, api, data) {
  const s = await fetch(`${base}/gradio_api/call/${api}`, { method: "POST", headers: { "content-type": "application/json", ...authH() }, body: JSON.stringify({ data }) });
  if (!s.ok) throw new Error(`${api} busy (${s.status})`);
  const { event_id } = await s.json();
  const t = await (await fetch(`${base}/gradio_api/call/${api}/${event_id}`, { headers: authH() })).text();
  const m = t.match(/event: complete\s*data: (.*)/);
  if (!m) throw new Error(`${api} failed (GPU quota or busy): ` + (t.match(/data: (.*)/)?.[1] || ""));
  return JSON.parse(m[1]);
}

const STYLES = {
  roblox: "stylized Roblox UGC style, clean chunky shapes, smooth surfaces, bright saturated colors",
  lowpoly: "low poly game asset, flat shaded facets, simple clean colors",
  cartoon: "cartoon 3D style like a Pixar toy, rounded shapes, vibrant colors",
  realistic: "photorealistic PBR game asset, detailed realistic materials and textures",
};
async function textToImage(prompt, style = "roblox") {
  const p = `${prompt}, ${STYLES[style] || STYLES.roblox}, single isolated object, whole object fully visible, three-quarter front view, centered, no cropping, no text, soft even studio lighting, no shadows, plain pure white background, high detail 3D render`;
  const out = await gradioSimple(FLUX, "infer", [p, 0, true, 1024, 1024, 4]);
  return await (await fetch(out[0].url)).blob();
}

async function imageToMesh(blob, onStatus = () => {}, quality = "high") {
  const cfg = await (await fetch(TRELLIS + "/config")).json();
  const fn = (n) => cfg.dependencies.findIndex((d) => d.api_name === n);
  const session = Math.random().toString(36).slice(2);
  const run = async (name, data) => {
    const j = await fetch(TRELLIS + "/gradio_api/queue/join", { method: "POST", headers: { "content-type": "application/json", ...authH() },
      body: JSON.stringify({ data, fn_index: fn(name), session_hash: session, event_data: null, trigger_id: null }) });
    if (!j.ok) throw new Error(`TRELLIS busy (${j.status})`);
    const res = await fetch(TRELLIS + "/gradio_api/queue/data?session_hash=" + session, { headers: authH() });
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).replace(/^data: ?/, ""); buf = buf.slice(i + 2);
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.msg === "estimation") onStatus(`In queue (position ${msg.rank + 1}, ~${Math.round(msg.rank_eta || 0)}s)…`);
        if (msg.msg === "process_starts") onStatus("Building textured 3D model…");
        if (msg.msg === "process_completed") {
          if (!msg.success) throw new Error("TRELLIS failed — usually the free GPU quota is used up. Add a free Hugging Face token (⚙ AI key) or try later.");
          return msg.output.data;
        }
      }
    }
    throw new Error("TRELLIS connection closed");
  };
  await run("start_session", []);
  const fd = new FormData(); fd.append("files", blob, "input.png");
  const up = await (await fetch(TRELLIS + "/gradio_api/upload", { method: "POST", body: fd, headers: authH() })).json();
  const file = { path: up[0], meta: { _type: "gradio.FileData" }, orig_name: "input.png" };
  await run("preprocess_image", [file]);
  // high quality = more sampling steps, bigger texture, keep more triangles (Roblox allows 20k per mesh)
  const q = quality === "high" ? [9, 30, 3.5, 30, 0.9, 2048] : [7.5, 12, 3, 12, 0.95, 1024];
  const out = await run("generate_and_extract_glb", [file, [], Math.floor(Math.random() * 1e6), q[0], q[1], q[2], q[3], "stochastic", q[4], q[5]]);
  const glb = out.map((o) => o?.url || o?.value?.url).find((u) => u && /\.glb/i.test(u));
  if (!glb) throw new Error("TRELLIS returned no model");
  return await (await fetch(glb, { headers: authH() })).arrayBuffer();
}

async function generateHQMesh({ prompt, image, style, quality }, onStatus = () => {}) {
  let blob = image;
  if (!blob) { onStatus("Step 1/2: drawing a reference image (FLUX)…"); blob = await textToImage(prompt, style); }
  onStatus("Step 2/2: turning it into a textured 3D model (TRELLIS)…");
  return { glb: await imageToMesh(blob, onStatus, quality), preview: URL.createObjectURL(blob) };
}
export { generateHQMesh };

// Recover complete parts/scripts from a reply that got cut off mid-JSON.
function salvage(text) {
  // if the JSON was nested inside a string, unescape it once
  let t = text;
  const nested = text.indexOf('{\\"');
  if (nested >= 0 && nested < 40) t = text.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const grab = (key) => {
    const i = t.indexOf('"' + key + '":['); if (i < 0) return [];
    const out = []; let depth = 0, start = -1, inStr = false;
    for (let j = t.indexOf("[", i) + 1; j < t.length; j++) {
      const c = t[j];
      if (inStr) { if (c === "\\") j++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") { if (depth++ === 0) start = j; }
      else if (c === "}") { if (--depth === 0) { try { out.push(JSON.parse(t.slice(start, j + 1))); } catch {} } }
      else if (c === "]" && depth === 0) break;
    }
    return out;
  };
  const parts = grab("parts"), scripts = grab("scripts").filter((x) => x.source);
  const name = t.match(/"model":\{"name":"([^"]+)/)?.[1] || "Model";
  const msg = t.match(/"message":"((?:[^"\\]|\\.)*)"/)?.[1];
  return {
    update: "replace", scripts, remotes: grab("remotes"), model: parts.length ? { name, parts } : null,
    message: (msg || "Built it.") + (parts.length ? ` (reply was cut off; kept ${parts.length} complete parts)` : ""),
  };
}

// ---------- Stronger free models via a (free) Pollinations key ----------
const POLLEN_URL = "https://gen.pollinations.ai/v1/chat/completions";
const pollenModel = () => ls("roforge_pmodel") || "deepseek";

async function pollenChat(body) {
  const res = await fetch(POLLEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + getPollenKey() },
    body: JSON.stringify({ model: pollenModel(), ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Pollinations (${pollenModel()}) error ${res.status}: ${data.error?.message || ""}`);
  return data.choices?.[0]?.message || {};
}

async function callPollen(messages) {
  const msg = await pollenChat({
    max_tokens: 32000,
    messages: [{ role: "system", content: SYSTEM }, ...messages],
    tools: [{ type: "function", function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.input_schema } }],
    tool_choice: { type: "function", function: { name: TOOL.name } },
  });
  const args = msg.tool_calls?.[0]?.function?.arguments;
  const text = args || msg.content || "";
  try { return { result: JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) }; }
  catch { return { result: salvage(text) }; }
}

// ---------- "Understand first": turn a short request into a detailed design brief ----------
const BRIEF_SYSTEM = `You are a senior Roblox game designer and 3D artist. The user wrote a short, possibly vague or misspelled request.
Work out what they REALLY want and write a precise design brief (max 250 words) that a builder can follow exactly:
- Restate the request clearly (fix spelling, infer intent, pick sensible defaults for anything missing).
- For a 3D model: list every component with approximate size in studs, position relative to the others, shape (Block/Wedge/Cylinder/Ball), color and material. Mention what makes it instantly recognizable.
- For a game: core loop, win/lose, progression, list of mechanics, map layout with sizes, UI, and which scripts/remotes are needed.
- If they want to change existing work, say exactly what to add/change and what to keep.
Plain text only, no code.`;

async function writeBrief(messages) {
  const last = messages[messages.length - 1];
  const convo = [{ role: "user", content: (typeof last.content === "string" ? last.content : "").slice(0, 6000) }];
  if (getKey()) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": getKey(), "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: getModel(), max_tokens: 1200, system: BRIEF_SYSTEM, messages: convo }),
    });
    const d = await res.json(); if (!res.ok) throw new Error(d.error?.message);
    return d.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  }
  if (getPollenKey()) return (await pollenChat({ max_tokens: 1500, messages: [{ role: "system", content: BRIEF_SYSTEM }, ...convo] })).content || "";
  return "";
}

async function smartGenerate(messages, onWait, onStatus = () => {}) {
  let msgs = messages;
  if (getKey() || getPollenKey()) { // anonymous free tier is 1 reply / 45s, so skip the extra step there
    try {
      onStatus("🧠 Understanding your request…");
      const brief = await writeBrief(messages);
      if (brief) {
        onStatus("🔨 Building from the design brief…\n\n" + brief.slice(0, 600));
        const last = msgs[msgs.length - 1];
        msgs = [...msgs.slice(0, -1), { ...last, content: last.content + "\n\n--- DESIGN BRIEF (follow it closely) ---\n" + brief }];
      }
    } catch { /* brief is optional */ }
  }
  if (getKey()) return callClaude(msgs, onWait);
  if (getPollenKey()) return callPollen(msgs);
  return callFree(msgs, onWait);
}
export { smartGenerate };

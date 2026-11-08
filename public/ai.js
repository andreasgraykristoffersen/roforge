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
async function generateMesh(prompt) {
  const start = await fetch(`${SHAPE_SPACE}/call/text-to-3d`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: [prompt, Math.floor(Math.random() * 1e6), 15, 64] }),
  });
  if (!start.ok) throw new Error(`3D generator busy (${start.status}). Try again in a minute.`);
  const { event_id } = await start.json();
  const stream = await (await fetch(`${SHAPE_SPACE}/call/text-to-3d/${event_id}`)).text();
  const m = stream.match(/event: complete\s*data: (.*)/);
  if (!m) throw new Error("3D generator failed: " + (stream.match(/data: (.*)/)?.[1] || "no result"));
  const file = JSON.parse(m[1])[0];
  const glb = await fetch(file.url);
  return await glb.arrayBuffer();
}

// ---------- FREE: text AI via Pollinations (used when no ANTHROPIC_API_KEY) ----------
async function callFree(messages) {
  const example = {
    update: "replace", plan: "...", message: "...", remotes: [{ name: "CoinCollected", type: "RemoteEvent" }],
    scripts: [{ name: "GameServer", type: "Script", parent: "ServerScriptService", source: "-- full Luau code" }],
    model: { name: "Map", parts: [{ name: "Floor", shape: "Block", size: [100, 1, 100], position: [0, 0.5, 0], rotation: [0, 0, 0], color: "#4caf50", material: "Grass", transparency: 0, canCollide: true }] },
    testSteps: ["..."],
  };
  const sys = SYSTEM.replace("Always answer by calling the build_game tool.", "") +
    `\n\nRespond with ONLY the filled-in JSON data (NOT a JSON schema, no markdown fences), shaped exactly like this example:\n` + JSON.stringify(example) +
    `\nIMPORTANT (free mode, short output limit): keep it compact — max 3 scripts, max 25 parts, total code under 5000 characters, plan and message 1-2 sentences.`;
  const send = () => fetch("https://text.pollinations.ai/openai", {
    method: "POST", headers: { "content-type": "application/json", ...(getPollenKey() ? { authorization: "Bearer " + getPollenKey() } : {}) },
    body: JSON.stringify({ model: "openai", max_tokens: 16000, reasoning_effort: "low", messages: [{ role: "system", content: sys }, ...messages], response_format: { type: "json_object" } }),
  });
  let res = await send();
  if (res.status === 402 || res.status === 429) { // free tier: 1 reply / 45s — wait and retry once
    await new Promise((r) => setTimeout(r, 46000));
    res = await send();
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
  catch { return { result: { message: text, scripts: [] } }; }
}

async function callClaude(messages) {
  const API_KEY = getKey(); if (!API_KEY) return callFree(messages);
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


export { callClaude as generateGame, generateMesh };

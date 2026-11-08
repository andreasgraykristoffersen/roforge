// Optional local preview server. The app is fully static (docs/) and runs in the browser,
// so you can also host docs/ on GitHub Pages, Netlify, Vercel, etc.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "docs");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === "/" ? "index.html" : path.normalize(req.url.split("?")[0]));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end("Not found");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`RoForge at http://localhost:${PORT}`));

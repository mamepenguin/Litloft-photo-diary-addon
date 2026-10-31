// Static server rooted at e2e/fixture/.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "fixture");
const port = Number(process.argv[2]);
const types = { ".html": "text/html", ".js": "text/javascript" };

createServer(async (req, res) => {
  const name = normalize(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  try {
    const body = await readFile(join(root, name));
    res.writeHead(200, { "Content-Type": types[extname(name)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1");

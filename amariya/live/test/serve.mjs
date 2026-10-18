// Serves a static folder with clean URLs, like Vercel: node serve.mjs <dir> <port>
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
const [, , root, port = '4400'] = process.argv
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' }
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (!extname(p)) p = p.replace(/\/$/, '') + '/index.html'
  try { const data = await readFile(join(root, p)); res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }); res.end(data) } catch { res.writeHead(404); res.end('not found') }
}).listen(+port, '127.0.0.1', () => console.log('serving', root, 'on', port))

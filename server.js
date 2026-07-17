import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4'
};

const server = http.createServer((req, res) => {
  // Strip query parameters
  const urlPath = req.url.split('?')[0];
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);

  // Safety check: prevent path traversal
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Dynamic rewrite for ES Module Worker bare imports
  if (urlPath === '/exporter-worker.js') {
    fs.readFile(filePath, 'utf8', (err, code) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not Found');
      } else {
        // Rewrite "mp4-muxer" bare import to a browser-compatible path on the fly
        const rewrittenCode = code.replace(
          /import\s+\*\s+as\s+Mp4Muxer\s+from\s+["']mp4-muxer["']/g,
          'import * as Mp4Muxer from "/node_modules/mp4-muxer/build/mp4-muxer.mjs"'
        );
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(rewrittenCode);
      }
    });
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('Not Found');
      } else {
        res.statusCode = 500;
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000; // Render-ന് വേണ്ടി process.env.PORT ചേർത്തു

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((req, res) => {
  // CORS error വരാതിരിക്കാൻ
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const urlPath = req.url.split('?')[0];

  // 1. ഓഡിയോ ജനറേറ്റ് ചെയ്യാനുള്ള പുതിയ API വഴി (/api/tts)
  if (urlPath === '/api/tts') {
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const text = urlParams.searchParams.get('text') || 'Hello';
    const lang = urlParams.searchParams.get('lang') || 'en';
    
    // Google Translate-ന്റെ സൗജന്യ TTS ലിങ്ക്
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;

    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    
    // ഗൂഗിളിൽ നിന്ന് ഓഡിയോ എടുത്ത് നേരിട്ട് ബ്രൗസറിലേക്ക് കൊടുക്കുന്നു (Stream)
    https.get(googleTtsUrl, (googleRes) => {
      googleRes.pipe(res);
    }).on('error', (e) => {
      res.statusCode = 500;
      res.end('Audio Generation Failed');
    });
    return;
  }

  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);

  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  if (urlPath === '/exporter-worker.js') {
    fs.readFile(filePath, 'utf8', (err, code) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not Found');
      } else {
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
  console.log(`Server is running at port ${PORT}`);
});
// ローカル確認用の静的ファイルサーバー(依存パッケージなし)。
// ES Modules は file:// では読み込めないため、src/ を HTTP で配信する。

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, headers = {}, body) {
  res.writeHead(status, headers);
  res.end(body);
}

export function createStaticServer(rootDir) {
  const root = resolve(rootDir);

  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { Allow: 'GET, HEAD' });
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request');
    }
    if (pathname.includes('\0')) {
      return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request');
    }

    // %2f などのエンコードされた区切り文字はデコード後に ".." として現れるため、
    // 解決後のパスがルート配下にあることを必ず確認する
    const filePath = resolve(join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname));
    if (!filePath.startsWith(root + sep)) {
      return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
    }

    try {
      const body = await readFile(filePath);
      const headers = {
        'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
      };
      // HEAD のときは Node が本文を自動的に省くため、そのまま body を渡してよい
      return send(res, 200, headers, body);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR' || error.code === 'ENOTDIR') {
        return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
      }
      console.error(error);
      return send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Internal Server Error');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  const server = createStaticServer(fileURLToPath(new URL('./src', import.meta.url)));
  server.listen(port, host, () => {
    console.log(`TODO アプリを起動しました: http://${host}:${port}`);
  });
}

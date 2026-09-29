import { after, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../server.js';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const SECRET = 'top-secret-outside-of-root';

let workDir;
let fixtureServer;
let fixtureBase;
let appServer;
let appBase;

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

const close = (server) => new Promise((resolve) => server.close(resolve));

before(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'ccn2-todo-server-'));
  const root = join(workDir, 'public');
  await mkdir(join(root, 'nested'), { recursive: true });
  await mkdir(join(root, 'no-index'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<h1>ルート</h1>');
  await writeFile(join(root, 'nested', 'index.html'), '<h1>nested</h1>');
  await writeFile(join(root, 'app.js'), 'export const answer = 42;');
  await writeFile(join(root, 'style.css'), 'body { color: red; }');
  await writeFile(join(root, 'data.json'), '{"ok":true}');
  await writeFile(join(root, 'file.unknown-ext'), 'binary-ish');
  await writeFile(join(workDir, 'secret.txt'), SECRET);

  fixtureServer = createStaticServer(root);
  fixtureBase = await listen(fixtureServer);
  appServer = createStaticServer(SRC_DIR);
  appBase = await listen(appServer);
});

after(async () => {
  await close(fixtureServer);
  await close(appServer);
  await rm(workDir, { recursive: true, force: true });
});

describe('createStaticServer: ファイル配信', () => {
  test('/ は index.html を text/html で返す', async () => {
    const response = await fetch(`${fixtureBase}/`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await response.text(), '<h1>ルート</h1>');
  });

  test('サブディレクトリ(末尾スラッシュ)は、その中の index.html を返す', async () => {
    const response = await fetch(`${fixtureBase}/nested/`);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<h1>nested</h1>');
  });

  // ES Modules は JavaScript の MIME タイプで配信されないとブラウザが読み込みを拒否する
  test('.js は JavaScript の MIME タイプで返す', async () => {
    const response = await fetch(`${fixtureBase}/app.js`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(await response.text(), 'export const answer = 42;');
  });

  test('拡張子ごとに Content-Type を返し分ける(css / json / 未知)', async () => {
    const css = await fetch(`${fixtureBase}/style.css`);
    const json = await fetch(`${fixtureBase}/data.json`);
    const unknown = await fetch(`${fixtureBase}/file.unknown-ext`);

    assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
    assert.equal(json.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(unknown.headers.get('content-type'), 'application/octet-stream');
  });

  test('クエリ文字列は無視してファイルを返す', async () => {
    const response = await fetch(`${fixtureBase}/app.js?v=123`);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'export const answer = 42;');
  });

  test('HEAD はヘッダーだけを返し、本文は空', async () => {
    const response = await fetch(`${fixtureBase}/app.js`, { method: 'HEAD' });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(await response.text(), '');
  });
});

describe('createStaticServer: エラー応答', () => {
  test('存在しないパスは 404', async () => {
    const response = await fetch(`${fixtureBase}/missing.js`);

    assert.equal(response.status, 404);
  });

  test('index.html のないディレクトリは 404', async () => {
    assert.equal((await fetch(`${fixtureBase}/no-index/`)).status, 404);
    assert.equal((await fetch(`${fixtureBase}/no-index`)).status, 404);
  });

  for (const method of ['POST', 'PUT', 'DELETE']) {
    test(`${method} は 405 と Allow ヘッダーを返す`, async () => {
      const response = await fetch(`${fixtureBase}/app.js`, { method });

      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    });
  }

  test('不正な percent-encoding は 400', async () => {
    const response = await fetch(`${fixtureBase}/%E0%A4%A`);

    assert.equal(response.status, 400);
  });

  test('NUL バイトを含むパスは 400', async () => {
    const response = await fetch(`${fixtureBase}/app.js%00.txt`);

    assert.equal(response.status, 400);
  });

  // root ユーザーは権限のないファイルも読めてしまうため、その場合は検証できない
  test(
    '読み取り権限のないファイルは 500 を返し、原因をログに出力してもサーバーは動き続ける',
    { skip: process.getuid?.() === 0 },
    async () => {
      const unreadable = join(workDir, 'public', 'unreadable.txt');
      await writeFile(unreadable, 'x');
      await chmod(unreadable, 0o000);
      const logged = mock.method(console, 'error', () => {});
      try {
        const response = await fetch(`${fixtureBase}/unreadable.txt`);

        assert.equal(response.status, 500);
        assert.equal(logged.mock.callCount(), 1);
        assert.equal(logged.mock.calls[0].arguments[0].code, 'EACCES');
        assert.equal((await fetch(`${fixtureBase}/app.js`)).status, 200);
      } finally {
        logged.mock.restore();
        await chmod(unreadable, 0o644);
      }
    },
  );
});

describe('createStaticServer: ルート外のファイルは配信しない', () => {
  const traversalPaths = [
    ['エンコードしたスラッシュ', '/..%2fsecret.txt'],
    ['ドットもスラッシュもエンコード', '/%2e%2e%2fsecret.txt'],
    ['深い階層から遡る', '/nested/..%2f..%2fsecret.txt'],
    ['バックスラッシュ区切り', '/..%5csecret.txt'],
  ];

  for (const [label, path] of traversalPaths) {
    test(`${label}(${path})では 404 になり、内容が漏れない`, async () => {
      const response = await fetch(`${fixtureBase}${path}`);
      const body = await response.text();

      assert.equal(response.status, 404);
      assert.ok(!body.includes(SECRET));
    });
  }

  test('ルート直下のファイルは同じ経路で正しく読める(対照実験)', async () => {
    const response = await fetch(`${fixtureBase}/nested/..%2fapp.js`);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'export const answer = 42;');
  });
});

describe('src/ の配信(実アプリのスモークテスト)', () => {
  test('index.html が配信され、アプリのエントリーポイントを module として読み込む', async () => {
    const response = await fetch(`${appBase}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<title>TODO<\/title>/);
    assert.match(html, /<script type="module" src="app\.js"><\/script>/);
  });

  for (const file of ['app.js', 'todo-list.js', 'filter.js', 'storage.js', 'edit-keys.js']) {
    test(`${file} が JavaScript として配信される`, async () => {
      const response = await fetch(`${appBase}/${file}`);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
    });
  }

  test('style.css が配信される', async () => {
    const response = await fetch(`${appBase}/style.css`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/css; charset=utf-8');
  });

  test('src/ の外にある package.json は配信されない', async () => {
    assert.equal((await fetch(`${appBase}/package.json`)).status, 404);
    assert.equal((await fetch(`${appBase}/..%2fpackage.json`)).status, 404);
  });
});

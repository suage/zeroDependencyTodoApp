import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Vercel は、ルートまたは src/ にある server.{js,cjs,mjs,ts,cts,mts} を Node.js サーバーのエントリーポイントと自動判定し、
// Function としてデプロイしようとする。このアプリは静的サイトなので、該当する名前のファイルがあると
// 「The default export must be a function or server」でデプロイが失敗する。
const VERCEL_SERVER_ENTRYPOINT = /^server\.(js|cjs|mjs|ts|cts|mts)$/;

describe('Vercel へのデプロイ設定', () => {
  for (const [label, dir] of [['プロジェクトのルート', ''], ['src/', 'src']]) {
    test(`${label}に、Vercel がサーバーと判定するファイル(server.*)がない`, async () => {
      const names = await readdir(join(ROOT, dir));

      assert.deepEqual(names.filter((name) => VERCEL_SERVER_ENTRYPOINT.test(name)), []);
    });
  }

  test('vercel.json は「Other」プリセットを指定し、index.html のある src/ を公開する', async () => {
    const config = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));

    assert.equal(config.framework, null);
    assert.equal(config.outputDirectory, 'src');
    await access(join(ROOT, config.outputDirectory, 'index.html'));
  });
});

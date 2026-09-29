import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_KEY, loadTodos, saveTodos } from '../src/storage.js';

// Web Storage 互換の最小実装(getItem / setItem の振る舞いは本物と同じ)
class MemoryStorage {
  #data = new Map();

  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }

  setItem(key, value) {
    this.#data.set(key, String(value));
  }
}

const throwingStorage = () => ({
  getItem() {
    throw new DOMException('denied', 'SecurityError');
  },
  setItem() {
    throw new DOMException('quota', 'QuotaExceededError');
  },
});

const makeTodo = (overrides = {}) => ({
  id: 'todo-1',
  title: '牛乳を買う',
  completed: false,
  createdAt: 1_700_000_000_000,
  ...overrides,
});

const storageWith = (value) => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  return storage;
};

describe('saveTodos', () => {
  test('STORAGE_KEY に JSON 配列として保存し、true を返す', () => {
    const storage = new MemoryStorage();
    const todos = [makeTodo({ id: 'a' }), makeTodo({ id: 'b', completed: true })];

    const saved = saveTodos(storage, todos);

    assert.equal(saved, true);
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), todos);
  });

  test('空の配列も保存できる(前回の内容を上書きする)', () => {
    const storage = new MemoryStorage();
    saveTodos(storage, [makeTodo()]);

    saveTodos(storage, []);

    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), []);
  });

  test('容量超過などで setItem が例外を投げても、例外を伝播させず false を返す', () => {
    assert.equal(saveTodos(throwingStorage(), [makeTodo()]), false);
  });

  test('ストレージが利用できない(null / undefined)場合は false を返す', () => {
    assert.equal(saveTodos(null, [makeTodo()]), false);
    assert.equal(saveTodos(undefined, [makeTodo()]), false);
  });
});

describe('loadTodos', () => {
  test('何も保存されていなければ空の配列を返す', () => {
    assert.deepEqual(loadTodos(new MemoryStorage()), []);
  });

  test('saveTodos で保存した内容をそのまま復元できる', () => {
    const storage = new MemoryStorage();
    const todos = [
      makeTodo({ id: 'a', title: '日本語 と "quote" と <b>tag</b> と 😀' }),
      makeTodo({ id: 'b', completed: true, createdAt: 1_700_000_000_500 }),
    ];
    saveTodos(storage, todos);

    assert.deepEqual(loadTodos(storage), todos);
  });

  test('壊れた JSON でも例外を投げず、空の配列を返す', () => {
    assert.deepEqual(loadTodos(storageWith('{not json')), []);
  });

  for (const [label, raw] of [
    ['オブジェクト', '{}'],
    ['文字列', '"text"'],
    ['数値', '42'],
    ['真偽値', 'true'],
    ['null', 'null'],
  ]) {
    test(`保存内容が配列でない(${label})場合は空の配列を返す`, () => {
      assert.deepEqual(loadTodos(storageWith(raw)), []);
    });
  }

  test('getItem が例外を投げても、例外を伝播させず空の配列を返す', () => {
    assert.deepEqual(loadTodos(throwingStorage()), []);
  });

  test('ストレージが利用できない(null / undefined)場合は空の配列を返す', () => {
    assert.deepEqual(loadTodos(null), []);
    assert.deepEqual(loadTodos(undefined), []);
  });

  const valid = makeTodo({ id: 'valid', title: '正しいタスク' });
  const invalidEntries = [
    ['id が数値', makeTodo({ id: 1 })],
    ['id が空文字', makeTodo({ id: '' })],
    ['title が数値', makeTodo({ title: 123 })],
    ['title が空白のみ', makeTodo({ title: ' 　 ' })],
    ['completed が文字列', makeTodo({ completed: 'true' })],
    ['createdAt が文字列', makeTodo({ createdAt: '1700000000000' })],
    ['createdAt が null(NaN の JSON 表現)', makeTodo({ createdAt: null })],
    ['プロパティの欠落', { id: 'only-id' }],
    ['null', null],
    ['数値', 5],
    ['文字列', 'text'],
    ['配列', []],
  ];

  for (const [label, invalid] of invalidEntries) {
    test(`不正な要素(${label})だけを捨て、正しい要素は残す`, () => {
      assert.deepEqual(loadTodos(storageWith([invalid, valid])), [valid]);
    });
  }

  test('id が重複している場合は、最初の要素だけを残す', () => {
    const first = makeTodo({ id: 'dup', title: '最初' });
    const second = makeTodo({ id: 'dup', title: '後から' });

    assert.deepEqual(loadTodos(storageWith([first, second])), [first]);
  });

  test('未知のプロパティは取り込まない', () => {
    const loaded = loadTodos(storageWith([{ ...makeTodo({ id: 'a' }), injected: 'x' }]));

    assert.deepEqual(loaded, [makeTodo({ id: 'a' })]);
  });
});

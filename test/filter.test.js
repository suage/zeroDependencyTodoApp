import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { FILTERS, filterFromHash, filterTodos, hashFromFilter } from '../src/filter.js';

const todos = Object.freeze([
  Object.freeze({ id: 'a', title: '一', completed: false, createdAt: 1 }),
  Object.freeze({ id: 'b', title: '二', completed: true, createdAt: 2 }),
  Object.freeze({ id: 'c', title: '三', completed: false, createdAt: 3 }),
  Object.freeze({ id: 'd', title: '四', completed: true, createdAt: 4 }),
]);

describe('FILTERS', () => {
  test('all / active / completed の 3 種類を定義する', () => {
    assert.deepEqual([...FILTERS], ['all', 'active', 'completed']);
  });
});

describe('filterTodos', () => {
  test('all はすべてのタスクを元の順序で返す', () => {
    assert.deepEqual(filterTodos(todos, 'all').map((todo) => todo.id), ['a', 'b', 'c', 'd']);
  });

  test('active は未完了のタスクだけを返す', () => {
    assert.deepEqual(filterTodos(todos, 'active').map((todo) => todo.id), ['a', 'c']);
  });

  test('completed は完了済みのタスクだけを返す', () => {
    assert.deepEqual(filterTodos(todos, 'completed').map((todo) => todo.id), ['b', 'd']);
  });

  test('空のリストはどのフィルターでも空', () => {
    for (const filter of FILTERS) {
      assert.deepEqual(filterTodos([], filter), []);
    }
  });

  test('該当するタスクがなければ空の配列を返す', () => {
    const onlyActive = todos.filter((todo) => !todo.completed);

    assert.deepEqual(filterTodos(onlyActive, 'completed'), []);
  });

  for (const unknown of ['unknown', '', undefined, null, 'constructor', '__proto__', 'ALL']) {
    test(`未知のフィルター ${JSON.stringify(unknown) ?? String(unknown)} は RangeError になる`, () => {
      assert.throws(() => filterTodos(todos, unknown), RangeError);
    });
  }
});

describe('filterFromHash', () => {
  const cases = [
    ['#/', 'all'],
    ['#/active', 'active'],
    ['#/completed', 'completed'],
    ['', 'all'],
    ['#', 'all'],
    ['#/unknown', 'all'],
    ['#/active/extra', 'all'],
    ['#/Active', 'all'],
    ['active', 'all'],
    [undefined, 'all'],
  ];

  for (const [hash, expected] of cases) {
    test(`${JSON.stringify(hash) ?? 'undefined'} → ${expected}`, () => {
      assert.equal(filterFromHash(hash), expected);
    });
  }
});

describe('hashFromFilter', () => {
  test('フィルターごとの URL ハッシュを返す', () => {
    assert.equal(hashFromFilter('all'), '#/');
    assert.equal(hashFromFilter('active'), '#/active');
    assert.equal(hashFromFilter('completed'), '#/completed');
  });

  test('hashFromFilter と filterFromHash は互いに逆変換になる', () => {
    for (const filter of FILTERS) {
      assert.equal(filterFromHash(hashFromFilter(filter)), filter);
    }
  });

  test('未知のフィルターは RangeError になる', () => {
    assert.throws(() => hashFromFilter('unknown'), RangeError);
  });
});

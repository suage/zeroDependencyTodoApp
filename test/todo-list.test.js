import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TITLE_LENGTH,
  TodoValidationError,
  addTodo,
  clearCompleted,
  countCompleted,
  countRemaining,
  editTodo,
  removeTodo,
  toggleAll,
  toggleTodo,
} from '../src/todo-list.js';

const makeTodo = (overrides = {}) => ({
  id: 'todo-1',
  title: '牛乳を買う',
  completed: false,
  createdAt: 1_700_000_000_000,
  ...overrides,
});

// 凍結しておくことで、実装が入力を破壊的に変更すると TypeError でテストが落ちる
const freezeAll = (todos) => Object.freeze(todos.map((todo) => Object.freeze({ ...todo })));

const INVALID_TITLES = [
  ['空文字', ''],
  ['半角スペースのみ', '   '],
  ['全角スペースのみ', '　　'],
  ['改行とタブのみ', '\n\t'],
  ['undefined', undefined],
  ['null', null],
  ['数値', 123],
  ['オブジェクト', {}],
];

describe('addTodo', () => {
  test('指定した id と時刻で、未完了のタスクを追加する', () => {
    const result = addTodo([], '牛乳を買う', { id: 'a1', now: 1_700_000_000_000 });

    assert.deepEqual(result, [
      { id: 'a1', title: '牛乳を買う', completed: false, createdAt: 1_700_000_000_000 },
    ]);
  });

  test('既存のタスクの順序と内容を保ったまま、末尾に追加する', () => {
    const existing = freezeAll([makeTodo({ id: 'a' }), makeTodo({ id: 'b', title: '洗濯' })]);

    const result = addTodo(existing, '掃除', { id: 'c', now: 5 });

    assert.deepEqual(result.map((todo) => todo.id), ['a', 'b', 'c']);
    assert.deepEqual(result.slice(0, 2), existing);
    assert.equal(result[2].title, '掃除');
  });

  test('元の配列を変更せず、新しい配列を返す', () => {
    const existing = freezeAll([makeTodo()]);

    const result = addTodo(existing, '新規', { id: 'n', now: 1 });

    assert.notEqual(result, existing);
    assert.equal(existing.length, 1);
    assert.equal(result.length, 2);
  });

  test('前後の空白(全角含む)を取り除いて保存する', () => {
    const [todo] = addTodo([], '  　牛乳を買う　 ', { id: 'a', now: 1 });

    assert.equal(todo.title, '牛乳を買う');
  });

  test('タスク名の途中の空白は保持する', () => {
    const [todo] = addTodo([], '牛乳を  買う', { id: 'a', now: 1 });

    assert.equal(todo.title, '牛乳を  買う');
  });

  test('HTML として解釈され得る文字列も加工せずそのまま保持する', () => {
    const [todo] = addTodo([], '<script>alert("x")</script>', { id: 'a', now: 1 });

    assert.equal(todo.title, '<script>alert("x")</script>');
  });

  test('id を省略すると、タスクごとに異なる空でない id が採番される', () => {
    const [first, second] = addTodo(addTodo([], '一つ目'), '二つ目');

    assert.equal(typeof first.id, 'string');
    assert.notEqual(first.id, '');
    assert.notEqual(first.id, second.id);
  });

  // http://192.168.x.x のような安全でないコンテキストでは crypto.randomUUID が存在しない
  test('crypto.randomUUID が使えない環境でも、一意な id を採番できる', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const todos = addTodo(addTodo(addTodo([], '一'), '二'), '三');
      const ids = todos.map((todo) => todo.id);

      assert.ok(ids.every((id) => typeof id === 'string' && id !== ''));
      assert.equal(new Set(ids).size, 3);
    } finally {
      Object.defineProperty(globalThis, 'crypto', original);
    }
  });

  test('時刻を省略すると、現在時刻が createdAt に入る', () => {
    const before = Date.now();
    const [todo] = addTodo([], '今');
    const after = Date.now();

    assert.ok(todo.createdAt >= before && todo.createdAt <= after);
  });

  for (const [label, input] of INVALID_TITLES) {
    test(`タスク名が ${label} の場合は TodoValidationError を投げ、入力を変更しない`, () => {
      const existing = freezeAll([makeTodo()]);

      assert.throws(
        () => addTodo(existing, input),
        (error) => error instanceof TodoValidationError && /入力/.test(error.message),
      );
      assert.equal(existing.length, 1);
    });
  }

  test('上限ちょうどの文字数は受け付ける', () => {
    const title = 'あ'.repeat(MAX_TITLE_LENGTH);

    const [todo] = addTodo([], title, { id: 'a', now: 1 });

    assert.equal(todo.title, title);
  });

  test('上限を 1 文字超えると TodoValidationError になり、上限値がメッセージに含まれる', () => {
    assert.throws(
      () => addTodo([], 'あ'.repeat(MAX_TITLE_LENGTH + 1)),
      (error) => error instanceof TodoValidationError && error.message.includes(String(MAX_TITLE_LENGTH)),
    );
  });

  test('文字数はコードポイント単位で数える(絵文字 1 つは 1 文字)', () => {
    const title = '😀'.repeat(MAX_TITLE_LENGTH);

    const [todo] = addTodo([], title, { id: 'a', now: 1 });

    assert.equal(todo.title, title);
  });

  test('空白を取り除いた後の文字数で上限を判定する', () => {
    const title = `${' '.repeat(50)}${'あ'.repeat(MAX_TITLE_LENGTH)}${'　'.repeat(50)}`;

    const [todo] = addTodo([], title, { id: 'a', now: 1 });

    assert.equal(todo.title, 'あ'.repeat(MAX_TITLE_LENGTH));
  });
});

describe('toggleTodo', () => {
  test('未完了のタスクを完了にする', () => {
    const result = toggleTodo(freezeAll([makeTodo({ id: 'a', completed: false })]), 'a');

    assert.equal(result[0].completed, true);
  });

  test('完了済みのタスクを未完了に戻す', () => {
    const result = toggleTodo(freezeAll([makeTodo({ id: 'a', completed: true })]), 'a');

    assert.equal(result[0].completed, false);
  });

  test('対象以外のタスクは変更しない', () => {
    const todos = freezeAll([
      makeTodo({ id: 'a' }),
      makeTodo({ id: 'b', completed: true }),
      makeTodo({ id: 'c' }),
    ]);

    const result = toggleTodo(todos, 'a');

    assert.deepEqual(result.map((todo) => todo.completed), [true, true, false]);
    assert.deepEqual(result.map((todo) => todo.id), ['a', 'b', 'c']);
  });

  test('id 以外の項目(タイトル・作成時刻)は保持する', () => {
    const original = makeTodo({ id: 'a', title: '洗濯', createdAt: 42 });

    const [result] = toggleTodo(freezeAll([original]), 'a');

    assert.equal(result.title, '洗濯');
    assert.equal(result.createdAt, 42);
  });

  test('存在しない id を指定しても、リストの内容は変わらない', () => {
    const todos = freezeAll([makeTodo({ id: 'a' })]);

    assert.deepEqual(toggleTodo(todos, 'missing'), todos);
  });
});

describe('editTodo', () => {
  test('タイトルを更新し、前後の空白は取り除く', () => {
    const result = editTodo(freezeAll([makeTodo({ id: 'a' })]), 'a', '　牛乳とパンを買う ');

    assert.equal(result[0].title, '牛乳とパンを買う');
  });

  test('完了状態・id・作成時刻は保持する', () => {
    const todos = freezeAll([makeTodo({ id: 'a', completed: true, createdAt: 42 })]);

    const [result] = editTodo(todos, 'a', '新しい名前');

    assert.equal(result.completed, true);
    assert.equal(result.id, 'a');
    assert.equal(result.createdAt, 42);
  });

  test('対象以外のタスクは変更しない', () => {
    const todos = freezeAll([makeTodo({ id: 'a' }), makeTodo({ id: 'b', title: '洗濯' })]);

    const result = editTodo(todos, 'a', '変更後');

    assert.equal(result[1].title, '洗濯');
  });

  for (const [label, input] of INVALID_TITLES) {
    test(`タイトルが ${label} の場合は TodoValidationError を投げる`, () => {
      const todos = freezeAll([makeTodo({ id: 'a' })]);

      assert.throws(() => editTodo(todos, 'a', input), TodoValidationError);
      assert.equal(todos[0].title, '牛乳を買う');
    });
  }

  test('上限ちょうどは受け付け、1 文字超えると拒否する', () => {
    const todos = freezeAll([makeTodo({ id: 'a' })]);

    const accepted = editTodo(todos, 'a', 'あ'.repeat(MAX_TITLE_LENGTH));

    assert.equal(accepted[0].title.length, MAX_TITLE_LENGTH);
    assert.throws(() => editTodo(todos, 'a', 'あ'.repeat(MAX_TITLE_LENGTH + 1)), TodoValidationError);
  });

  test('存在しない id を指定しても、リストの内容は変わらない', () => {
    const todos = freezeAll([makeTodo({ id: 'a' })]);

    assert.deepEqual(editTodo(todos, 'missing', '変更後'), todos);
  });
});

describe('removeTodo', () => {
  test('指定した id のタスクだけを取り除き、残りの順序を保つ', () => {
    const todos = freezeAll([makeTodo({ id: 'a' }), makeTodo({ id: 'b' }), makeTodo({ id: 'c' })]);

    const result = removeTodo(todos, 'b');

    assert.deepEqual(result.map((todo) => todo.id), ['a', 'c']);
    assert.equal(todos.length, 3);
  });

  test('存在しない id を指定しても、リストの内容は変わらない', () => {
    const todos = freezeAll([makeTodo({ id: 'a' })]);

    assert.deepEqual(removeTodo(todos, 'missing'), todos);
  });

  test('空のリストに対しても空のリストを返す', () => {
    assert.deepEqual(removeTodo([], 'a'), []);
  });
});

describe('clearCompleted', () => {
  test('完了済みのタスクだけを取り除き、未完了の順序を保つ', () => {
    const todos = freezeAll([
      makeTodo({ id: 'a', completed: false }),
      makeTodo({ id: 'b', completed: true }),
      makeTodo({ id: 'c', completed: false }),
      makeTodo({ id: 'd', completed: true }),
    ]);

    const result = clearCompleted(todos);

    assert.deepEqual(result.map((todo) => todo.id), ['a', 'c']);
  });

  test('完了済みがなければ内容は変わらない', () => {
    const todos = freezeAll([makeTodo({ id: 'a' }), makeTodo({ id: 'b' })]);

    assert.deepEqual(clearCompleted(todos), todos);
  });

  test('すべて完了済みなら空になる', () => {
    const todos = freezeAll([makeTodo({ id: 'a', completed: true }), makeTodo({ id: 'b', completed: true })]);

    assert.deepEqual(clearCompleted(todos), []);
  });
});

describe('toggleAll', () => {
  test('未完了が 1 つでもあれば、すべてを完了にする', () => {
    const todos = freezeAll([
      makeTodo({ id: 'a', completed: true }),
      makeTodo({ id: 'b', completed: false }),
      makeTodo({ id: 'c', completed: false }),
    ]);

    const result = toggleAll(todos);

    assert.deepEqual(result.map((todo) => todo.completed), [true, true, true]);
  });

  test('すべて完了済みなら、すべてを未完了に戻す', () => {
    const todos = freezeAll([makeTodo({ id: 'a', completed: true }), makeTodo({ id: 'b', completed: true })]);

    const result = toggleAll(todos);

    assert.deepEqual(result.map((todo) => todo.completed), [false, false]);
  });

  test('id・タイトル・順序は変えない', () => {
    const todos = freezeAll([makeTodo({ id: 'a', title: '一' }), makeTodo({ id: 'b', title: '二' })]);

    const result = toggleAll(todos);

    assert.deepEqual(result.map(({ id, title }) => ({ id, title })), [
      { id: 'a', title: '一' },
      { id: 'b', title: '二' },
    ]);
  });

  test('空のリストは空のまま', () => {
    assert.deepEqual(toggleAll([]), []);
  });
});

describe('countRemaining / countCompleted', () => {
  const todos = [
    makeTodo({ id: 'a', completed: false }),
    makeTodo({ id: 'b', completed: true }),
    makeTodo({ id: 'c', completed: false }),
    makeTodo({ id: 'd', completed: true }),
    makeTodo({ id: 'e', completed: true }),
  ];

  test('未完了と完了済みの件数をそれぞれ数える', () => {
    assert.equal(countRemaining(todos), 2);
    assert.equal(countCompleted(todos), 3);
  });

  test('空のリストはどちらも 0 件', () => {
    assert.equal(countRemaining([]), 0);
    assert.equal(countCompleted([]), 0);
  });

  test('未完了と完了済みの合計は全件数と一致する', () => {
    assert.equal(countRemaining(todos) + countCompleted(todos), todos.length);
  });
});

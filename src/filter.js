// 表示フィルター(すべて / 未完了 / 完了)と、URL ハッシュとの相互変換。

export const FILTERS = Object.freeze(['all', 'active', 'completed']);

const PREDICATES = {
  all: () => true,
  active: (todo) => !todo.completed,
  completed: (todo) => todo.completed,
};

const HASH_PATTERN = /^#\/(active|completed)?$/;

// 'constructor' のようなプロトタイプ上の名前を通さないよう、オブジェクト参照ではなく FILTERS で検証する
function assertFilter(filter) {
  if (!FILTERS.includes(filter)) {
    throw new RangeError(`未知のフィルターです: ${String(filter)}`);
  }
}

export function filterTodos(todos, filter) {
  assertFilter(filter);
  return todos.filter(PREDICATES[filter]);
}

// 想定外のハッシュ(手入力など)は all として扱う
export function filterFromHash(hash) {
  return HASH_PATTERN.exec(hash)?.[1] ?? 'all';
}

export function hashFromFilter(filter) {
  assertFilter(filter);
  return filter === 'all' ? '#/' : `#/${filter}`;
}

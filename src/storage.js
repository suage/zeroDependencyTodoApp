// localStorage(Web Storage 互換)への保存と復元。
// ストレージの中身はユーザーが書き換えられるため、読み込み時に形式を検証して不正な要素は捨てる。

export const STORAGE_KEY = 'ccn2-todo:todos';

function isValidTodo(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    value.id !== '' &&
    typeof value.title === 'string' &&
    value.title.trim() !== '' &&
    typeof value.completed === 'boolean' &&
    Number.isFinite(value.createdAt)
  );
}

export function loadTodos(storage) {
  let parsed;
  try {
    const raw = storage?.getItem(STORAGE_KEY) ?? null;
    if (raw === null) {
      return [];
    }
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const seenIds = new Set();
  const todos = [];
  for (const item of parsed) {
    // id が重複すると 1 件の操作が複数件に効いてしまうため、最初の要素だけを採用する
    if (!isValidTodo(item) || seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    todos.push({
      id: item.id,
      title: item.title,
      completed: item.completed,
      createdAt: item.createdAt,
    });
  }
  return todos;
}

// 保存できたかどうかを返す(容量超過やプライベートモードでは false)
export function saveTodos(storage, todos) {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(todos));
    return true;
  } catch {
    return false;
  }
}

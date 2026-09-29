// TODO リストの操作(純粋関数)。
// すべて元の配列を変更せず、新しい配列を返す。DOM やストレージには依存しない。

export const MAX_TITLE_LENGTH = 200;

export class TodoValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TodoValidationError';
  }
}

// randomUUID は安全なコンテキスト(https / localhost)でしか使えないため、それ以外は乱数で代替する
function createId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function validateTitle(rawTitle) {
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (title === '') {
    throw new TodoValidationError('タスク名を入力してください');
  }
  // サロゲートペア(絵文字など)を 1 文字として数えるためコードポイント単位で判定する
  if ([...title].length > MAX_TITLE_LENGTH) {
    throw new TodoValidationError(`タスク名は${MAX_TITLE_LENGTH}文字以内で入力してください`);
  }
  return title;
}

function updateTodo(todos, id, update) {
  return todos.map((todo) => (todo.id === id ? update(todo) : todo));
}

export function addTodo(todos, title, { id = createId(), now = Date.now() } = {}) {
  const todo = { id, title: validateTitle(title), completed: false, createdAt: now };
  return [...todos, todo];
}

export function toggleTodo(todos, id) {
  return updateTodo(todos, id, (todo) => ({ ...todo, completed: !todo.completed }));
}

export function editTodo(todos, id, title) {
  const validTitle = validateTitle(title);
  return updateTodo(todos, id, (todo) => ({ ...todo, title: validTitle }));
}

export function removeTodo(todos, id) {
  return todos.filter((todo) => todo.id !== id);
}

export function clearCompleted(todos) {
  return todos.filter((todo) => !todo.completed);
}

// 未完了が 1 つでもあれば全件を完了に、すべて完了済みなら全件を未完了に戻す
export function toggleAll(todos) {
  const completed = countRemaining(todos) > 0;
  return todos.map((todo) => (todo.completed === completed ? todo : { ...todo, completed }));
}

export function countRemaining(todos) {
  return todos.filter((todo) => !todo.completed).length;
}

export function countCompleted(todos) {
  return todos.filter((todo) => todo.completed).length;
}

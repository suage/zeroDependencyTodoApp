// 画面の組み立てとイベント処理。ロジックは todo-list / filter / storage に任せ、ここは DOM との橋渡しだけを行う。

import {
  TodoValidationError,
  addTodo,
  clearCompleted,
  countCompleted,
  countRemaining,
  editTodo,
  removeTodo,
  toggleAll,
  toggleTodo,
} from './todo-list.js';
import { editKeyAction } from './edit-keys.js';
import { filterFromHash, filterTodos } from './filter.js';
import { loadTodos, saveTodos } from './storage.js';

const EMPTY_MESSAGES = {
  all: 'タスクはまだありません。上のフォームから追加しましょう。',
  active: '未完了のタスクはありません。',
  completed: '完了したタスクはありません。',
};

// localStorage へのアクセス自体が例外になる環境(ストレージをブロックした設定など)がある
function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();

const state = {
  todos: loadTodos(storage),
  filter: filterFromHash(window.location.hash),
  editingId: null,
};

const el = {
  form: document.getElementById('add-form'),
  newTitle: document.getElementById('new-title'),
  error: document.getElementById('form-error'),
  toolbar: document.getElementById('toolbar'),
  toggleAll: document.getElementById('toggle-all'),
  list: document.getElementById('todo-list'),
  emptyMessage: document.getElementById('empty-message'),
  footer: document.getElementById('footer'),
  remaining: document.getElementById('remaining'),
  filterLinks: document.querySelectorAll('.filters a'),
  clearCompleted: document.getElementById('clear-completed'),
  storageWarning: document.getElementById('storage-warning'),
};

function showError(message) {
  el.error.textContent = message;
  el.error.hidden = false;
}

function clearError() {
  el.error.textContent = '';
  el.error.hidden = true;
}

function createButton(className, label, ariaLabel) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${className}`;
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  return button;
}

// タイトルはユーザー入力なので、innerHTML ではなく textContent / setAttribute だけで DOM に入れる
function createItem(todo) {
  const item = document.createElement('li');
  item.className = 'todo-item';
  item.dataset.id = todo.id;
  item.classList.toggle('is-completed', todo.completed);

  if (state.editingId === todo.id) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'edit-input';
    input.value = todo.title;
    input.setAttribute('aria-label', 'タスク名を編集(Enter で保存、Esc で取り消し)');
    item.append(input);
    return item;
  }

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'toggle';
  toggle.checked = todo.completed;
  toggle.setAttribute('aria-label', todo.title);

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = todo.title;

  item.append(
    toggle,
    title,
    createButton('edit', '編集', `「${todo.title}」を編集`),
    createButton('remove', '削除', `「${todo.title}」を削除`),
  );
  return item;
}

function render() {
  const visible = filterTodos(state.todos, state.filter);
  const remaining = countRemaining(state.todos);
  const hasTodos = state.todos.length > 0;

  el.list.replaceChildren(...visible.map(createItem));
  el.emptyMessage.textContent = EMPTY_MESSAGES[state.filter];
  el.emptyMessage.hidden = visible.length > 0;

  el.toolbar.hidden = !hasTodos;
  el.toggleAll.checked = hasTodos && remaining === 0;
  el.footer.hidden = !hasTodos;
  el.remaining.textContent = `残り ${remaining} 件`;
  el.clearCompleted.disabled = countCompleted(state.todos) === 0;

  for (const link of el.filterLinks) {
    if (link.dataset.filter === state.filter) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }

  const editInput = el.list.querySelector('.edit-input');
  if (editInput) {
    editInput.focus();
    editInput.select();
  }
}

function commit(todos) {
  state.todos = todos;
  el.storageWarning.hidden = saveTodos(storage, todos);
  render();
}

function focusEditButton(id) {
  el.list.querySelector(`li[data-id="${CSS.escape(id)}"] .edit`)?.focus();
}

function startEdit(id) {
  clearError();
  state.editingId = id;
  render();
}

// Enter / Esc / フォーカス喪失のどれで終わっても 1 回しか処理しないよう、editingId で重複を防ぐ
// (render で入力欄を取り除く際にブラウザが blur を発火するため、二重に呼ばれ得る)
function finishEdit(id, rawTitle, { restoreFocus = false } = {}) {
  if (state.editingId !== id) {
    return;
  }
  state.editingId = null;

  let next;
  try {
    next = editTodo(state.todos, id, rawTitle);
  } catch (error) {
    if (!(error instanceof TodoValidationError)) {
      throw error;
    }
    showError(error.message);
    render();
    if (restoreFocus) focusEditButton(id);
    return;
  }
  clearError();
  commit(next);
  if (restoreFocus) focusEditButton(id);
}

function cancelEdit(id) {
  if (state.editingId !== id) {
    return;
  }
  state.editingId = null;
  render();
  focusEditButton(id);
}

const idOf = (node) => node.closest('li').dataset.id;

el.form.addEventListener('submit', (event) => {
  event.preventDefault();

  let next;
  try {
    next = addTodo(state.todos, el.newTitle.value);
  } catch (error) {
    if (!(error instanceof TodoValidationError)) {
      throw error;
    }
    showError(error.message);
    el.newTitle.focus();
    return;
  }

  clearError();
  el.newTitle.value = '';
  commit(next);
  el.newTitle.focus();
});

el.newTitle.addEventListener('input', clearError);

el.toggleAll.addEventListener('change', () => commit(toggleAll(state.todos)));

el.clearCompleted.addEventListener('click', () => commit(clearCompleted(state.todos)));

el.list.addEventListener('change', (event) => {
  if (event.target.matches('.toggle')) {
    commit(toggleTodo(state.todos, idOf(event.target)));
  }
});

el.list.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }
  const id = idOf(button);
  if (button.classList.contains('edit')) {
    startEdit(id);
  } else if (button.classList.contains('remove')) {
    commit(removeTodo(state.todos, id));
  }
});

el.list.addEventListener('dblclick', (event) => {
  if (event.target.matches('.title')) {
    startEdit(idOf(event.target));
  }
});

el.list.addEventListener('keydown', (event) => {
  if (!event.target.matches('.edit-input')) {
    return;
  }
  const action = editKeyAction(event);
  if (action === null) {
    return;
  }
  // 処理後にフォーカスを「編集」ボタンへ戻すため、既定動作を止めないと同じ Enter がそのボタンを押して編集が再開してしまう
  event.preventDefault();
  if (action === 'save') {
    finishEdit(idOf(event.target), event.target.value, { restoreFocus: true });
  } else {
    cancelEdit(idOf(event.target));
  }
});

el.list.addEventListener('focusout', (event) => {
  if (event.target.matches('.edit-input')) {
    finishEdit(idOf(event.target), event.target.value);
  }
});

window.addEventListener('hashchange', () => {
  state.filter = filterFromHash(window.location.hash);
  state.editingId = null;
  render();
});

el.storageWarning.hidden = storage !== null;
render();

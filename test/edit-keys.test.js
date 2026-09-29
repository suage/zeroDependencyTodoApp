import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { editKeyAction } from '../src/edit-keys.js';

describe('editKeyAction', () => {
  test('Enter は保存', () => {
    assert.equal(editKeyAction({ key: 'Enter', isComposing: false, keyCode: 13 }), 'save');
  });

  test('Escape は取り消し', () => {
    assert.equal(editKeyAction({ key: 'Escape', isComposing: false, keyCode: 27 }), 'cancel');
  });

  test('isComposing は省略しても未変換扱いにならず、Enter は保存になる', () => {
    assert.equal(editKeyAction({ key: 'Enter' }), 'save');
  });

  // 日本語入力の変換確定の Enter を保存と取り違えると、文章の途中で編集が終わってしまう
  test('IME の変換中(isComposing)の Enter は無視する', () => {
    assert.equal(editKeyAction({ key: 'Enter', isComposing: true, keyCode: 229 }), null);
  });

  test('Safari のように isComposing が false でも keyCode 229 の Enter は無視する', () => {
    assert.equal(editKeyAction({ key: 'Enter', isComposing: false, keyCode: 229 }), null);
  });

  test('IME の変換中の Escape は変換の取り消しであり、編集の取り消しにはしない', () => {
    assert.equal(editKeyAction({ key: 'Escape', isComposing: true, keyCode: 229 }), null);
  });

  for (const key of ['a', 'あ', ' ', 'Tab', 'Shift', 'ArrowLeft', 'Backspace', 'enter', 'esc']) {
    test(`保存・取り消し以外のキー(${JSON.stringify(key)})は何もしない`, () => {
      assert.equal(editKeyAction({ key, isComposing: false, keyCode: 0 }), null);
    });
  }
});

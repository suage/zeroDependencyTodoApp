// タイトル編集中のキー入力を「保存 / 取り消し / 何もしない」に振り分ける。

// 日本語入力の変換中は Enter が変換の確定、Escape が変換の取り消しに使われるため、編集の操作とは扱わない。
// Safari は確定の keydown で isComposing が false になるため、keyCode 229 も変換中とみなす。
export function editKeyAction({ key, isComposing = false, keyCode = 0 }) {
  if (isComposing || keyCode === 229) {
    return null;
  }
  if (key === 'Enter') {
    return 'save';
  }
  if (key === 'Escape') {
    return 'cancel';
  }
  return null;
}

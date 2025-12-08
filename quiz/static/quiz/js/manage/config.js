// static/quiz/js/manage/config.js

export function getCSRFToken() {
  const cookieValue = document.cookie
    .split("; ")
    .find(row => row.startsWith("csrftoken="));
  return cookieValue ? cookieValue.split("=")[1] : "";
}

export function getQuizManageConfig() {
  const root = document.getElementById("quiz-manage-root");
  if (!root) return null;

  return {
    csrfToken: getCSRFToken(),

    // ✅ URLs
    addWordsUrl: root.dataset.addUrl,
    removeWordUrl: root.dataset.removeUrl,           // ✅ single delete
    bulkRemoveWordUrl: root.dataset.bulkRemoveUrl,   // ✅ bulk delete (NEW)

    // ✅ Main quiz table UI
    quizWordSearchInput: document.getElementById("quiz-word-search"),
    quizLanguageFilter: document.getElementById("quiz-language-filter"),
    quizWordTableBody: document.getElementById("quiz-word-table-body"),
    bulkDeleteBtn: document.getElementById("bulk-delete-btn"),
    selectAllQuizWords: document.getElementById("quiz-word-select-all"),
    quizWordCountNumber: document.getElementById("quiz-word-count-number"),
  };
}

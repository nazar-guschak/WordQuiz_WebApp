// static/quiz/js/manage/quiz_selection.js

export function initQuizSelection({
  quizWordTableBody,
  selectAllQuizWords,
  bulkDeleteBtn
}) {
  if (!quizWordTableBody || !selectAllQuizWords || !bulkDeleteBtn) {
    return { getSelectedWordIds: () => [] };
  }

  function getRowCheckboxes() {
    return quizWordTableBody.querySelectorAll(".quiz-word-checkbox");
  }

  function getSelectedWordIds() {
    return Array.from(
      quizWordTableBody.querySelectorAll(".quiz-word-checkbox:checked")
    ).map(cb => cb.closest("tr").dataset.wordId);
  }

  function updateBulkDeleteState() {
    const count = getSelectedWordIds().length;

    if (count > 0) {
      bulkDeleteBtn.classList.remove("d-none");
      bulkDeleteBtn.disabled = false;
      bulkDeleteBtn.textContent = `Delete selected (${count})`;
    } else {
      bulkDeleteBtn.classList.add("d-none");
      bulkDeleteBtn.disabled = true;
      bulkDeleteBtn.textContent = "Delete selected";
    }

    const allCbs = getRowCheckboxes();
    selectAllQuizWords.checked =
      allCbs.length > 0 && Array.from(allCbs).every(cb => cb.checked);
  }

  selectAllQuizWords.addEventListener("change", () => {
    const checked = selectAllQuizWords.checked;
    getRowCheckboxes().forEach(cb => (cb.checked = checked));
    updateBulkDeleteState();
  });

  quizWordTableBody.addEventListener("change", e => {
    if (e.target.classList.contains("quiz-word-checkbox")) {
      updateBulkDeleteState();
    }
  });

  updateBulkDeleteState();

  return { getSelectedWordIds };
}

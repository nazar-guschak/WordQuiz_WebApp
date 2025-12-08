// static/quiz/js/manage/quiz_single_delete.js

export function initSingleDelete({
  quizWordTableBody,
  removeWordUrl,
  csrfToken
}) {
  if (!quizWordTableBody) return;

  quizWordTableBody.addEventListener("click", e => {
    const removeBtn = e.target.closest(".remove-word-btn");
    if (!removeBtn) return;

    const row = removeBtn.closest("tr[data-word-id]");
    if (!row) return;

    const wordId = row.dataset.wordId;
    if (!confirm("Remove this word from the quiz?")) return;

    const formData = new FormData();
    formData.append("word_id", wordId);

    fetch(removeWordUrl, {
      method: "POST",
      body: formData,
      headers: {
        "X-CSRFToken": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "same-origin",
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          row.remove();
        } else {
          alert(data.error || "Failed to remove word from quiz.");
        }
      })
      .catch(err => {
        console.error("Remove word error:", err);
        alert("Network error while removing word.");
      });
  });
}

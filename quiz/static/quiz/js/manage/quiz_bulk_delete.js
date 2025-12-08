// static/quiz/js/manage/quiz_bulk_delete.js

export function initBulkDelete({
  bulkDeleteBtn,
  bulkRemoveWordUrl,   // ✅ correct BULK endpoint
  csrfToken,
  getSelectedWordIds
}) {
  if (!bulkDeleteBtn || !bulkRemoveWordUrl) return;

  bulkDeleteBtn.addEventListener("click", () => {
    const selectedIds = getSelectedWordIds();
    if (!selectedIds.length) return;

    if (!confirm(`Remove ${selectedIds.length} word(s) from this quiz?`)) return;

    const formData = new FormData();
    selectedIds.forEach(id => formData.append("word_ids[]", id));

    fetch(bulkRemoveWordUrl, {
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
          window.location.reload();
        } else {
          alert(data.error || "Bulk delete failed.");
        }
      })
      .catch(err => {
        console.error("Bulk delete error:", err);
        alert("Network error while deleting words.");
      });
  });
}

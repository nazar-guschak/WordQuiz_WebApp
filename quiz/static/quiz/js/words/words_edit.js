// static/quiz/js/words/words_edit.js

window.initWordsEdit = function () {
  const tableBody = document.getElementById("word-table-body");
  const editModalEl = document.getElementById("editModal");
  const editForm = document.getElementById("edit-form");

  if (!tableBody || !editForm) return;

  // Optional fields
  const editQuizSelect = editForm.querySelector("#edit-quiz"); // may not exist

  const editModal = (window.bootstrap && editModalEl)
    ? new bootstrap.Modal(editModalEl)
    : null;

  function getRowWordData(row) {
    // Your table appears to be: [0]=checkbox/controls, [1]=original, [2]=translation, ...
    const original = row.children?.[1]?.textContent?.trim() || "";
    const translation = row.children?.[2]?.textContent?.trim() || "";
    const language = row.dataset.language || "";
    return { original, translation, language };
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  // --------------------------
  // Row click delegation
  // --------------------------
  tableBody.addEventListener("click", async (e) => {
    const row = e.target.closest("tr[data-id]");
    if (!row) return;

    const id = row.dataset.id;
    if (!id) return;

    // ✅ EDIT
    if (e.target.closest(".edit-btn")) {
      const { original, translation, language } = getRowWordData(row);

      editForm.querySelector("#edit-id").value = id;
      editForm.querySelector("#edit-original").value = original;
      editForm.querySelector("#edit-translation").value = translation;
      editForm.querySelector("#edit-language").value = language;

      // Optional: reset quiz selector each open so user must actively choose
      if (editQuizSelect) {
        editQuizSelect.value = "";
      }

      editModal?.show();
      return;
    }

    // ✅ DELETE
    if (e.target.closest(".delete-btn")) {
      if (!confirm("Delete this word?")) return;

      try {
        const res = await fetch(`/word_list/${id}/delete/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCSRFToken(),
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "same-origin",
        });

        const data = await safeJson(res);

        if (res.ok && data?.success) {
          row.remove();
          window.updateBulkDeleteState?.();
          // Optional: if you show word count somewhere
          window.updateWordCount?.(-1);
        } else {
          alert(data?.error || "Delete failed");
        }
      } catch (err) {
        console.error(err);
        alert("Delete failed (network error).");
      }
    }
  });

  // --------------------------
  // Submit edit form
  // --------------------------
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = editForm.querySelector("#edit-id")?.value;
    if (!id) return;

    try {
      const formData = new FormData(editForm);

      // If you want to be explicit (not required if select has name="quiz_id")
      // but safe in case you forgot name="quiz_id" in template:
      if (editQuizSelect && !formData.has("quiz_id")) {
        formData.append("quiz_id", editQuizSelect.value || "");
      }

      const res = await fetch(`/word_list/${id}/edit/`, {
        method: "POST",
        body: formData,
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "same-origin",
      });

      const data = await safeJson(res);

      if (res.ok && data?.success) {
        editModal?.hide();
        window.searchWords?.(); // reload table via AJAX
      } else {
        alert(data?.error || "Save failed");
      }
    } catch (err) {
      console.error(err);
      alert("Save failed (network error).");
    }
  });
};

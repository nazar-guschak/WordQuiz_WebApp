window.initWordsEdit = function () {
  const tableBody = document.getElementById("word-table-body");
  const editModalEl = document.getElementById("editModal");
  const editForm = document.getElementById("edit-form");

  if (!tableBody || !editForm) return;

  const editModal = window.bootstrap
    ? new bootstrap.Modal(editModalEl)
    : null;

  tableBody.addEventListener("click", async e => {
    const row = e.target.closest("tr[data-id]");
    if (!row) return;

    const id = row.dataset.id;

    // ✅ EDIT
    if (e.target.closest(".edit-btn")) {
      editForm.querySelector("#edit-id").value = id;
      editForm.querySelector("#edit-original").value = row.children[1].textContent.trim();
      editForm.querySelector("#edit-translation").value = row.children[2].textContent.trim();
      editForm.querySelector("#edit-language").value = row.dataset.language || "";
      editModal?.show();
      return;
    }

    // ✅ DELETE — THIS WAS MISSING
    if (e.target.closest(".delete-btn")) {
      if (!confirm("Delete this word?")) return;

      const res = await fetch(`/word_list/${id}/delete/`, {
        method: "POST",
        headers: {
          "X-CSRFToken": getCSRFToken(),
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "same-origin"
      });

      const data = await res.json();

      if (data.success) {
        row.remove();
        window.updateBulkDeleteState?.();
      } else {
        alert(data.error || "Delete failed");
      }
    }
  });

  editForm.addEventListener("submit", async e => {
    e.preventDefault();

    const id = editForm.querySelector("#edit-id").value;

    const res = await fetch(`/word_list/${id}/edit/`, {
      method: "POST",
      body: new FormData(editForm),
      headers: { "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin"
    });

    const data = await res.json();

    if (data.success) {
      editModal?.hide();
      window.searchWords?.();
    } else {
      alert(data.error || "Save failed");
    }
  });
};

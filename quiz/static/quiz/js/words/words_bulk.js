window.initWordsBulk = function () {
  const tableBody = document.getElementById("word-table-body");
  const bulkDeleteBtn = document.getElementById("bulk-delete-words-btn");
  const selectAllCheckbox = document.getElementById("word-select-all");

  if (!tableBody || !bulkDeleteBtn || !selectAllCheckbox) return;

  // ✅ Collect selected word IDs
  function getSelectedIds() {
    return [...tableBody.querySelectorAll("tr[data-id]")]
      .filter(row => row.querySelector(".word-checkbox")?.checked)
      .map(row => row.dataset.id);
  }

  // ✅ UI state update for button + select-all
  function updateState() {
    const ids = getSelectedIds();

    if (ids.length) {
      bulkDeleteBtn.classList.remove("d-none");
      bulkDeleteBtn.disabled = false;
      bulkDeleteBtn.textContent = `Delete selected (${ids.length})`;
    } else {
      bulkDeleteBtn.classList.add("d-none");
      bulkDeleteBtn.disabled = true;
      bulkDeleteBtn.textContent = "Delete selected";
    }

    const allCheckboxes = tableBody.querySelectorAll(".word-checkbox");
    selectAllCheckbox.checked =
      allCheckboxes.length && [...allCheckboxes].every(cb => cb.checked);
  }

  // ✅ Select-all toggle
  selectAllCheckbox.addEventListener("change", () => {
    const checked = selectAllCheckbox.checked;
    tableBody.querySelectorAll(".word-checkbox").forEach(cb => {
      cb.checked = checked;
    });
    updateState();
  });

  // ✅ Individual checkbox change
  tableBody.addEventListener("change", e => {
    if (e.target.classList.contains("word-checkbox")) {
      updateState();
    }
  });

  // ✅ ONE-REQUEST BULK DELETE
  bulkDeleteBtn.addEventListener("click", async () => {
    const ids = getSelectedIds();

    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} word(s)?`)) return;

    try {
      const response = await fetch("/word_list/bulk_delete/", {
        method: "POST",
        headers: {
          "X-CSRFToken": getCSRFToken(),
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({ ids })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || "Bulk delete failed.");
        return;
      }

      // ✅ Optimistic UI removal (no reload)
      // ✅ Optimistic UI removal (no reload)
      ids.forEach(id => {
        const row = tableBody.querySelector(`tr[data-id="${id}"]`);
        if (row) row.remove();
      });

      // ✅ If table is now empty, show "No words found."
      const remainingRows = tableBody.querySelectorAll("tr[data-id]");
      if (!remainingRows.length) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center text-muted">No words found.</td>
          </tr>
        `;
      }

      updateState();

    } catch (err) {
      console.error("Bulk delete error:", err);
      alert("Network error while deleting words.");
    }
  });

  // ✅ Expose for other modules
  window.updateBulkDeleteState = updateState;

  // ✅ Initial state
  updateState();
};

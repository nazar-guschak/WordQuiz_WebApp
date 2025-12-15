// static/quiz/js/words/words_bulk.js

window.initWordsBulk = function () {
  const tableBody = document.getElementById("word-table-body");
  const bulkDeleteBtn = document.getElementById("bulk-delete-words-btn");
  const selectAllCheckbox = document.getElementById("word-select-all");
  const wordCountNumber = document.getElementById("word-count-number");

  if (!tableBody || !bulkDeleteBtn || !selectAllCheckbox) return;

  function getSelectedIds() {
    return [...tableBody.querySelectorAll("tr[data-id]")]
      .filter((row) => row.querySelector(".word-checkbox")?.checked)
      .map((row) => row.dataset.id)
      .filter(Boolean);
  }

  function updateWordCountFromTable() {
    if (!wordCountNumber) return;
    wordCountNumber.textContent = tableBody.querySelectorAll("tr[data-id]").length;
  }

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

    const allCheckboxes = [...tableBody.querySelectorAll(".word-checkbox")];
    selectAllCheckbox.checked =
      allCheckboxes.length > 0 && allCheckboxes.every((cb) => cb.checked);

    updateWordCountFromTable();
  }

  selectAllCheckbox.addEventListener("change", () => {
    const checked = selectAllCheckbox.checked;
    tableBody.querySelectorAll(".word-checkbox").forEach((cb) => (cb.checked = checked));
    updateState();
  });

  tableBody.addEventListener("change", (e) => {
    if (e.target.classList.contains("word-checkbox")) updateState();
  });

  bulkDeleteBtn.addEventListener("click", async () => {
    const ids = getSelectedIds();
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} word(s)?`)) return;

    const res = await fetch("/word_list/bulk_delete/", {
      method: "POST",
      headers: {
        "X-CSRFToken": window.getCSRFToken?.() || "",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ ids }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      alert(data?.error || "Bulk delete failed.");
      return;
    }

    ids.forEach((id) => {
      tableBody.querySelector(`tr[data-id="${CSS.escape(id)}"]`)?.remove();
    });

    if (!tableBody.querySelector("tr[data-id]")) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">
            No words found.
          </td>
        </tr>
      `;
    }

    selectAllCheckbox.checked = false;
    updateState();
  });

  window.updateBulkDeleteState = updateState;
  updateState();
};

// static/quiz/js/quizzes/quiz_bulk_delete.js

window.initQuizzesBulk = function () {
  const bulkDeleteBtn = document.getElementById("bulk-delete-quizzes-btn");
  const quizTableBody = document.getElementById("quiz-table-body");
  const selectAllCheckbox = document.getElementById("select-all-quizzes");

  if (!bulkDeleteBtn || !quizTableBody) return;

  const bulkDeleteUrl = bulkDeleteBtn.dataset.url;
  const csrfToken = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrftoken="))
    ?.split("=")[1];

  // Handle "No quizzes found" empty state
  function updateEmptyState() {
    const rows = quizTableBody.querySelectorAll("tr");
    const emptyRow = quizTableBody.querySelector(".ws-empty-row");

    // Do we have at least one real (non-empty-state) row?
    const hasRealRows = Array.from(rows).some(
      (row) => !row.classList.contains("ws-empty-row")
    );

    if (!hasRealRows) {
      // Table is effectively empty → ensure a single empty row is present
      if (!emptyRow) {
        quizTableBody.innerHTML = `
          <tr class="ws-empty-row">
            <td colspan="100%" class="text-center text-muted py-4">
              No quizzes found.
            </td>
          </tr>
        `;
      }
    } else if (emptyRow) {
      // We have real rows → remove any stale empty-state row
      emptyRow.remove();
    }
  }

  function getSelectedCheckboxes() {
    return quizTableBody.querySelectorAll(".quiz-checkbox:checked");
  }

  function getAllCheckboxes() {
    return quizTableBody.querySelectorAll(".quiz-checkbox");
  }

  function updateBulkDeleteState() {
    const selectedCount = getSelectedCheckboxes().length;
    const totalCount = getAllCheckboxes().length;

    // Toggle delete button
    if (selectedCount > 0) {
      bulkDeleteBtn.classList.remove("d-none");
      bulkDeleteBtn.disabled = false;
    } else {
      bulkDeleteBtn.classList.add("d-none");
      bulkDeleteBtn.disabled = true;
    }

    // Header checkbox: only checked or unchecked (no "-")
    if (selectAllCheckbox) {
      selectAllCheckbox.indeterminate = false;
      selectAllCheckbox.checked =
        totalCount > 0 && selectedCount === totalCount;
    }
  }

  // Row checkbox change
  quizTableBody.addEventListener("change", (event) => {
    if (event.target.classList.contains("quiz-checkbox")) {
      updateBulkDeleteState();
      // Not strictly needed here, but cheap and keeps things in sync
      updateEmptyState();
    }
  });

  // Header select-all checkbox
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", () => {
      const checked = selectAllCheckbox.checked;
      getAllCheckboxes().forEach((checkbox) => {
        checkbox.checked = checked;
      });
      updateBulkDeleteState();
    });
  }

  // Bulk delete click
  bulkDeleteBtn.addEventListener("click", () => {
    const selectedCheckboxes = getSelectedCheckboxes();
    if (!selectedCheckboxes.length) return;

    if (!confirm(`Delete ${selectedCheckboxes.length} quiz(es)?`)) return;

    const formData = new FormData();

    selectedCheckboxes.forEach((checkbox) => {
      const row = checkbox.closest("tr");
      const quizId = row?.dataset.id;
      if (quizId) {
        formData.append("quiz_ids[]", quizId);
      }
    });

    fetch(bulkDeleteUrl, {
      method: "POST",
      body: formData,
      headers: {
        "X-CSRFToken": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error("Bulk delete failed");

        // Remove deleted rows
        selectedCheckboxes.forEach((checkbox) => {
          checkbox.closest("tr")?.remove();
        });

        updateBulkDeleteState();
        updateEmptyState();
      })
      .catch(() => {
        alert("Bulk delete failed");
      });
  });

  // Initial state on page load
  updateBulkDeleteState();
  updateEmptyState();
};

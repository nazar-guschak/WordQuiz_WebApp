window.initQuizzesDelete = function () {
  const quizTableBody = document.getElementById("quiz-table-body");

  if (!quizTableBody) return;

  quizTableBody.addEventListener("click", async (e) => {
    const deleteBtn = e.target.closest(".delete-btn");
    if (!deleteBtn) return;

    const row = deleteBtn.closest("tr[data-id]");
    if (!row) return;

    const deleteUrl = deleteBtn.dataset.deleteUrl;

    if (!deleteUrl) {
      alert("No delete URL found on button.");
      return;
    }

    if (!confirm("Delete this quiz? This will NOT delete the words themselves.")) {
      return;
    }

    try {
      const response = await fetch(deleteUrl, {
        method: "POST",
        headers: {
          "X-CSRFToken": getCSRFToken(),
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "same-origin"
      });

      let data;
      try {
        data = await response.json();
      } catch (parseErr) {
        console.error("Failed to parse JSON from delete response", parseErr);
        alert("Delete failed: invalid server response.");
        return;
      }

      if (!response.ok || !data.success) {
        alert(data.error || "Failed to delete quiz.");
        return;
      }

      row.remove();

      const anyRowsLeft = quizTableBody.querySelector("tr[data-id]");
      if (!anyRowsLeft) {
        const emptyRow = document.createElement("tr");
        emptyRow.className = "no-quizzes-row";
        emptyRow.innerHTML = `
          <td colspan="3" class="text-center text-muted">
            No custom quizzes yet.
          </td>
        `;
        quizTableBody.appendChild(emptyRow);
      }
    } catch (err) {
      console.error("Delete quiz error:", err);
      alert("Network error while deleting quiz.");
    }
  });
};

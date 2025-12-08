// static/quiz/js/manage/quiz_filters.js

export function initQuizFilters({
  quizWordSearchInput,
  quizLanguageFilter,
  quizWordTableBody,
  quizWordCountNumber
}) {
  if (!quizWordTableBody) return;

  // ✅ Remove any server-rendered empty rows (prevents double messages)
  quizWordTableBody.querySelectorAll("tr").forEach(row => {
    if (!row.dataset.wordId) {
      row.remove();
    }
  });

  // ✅ Single JS-controlled empty-state row
  const noResultsRow = document.createElement("tr");
  noResultsRow.innerHTML = `
    <td colspan="100%" class="text-center text-muted py-2">
      No words found.
    </td>
  `;
  noResultsRow.style.display = "none";
  quizWordTableBody.appendChild(noResultsRow);

  // ✅ Case-insensitive, accent-safe sort (A–Z)
  function sortVisibleRows() {
    const rows = Array.from(
      quizWordTableBody.querySelectorAll("tr[data-word-id]")
    );

    rows.sort((a, b) => {
      const aText = a.querySelector("td:nth-child(2)")?.textContent.trim() || "";
      const bText = b.querySelector("td:nth-child(2)")?.textContent.trim() || "";

      // ✅ THIS FIXES: aaa coming after A & B
      return aText.localeCompare(bText, undefined, { sensitivity: "base" });
    });

    rows.forEach(row => quizWordTableBody.appendChild(row));
  }

  function updateQuizWordCount() {
    if (!quizWordCountNumber) return;

    let visibleCount = 0;

    quizWordTableBody.querySelectorAll("tr[data-word-id]").forEach(row => {
      if (row.style.display !== "none") visibleCount++;
    });

    quizWordCountNumber.textContent = visibleCount;

    // ✅ Toggle single empty message
    noResultsRow.style.display = visibleCount === 0 ? "" : "none";
  }

  function applyQuizFilters() {
    const term = (quizWordSearchInput?.value || "").toLowerCase();
    const lang = quizLanguageFilter?.value || "";

    quizWordTableBody.querySelectorAll("tr[data-word-id]").forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 4) return;

      const rowLang = row.dataset.language || "";
      const original = cells[1].textContent.toLowerCase();
      const translation = cells[2].textContent.toLowerCase();

      const matchesLanguage = !lang || rowLang === lang;
      const matchesText = !term || original.includes(term) || translation.includes(term);

      row.style.display = (matchesLanguage && matchesText) ? "" : "none";
    });

    // ✅ Re-sort AFTER filtering (case-insensitive)
    sortVisibleRows();

    updateQuizWordCount();
  }

  quizWordSearchInput?.addEventListener("input", applyQuizFilters);
  quizLanguageFilter?.addEventListener("change", applyQuizFilters);

  // ✅ Initial state (handles empty quiz on load + sorting)
  sortVisibleRows();
  updateQuizWordCount();
}

window.initQuizzesSearch = function () {
  const quizSearchInput = document.getElementById("quiz-search-input");
  const quizTableBody = document.getElementById("quiz-table-body");

  if (!quizSearchInput || !quizTableBody) return;

  quizSearchInput.addEventListener("input", () => {
    const term = quizSearchInput.value.toLowerCase();

    quizTableBody.querySelectorAll("tr").forEach(row => {
      const nameCell = row.querySelector("td:first-child");
      if (!nameCell) return;

      const text = nameCell.textContent.toLowerCase();
      row.style.display = text.includes(term) ? "" : "none";
    });
  });
};

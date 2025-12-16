// static/quiz/js/quizzes/quizzes_search.js

window.initQuizzesSearch = function () {
  const quizSearchInput = document.getElementById("quiz-search-input");
  const quizTableBody = document.getElementById("quiz-table-body");

  if (!quizSearchInput || !quizTableBody) return;

  // =========================
  // Search filter
  // =========================
  quizSearchInput.addEventListener("input", () => {
    const term = (quizSearchInput.value || "").toLowerCase().trim();

    quizTableBody.querySelectorAll("tr").forEach((row) => {
      // Skip "empty" row (no quizzes found)
      if (!row.dataset.id) return;

      // Your template's first cell is a checkbox cell, so quiz title isn't td:first-child.
      // Best effort: find the first link in the row (quiz title).
      const titleLink = row.querySelector('a[href*="custom_quiz_detail"]') || row.querySelector("a");
      const text = (titleLink?.textContent || row.textContent || "").toLowerCase();

      row.style.display = text.includes(term) ? "" : "none";
    });
  });

  // =========================
  // Start quiz guard (min 4 words)
  // =========================
  // Event delegation so it survives table redraws / future dynamic updates
  quizTableBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-start-quiz");
    if (!btn) return;

    const quizId = btn.dataset.quizId;
    const wordCount = parseInt(btn.dataset.wordCount || "0", 10);

    if (!quizId) return;

    if (Number.isNaN(wordCount) || wordCount < 4) {
      showQuizWarning(
        "Недостатньо слів",
        "Додайте принаймні 4 слова, щоб почати тест."
      );
      return;
    }

    // Proceed
    window.location.href = `/quiz/?start=1&quiz_id=${encodeURIComponent(quizId)}`;
  });

  // =========================
  // Warning UI (Bootstrap alert)
  // =========================
  function showQuizWarning(title, message) {
    // Remove any existing warning first (avoid stacking)
    const existing = document.getElementById("ws-quiz-start-warning");
    if (existing) existing.remove();

    const alert = document.createElement("div");
    alert.id = "ws-quiz-start-warning";
    alert.className = "alert alert-warning alert-dismissible fade show position-fixed";
    alert.style.bottom = "1rem";
    alert.style.left = "50%";
    alert.style.transform = "translateX(-50%)";
    alert.style.zIndex = "1055";
    alert.style.maxWidth = "min(560px, calc(100vw - 2rem))";
    alert.style.boxShadow = "0 10px 30px rgba(0,0,0,.18)";
    alert.style.borderRadius = "14px";

    alert.innerHTML = `
      <div class="fw-semibold mb-1">${escapeHtml(title)}</div>
      <div>${escapeHtml(message)}</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    document.body.appendChild(alert);

    // Auto-dismiss after a few seconds
    setTimeout(() => {
      alert.remove();
    }, 4000);
  }

  // Small helper to avoid injecting raw text into innerHTML
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
};

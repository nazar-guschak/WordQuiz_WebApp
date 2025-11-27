// static/quiz/js/quiz_manage_words.js

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("quiz-manage-root");
  if (!root) return;  // safety guard

  // --- Helper for CSRF ---
  function getCSRFToken() {
    const cookieValue = document.cookie
      .split("; ")
      .find(row => row.startsWith("csrftoken="));
    return cookieValue ? cookieValue.split("=")[1] : "";
  }

  const csrfToken = getCSRFToken();

  // URLs from data attributes
  const addWordsUrl = root.dataset.addUrl;
  const removeWordUrl = root.dataset.removeUrl;

  // Main quiz words table elements
  const quizWordSearchInput = document.getElementById("quiz-word-search");
  const quizLanguageFilter = document.getElementById("quiz-language-filter");
  const quizWordTableBody = document.getElementById("quiz-word-table-body");
  const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
  const selectAllQuizWords = document.getElementById("quiz-word-select-all");
  const quizWordCountNumber = document.getElementById("quiz-word-count-number");

  // ==================== Helpers ====================

  function updateQuizWordCount() {
    if (!quizWordCountNumber || !quizWordTableBody) return;
    let count = 0;
    quizWordTableBody.querySelectorAll("tr[data-word-id]").forEach(row => {
      if (row.style.display !== "none") {
        count += 1;
      }
    });
    quizWordCountNumber.textContent = count;
  }

  function getRowCheckboxes() {
    if (!quizWordTableBody) return [];
    return quizWordTableBody.querySelectorAll(".quiz-word-checkbox");
  }

  function getSelectedWordIds() {
    const ids = [];
    if (!quizWordTableBody) return ids;

    quizWordTableBody.querySelectorAll("tr[data-word-id]").forEach(row => {
      const cb = row.querySelector(".quiz-word-checkbox");
      if (cb && cb.checked) {
        ids.push(row.dataset.wordId);
      }
    });
    return ids;
  }

  function updateBulkDeleteState() {
    if (!bulkDeleteBtn || !selectAllQuizWords || !quizWordTableBody) return;

    const selectedIds = getSelectedWordIds();
    const count = selectedIds.length;

    if (count > 0) {
      bulkDeleteBtn.classList.remove("d-none");
      bulkDeleteBtn.disabled = false;
      bulkDeleteBtn.textContent = `Delete selected (${count})`;
    } else {
      bulkDeleteBtn.classList.add("d-none");
      bulkDeleteBtn.disabled = true;
      bulkDeleteBtn.textContent = "Delete selected";
    }

    const allCbs = getRowCheckboxes();
    if (!allCbs.length) {
      selectAllQuizWords.checked = false;
      return;
    }

    const allChecked = Array.from(allCbs).every(cb => cb.checked);
    selectAllQuizWords.checked = allChecked;
  }

  // ==================== Filtering quiz words (language + search) ====================

  function applyQuizFilters() {
    if (!quizWordTableBody) return;

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

    updateQuizWordCount();
  }

  if (quizWordSearchInput) {
    quizWordSearchInput.addEventListener("input", applyQuizFilters);
  }
  if (quizLanguageFilter) {
    quizLanguageFilter.addEventListener("change", applyQuizFilters);
  }

  // ==================== Selection / bulk delete for quiz words ====================

  if (selectAllQuizWords && quizWordTableBody) {
    // "Select all" in quiz table
    selectAllQuizWords.addEventListener("change", () => {
      const checked = selectAllQuizWords.checked;
      getRowCheckboxes().forEach(cb => {
        cb.checked = checked;
      });
      updateBulkDeleteState();
    });

    // Listen for individual row checkbox changes
    quizWordTableBody.addEventListener("change", (e) => {
      if (e.target.classList.contains("quiz-word-checkbox")) {
        updateBulkDeleteState();
      }
    });
  }

  if (bulkDeleteBtn && quizWordTableBody) {
    // Bulk delete button
    bulkDeleteBtn.addEventListener("click", () => {
      const selectedIds = getSelectedWordIds();
      if (!selectedIds.length) return;

      if (!confirm(`Remove ${selectedIds.length} word(s) from this quiz?`)) return;

      const requests = selectedIds.map(id => {
        const formData = new FormData();
        formData.append("word_id", id);

        return fetch(removeWordUrl, {
          method: "POST",
          body: formData,
          headers: {
            "X-CSRFToken": csrfToken,
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "same-origin",
        }).then(r => r.json());
      });

      Promise.all(requests)
        .then(results => {
          const anyError = results.some(res => !res.success);
          if (anyError) {
            alert("Some words could not be removed. Please refresh and try again.");
          }
          window.location.reload();
        })
        .catch(err => {
          console.error("Bulk remove error:", err);
          alert("Network error while removing words.");
        });
    });
  }

  // ==================== Remove a single word from quiz ====================

  if (quizWordTableBody) {
    quizWordTableBody.addEventListener("click", (e) => {
      if (!e.target.classList.contains("remove-word-btn")) return;

      const row = e.target.closest("tr[data-word-id]");
      if (!row) return;

      const wordId = row.dataset.wordId;
      if (!confirm("Remove this word from the quiz?")) return;

      const formData = new FormData();
      formData.append("word_id", wordId);

      fetch(removeWordUrl, {
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
            row.remove();
            updateBulkDeleteState();
            updateQuizWordCount();
          } else {
            alert(data.error || "Failed to remove word from quiz.");
          }
        })
        .catch(err => {
          console.error("Remove word error:", err);
          alert("Network error while removing word.");
        });
    });
  }

  // ==================== Add words modal ====================

  const addWordsBtn = document.getElementById("open-add-words-modal-btn");
  const addWordsModalEl = document.getElementById("addWordsModal");
  const addWordsModal = addWordsModalEl ? new bootstrap.Modal(addWordsModalEl) : null;

  const availableLanguageFilter = document.getElementById("available-language-filter");
  const availableSearchInput = document.getElementById("available-word-search");
  const availableTableBody = document.getElementById("available-word-table-body");
  const selectAllAvailable = document.getElementById("available-word-select-all");
  const confirmAddBtn = document.getElementById("add-words-confirm-btn");
  const availableWordCountNumber = document.getElementById("available-word-count-number");

  function updateAvailableWordCount() {
    if (!availableWordCountNumber || !availableTableBody) return;
    let count = 0;
    availableTableBody.querySelectorAll("tr").forEach(row => {
      if (row.style.display !== "none") {
        count += 1;
      }
    });
    availableWordCountNumber.textContent = count;
  }

  function applyAvailableFilters() {
    if (!availableTableBody) return;

    const term = (availableSearchInput?.value || "").toLowerCase();
    const lang = availableLanguageFilter?.value || "";

    availableTableBody.querySelectorAll("tr").forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 4) return;

      const rowLang = row.dataset.language || "";
      const original = cells[1].textContent.toLowerCase();
      const translation = cells[2].textContent.toLowerCase();

      const matchesLanguage = !lang || rowLang === lang;
      const matchesText = !term || original.includes(term) || translation.includes(term);

      row.style.display = (matchesLanguage && matchesText) ? "" : "none";
    });

    updateAvailableWordCount();
  }

  if (addWordsBtn && addWordsModal && availableTableBody) {
    addWordsBtn.addEventListener("click", () => {
      // reset filters & checkboxes
      if (availableSearchInput) availableSearchInput.value = "";
      if (availableLanguageFilter) availableLanguageFilter.value = "";
      if (selectAllAvailable) selectAllAvailable.checked = false;

      availableTableBody.querySelectorAll("tr").forEach(row => {
        row.style.display = "";
        const cb = row.querySelector(".available-word-checkbox");
        if (cb) cb.checked = false;
      });

      updateAvailableWordCount();
      addWordsModal.show();
    });
  }

  if (availableSearchInput) {
    availableSearchInput.addEventListener("input", applyAvailableFilters);
  }
  if (availableLanguageFilter) {
    availableLanguageFilter.addEventListener("change", applyAvailableFilters);
  }

  // Select all available words
  if (selectAllAvailable && availableTableBody) {
    selectAllAvailable.addEventListener("change", () => {
      const checked = selectAllAvailable.checked;
      availableTableBody
        .querySelectorAll(".available-word-checkbox")
        .forEach(cb => {
          cb.checked = checked;
        });
    });
  }

  // Confirm add selected words
  if (confirmAddBtn && availableTableBody) {
    confirmAddBtn.addEventListener("click", () => {
      const selected = [];
      availableTableBody
        .querySelectorAll(".available-word-checkbox:checked")
        .forEach(cb => {
          const row = cb.closest("tr");
          if (row && row.style.display === "none") return; // skip hidden if filtered out
          selected.push(cb.value);
        });

      if (!selected.length) {
        alert("Please select at least one word.");
        return;
      }

      const formData = new FormData();
      selected.forEach(id => formData.append("word_ids[]", id));

      fetch(addWordsUrl, {
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
            alert(data.error || "Failed to add words.");
          }
        })
        .catch(err => {
          console.error("Add words error:", err);
          alert("Network error while adding words.");
        });
    });
  }

  // Initial state
  updateBulkDeleteState();
  updateQuizWordCount();
  updateAvailableWordCount();
});

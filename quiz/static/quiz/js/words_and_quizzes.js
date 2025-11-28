// static/quiz/js/words_and_quizzes.js

document.addEventListener("DOMContentLoaded", () => {
  // --- Helper for CSRF ---
  function getCSRFToken() {
    const cookieValue = document.cookie
      .split("; ")
      .find(row => row.startsWith("csrftoken="));
    return cookieValue ? cookieValue.split("=")[1] : "";
  }

  // ==================== WORDS TAB LOGIC ====================
  const input = document.getElementById("word-search-input");
  const languageFilter = document.getElementById("language-filter");
  const tableBody = document.getElementById("word-table-body");
  const bulkDeleteWordsBtn = document.getElementById("bulk-delete-words-btn");
  const selectAllWordsCheckbox = document.getElementById("word-select-all");
  const wordCountNumber = document.getElementById("word-count-number");

  // Edit modal
  const editModalEl = document.getElementById("editModal");
  const editModal = editModalEl ? new bootstrap.Modal(editModalEl) : null;
  const editId = document.getElementById("edit-id");
  const editOriginal = document.getElementById("edit-original");
  const editTranslation = document.getElementById("edit-translation");
  const editLanguageSelect = document.getElementById("edit-language");
  const editForm = document.getElementById("edit-form");

  // Add modal + multi-row fields
  const addBtn = document.getElementById("add-word-btn");
  const addModalEl = document.getElementById("addModal");
  const addModal = addModalEl ? new bootstrap.Modal(addModalEl) : null;
  const addForm = document.getElementById("add-form");
  const wordRowsContainer = document.getElementById("word-rows-container");
  const addRowBtn = document.getElementById("add-row-btn");
  const addLanguageSelect = document.getElementById("add-language");

  let timer;

  function updateWordCount(count) {
    if (wordCountNumber) {
      wordCountNumber.textContent = count;
    }
  }

  // ---- helpers for bulk selection ----
  function getWordRowCheckboxes() {
    return tableBody ? tableBody.querySelectorAll(".word-checkbox") : [];
  }

  function getSelectedWordIds() {
    const ids = [];
    if (!tableBody) return ids;

    tableBody.querySelectorAll("tr[data-id]").forEach(row => {
      const cb = row.querySelector(".word-checkbox");
      if (cb && cb.checked) {
        ids.push(row.dataset.id);
      }
    });
    return ids;
  }

  function updateBulkDeleteState() {
    if (!bulkDeleteWordsBtn || !selectAllWordsCheckbox || !tableBody) return;

    const selectedIds = getSelectedWordIds();
    const count = selectedIds.length;

    if (count > 0) {
      bulkDeleteWordsBtn.classList.remove("d-none");
      bulkDeleteWordsBtn.disabled = false;
      bulkDeleteWordsBtn.textContent = `Delete selected (${count})`;
    } else {
      bulkDeleteWordsBtn.classList.add("d-none");
      bulkDeleteWordsBtn.disabled = true;
      bulkDeleteWordsBtn.textContent = "Delete selected";
    }

    const allCbs = getWordRowCheckboxes();
    if (!allCbs.length) {
      selectAllWordsCheckbox.checked = false;
    } else {
      const allChecked = Array.from(allCbs).every(cb => cb.checked);
      selectAllWordsCheckbox.checked = allChecked;
    }
  }

  // --- Live search for words (server-side) ---
  async function searchWords() {
    if (!tableBody) return;

    const query = input ? input.value : "";
    const language = languageFilter ? languageFilter.value : "";

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (language) params.set("language", language);

    const response = await fetch(`?${params.toString()}`, {
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    const data = await response.json();
    renderTable(data.words || []);
  }

  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(searchWords, 300);
    });
  }

  if (languageFilter) {
    languageFilter.addEventListener("change", () => {
      clearTimeout(timer);
      searchWords();
    });
  }

  // --- Render words table (for AJAX search) ---
  function renderTable(words) {
    if (!tableBody) return;

    tableBody.innerHTML = "";

    if (words.length > 0) {
      words.forEach(word => {
        const row = document.createElement("tr");
        row.dataset.id = word.id;
        row.dataset.language = word.language;

        const languageText = word.language_display || word.language || "";

        row.innerHTML = `
          <td><input type="checkbox" class="word-checkbox"></td>
          <td>${word.original_word}</td>
          <td>${word.translation}</td>
          <td>${languageText}</td>
          <td class="action-buttons text-center">
            <div class="d-flex gap-2 justify-content-center">
              <button type="button"
                      class="icon-action edit edit-btn"
                      title="Edit word">
                <i class="bi bi-pencil-square fs-5"></i>
              </button>
              <button type="button"
                      class="icon-action delete delete-btn"
                      title="Delete word">
                <i class="bi bi-trash3 fs-5"></i>
              </button>
            </div>
          </td>
        `;

        tableBody.appendChild(row);
      });
    } else {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted">No words found.</td>
        </tr>
      `;
    }

    updateWordCount(words.length);
    updateBulkDeleteState();
  }

  // --- “Select all” words ---
  if (selectAllWordsCheckbox && tableBody) {
    selectAllWordsCheckbox.addEventListener("change", () => {
      const checked = selectAllWordsCheckbox.checked;
      getWordRowCheckboxes().forEach(cb => {
        cb.checked = checked;
      });
      updateBulkDeleteState();
    });

    tableBody.addEventListener("change", (e) => {
      if (e.target.classList.contains("word-checkbox")) {
        updateBulkDeleteState();
      }
    });
  }

  // --- Bulk delete words ---
  if (bulkDeleteWordsBtn && tableBody) {
    bulkDeleteWordsBtn.addEventListener("click", () => {
      const selectedIds = getSelectedWordIds();
      if (!selectedIds.length) return;

      if (!confirm(`Delete ${selectedIds.length} word(s)?`)) return;

      const csrfToken = getCSRFToken();

      Promise.all(
        selectedIds.map(id => {
          return fetch(`/word_list/${id}/delete/`, {
            method: "POST",
            headers: {
              "X-CSRFToken": csrfToken,
              "X-Requested-With": "XMLHttpRequest"
            },
            credentials: "same-origin"
          }).then(r => r.json());
        })
      )
        .then(results => {
          const anyError = results.some(res => !res.success);
          if (anyError) {
            alert("Some words could not be deleted. Please refresh and try again.");
          }
          window.location.reload();
        })
        .catch(err => {
          console.error("Bulk delete error:", err);
          alert("Network error while deleting words.");
        });
    });
  }

  // --- Delegate Edit/Delete buttons for words ---
  if (tableBody) {
    tableBody.addEventListener("click", (e) => {
      const row = e.target.closest("tr[data-id]");
      if (!row) return;
      const id = row.dataset.id;

      const editButton = e.target.closest(".edit-btn");
      const deleteButton = e.target.closest(".delete-btn");

      // Edit
      if (editButton) {
        if (!editModal) return;
        if (editId) editId.value = id;
        if (editOriginal) editOriginal.value = row.children[1].textContent.trim();
        if (editTranslation) editTranslation.value = row.children[2].textContent.trim();
        if (editLanguageSelect) {
          editLanguageSelect.value = row.dataset.language || "";
        }
        editModal.show();
        return;
      }

      // Delete
      if (deleteButton) {
        if (!confirm("Delete this word?")) return;

        fetch(`/word_list/${id}/delete/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCSRFToken(),
            "X-Requested-With": "XMLHttpRequest"
          },
          credentials: "same-origin"
        })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              row.remove();
              const remaining = tableBody.querySelectorAll("tr[data-id]").length;
              updateWordCount(remaining);
              updateBulkDeleteState();
            } else {
              alert(data.error || "Delete failed.");
            }
          })
          .catch(err => {
            console.error("Word delete error:", err);
            alert("Network error while deleting word.");
          });
      }
    });
  }

  // --- Handle Edit form submission ---
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = editId ? editId.value : null;
      if (!id) return;

      const formData = new FormData(editForm);

      try {
        const response = await fetch(`/word_list/${id}/edit/`, {
          method: "POST",
          body: formData,
          credentials: "same-origin",
          headers: { "X-Requested-With": "XMLHttpRequest" }
        });

        const data = await response.json();
        if (response.ok && data.success) {
          if (editModal) editModal.hide();
          searchWords();
        } else {
          alert(data.error || "Save failed. Check input and try again.");
        }
      } catch (err) {
        console.error("Edit error:", err);
        alert("Network error while saving. Check console.");
      }
    });
  }

  // ---------- Multi-row Add Word helpers ----------
  function createWordRow() {
    const row = document.createElement("div");
    row.className = "row g-2 align-items-center mb-2 word-row";

    row.innerHTML = `
      <div class="col">
        <input type="text"
               class="form-control original-input"
               name="original_word"
               placeholder="Original word">
      </div>
      <div class="col-auto text-center">
        &rarr;
      </div>
      <div class="col">
        <input type="text"
               class="form-control translation-input"
               name="translation"
               placeholder="Translation">
      </div>
      <div class="col-auto">
        <button type="button" class="btn btn-outline-danger btn-sm remove-row-btn">
          &times;
        </button>
      </div>
    `;

    return row;
  }

  function updateRemoveButtonsVisibility() {
    if (!wordRowsContainer) return;
    const rows = wordRowsContainer.querySelectorAll(".word-row");
    const showRemove = rows.length > 1;

    rows.forEach(row => {
      const btn = row.querySelector(".remove-row-btn");
      if (!btn) return;
      if (showRemove) {
        btn.classList.remove("d-none");
      } else {
        btn.classList.add("d-none");
      }
    });
  }

  function resetToSingleEmptyRow() {
    if (!wordRowsContainer) return;
    wordRowsContainer.innerHTML = "";
    const row = createWordRow();
    wordRowsContainer.appendChild(row);
    updateRemoveButtonsVisibility();
  }

  if (wordRowsContainer) {
    if (wordRowsContainer.children.length === 0) {
      resetToSingleEmptyRow();
    } else {
      updateRemoveButtonsVisibility();
    }
  }

  // --- Add Word (open modal) ---
  if (addBtn && addModal && wordRowsContainer) {
    addBtn.addEventListener("click", () => {
      resetToSingleEmptyRow();
      addModal.show();
      const firstInput = wordRowsContainer.querySelector(".original-input");
      if (firstInput) firstInput.focus();
    });
  }

  // --- "+ Add more" button in modal ---
  if (addRowBtn && wordRowsContainer) {
    addRowBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const newRow = createWordRow();
      wordRowsContainer.appendChild(newRow);
      updateRemoveButtonsVisibility();
    });
  }

  // --- Remove a specific row in modal ---
  if (wordRowsContainer) {
    wordRowsContainer.addEventListener("click", (e) => {
      if (!e.target.classList.contains("remove-row-btn")) return;

      const row = e.target.closest(".word-row");
      if (!row) return;

      const rows = wordRowsContainer.querySelectorAll(".word-row");

      if (rows.length === 1) {
        row.querySelectorAll("input").forEach(input => {
          input.value = "";
        });
      } else {
        row.remove();
      }

      updateRemoveButtonsVisibility();
    });
  }

  // --- Add Word (multi-row submit) with CSRF ---
  if (addForm && wordRowsContainer) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitter = e.submitter;
      const action = submitter ? submitter.dataset.action : "close";

      const rows = wordRowsContainer.querySelectorAll(".word-row");
      const pairs = [];

      rows.forEach(row => {
        const originalInput = row.querySelector(".original-input");
        const translationInput = row.querySelector(".translation-input");
        const original = originalInput ? originalInput.value.trim() : "";
        const translation = translationInput ? translationInput.value.trim() : "";

        if (original || translation) {
          if (original && translation) {
            pairs.push({ original, translation });
          }
        }
      });

      if (!pairs.length) {
        alert("Please fill in at least one word pair.");
        return;
      }

      const csrfToken = getCSRFToken();
      const language = addLanguageSelect ? addLanguageSelect.value : "";

      if (!language) {
        alert("Please select a language.");
        return;
      }

      try {
        const responses = await Promise.all(
          pairs.map(pair => {
            const fd = new FormData();
            fd.append("original_word", pair.original);
            fd.append("translation", pair.translation);
            fd.append("language", language);

            return fetch("/word_list/add/", {
              method: "POST",
              body: fd,
              credentials: "same-origin",
              headers: {
                "X-Requested-With": "XMLHttpRequest",
                "X-CSRFToken": csrfToken
              }
            }).then(r => r.json());
          })
        );

        const successes = responses.filter(r => r.success).length;
        const failures = responses.filter(r => !r.success);

        if (!successes) {
          const firstError = failures[0]?.error || "Failed to add words.";
          alert(firstError);
          return;
        }

        await searchWords();
        if (failures.length) {
          const msg = failures[0].error || "Some words could not be added (duplicates?).";
          alert(`Added ${successes} word(s). ${msg}`);
        }

        if (action === "close") {
          if (addModal) addModal.hide();
        } else if (action === "add") {
          resetToSingleEmptyRow();
          const firstInput = wordRowsContainer.querySelector(".original-input");
          if (firstInput) firstInput.focus();
        }
      } catch (err) {
        console.error("Add error:", err);
        alert("Network error while adding words. Check console.");
      }
    });
  }

  // Init bulk state once on load
  updateBulkDeleteState();

  // ==================== QUIZZES TAB LOGIC ====================
  const quizTableBody = document.getElementById("quiz-table-body");
  const quizAddBtn = document.getElementById("quiz-add-btn");
  const quizAddModalEl = document.getElementById("quizAddModal");
  const quizAddModal = quizAddModalEl ? new bootstrap.Modal(quizAddModalEl) : null;
  const quizAddForm = document.getElementById("quiz-add-form");
  const quizSearchInput = document.getElementById("quiz-search-input");

  const createQuizUrl = quizAddForm ? quizAddForm.dataset.createUrl : null;

  // ---------- Open "Add quiz" modal ----------
  if (quizAddBtn && quizAddModal && quizAddForm) {
    quizAddBtn.addEventListener("click", () => {
      quizAddForm.reset();
      quizAddModal.show();
    });
  }

  // ---------- Create quiz (AJAX) ----------
  if (quizAddForm && createQuizUrl) {
    quizAddForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const submitter = e.submitter;
      const action = submitter ? submitter.dataset.action : "close";

      const formData = new FormData(quizAddForm);

      try {
        const response = await fetch(createQuizUrl, {
          method: "POST",
          body: formData,
          headers: {
            "X-CSRFToken": getCSRFToken(),
            "X-Requested-With": "XMLHttpRequest"
          },
          credentials: "same-origin"
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          alert(data.error || "Failed to create quiz.");
          return;
        }

        const quiz = data.quiz;

        if (quizTableBody) {
          const emptyRow = quizTableBody.querySelector(".no-quizzes-row");
          if (emptyRow) {
            emptyRow.remove();
          }

          const tr = document.createElement("tr");
          tr.dataset.id = quiz.id;
          tr.innerHTML = `
            <td>
              <a href="${quiz.detail_url}">${quiz.title}</a>
            </td>
            <td>${quiz.word_count}</td>
            <td class="action-buttons text-center">
              <div class="d-flex gap-2 justify-content-center">
                <button type="button"
                        class="icon-action edit"
                        title="Edit quiz"
                        onclick="window.location.href='${quiz.detail_url}'">
                  <i class="bi bi-pencil-square fs-5"></i>
                </button>
                <button type="button"
                        class="icon-action delete delete-btn"
                        data-delete-url="${quiz.delete_url || ""}"
                        title="Delete quiz">
                  <i class="bi bi-trash3 fs-5"></i>
                </button>
              </div>
            </td>
          `;
          quizTableBody.appendChild(tr);
        }

        if (action === "close") {
          if (quizAddModal) quizAddModal.hide();
        } else if (action === "add-words") {
          window.location.href = quiz.detail_url;
        }
      } catch (err) {
        console.error("Create quiz error:", err);
        alert("Network error while creating quiz.");
      }
    });
  }

  // ---------- Search quizzes (client-side filter) ----------
  if (quizSearchInput && quizTableBody) {
    quizSearchInput.addEventListener("input", () => {
      const term = quizSearchInput.value.toLowerCase();

      quizTableBody.querySelectorAll("tr").forEach(row => {
        const nameCell = row.querySelector("td:first-child");
        if (!nameCell) return;

        const text = nameCell.textContent.toLowerCase();
        row.style.display = text.includes(term) ? "" : "none";
      });
    });
  }

  // ---------- Delete quiz (delegated) ----------
  if (quizTableBody) {
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
  }
});

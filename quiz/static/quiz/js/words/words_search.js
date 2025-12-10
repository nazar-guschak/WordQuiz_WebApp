// static/quiz/js/words/words_search.js

window.initWordsSearch = function () {
  const input = document.getElementById("word-search-input");
  const languageFilter = document.getElementById("language-filter");
  const tableBody = document.getElementById("word-table-body");
  const wordCountNumber = document.getElementById("word-count-number");

  if (!tableBody) return;

  let timer;

  function updateWordCount(count) {
    if (wordCountNumber) {
      wordCountNumber.textContent = count;
    }
  }

  // ✅ ALWAYS FETCH + AUTO-SORT DATA (CASE-INSENSITIVE)
  async function searchWords() {
    const query = input ? input.value : "";
    const language = languageFilter ? languageFilter.value : "";

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (language) params.set("language", language);

    const response = await fetch(`?${params.toString()}`, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });

    const data = await response.json();

    // ✅ FORCE CASE-INSENSITIVE SORT BY ORIGINAL WORD
    const words = (data.words || []).sort((a, b) => {
      return (a.original_word || "").localeCompare(
        b.original_word || "",
        "de",
        { sensitivity: "base" }
      );
    });

    renderTable(words);
  }

  function renderTable(words) {
    tableBody.innerHTML = "";

    if (!words.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">
            No words found.
          </td>
        </tr>
      `;
      updateWordCount(0);
      return;
    }

    words.forEach((word) => {
      const row = document.createElement("tr");
      row.dataset.id = word.id;
      row.dataset.language = word.language || "";

      const isUnknown = word.has_unknown_language || !word.language;

      if (isUnknown) {
        row.classList.add("ws-row-unknown");
      }

      // ===== Checkbox cell =====
      const checkTd = document.createElement("td");
      checkTd.className = "ws-check-cell";
      checkTd.innerHTML =
        '<input type="checkbox" class="ws-check-input word-checkbox">';
      row.appendChild(checkTd);

      // ===== Original =====
      const originalTd = document.createElement("td");
      originalTd.className = "ws-col-original";
      originalTd.textContent = word.original_word;
      row.appendChild(originalTd);

      // ===== Translation =====
      const translationTd = document.createElement("td");
      translationTd.className = "ws-col-translation";
      translationTd.textContent = word.translation;
      row.appendChild(translationTd);

      // ===== Language =====
      const langTd = document.createElement("td");
      langTd.className = "ws-lang-cell";

      const languageDisplay =
        word.language_display || word.language || "";

      if (isUnknown) {
        langTd.innerHTML = `
          <span class="ws-lang-badge ws-lang-badge-unknown">
            Unknown
          </span>
          <span class="text-muted small d-block">
            Excluded from quizzes
          </span>
        `;
      } else {
        langTd.innerHTML = `
          <span class="ws-lang-badge">
            ${languageDisplay}
          </span>
        `;
      }

      row.appendChild(langTd);

      // ===== Actions =====
      const actionsTd = document.createElement("td");
      actionsTd.className = "ws-actions-cell";
      actionsTd.innerHTML = `
        <div class="btn-row">
          <button
            type="button"
            class="btn-ws-icon edit edit-btn"
            title="Edit"
            aria-label="Edit word"
          >
            <i class="bi bi-pencil-square"></i>
          </button>
          <button
            type="button"
            class="btn-ws-icon delete delete-btn"
            title="Delete"
            aria-label="Delete word"
          >
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      `;
      row.appendChild(actionsTd);

      tableBody.appendChild(row);
    });

    updateWordCount(words.length);

    // Keep your existing bulk-delete hook
    window.updateBulkDeleteState?.();
  }

  if (input) {
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(searchWords, 300);
    });
  }

  if (languageFilter) {
    languageFilter.addEventListener("change", searchWords);
  }

  // ✅ Expose globally for add/edit modules
  window.searchWords = searchWords;
};

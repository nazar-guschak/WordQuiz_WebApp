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
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });

    const data = await response.json();

    // ✅ FORCE CASE-INSENSITIVE SORT BY ORIGINAL WORD
    const words = (data.words || []).sort((a, b) => {
      return (a.original_word || "")
        .localeCompare(b.original_word || "", "de", { sensitivity: "base" });
    });

    renderTable(words);
  }

  function renderTable(words) {
    tableBody.innerHTML = "";

    if (!words.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted">No words found.</td>
        </tr>
      `;
      updateWordCount(0);
      return;
    }

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
            <button type="button" class="icon-action edit edit-btn">
              <i class="bi bi-pencil-square fs-5"></i>
            </button>
            <button type="button" class="icon-action delete delete-btn">
              <i class="bi bi-trash3 fs-5"></i>
            </button>
          </div>
        </td>
      `;

      tableBody.appendChild(row);
    });

    updateWordCount(words.length);
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

// static/quiz/js/manage/quiz_add_modal.js

export function initAddWordsModal({
  csrfToken,
  addWordsUrl, // optional fallback if data-add-url is not present
}) {
  const addWordsBtn = document.getElementById("open-add-words-modal-btn");
  const addWordsModalEl = document.getElementById("addWordsModal");
  const addWordsModal =
    addWordsModalEl && window.bootstrap
      ? new bootstrap.Modal(addWordsModalEl)
      : null;

  const availableLanguageFilter = document.getElementById("available-language-filter");
  const availableSearchInput = document.getElementById("available-word-search");
  const availableTableBody = document.getElementById("available-word-table-body");
  const selectAllAvailable = document.getElementById("available-word-select-all");
  const confirmAddBtn = document.getElementById("add-words-confirm-btn");
  const availableWordCountNumber = document.getElementById("available-word-count-number");

  if (!addWordsBtn || !addWordsModalEl || !availableTableBody) return;

  // ✅ New: URLs from data attributes
  const candidateUrl = addWordsBtn.dataset.candidateUrl || null;
  const effectiveAddWordsUrl = addWordsBtn.dataset.addUrl || addWordsUrl;

  if (!candidateUrl || !effectiveAddWordsUrl) {
    console.warn("Add words modal: candidateUrl or addWordsUrl missing.");
  }

  // ===== Helpers =====

  function updateAvailableWordCount() {
    if (!availableWordCountNumber || !availableTableBody) return;

    const rows = Array.from(
      availableTableBody.querySelectorAll("tr:not([data-empty='true'])")
    );
    const count = rows.length;

    availableWordCountNumber.textContent = count;

    let emptyRow = availableTableBody.querySelector("tr[data-empty='true']");

    if (count === 0) {
      if (!emptyRow) {
        emptyRow = document.createElement("tr");
        emptyRow.dataset.empty = "true";
        emptyRow.innerHTML = `
          <td colspan="100%" class="text-center text-muted py-2 small">
            No words found.
          </td>
        `;
        availableTableBody.appendChild(emptyRow);
      }
      emptyRow.style.display = "";
    } else if (emptyRow) {
      emptyRow.style.display = "none";
    }
  }

  function sortAvailableRows() {
    if (!availableTableBody) return;

    const rows = Array.from(
      availableTableBody.querySelectorAll("tr:not([data-empty='true'])")
    );

    rows.sort((a, b) => {
      const aText =
        a.querySelector("td:nth-child(2)")?.textContent.trim() || "";
      const bText =
        b.querySelector("td:nth-child(2)")?.textContent.trim() || "";

      return aText.localeCompare(bText, undefined, { sensitivity: "base" });
    });

    rows.forEach((row) => availableTableBody.appendChild(row));
  }

  // ===== Core: load candidates from backend =====

  async function loadAvailableWords() {
    if (!candidateUrl) return;

    const params = new URLSearchParams();
    const term = (availableSearchInput?.value || "").trim();
    const lang = availableLanguageFilter?.value || "";

    if (term) params.set("q", term);
    if (lang) params.set("language", lang);

    try {
      const resp = await fetch(`${candidateUrl}?${params.toString()}`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const words = data.words || [];

      // Clear old rows
      availableTableBody.innerHTML = "";

      if (!words.length) {
        const emptyRow = document.createElement("tr");
        emptyRow.dataset.empty = "true";
        emptyRow.innerHTML = `
          <td colspan="100%" class="text-center text-muted py-2 small">
            No words found.
          </td>
        `;
        availableTableBody.appendChild(emptyRow);
        updateAvailableWordCount();
        if (selectAllAvailable) selectAllAvailable.checked = false;
        return;
      }

      words.forEach((w) => {
        const row = document.createElement("tr");
        row.dataset.language = w.language || "";
        row.innerHTML = `
          <td>
            <input
              type="checkbox"
              class="available-word-checkbox"
              value="${w.id}"
            >
          </td>
          <td>${w.original_word}</td>
          <td>${w.translation}</td>
          <td>${w.language_display}</td>
        `;
        availableTableBody.appendChild(row);
      });

      // Sort + count after loading
      sortAvailableRows();
      updateAvailableWordCount();

      if (selectAllAvailable) {
        selectAllAvailable.checked = false;
      }
    } catch (err) {
      console.error("Error loading available words:", err);
      availableTableBody.innerHTML = `
        <tr data-empty="true">
          <td colspan="100%" class="text-center text-muted py-2 small">
            Could not load words.
          </td>
        </tr>
      `;
      updateAvailableWordCount();
      if (selectAllAvailable) selectAllAvailable.checked = false;
    }
  }

  // ===== Filters trigger reload (server-side filtering) =====

  availableSearchInput?.addEventListener("input", () => {
    loadAvailableWords();
  });

  availableLanguageFilter?.addEventListener("change", () => {
    loadAvailableWords();
  });

  // ===== Open modal =====

  addWordsBtn.addEventListener("click", () => {
    if (availableSearchInput) availableSearchInput.value = "";
    if (availableLanguageFilter) availableLanguageFilter.value = "";
    if (selectAllAvailable) selectAllAvailable.checked = false;

    loadAvailableWords();
    addWordsModal?.show();
  });

  // ===== Select all =====

  selectAllAvailable?.addEventListener("change", () => {
    const checked = selectAllAvailable.checked;
    availableTableBody
      ?.querySelectorAll(".available-word-checkbox")
      .forEach((cb) => {
        cb.checked = checked;
      });
  });

  // ===== Confirm add =====

  confirmAddBtn?.addEventListener("click", () => {
    const selected = [];

    availableTableBody
      ?.querySelectorAll(".available-word-checkbox:checked")
      .forEach((cb) => {
        const row = cb.closest("tr");
        if (row && row.dataset.empty === "true") return;
        selected.push(cb.value);
      });

    if (!selected.length) {
      alert("Please select at least one word.");
      return;
    }

    const formData = new FormData();
    selected.forEach((id) => formData.append("word_ids[]", id));

    fetch(effectiveAddWordsUrl, {
      method: "POST",
      body: formData,
      headers: {
        "X-CSRFToken": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          window.location.reload();
        } else {
          alert(data.error || "Failed to add words.");
        }
      })
      .catch((err) => {
        console.error("Add words error:", err);
        alert("Network error while adding words.");
      });
  });

  // We no longer sort/count on init; rows are loaded via AJAX when modal opens
}

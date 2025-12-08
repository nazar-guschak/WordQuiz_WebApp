// static/quiz/js/manage/quiz_add_modal.js

export function initAddWordsModal({
  csrfToken,
  addWordsUrl
}) {
  const addWordsBtn = document.getElementById("open-add-words-modal-btn");
  const addWordsModalEl = document.getElementById("addWordsModal");
  const addWordsModal = addWordsModalEl ? new bootstrap.Modal(addWordsModalEl) : null;

  const availableLanguageFilter = document.getElementById("available-language-filter");
  const availableSearchInput = document.getElementById("available-word-search");
  const availableTableBody = document.getElementById("available-word-table-body");
  const selectAllAvailable = document.getElementById("available-word-select-all");
  const confirmAddBtn = document.getElementById("add-words-confirm-btn");
  const availableWordCountNumber = document.getElementById("available-word-count-number");

  // ✅ Case-insensitive, accent-safe sort (A–Z)
  function sortAvailableRows() {
    if (!availableTableBody) return;

    const rows = Array.from(
      availableTableBody.querySelectorAll("tr:not([data-empty='true'])")
    );

    rows.sort((a, b) => {
      const aText = a.querySelector("td:nth-child(2)")?.textContent.trim() || "";
      const bText = b.querySelector("td:nth-child(2)")?.textContent.trim() || "";

      // ✅ FIX: ignores case + respects accents
      return aText.localeCompare(bText, undefined, { sensitivity: "base" });
    });

    rows.forEach(row => availableTableBody.appendChild(row));
  }

  function updateAvailableWordCount() {
    if (!availableWordCountNumber || !availableTableBody) return;

    let count = 0;

    availableTableBody.querySelectorAll("tr").forEach(row => {
      if (row.style.display !== "none" && !row.dataset.empty) {
        count++;
      }
    });

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
    } else {
      if (emptyRow) emptyRow.style.display = "none";
    }
  }

  function applyAvailableFilters() {
    if (!availableTableBody) return;

    const term = (availableSearchInput?.value || "").toLowerCase();
    const lang = availableLanguageFilter?.value || "";

    availableTableBody.querySelectorAll("tr").forEach(row => {
      if (row.dataset.empty === "true") return;

      const cells = row.querySelectorAll("td");
      if (cells.length < 4) return;

      const rowLang = row.dataset.language || "";
      const original = cells[1].textContent.toLowerCase();
      const translation = cells[2].textContent.toLowerCase();

      const matchesLanguage = !lang || rowLang === lang;
      const matchesText = !term || original.includes(term) || translation.includes(term);

      row.style.display = (matchesLanguage && matchesText) ? "" : "none";
    });

    // ✅ Re-sort AFTER filtering
    sortAvailableRows();
    updateAvailableWordCount();
  }

  availableSearchInput?.addEventListener("input", applyAvailableFilters);
  availableLanguageFilter?.addEventListener("change", applyAvailableFilters);

  addWordsBtn?.addEventListener("click", () => {
    if (availableSearchInput) availableSearchInput.value = "";
    if (availableLanguageFilter) availableLanguageFilter.value = "";
    if (selectAllAvailable) selectAllAvailable.checked = false;

    availableTableBody?.querySelectorAll("tr").forEach(row => {
      if (row.dataset.empty === "true") return;

      row.style.display = "";
      const cb = row.querySelector(".available-word-checkbox");
      if (cb) cb.checked = false;
    });

    // ✅ Sort on modal open (case-insensitive)
    sortAvailableRows();
    updateAvailableWordCount();

    addWordsModal?.show();
  });

  selectAllAvailable?.addEventListener("change", () => {
    const checked = selectAllAvailable.checked;
    availableTableBody
      ?.querySelectorAll(".available-word-checkbox")
      .forEach(cb => (cb.checked = checked));
  });

  confirmAddBtn?.addEventListener("click", () => {
    const selected = [];

    availableTableBody
      ?.querySelectorAll(".available-word-checkbox:checked")
      .forEach(cb => {
        const row = cb.closest("tr");
        if (row && row.style.display === "none") return;
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

  // ✅ Initial sort + count
  sortAvailableRows();
  updateAvailableWordCount();
}

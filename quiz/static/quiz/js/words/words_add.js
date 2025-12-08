window.initWordsAdd = function () {
  const addBtn = document.getElementById("add-word-btn");
  const addModalEl = document.getElementById("addModal");
  const addForm = document.getElementById("add-form");
  const container = document.getElementById("word-rows-container");
  const addRowBtn = document.getElementById("add-row-btn");
  const languageSelect = document.getElementById("add-language");

  if (!addBtn || !addForm || !container || !addModalEl) return;

  const addModal = window.bootstrap
    ? new bootstrap.Modal(addModalEl)
    : null;

  function createRow() {
    const row = document.createElement("div");
    row.className = "row g-2 align-items-center mb-2 word-row";
    row.innerHTML = `
      <div class="col">
        <input class="form-control original-input" placeholder="Original">
      </div>
      <div class="col">
        <input class="form-control translation-input" placeholder="Translation">
      </div>
      <div class="col-auto">
        <button type="button"
                class="btn btn-outline-danger btn-sm remove-row-btn">
          ×
        </button>
      </div>
    `;
    return row;
  }

  // ✅ Hide X if only 1 row exists, show if 2+
  function updateRemoveButtonsVisibility() {
    const rows = container.querySelectorAll(".word-row");
    const showRemove = rows.length > 1;

    rows.forEach(row => {
      const btn = row.querySelector(".remove-row-btn");
      if (!btn) return;
      btn.style.display = showRemove ? "inline-flex" : "none";
    });
  }

  function reset() {
    container.innerHTML = "";
    container.appendChild(createRow());
    updateRemoveButtonsVisibility(); // ✅ Apply rule on reset
  }

  // ✅ Open modal
  addBtn.addEventListener("click", () => {
    reset();
    addModal?.show();
  });

  // ✅ Add another row
  addRowBtn?.addEventListener("click", e => {
    e.preventDefault();
    container.appendChild(createRow());
    updateRemoveButtonsVisibility(); // ✅ Re-check after adding
  });

  // ✅ Remove row
  container.addEventListener("click", e => {
    if (!e.target.classList.contains("remove-row-btn")) return;

    const row = e.target.closest(".word-row");
    if (!row) return;

    const rows = container.querySelectorAll(".word-row");

    if (rows.length === 1) {
      row.querySelectorAll("input").forEach(i => i.value = "");
    } else {
      row.remove();
    }

    updateRemoveButtonsVisibility(); // ✅ Re-check after removing
  });

  // ✅ Submit words
  addForm.addEventListener("submit", async e => {
    e.preventDefault();

    const pairs = [...container.querySelectorAll(".word-row")]
      .map(row => ({
        original: row.querySelector(".original-input").value.trim(),
        translation: row.querySelector(".translation-input").value.trim()
      }))
      .filter(p => p.original && p.translation);

    if (!pairs.length) {
      alert("Please fill in at least one word pair.");
      return;
    }

    const token = getCSRFToken();
    const language = languageSelect.value;

    if (!language) {
      alert("Please select a language.");
      return;
    }

    for (const pair of pairs) {
      const fd = new FormData();
      fd.append("original_word", pair.original);
      fd.append("translation", pair.translation);
      fd.append("language", language);

      await fetch("/word_list/add/", {
        method: "POST",
        body: fd,
        headers: {
          "X-CSRFToken": token,
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "same-origin"
      });
    }

    addModal?.hide();
    window.searchWords?.();
  });
};

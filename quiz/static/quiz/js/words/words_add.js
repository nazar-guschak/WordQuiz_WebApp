// static/quiz/js/words/words_add.js

window.initWordsAdd = function () {
  const addBtn = document.getElementById("add-word-btn");
  const addModalEl = document.getElementById("addModal");
  const addForm = document.getElementById("add-form");
  const container = document.getElementById("word-rows-container");
  const addRowBtn = document.getElementById("add-row-btn");
  const languageSelect = document.getElementById("add-language");
  const quizSelect = document.getElementById("add-quiz"); // optional

  if (!addBtn || !addForm || !container || !addModalEl || !languageSelect) return;

  const addModal = window.bootstrap ? new bootstrap.Modal(addModalEl) : null;

  function getCSRFToken() {
    return document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrftoken="))
      ?.split("=")[1];
  }

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
        <button type="button" class="btn btn-outline-danger btn-sm remove-row-btn">×</button>
      </div>
    `;
    return row;
  }

  function updateRemoveButtonsVisibility() {
    const rows = container.querySelectorAll(".word-row");
    const showRemove = rows.length > 1;

    rows.forEach((row) => {
      const btn = row.querySelector(".remove-row-btn");
      if (!btn) return;
      btn.style.display = showRemove ? "inline-flex" : "none";
    });
  }

  function reset() {
    addForm.reset();
    container.innerHTML = "";
    container.appendChild(createRow());
    updateRemoveButtonsVisibility();
  }

  addBtn.addEventListener("click", () => {
    reset();
    addModal?.show();
  });

  addRowBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    container.appendChild(createRow());
    updateRemoveButtonsVisibility();
  });

  container.addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove-row-btn")) return;

    const row = e.target.closest(".word-row");
    if (!row) return;

    const rows = container.querySelectorAll(".word-row");
    if (rows.length === 1) {
      row.querySelectorAll("input").forEach((i) => (i.value = ""));
    } else {
      row.remove();
    }

    updateRemoveButtonsVisibility();
  });

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const language = (languageSelect.value || "").trim().toLowerCase(); // can be ""
    const quizId = quizSelect?.value?.trim() || "";

    const pairs = [...container.querySelectorAll(".word-row")]
      .map((row) => ({
        original: row.querySelector(".original-input")?.value.trim() || "",
        translation: row.querySelector(".translation-input")?.value.trim() || "",
      }))
      .filter((p) => p.original && p.translation);

    if (!pairs.length) {
      alert("Please fill in at least one word pair.");
      return;
    }

    const token = getCSRFToken();

    for (const pair of pairs) {
      const fd = new FormData();
      fd.append("original_word", pair.original);
      fd.append("translation", pair.translation);
      fd.append("language", language); // "" allowed

      if (quizId) fd.append("quiz_id", quizId);

      const res = await fetch("/word_list/add/", {
        method: "POST",
        body: fd,
        headers: {
          "X-CSRFToken": token,
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        alert(data?.error || "Failed to add a word.");
        return;
      }
    }

    addModal?.hide();
    window.searchWords?.(); // table rebuild uses the fixed words_search.js
  });
};

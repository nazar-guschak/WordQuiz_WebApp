// static/quiz/js/words/words_edit.js

function getCSRFToken() {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrftoken="))
    ?.split("=")[1];
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Keep language rendering consistent with templates/quiz/partials/_words_tab.html:
 * - Known language => <span class="ws-lang-badge">DE</span>
 * - Unknown => Unknown badge + "Excluded from quizzes"
 */
function renderLanguageCellHTML(languageCode) {
  const code = (languageCode || "").trim().toLowerCase();

  if (code) {
    return `
      <span class="ws-lang-badge">${code.toUpperCase()}</span>
    `.trim();
  }

  return `
    <span class="ws-lang-badge ws-lang-badge-unknown">Unknown</span>
    <span class="text-muted small d-block">Excluded from quizzes</span>
  `.trim();
}

window.initWordsEdit = function () {
  const editModalEl = document.getElementById("editModal");
  const editForm = document.getElementById("edit-form");
  if (!editForm) return;

  const editModal =
    window.bootstrap && editModalEl ? new bootstrap.Modal(editModalEl) : null;

  // Works on either page
  const generalBody = document.getElementById("word-table-body");
  const quizBody = document.getElementById("quiz-word-table-body");
  if (!generalBody && !quizBody) return;

  const editUrlInput = editForm.querySelector("#edit-url"); // optional
  const editQuizSelect = editForm.querySelector("#edit-quiz"); // optional

  function fillForm({ id, original, translation, language, editUrl }) {
    editForm.querySelector("#edit-id").value = id || "";
    editForm.querySelector("#edit-original").value = original || "";
    editForm.querySelector("#edit-translation").value = translation || "";
    editForm.querySelector("#edit-language").value = (language || "").toLowerCase();

    if (editUrlInput) editUrlInput.value = editUrl || "";
    if (editQuizSelect) editQuizSelect.value = "";

    editModal?.show();
  }

  function bindBody(body, mode) {
    body.addEventListener("click", async (e) => {
      // ✅ EDIT (general: .edit-btn, quiz: .quiz-edit-word-btn)
      const editBtn =
        e.target.closest(".edit-btn") || e.target.closest(".quiz-edit-word-btn");

      if (editBtn) {
        const row =
          editBtn.closest("tr[data-id]") || editBtn.closest("tr[data-word-id]");

        const id =
          editBtn.dataset.wordId || row?.dataset.wordId || row?.dataset.id;

        if (!id) return;

        // Prefer dataset from button (quiz table should have these)
        const original =
          editBtn.dataset.original ||
          row?.querySelector(".ws-col-original")?.textContent?.trim() ||
          "";

        const translation =
          editBtn.dataset.translation ||
          row?.querySelector(".ws-col-translation")?.textContent?.trim() ||
          "";

        const language = editBtn.dataset.language || row?.dataset.language || "";
        const editUrl = editBtn.dataset.editUrl || ""; // quiz table provides this

        fillForm({ id, original, translation, language, editUrl });
        return;
      }

      // ✅ DELETE (general words page only)
      if (mode === "general" && e.target.closest(".delete-btn")) {
        const row = e.target.closest("tr[data-id]");
        if (!row) return;

        const id = row.dataset.id;
        if (!id) return;

        if (!confirm("Delete this word?")) return;

        const res = await fetch(`/word_list/${id}/delete/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCSRFToken(),
            "X-Requested-With": "XMLHttpRequest",
          },
          credentials: "same-origin",
        });

        const data = await safeJson(res);

        if (res.ok && data?.success) {
          row.remove();
          window.updateBulkDeleteState?.();
          window.updateWordCount?.(-1);
        } else {
          alert(data?.error || "Delete failed");
        }
      }
    });
  }

  if (generalBody) bindBody(generalBody, "general");
  if (quizBody) bindBody(quizBody, "quiz");

  // ✅ Submit edit form (general + quiz)
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = editForm.querySelector("#edit-id")?.value;
    if (!id) return;

    const formData = new FormData(editForm);
    if (editQuizSelect && !formData.has("quiz_id")) {
      formData.append("quiz_id", editQuizSelect.value || "");
    }

    const url =
      editUrlInput && editUrlInput.value
        ? editUrlInput.value
        : `/word_list/${id}/edit/`;

    const res = await fetch(url, {
      method: "POST",
      body: formData,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
    });

    const data = await safeJson(res);
    if (!(res.ok && data?.success)) {
      alert(data?.error || "Save failed");
      return;
    }

    editModal?.hide();

    // General words page: keep your current flow (server/JS decides table HTML)
    if (typeof window.searchWords === "function") {
      window.searchWords();
      return;
    }

    // Quiz manage page OR fallback: update row in-place
    const row =
      quizBody?.querySelector(`tr[data-word-id="${CSS.escape(id)}"]`) ||
      generalBody?.querySelector(`tr[data-id="${CSS.escape(id)}"]`);

    if (!row) return;

    const newOriginal = (editForm.querySelector("#edit-original")?.value || "").trim();
    const newTranslation = (editForm.querySelector("#edit-translation")?.value || "").trim();
    const newLanguage = (editForm.querySelector("#edit-language")?.value || "").trim().toLowerCase();

    const origCell = row.querySelector(".ws-col-original");
    const transCell = row.querySelector(".ws-col-translation");
    if (origCell) origCell.textContent = newOriginal;
    if (transCell) transCell.textContent = newTranslation;

    // Keep dataset in sync (used by other scripts)
    row.dataset.language = newLanguage;

    // ✅ Important: rebuild the whole language cell consistently
    const langCell = row.querySelector(".ws-lang-cell");
    if (langCell) {
      langCell.innerHTML = renderLanguageCellHTML(newLanguage);
    } else {
      // Fallback: if no .ws-lang-cell exists, update badge if present
      const badge = row.querySelector(".ws-lang-badge");
      if (badge) badge.textContent = (newLanguage || "").toUpperCase();
    }

    // Keep quiz edit button dataset in sync (modal prefill)
    const quizEditBtn = row.querySelector(".quiz-edit-word-btn");
    if (quizEditBtn) {
      quizEditBtn.dataset.original = newOriginal;
      quizEditBtn.dataset.translation = newTranslation;
      quizEditBtn.dataset.language = newLanguage;
    }
  });
};

export function initQuizSelection() {
  const selectionRoot = document.getElementById("quiz-selection-root");
  if (!selectionRoot) return;

  const quizSelector = document.getElementById("quiz-selector");
  const languageWrapper = document.getElementById("language-wrapper");
  const languageSelect = document.getElementById("quiz-language");
  const warningBox = document.getElementById("quiz-warning");
  const startBtn = document.getElementById("start-quiz-btn");

  const allWordCount = parseInt(
    selectionRoot.dataset.allWordCount || "0",
    10
  );

  function updateLanguageVisibility() {
    if (!languageWrapper || !languageSelect) return;

    const isGeneral = !quizSelector.value;

    languageWrapper.style.display = isGeneral ? "" : "none";

    // ✅ IMPORTANT: don’t block submit for custom quizzes
    languageSelect.disabled = !isGeneral;
    languageSelect.required = isGeneral;

    // optional: clear value when switching to custom
    if (!isGeneral) languageSelect.value = "";
  }


  // ✅ RESTORED ORIGINAL SAFE WORD COUNT LOGIC
  function getCurrentWordCount() {
    const selectedQuizId = quizSelector.value;

    // -------------------------
    // ✅ GENERAL QUIZ
    // -------------------------
    if (!selectedQuizId) {
      if (!languageSelect) return allWordCount;

      const langValue = languageSelect.value;

      // ✅ "All languages"
      if (!langValue) {
        return allWordCount;
      }

      const opt = languageSelect.selectedOptions[0];
      if (!opt) return 0;

      const count = parseInt(opt.dataset.wordCount || "0", 10);
      return isNaN(count) ? 0 : count;
    }

    // -------------------------
    // ✅ CUSTOM QUIZ
    // -------------------------
    const quizOpt = quizSelector.selectedOptions[0];
    if (!quizOpt) return 0;

    const count = parseInt(quizOpt.dataset.wordCount || "0", 10);
    return isNaN(count) ? 0 : count;
  }

  function updateWarningAndButton() {
    const count = getCurrentWordCount();
    const selectedQuizId = quizSelector.value;

    if (count < 4) {
      let message;

      if (!selectedQuizId) {
        if (languageSelect && languageSelect.value) {
          const langOpt = languageSelect.selectedOptions[0];
          const langLabel = langOpt
            ? langOpt.textContent.trim()
            : "selected language";

          message =
            `The selected general quiz has only ${count} word(s). ` +
            `You need at least 4 words to start a quiz. ` +
            `Please add more words first to ${langLabel}.`;
        } else {
          message =
            `Your general word list has only ${count} word(s). ` +
            `You need at least 4 words to start a quiz. ` +
            `Please add more words first.`;
        }
      } else {
        const quizOpt = quizSelector.selectedOptions[0];
        const quizName = quizOpt
          ? quizOpt.textContent.trim()
          : "this quiz";

        message =
          `Додайте принаймні 4 слова, щоб почати цей тест. `;
      }

      warningBox.textContent = message;
      warningBox.classList.remove("d-none");
      startBtn.disabled = true;
    } else {
      warningBox.textContent = "";
      warningBox.classList.add("d-none");
      startBtn.disabled = false;
    }
  }

  quizSelector.addEventListener("change", () => {
    updateLanguageVisibility();
    updateWarningAndButton();
  });

  if (languageSelect) {
    languageSelect.addEventListener("change", updateWarningAndButton);
  }

  // ✅ Initial state
  updateLanguageVisibility();
  updateWarningAndButton();
}

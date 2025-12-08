import { quizConfig } from "./config.js";
import { buildMatchingUI } from "./match.js";
import { initChoiceHandlers } from "./choice.js";

export function initQuizFlow() {
  const container = document.getElementById("choices-container");
  const nextBtn = document.getElementById("next-btn");
  const wordText = document.getElementById("word-text");
  const wordCard = document.getElementById("word-card");
  const correctInput = document.getElementById("correct-answer");
  const wordIdInput = document.getElementById("word-id");
  const finishButtons = document.getElementById("quiz-finish-buttons");
  const retryBtn = document.getElementById("retry-btn");
  const backBtn = document.getElementById("back-btn");

  if (!container || !nextBtn || !correctInput) return;

  let nextUrl = quizConfig.nextQuizBaseUrl;

  if (quizConfig.quizId)
    nextUrl += `?quiz_id=${quizConfig.quizId}`;
  else if (quizConfig.selectedLanguage)
    nextUrl += `?language=${encodeURIComponent(
      quizConfig.selectedLanguage
    )}`;

  // ✅ FIRST QUESTION (rendered by Django)
  if (document.querySelectorAll(".choice-btn").length) {
    initChoiceHandlers(correctInput, wordIdInput, nextBtn);
  }

  // =========================
  // ✅ NEXT BUTTON
  // =========================
  nextBtn.addEventListener("click", async () => {
    if (nextBtn.disabled) return;

    const res = await fetch(nextUrl);
    const data = await res.json();

    // =========================
    // ✅ QUIZ FINISHED
    // =========================
    if (data.finished) {
      const nCorrect = data.score ?? 0;
      const nTotal = data.total ?? 0;

      if (wordCard) {
        wordCard.classList.remove("d-none");
      }

      wordText.textContent = `Finished! Score: ${nCorrect} / ${nTotal}`;
      container.innerHTML = "";
      nextBtn.classList.add("d-none");

      if (finishButtons) finishButtons.classList.remove("d-none");

      // ✅ For custom quiz: hide "Change quiz type"
      if (quizConfig.quizId) {
        const changeLinkWrapper = document.getElementById(
          "change-quiz-link-wrapper"
        );
        if (changeLinkWrapper) {
          changeLinkWrapper.classList.add("d-none");
        }
      }

      return;
    }

    container.innerHTML = "";

    // =========================
    // ✅ MATCH MODE
    // =========================
    if (data.quiz_type === "match") {
      // ✅ HIDE WORD CARD DURING MATCH (FIX #1)
      if (wordCard) wordCard.classList.add("d-none");
      wordText.textContent = "";

      // ✅ Remove grid spacing used for MC
      container.className = "mt-2";

      buildMatchingUI(data, container, nextBtn);
      nextBtn.disabled = true;
      return;
    }

    // =========================
    // ✅ MULTIPLE CHOICE MODE
    // =========================
    // ✅ RESTORE WORD CARD (FIX #1)
    if (wordCard) wordCard.classList.remove("d-none");

    wordText.textContent = data.word;
    correctInput.value = data.correct;
    if (wordIdInput) wordIdInput.value = data.word_id;

    // ✅ RESTORE GRID SPACING AFTER MATCH (FIX #2)
    container.className = "d-grid gap-3";

    data.choices.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-ws-base btn-ws-soft choice-btn w-100";
      btn.dataset.answer = c;
      btn.textContent = c;
      container.appendChild(btn);
    });

    nextBtn.disabled = true;
    initChoiceHandlers(correctInput, wordIdInput, nextBtn);
  });

  // =========================
  // ✅ RETRY BUTTON
  // =========================
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      if (!quizConfig.quizPageUrl) return;

      if (!quizConfig.quizId) {
        let url = `${quizConfig.quizPageUrl}?start=1`;
        if (quizConfig.selectedLanguage) {
          url += `&language=${encodeURIComponent(
            quizConfig.selectedLanguage
          )}`;
        }
        window.location.href = url;
      } else {
        window.location.href = `${quizConfig.quizPageUrl}?start=1&quiz_id=${quizConfig.quizId}`;
      }
    });
  }

  // =========================
  // ✅ BACK TO SELECTION
  // =========================
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (!quizConfig.quizPageUrl) return;
      window.location.href = quizConfig.quizPageUrl;
    });
  }
}

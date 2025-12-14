// static/quiz/js/quizz/choice.js
import { quizConfig, getCSRFToken } from "./config.js";

/**
 * Choice quiz handlers:
 * - Keeps btn-ws-soft as the stable base style (overlay fade relies on it).
 * - Adds `.ws-choice` marker class so choice-only CSS can target it (prevents match quiz regressions).
 * - Uses staged class toggles to ensure transitions fire:
 *   answer-reveal (opacity 0) -> btn-ws-success/danger -> answer-visible (opacity 1)
 * - Removes answer-reveal after visible so text doesn't "fade out" / get stuck in staging styles.
 */
export function initChoiceHandlers(correctInput, wordIdInput, nextBtn) {
  const buttons = [...document.querySelectorAll(".choice-btn")];
  if (!buttons.length || !nextBtn || !correctInput) return;

  // Mark these buttons as CHOICE-only for CSS scoping (important!)
  buttons.forEach((b) => b.classList.add("ws-choice"));

  let answered = false;

  function setPressed(btn) {
    buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");
  }

  function lockOthers(selectedBtn) {
    // Do NOT remove btn-ws-soft from anything.
    // Only disable the other buttons.
    buttons.forEach((b) => {
      if (b !== selectedBtn) b.disabled = true;
    });
  }

  function resetUI() {
    answered = false;

    buttons.forEach((b) => {
      b.disabled = false;

      // Base style for all choices
      b.classList.add("btn-ws-soft");

      // Keep marker
      b.classList.add("ws-choice");

      // Clear result / animation classes
      b.classList.remove(
        "btn-ws-success",
        "btn-ws-danger",
        "answer-reveal",
        "answer-visible"
      );

      b.setAttribute("aria-pressed", "false");
    });

    nextBtn.disabled = true;
  }

  async function checkChoice(chosen) {
    const res = await fetch(quizConfig.checkAnswerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": getCSRFToken(),
      },
      body: new URLSearchParams({
        quiz_type: "choice",
        chosen,
        correct: correctInput.value || "",
        quiz_id: quizConfig.quizId || "",
        word_id: wordIdInput?.value || "",
      }),
    });

    if (!res.ok) throw new Error(`Bad response: ${res.status}`);
    return res.json();
  }

  function reveal(btn, isCorrect) {
    // Clean slate for reveal sequence (keep btn-ws-soft + ws-choice!)
    btn.classList.remove(
      "btn-ws-success",
      "btn-ws-danger",
      "answer-reveal",
      "answer-visible"
    );

    // Stage 1: start hidden (overlay opacity 0)
    btn.classList.add("answer-reveal");

    // Force flush so subsequent changes transition
    void btn.offsetHeight;

    // Stage 2: set which overlay we want
    requestAnimationFrame(() => {
      btn.classList.add(isCorrect ? "btn-ws-success" : "btn-ws-danger");

      // Stage 3: make overlay visible (opacity transition + shake via CSS)
      requestAnimationFrame(() => {
        btn.classList.add("answer-visible");

        // IMPORTANT:
        // Don't leave staging class behind; it can keep "pre-reveal" text styling active.
        btn.classList.remove("answer-reveal");
      });
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (answered) return;

      answered = true;
      nextBtn.disabled = true;

      const chosen = btn.dataset.answer ?? "";

      setPressed(btn);
      lockOthers(btn);

      try {
        const data = await checkChoice(chosen);

        reveal(btn, !!data.is_correct);
        nextBtn.disabled = false;
      } catch (e) {
        console.error("Choice check failed:", e);
        resetUI();
      }
    });
  });
}

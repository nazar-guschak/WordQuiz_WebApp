import { quizConfig, getCSRFToken } from "./config.js";

export function initChoiceHandlers(correctInput, wordIdInput, nextBtn) {
  const buttons = document.querySelectorAll(".choice-btn");
  let answered = false;

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (answered) return;
      answered = true;

      const chosen = btn.dataset.answer;

      const response = await fetch(quizConfig.checkAnswerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRFToken": getCSRFToken(),
        },
        body: new URLSearchParams({
          quiz_type: "choice",
          chosen,
          correct: correctInput.value,
          quiz_id: quizConfig.quizId || "",
          word_id: wordIdInput?.value || "",
        }),
      });

      const data = await response.json();

      document.querySelectorAll(".choice-btn").forEach((b) => {
        b.disabled = true;
        b.classList.remove("btn-ws-soft");
      });

      btn.classList.add(data.is_correct ? "btn-ws-success" : "btn-ws-danger");

      nextBtn.disabled = false;
    });
  });
}

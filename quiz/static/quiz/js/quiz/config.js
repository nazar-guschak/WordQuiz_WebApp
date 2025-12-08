const pageRoot = document.getElementById("quiz-page-root");

export const quizConfig = {
  nextQuizBaseUrl: pageRoot?.dataset.nextUrl || "",
  checkAnswerUrl: pageRoot?.dataset.checkUrl || "",
  quizPageUrl: pageRoot?.dataset.quizUrl || "",
  selectedLanguage: pageRoot?.dataset.selectedLanguage || "",
  quizId: pageRoot?.dataset.quizId
    ? parseInt(pageRoot.dataset.quizId, 10)
    : null,
};

export function getCSRFToken() {
  const cookieValue = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrftoken="));
  return cookieValue ? cookieValue.split("=")[1] : "";
}

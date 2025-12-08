window.initQuizzesAdd = function () {
  const quizTableBody = document.getElementById("quiz-table-body");
  const quizAddBtn = document.getElementById("quiz-add-btn");
  const quizAddModalEl = document.getElementById("quizAddModal");
  const quizAddForm = document.getElementById("quiz-add-form");

  if (!quizAddBtn || !quizAddForm) return;

  // Only initialize modal if Bootstrap is available
  const quizAddModal = window.bootstrap
    ? new bootstrap.Modal(quizAddModalEl)
    : null;

  const createQuizUrl = quizAddForm.dataset.createUrl;

  // --- Open Add Quiz Modal ---
  quizAddBtn.addEventListener("click", () => {
    quizAddForm.reset();
    quizAddModal?.show();
  });

  // --- Create Quiz via AJAX ---
  quizAddForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitter = e.submitter;
    const action = submitter ? submitter.dataset.action : "close";

    const formData = new FormData(quizAddForm);

    try {
      const response = await fetch(createQuizUrl, {
        method: "POST",
        body: formData,
        headers: {
          "X-CSRFToken": getCSRFToken(),
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "same-origin"
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || "Failed to create quiz.");
        return;
      }

      const quiz = data.quiz;

      if (quizTableBody) {
        const emptyRow = quizTableBody.querySelector("tr");
        if (emptyRow && emptyRow.textContent.toLowerCase().includes("no")) {
          emptyRow.remove();
        }

        const tr = document.createElement("tr");
        tr.dataset.id = quiz.id;

        tr.innerHTML = `
          <td>
            <a href="${quiz.detail_url}">${quiz.title}</a>
          </td>
          <td>${quiz.word_count}</td>
          <td class="action-buttons text-center">
            <div class="d-flex gap-2 justify-content-center">
              <button type="button"
                      class="icon-action edit"
                      title="Edit quiz"
                      onclick="window.location.href='${quiz.detail_url}'">
                <i class="bi bi-pencil-square fs-5"></i>
              </button>
              <button type="button"
                      class="icon-action delete delete-btn"
                      data-delete-url="${quiz.delete_url || ""}"
                      title="Delete quiz">
                <i class="bi bi-trash3 fs-5"></i>
              </button>
            </div>
          </td>
        `;

        quizTableBody.appendChild(tr);
      }

      if (action === "close") {
        quizAddModal?.hide();
      } else if (action === "add-words") {
        window.location.href = quiz.detail_url;
      }
    } catch (err) {
      console.error("Create quiz error:", err);
      alert("Network error while creating quiz.");
    }
  });
};

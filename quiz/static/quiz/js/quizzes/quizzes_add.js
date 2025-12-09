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
          <!-- Checkbox -->
          <td class="ws-check-cell">
            <input type="checkbox" class="ws-check-input quiz-checkbox">
          </td>

          <!-- Quiz title -->
          <td class="ws-col-original">
            <a href="${quiz.detail_url}" class="text-decoration-none">
              ${quiz.title}
            </a>
          </td>

          <!-- Word count -->
          <td class="ws-col-translation">
            ${quiz.word_count}
          </td>

          <!-- Actions -->
          <td class="ws-actions-cell">
            <div class="btn-row">

              <button type="button"
                      class="btn-ws-icon edit"
                      title="Edit quiz"
                      aria-label="Edit quiz"
                      onclick="window.location.href='${quiz.detail_url}'">
                <i class="bi bi-pencil-square"></i>
              </button>

              <button type="button"
                      class="btn-ws-icon delete delete-btn"
                      title="Delete quiz"
                      aria-label="Delete quiz"
                      data-delete-url="${quiz.delete_url}">
                <i class="bi bi-trash3"></i>
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

// static/quiz/js/quiz.js

document.addEventListener("DOMContentLoaded", () => {
  const pageRoot = document.getElementById("quiz-page-root");
  if (!pageRoot) return;

  // ------------------------------------------------------------
  // Common URLs & state from data attributes
  // ------------------------------------------------------------
  const nextQuizBaseUrl = pageRoot.dataset.nextUrl || "";
  const checkAnswerUrl = pageRoot.dataset.checkUrl || "";
  const quizPageUrl = pageRoot.dataset.quizUrl || "";
  const selectedLanguage = pageRoot.dataset.selectedLanguage || "";
  const quizIdRaw = pageRoot.dataset.quizId || "";
  const quizId = quizIdRaw ? parseInt(quizIdRaw, 10) : null;

  // ------------------------------------------------------------
  // CSRF helper
  // ------------------------------------------------------------
  function getCSRFToken() {
    const cookieValue = document.cookie
      .split("; ")
      .find(row => row.startsWith("csrftoken="));
    return cookieValue ? cookieValue.split("=")[1] : "";
  }
  const csrfToken = getCSRFToken();

  // ============================================================
  // 1. SELECTION MODE (start screen)
  // ============================================================
  const selectionRoot = document.getElementById("quiz-selection-root");

  if (selectionRoot) {
    const quizSelector = document.getElementById("quiz-selector");
    const languageWrapper = document.getElementById("language-wrapper");
    const languageSelect = document.getElementById("quiz-language");
    const warningBox = document.getElementById("quiz-warning");
    const startBtn = document.getElementById("start-quiz-btn");

    if (quizSelector && warningBox && startBtn) {
      const allWordCount = parseInt(
        selectionRoot.dataset.allWordCount || "0",
        10
      );

      function updateLanguageVisibility() {
        if (!languageWrapper) return;
        const isGeneral = !quizSelector.value; // empty => general quiz
        languageWrapper.style.display = isGeneral ? "" : "none";
      }

      function getCurrentWordCount() {
        const selectedQuizId = quizSelector.value;

        // GENERAL QUIZ
        if (!selectedQuizId) {
          if (!languageSelect) return allWordCount;

          const langValue = languageSelect.value;
          if (!langValue) {
            // "All languages"
            return allWordCount;
          }
          const opt = languageSelect.selectedOptions[0];
          if (!opt) return 0;
          const count = parseInt(opt.dataset.wordCount || "0", 10);
          return isNaN(count) ? 0 : count;
        }

        // CUSTOM QUIZ
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
            // General quiz
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
            // Custom quiz
            const quizOpt = quizSelector.selectedOptions[0];
            const quizName = quizOpt
              ? quizOpt.textContent.trim()
              : "this quiz";
            message =
              `The selected quiz (“${quizName}”) has only ${count} word(s). ` +
              `You need at least 4 words to start this quiz. ` +
              `Please add more words to it first.`;
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

      // Initial state
      updateLanguageVisibility();
      updateWarningAndButton();
    }
  }

  // ============================================================
  // 2. QUIZ MODE (active quiz)
  // ============================================================
  const choicesContainer = document.getElementById("choices-container");
  const nextBtn = document.getElementById("next-btn");
  const wordText = document.getElementById("word-text");
  const wordCard = document.getElementById("word-card");
  const correctAnswerInput = document.getElementById("correct-answer");
  const wordIdInput = document.getElementById("word-id");
  const finishButtons = document.getElementById("quiz-finish-buttons");
  const retryBtn = document.getElementById("retry-btn");
  const backBtn = document.getElementById("back-btn");

  if (choicesContainer && nextBtn && wordText && correctAnswerInput) {
    // ---------- State ----------
    let answered = false;           // current question answered/committed
    let currentQuizType = "choice"; // "choice" or "match"

    // Matching quiz state
    let matchLeftToRight = {};   // leftId -> rightId (only correct pairs stick)
    let matchRightToLeft = {};   // rightId -> leftId
    let matchLeftElements = {};  // leftId -> DOM element
    let matchRightElements = {}; // rightId -> DOM element
    let matchSelectedLeftId = null;

    // Per-word first attempt correctness: word_id -> true/false
    let firstAttemptCorrectByWord = {}; // only set once per word

    // For match questions: which words belong to this question
    let currentQuestionWordIds = [];

    // ---------- Build base URL for "next quiz" calls ----------
    let nextQuizUrl = nextQuizBaseUrl;
    if (quizId) {
      nextQuizUrl = `${nextQuizBaseUrl}?quiz_id=${quizId}`;
    } else if (selectedLanguage) {
      nextQuizUrl = `${nextQuizBaseUrl}?language=${encodeURIComponent(
        selectedLanguage
      )}`;
    }

    // ========================================================
    // Matching helpers
    // ========================================================
    function resetMatchState() {
      matchLeftToRight = {};
      matchRightToLeft = {};
      matchLeftElements = {};
      matchRightElements = {};
      matchSelectedLeftId = null;
      firstAttemptCorrectByWord = {};
      // currentQuestionWordIds is set when we receive new data
    }

    function resetToChoiceUI() {
      currentQuizType = "choice";
      resetMatchState();

      if (wordCard) {
        wordCard.classList.remove("d-none");
      }

      nextBtn.textContent = "Next";
      nextBtn.disabled = true;
      nextBtn.classList.remove("btn-primary");
      nextBtn.classList.add("btn-secondary");
    }

    function clearPairClasses(el) {
      if (!el) return;
      el.classList.remove(
        "match-paired",
        "match-pair-1",
        "match-pair-2",
        "match-pair-3",
        "match-pair-4",
        "match-correct",
        "match-wrong"
      );
    }

    // For correct pair: turn both green and lock them
    function markCorrectPair(leftId, rightId) {
      const leftEl = matchLeftElements[leftId];
      const rightEl = matchRightElements[rightId];
      if (!leftEl || !rightEl) return;

      clearPairClasses(leftEl);
      clearPairClasses(rightEl);

      leftEl.classList.add("match-correct", "match-disabled");
      rightEl.classList.add("match-correct", "match-disabled");
    }

    // For wrong attempt: flash red and then revert
    function flashWrongPair(leftEl, rightEl) {
      if (!leftEl || !rightEl) return;

      clearPairClasses(leftEl);
      clearPairClasses(rightEl);

      leftEl.classList.add("match-wrong");
      rightEl.classList.add("match-wrong");

      setTimeout(() => {
        clearPairClasses(leftEl);
        clearPairClasses(rightEl);
      }, 500);
    }

    // Called after each correct pairing; when all pairs are done:
    //  - Next is enabled
    //  - Results are sent to backend for scoring (once)
    function finalizeMatchQuestionIfComplete() {
      const totalPairsNeeded = Object.keys(matchLeftElements).length;
      const currentPairs = Object.keys(matchLeftToRight).length;

      if (currentPairs === totalPairsNeeded) {
        nextBtn.disabled = false;
        nextBtn.classList.remove("btn-secondary");
        nextBtn.classList.add("btn-primary");
        nextBtn.textContent = "Next";

        // Send matches + first-attempt info to backend once
        submitMatchAnswer();
      } else {
        nextBtn.disabled = true;
        nextBtn.classList.remove("btn-primary");
        nextBtn.classList.add("btn-secondary");
      }
    }

    function buildMatchingUI(leftItems, rightItems, instruction) {
      currentQuizType = "match";
      answered = false;

      if (wordCard) {
        wordCard.classList.add("d-none");
      }
      wordText.textContent = "";

      choicesContainer.innerHTML = "";

      const instructionText =
        instruction || "Match each word with its correct translation.";

      const infoP = document.createElement("p");
      infoP.className = "fw-semibold text-center mb-3";
      infoP.textContent = instructionText;
      choicesContainer.appendChild(infoP);

      const row = document.createElement("div");
      row.className = "row";

      const leftCol = document.createElement("div");
      leftCol.className = "col-6 d-grid gap-2";

      const rightCol = document.createElement("div");
      rightCol.className = "col-6 d-grid gap-2";

      resetMatchState();

      // Left column buttons (original words)
      leftItems.forEach(item => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "btn btn-outline-primary py-2 fs-5 w-100 text-start match-item match-left";
        btn.dataset.wordId = item.id;
        btn.textContent = item.text;
        leftCol.appendChild(btn);
        matchLeftElements[item.id] = btn;
      });

      // Right column buttons (translations)
      rightItems.forEach(item => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "btn btn-outline-primary py-2 fs-5 w-100 text-start match-item match-right";
        btn.dataset.wordId = item.id;
        btn.textContent = item.text;
        rightCol.appendChild(btn);
        matchRightElements[item.id] = btn;
      });

      row.appendChild(leftCol);
      row.appendChild(rightCol);
      choicesContainer.appendChild(row);

      // In match mode the button is "Next", but disabled until all pairs correct
      nextBtn.textContent = "Next";
      nextBtn.disabled = true;
      nextBtn.classList.remove("btn-primary");
      nextBtn.classList.add("btn-secondary");

      attachMatchHandlers();
    }

    function attachMatchHandlers() {
      const leftButtons = document.querySelectorAll(".match-left");
      const rightButtons = document.querySelectorAll(".match-right");

      // Left column: select a word to pair
      leftButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          if (currentQuizType !== "match") return;

          const id = parseInt(btn.dataset.wordId, 10);
          if (isNaN(id)) return;

          // Toggle selection
          if (matchSelectedLeftId === id) {
            btn.classList.remove("match-selected");
            matchSelectedLeftId = null;
          } else {
            if (matchSelectedLeftId !== null) {
              const prev = matchLeftElements[matchSelectedLeftId];
              if (prev) prev.classList.remove("match-selected");
            }
            matchSelectedLeftId = id;
            btn.classList.add("match-selected");
          }
        });
      });

      // Right column: try to pair with selected left word
      rightButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          if (currentQuizType !== "match") return;

          const rightId = parseInt(btn.dataset.wordId, 10);
          if (isNaN(rightId)) return;
          if (matchSelectedLeftId === null) {
            return; // need a left selection first
          }

          const leftId = matchSelectedLeftId;
          const leftEl = matchLeftElements[leftId];
          const rightEl = matchRightElements[rightId];

          // Record first attempt correctness for this word (leftId),
          // but only if this is the FIRST time we try to pair it.
          if (!(leftId in firstAttemptCorrectByWord)) {
            const firstCorrect = leftId === rightId;
            firstAttemptCorrectByWord[leftId] = firstCorrect;
          }

          // If this attempt is wrong: flash red and do NOT store the pair
          if (leftId !== rightId) {
            flashWrongPair(leftEl, rightEl);
            matchSelectedLeftId = null;
            if (leftEl) {
              leftEl.classList.remove("match-selected");
            }
            return;
          }

          // At this point: correct pair (leftId === rightId)

          // Remove any previous mapping for this left or right, just in case
          if (matchLeftToRight[leftId] !== undefined) {
            const oldRightId = matchLeftToRight[leftId];
            delete matchLeftToRight[leftId];
            delete matchRightToLeft[oldRightId];
          }
          if (matchRightToLeft[rightId] !== undefined) {
            const oldLeftId = matchRightToLeft[rightId];
            delete matchRightToLeft[rightId];
            delete matchLeftToRight[oldLeftId];
          }

          // Store correct pair
          matchLeftToRight[leftId] = rightId;
          matchRightToLeft[rightId] = leftId;

          // Mark as correct + lock
          markCorrectPair(leftId, rightId);

          // Clear left selection
          matchSelectedLeftId = null;
          if (leftEl) {
            leftEl.classList.remove("match-selected");
          }

          // If all words are paired correctly now, finalize
          finalizeMatchQuestionIfComplete();
        });
      });
    }

    async function submitMatchAnswer() {
      const pairs = Object.entries(matchLeftToRight).map(
        ([leftId, rightId]) => ({
          left_id: parseInt(leftId, 10),
          right_id: parseInt(rightId, 10),
        })
      );

      if (!pairs.length) return;

      // Build first-attempt info as array of { word_id, first_correct }
      const firstAttempts = Object.entries(firstAttemptCorrectByWord).map(
        ([wordId, firstCorrect]) => ({
          word_id: parseInt(wordId, 10),
          first_correct: !!firstCorrect,
        })
      );

      try {
        const response = await fetch(checkAnswerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRFToken": csrfToken,
          },
          body: new URLSearchParams({
            quiz_type: "match",
            matches: JSON.stringify(pairs),
            quiz_id: quizId || "",
            question_word_ids: JSON.stringify(currentQuestionWordIds || []),
            first_attempts: JSON.stringify(firstAttempts || []),
          }),
        });

        const data = await response.json();

        if (!data.results || !Array.isArray(data.results)) {
          console.error("Unexpected match response:", data);
          return;
        }

        // UI already shows correctness; we just mark question as answered
        answered = true;
      } catch (err) {
        console.error("Match answer error:", err);
        alert("Network error while checking matches.");
      }
    }

    // ========================================================
    // Multiple-choice quiz
    // ========================================================
    function attachChoiceHandlers() {
      resetToChoiceUI();
      answered = false;

      const buttons = document.querySelectorAll(".choice-btn");
      if (!buttons.length || !correctAnswerInput.value) return;

      buttons.forEach(btn => {
        btn.addEventListener("click", async () => {
          if (answered) return;
          answered = true;

          const chosen = btn.dataset.answer;

          try {
            const response = await fetch(checkAnswerUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-CSRFToken": csrfToken,
              },
              body: new URLSearchParams({
                quiz_type: "choice",
                chosen: chosen,
                correct: correctAnswerInput.value,
                quiz_id: quizId || "",
                word_id: wordIdInput ? wordIdInput.value : "",
              }),
            });

            const data = await response.json();

            document
              .querySelectorAll(".choice-btn")
              .forEach(b => (b.disabled = true));

            btn.classList.remove("btn-outline-primary");
            btn.classList.add(data.is_correct ? "btn-success" : "btn-danger");

            nextBtn.disabled = false;
            nextBtn.classList.remove("btn-secondary");
            nextBtn.classList.add("btn-primary");
            nextBtn.textContent = "Next";
          } catch (err) {
            console.error("Check answer error:", err);
            alert("Network error while checking answer.");
          }
        });
      });
    }

    // ========================================================
    // Initial wiring and main Next logic
    // ========================================================

    // The first question is rendered by the template as multiple-choice
    attachChoiceHandlers();

    // Next button
    nextBtn.addEventListener("click", async () => {
      if (nextBtn.disabled) return;

      try {
        const response = await fetch(nextQuizUrl);
        const data = await response.json();

        // ----- QUIZ FINISHED (custom or "no words") -----
        if (data.finished) {
          const nCorrect = data.score ?? 0;
          const nTotal = data.total ?? 0;

          const message = `Finished! Score: ${nCorrect} / ${nTotal}`;

          if (wordCard) {
            wordCard.classList.remove("d-none");
          }
          wordText.textContent = message;

          choicesContainer.innerHTML = "";
          nextBtn.classList.add("d-none");
          if (finishButtons) finishButtons.classList.remove("d-none");

          // For custom quiz, hide "← Change quiz type" as redundant
          if (quizId) {
            const changeLinkWrapper = document.getElementById(
              "change-quiz-link-wrapper"
            );
            if (changeLinkWrapper) {
              changeLinkWrapper.classList.add("d-none");
            }
          }

          return;
        }

        // ----- NEXT QUESTION (general or custom) -----
        const quizType = data.quiz_type || "choice";
        answered = false;

        if (quizType === "match") {
          const instruction = data.instruction;
          const leftItems = data.left_items || [];
          const rightItems = data.right_items || [];

          // Save word IDs for this match question (used in backend)
          currentQuestionWordIds = data.question_word_ids || [];

          buildMatchingUI(leftItems, rightItems, instruction);
        } else {
          // Multiple-choice question
          currentQuizType = "choice";
          if (wordCard) {
            wordCard.classList.remove("d-none");
          }

          wordText.textContent = data.word;
          correctAnswerInput.value = data.correct;
          if (wordIdInput && data.word_id !== undefined) {
            wordIdInput.value = data.word_id;
          }

          choicesContainer.innerHTML = "";
          (data.choices || []).forEach(choice => {
            const btn = document.createElement("button");
            btn.className = "btn btn-outline-primary py-2 fs-5 choice-btn";
            btn.dataset.answer = choice;
            btn.textContent = choice;
            choicesContainer.appendChild(btn);
          });

          nextBtn.disabled = true;
          nextBtn.classList.remove("btn-primary");
          nextBtn.classList.add("btn-secondary");
          nextBtn.textContent = "Next";

          attachChoiceHandlers();
        }
      } catch (err) {
        console.error("Next quiz error:", err);
        alert("Network error while loading next question.");
      }
    });

    // Retry this quiz
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        if (!quizPageUrl) return;

        if (!quizId) {
          // General quiz: preserve selected language
          let url = `${quizPageUrl}?start=1`;
          if (selectedLanguage) {
            url += `&language=${encodeURIComponent(selectedLanguage)}`;
          }
          window.location.href = url;
        } else {
          // Custom quiz
          window.location.href = `${quizPageUrl}?start=1&quiz_id=${quizId}`;
        }
      });
    }

    // Back to quiz selection
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        if (!quizPageUrl) return;
        window.location.href = quizPageUrl;
      });
    }
  }
});

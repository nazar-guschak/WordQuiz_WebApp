import { quizConfig, getCSRFToken } from "./config.js";

let matchLeftToRight = {};
let matchRightToLeft = {};
let matchLeftElements = {};
let matchRightElements = {};
let matchSelectedId = null;   // ✅ now holds either left OR right id
let matchSelectedSide = null; // ✅ "left" or "right"
let firstAttemptCorrectByWord = {};
let currentQuestionWordIds = [];

// =====================================================
// ✅ BUILD UI
// =====================================================
export function buildMatchingUI(data, container, nextBtn) {
  container.innerHTML = "";
  container.className = "mt-2";

  const instructionText =
    data.instruction || "Match each word with its correct translation.";

  const infoP = document.createElement("p");
  infoP.className = "fw-semibold text-center mb-3";
  infoP.textContent = instructionText;
  container.appendChild(infoP);

  const row = document.createElement("div");
  row.className = "row g-2 g-md-3";
  container.appendChild(row);

  const leftCol = document.createElement("div");
  leftCol.className = "col-6 d-grid gap-2";
  row.appendChild(leftCol);

  const rightCol = document.createElement("div");
  rightCol.className = "col-6 d-grid gap-2";
  row.appendChild(rightCol);

  resetMatchState();
  currentQuestionWordIds = data.question_word_ids || [];

  // ✅ LEFT column
  data.left_items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "btn btn-ws-base btn-ws-soft choice-btn w-100 text-start match-item match-left";
    btn.dataset.wordId = item.id;
    btn.textContent = item.text;
    leftCol.appendChild(btn);
    matchLeftElements[item.id] = btn;
  });

  // ✅ RIGHT column
  data.right_items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "btn btn-ws-base btn-ws-soft choice-btn w-100 text-start match-item match-right";
    btn.dataset.wordId = item.id;
    btn.textContent = item.text;
    rightCol.appendChild(btn);
    matchRightElements[item.id] = btn;
  });

  nextBtn.textContent = "Next";
  nextBtn.disabled = true;

  attachMatchHandlers(nextBtn);
}

// =====================================================
// ✅ STATE RESET
// =====================================================
function resetMatchState() {
  matchLeftToRight = {};
  matchRightToLeft = {};
  matchLeftElements = {};
  matchRightElements = {};
  matchSelectedId = null;
  matchSelectedSide = null;
  firstAttemptCorrectByWord = {};
}

// =====================================================
// ✅ VISUAL HELPERS (UNCHANGED)
// =====================================================
function clearPairClasses(el) {
  if (!el) return;
  el.classList.remove(
    "match-paired",
    "match-pair-1",
    "match-pair-2",
    "match-pair-3",
    "match-pair-4",
    "match-disabled",
    "match-selected",
    "match-wrong",
    "btn-ws-success"
  );
}

function markCorrectPair(leftId, rightId) {
  const leftEl = matchLeftElements[leftId];
  const rightEl = matchRightElements[rightId];
  if (!leftEl || !rightEl) return;

  clearPairClasses(leftEl);
  clearPairClasses(rightEl);

  leftEl.classList.remove("btn-ws-soft");
  rightEl.classList.remove("btn-ws-soft");

  leftEl.classList.add("btn-ws-success", "match-disabled");
  rightEl.classList.add("btn-ws-success", "match-disabled");
}

function flashWrongPair(leftEl, rightEl) {
  if (!leftEl || !rightEl) return;

  clearPairClasses(leftEl);
  clearPairClasses(rightEl);

  leftEl.classList.add("match-wrong");
  rightEl.classList.add("match-wrong");

  setTimeout(() => {
    leftEl.classList.remove("match-wrong");
    rightEl.classList.remove("match-wrong");
  }, 800);
}

// =====================================================
// ✅ FINALIZATION
// =====================================================
function finalizeMatchQuestionIfComplete(nextBtn) {
  const totalPairsNeeded = Object.keys(matchLeftElements).length;
  const currentPairs = Object.keys(matchLeftToRight).length;

  if (currentPairs === totalPairsNeeded) {
    nextBtn.disabled = false;
    submitMatchAnswer();
  } else {
    nextBtn.disabled = true;
  }
}

// =====================================================
// ✅ BIDIRECTIONAL MATCH HANDLERS
// =====================================================
function attachMatchHandlers(nextBtn) {
  const leftButtons = document.querySelectorAll(".match-left");
  const rightButtons = document.querySelectorAll(".match-right");

  function clearSelection() {
    if (matchSelectedSide === "left" && matchLeftElements[matchSelectedId]) {
      matchLeftElements[matchSelectedId].classList.remove("match-selected");
    }
    if (matchSelectedSide === "right" && matchRightElements[matchSelectedId]) {
      matchRightElements[matchSelectedId].classList.remove("match-selected");
    }
    matchSelectedId = null;
    matchSelectedSide = null;
  }

  function handlePairAttempt(leftId, rightId) {
    const leftEl = matchLeftElements[leftId];
    const rightEl = matchRightElements[rightId];

    // ✅ First-attempt tracking
    if (!(leftId in firstAttemptCorrectByWord)) {
      firstAttemptCorrectByWord[leftId] = leftId === rightId;
    }

    // ❌ WRONG
    if (leftId !== rightId) {
      flashWrongPair(leftEl, rightEl);
      clearSelection();
      return;
    }

    // ✅ CORRECT
    matchLeftToRight[leftId] = rightId;
    matchRightToLeft[rightId] = leftId;

    markCorrectPair(leftId, rightId);
    clearSelection();
    finalizeMatchQuestionIfComplete(nextBtn);
  }

  // ✅ LEFT SIDE CLICK
  leftButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const leftId = parseInt(btn.dataset.wordId, 10);

      // If RIGHT was selected first → pair
      if (matchSelectedSide === "right") {
        handlePairAttempt(leftId, matchSelectedId);
        return;
      }

      clearSelection();
      matchSelectedId = leftId;
      matchSelectedSide = "left";
      btn.classList.add("match-selected");
    });
  });

  // ✅ RIGHT SIDE CLICK
  rightButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const rightId = parseInt(btn.dataset.wordId, 10);

      // If LEFT was selected first → pair
      if (matchSelectedSide === "left") {
        handlePairAttempt(matchSelectedId, rightId);
        return;
      }

      clearSelection();
      matchSelectedId = rightId;
      matchSelectedSide = "right";
      btn.classList.add("match-selected");
    });
  });
}

// =====================================================
// ✅ SUBMIT TO BACKEND
// =====================================================
async function submitMatchAnswer() {
  const pairs = Object.entries(matchLeftToRight).map(
    ([leftId, rightId]) => ({
      left_id: parseInt(leftId, 10),
      right_id: parseInt(rightId, 10),
    })
  );

  const firstAttempts = Object.entries(firstAttemptCorrectByWord).map(
    ([wordId, firstCorrect]) => ({
      word_id: parseInt(wordId, 10),
      first_correct: !!firstCorrect,
    })
  );

  await fetch(quizConfig.checkAnswerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-CSRFToken": getCSRFToken(),
    },
    body: new URLSearchParams({
      quiz_type: "match",
      matches: JSON.stringify(pairs),
      quiz_id: quizConfig.quizId || "",
      question_word_ids: JSON.stringify(currentQuestionWordIds || []),
      first_attempts: JSON.stringify(firstAttempts || []),
    }),
  });
}

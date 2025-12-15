// static/quiz/js/words/words_search.js

window.initWordsSearch = function () {
  var input = document.getElementById("word-search-input");
  var languageFilter = document.getElementById("language-filter");
  var tableBody = document.getElementById("word-table-body");
  var wordCountNumber = document.getElementById("word-count-number");

  if (!tableBody) return;

  var timer = null;

  function updateWordCount(count) {
    if (wordCountNumber) wordCountNumber.textContent = String(count);
  }

  function renderLanguageCellHTML(languageCode) {
    var code = (languageCode || "").trim().toLowerCase();

    if (code) {
      return '<span class="ws-lang-badge">' + code.toUpperCase() + "</span>";
    }

    return (
      '<span class="ws-lang-badge ws-lang-badge-unknown">Unknown</span>' +
      '<span class="text-muted small d-block">Excluded from quizzes</span>'
    );
  }

  function setEmptyState() {
    tableBody.innerHTML =
      '<tr><td colspan="5" class="text-center text-muted py-4">No words found.</td></tr>';
    updateWordCount(0);
    if (window.updateBulkDeleteState) window.updateBulkDeleteState();
  }

  function renderTable(words) {
    tableBody.innerHTML = "";

    if (!words || !words.length) {
      setEmptyState();
      return;
    }

    for (var i = 0; i < words.length; i++) {
      var word = words[i];

      var row = document.createElement("tr");
      row.setAttribute("data-id", String(word.id));
      row.dataset.language = word.language || "";

      if (!word.language) row.classList.add("ws-row-unknown");

      // checkbox
      var checkTd = document.createElement("td");
      checkTd.className = "ws-check-cell";
      checkTd.innerHTML =
        '<input type="checkbox" class="ws-check-input word-checkbox">';
      row.appendChild(checkTd);

      // original
      var originalTd = document.createElement("td");
      originalTd.className = "ws-col-original";
      originalTd.textContent = word.original_word || "";
      row.appendChild(originalTd);

      // translation
      var translationTd = document.createElement("td");
      translationTd.className = "ws-col-translation";
      translationTd.textContent = word.translation || "";
      row.appendChild(translationTd);

      // language (FIX: always code -> DE/EN, never full name)
      var langTd = document.createElement("td");
      langTd.className = "ws-lang-cell";
      langTd.innerHTML = renderLanguageCellHTML(word.language);
      row.appendChild(langTd);

      // actions
      var actionsTd = document.createElement("td");
      actionsTd.className = "ws-actions-cell";
      actionsTd.innerHTML =
        '<div class="btn-row">' +
        '  <button type="button" class="btn-ws-icon edit edit-btn" title="Edit" aria-label="Edit word">' +
        '    <i class="bi bi-pencil-square"></i>' +
        "  </button>" +
        '  <button type="button" class="btn-ws-icon delete delete-btn" title="Delete" aria-label="Delete word">' +
        '    <i class="bi bi-trash3"></i>' +
        "  </button>" +
        "</div>";
      row.appendChild(actionsTd);

      tableBody.appendChild(row);
    }

    updateWordCount(words.length);
    if (window.updateBulkDeleteState) window.updateBulkDeleteState();
  }

  function searchWords() {
    var query = input ? input.value : "";
    var language = languageFilter ? languageFilter.value : "";

    var params = new URLSearchParams();
    if (query) params.set("q", query);
    if (language) params.set("language", language);

    fetch("?" + params.toString(), {
      headers: { "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        var words = data && data.words ? data.words : [];
        // optional: sort by original
        words.sort(function (a, b) {
          var ao = (a.original_word || "").toLowerCase();
          var bo = (b.original_word || "").toLowerCase();
          if (ao < bo) return -1;
          if (ao > bo) return 1;
          return 0;
        });
        renderTable(words);
      })
      .catch(function () {
        setEmptyState();
      });
  }

  if (input) {
    input.addEventListener("input", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(searchWords, 300);
    });
  }

  if (languageFilter) {
    languageFilter.addEventListener("change", searchWords);
  }

  window.searchWords = searchWords;
};

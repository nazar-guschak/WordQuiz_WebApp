// static/quiz/js/manage/quiz_manage_words.js

import { getQuizManageConfig } from "./config.js";
import { initQuizFilters } from "./quiz_filters.js";
import { initQuizSelection } from "./quiz_selection.js";
import { initBulkDelete } from "./quiz_bulk_delete.js";
import { initSingleDelete } from "./quiz_single_delete.js";
import { initAddWordsModal } from "./quiz_add_modal.js";

document.addEventListener("DOMContentLoaded", () => {
  const config = getQuizManageConfig();
  if (!config) return;

  initQuizFilters(config);

  const { getSelectedWordIds } = initQuizSelection(config);

  initBulkDelete({
    ...config,
    getSelectedWordIds,
  });

  initSingleDelete(config);
  initAddWordsModal(config);

  // ✅ Hook edit modal behavior (defined by quiz/js/words/words_edit.js)
  window.initWordsEdit?.();
});

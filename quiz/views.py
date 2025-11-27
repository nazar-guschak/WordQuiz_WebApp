from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_POST
from django.urls import reverse
from django.http import JsonResponse, Http404
import json

from .services import *   # used for read_words(Word)
from .models import *     # Word, CustomQuiz, etc.


# ============================================================
# Basic pages
# ============================================================

def index(request):
    """
    Landing / home page view.
    Renders a simple index template (e.g., menu with links to quiz, word list, etc.).
    """
    return render(request, 'index.html')


# ============================================================
# Main quiz flow (random quiz from all words)
# ============================================================

def quiz(request):
    quiz_id = request.GET.get("quiz_id")
    start = request.GET.get("start")
    selected_language = request.GET.get("language", "").strip() or None

    custom_quizzes = CustomQuiz.objects.all()
    all_word_count = Word.objects.count()

    # ---------- Build language list for selection screen ----------
    from django.db.models import Count

    language_stats = (
        Word.objects.values("language")
        .annotate(count=Count("id"))
        .order_by("language")
    )

    quiz_languages = [
        {
            "code": item["language"],
            "name": dict(Word.LANGUAGE_CHOICES).get(item["language"], item["language"]),
            "count": item["count"],
        }
        for item in language_stats
    ]

    has_multiple_languages = len(quiz_languages) > 1

    # ---------------- SELECTION MODE ----------------
    if not start:
        return render(request, "quiz/quiz.html", {
            "quiz_started": False,
            "current_quiz": None,
            "custom_quizzes": custom_quizzes,
            "all_word_count": all_word_count,

            # NEW:
            "quiz_languages": quiz_languages,
            "has_multiple_languages": has_multiple_languages,
            "selected_language": selected_language,
        })

    # ---------------- QUIZ MODE ----------------
    current_quiz = None
    question_data = None
    progress = None

    # ---------- CUSTOM QUIZ ----------
    if quiz_id:
        current_quiz = get_object_or_404(CustomQuiz, pk=quiz_id)

        words_qs = list(current_quiz.words.order_by("original_word"))
        order = [w.id for w in words_qs]
        random.shuffle(order)

        state = {
            "quiz_id": current_quiz.id,
            # we've already served order[0] on this page
            "order": order,
            "current_index": 1 if order else 0,
            "score": 0,
            "total": len(order),
        }
        request.session["custom_quiz_state"] = state
        request.session.modified = True

        if state["total"] > 0:
            first_word = current_quiz.words.get(pk=order[0])

            choices = [first_word]
            others = list(current_quiz.words.exclude(pk=first_word.pk))
            random.shuffle(others)
            choices.extend(others[:3])
            random.shuffle(choices)

            question_data = {
                "word": first_word,
                "choices": choices,
                "correct": first_word,
            }

            progress = {
                "current": 1,
                "total": state["total"],
                "percent": int(100 * 1 / state["total"]) if state["total"] else 0,
            }

        return render(request, "quiz/quiz.html", {
            "quiz_started": True,
            "current_quiz": current_quiz,
            "custom_quizzes": custom_quizzes,
            "all_word_count": all_word_count,
            "progress": progress,
            "quiz_choices": question_data["choices"] if question_data else [],
            "correct_answer": question_data["correct"] if question_data else None,
            "selected_language": selected_language,
        })

    # ---------- GENERAL QUIZ ----------
    # APPLY LANGUAGE FILTER HERE
    if selected_language:
        filtered_words = Word.objects.filter(language=selected_language)
    else:
        filtered_words = Word.objects.all()

    # pick next question
    quiz_choices, correct_answer, direction = read_words(filtered_words)

    return render(request, "quiz/quiz.html", {
        "quiz_started": True,
        "current_quiz": None,
        "custom_quizzes": custom_quizzes,
        "all_word_count": all_word_count,
        "progress": None,
        "quiz_choices": quiz_choices,
        "correct_answer": correct_answer,

        # display selected language in heading + nextQuiz JS
        "selected_language": selected_language,
    })


@require_POST
def check_answer(request):
    """
    Checks answers for both quiz types and updates stats.

    Multiple-choice ("choice", default):
      - payload: chosen, correct, word_id, optional quiz_id
      - stats:
          times_quizzed +1 for that word
          correct_answers +1 if correct
      - custom quiz score:
          +1 if correct

    Matching ("match"):
      - payload:
          quiz_type="match"
          matches=<json list of {left_id, right_id}>
          quiz_id (optional)
          question_word_ids=<json list of word IDs used in this question>
          first_attempts=<json list of {word_id, first_correct}>
      - stats:
          For each word in question_word_ids:
            times_quizzed +1
            correct_answers +1 only if:
              - it ended in a correct final pair, AND
              - it was matched correctly on the first attempt
      - custom quiz score:
          +1 for each word in question_word_ids that was correctly matched
          on the first attempt.
    """
    quiz_type = request.POST.get("quiz_type") or "choice"

    # ---------- MATCHING QUIZ ANSWER ----------
    if quiz_type == "match":
        matches_json = request.POST.get("matches")
        if not matches_json:
            return JsonResponse({"error": "Missing matches payload"}, status=400)

        try:
            matches = json.loads(matches_json)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid matches JSON"}, status=400)

        if not isinstance(matches, list) or not matches:
            return JsonResponse({"error": "No matches provided"}, status=400)

        quiz_id = request.POST.get("quiz_id")

        # IDs of words that were part of this match question
        question_ids_json = request.POST.get("question_word_ids")
        try:
            question_word_ids = json.loads(question_ids_json) if question_ids_json else []
        except json.JSONDecodeError:
            question_word_ids = []

        # --- New: parse first_attempts payload ---
        first_attempts_json = request.POST.get("first_attempts")
        try:
            first_attempts_list = json.loads(first_attempts_json) if first_attempts_json else []
        except json.JSONDecodeError:
            first_attempts_list = []

        # Map: word_id -> True/False (first_correct)
        first_attempts = {}
        for item in first_attempts_list:
            try:
                wid = int(item.get("word_id"))
            except (TypeError, ValueError):
                continue
            first_attempts[wid] = bool(item.get("first_correct"))

        results = []
        # Final correctness per word (based on final pairs, not tries)
        final_correct = {}  # wid -> bool

        for pair in matches:
            left_id = pair.get("left_id")
            right_id = pair.get("right_id")
            if left_id is None or right_id is None:
                continue

            try:
                left_int = int(left_id)
                right_int = int(right_id)
            except (TypeError, ValueError):
                continue

            # In our design left_id and right_id are Word IDs,
            # and a pair is correct if they are equal.
            is_correct = (left_int == right_int)

            results.append({
                "left_id": left_int,
                "right_id": right_int,
                "is_correct": is_correct,
            })

            if is_correct:
                final_correct[left_int] = True

        # --- Build deltas for times_quizzed and correct_answers ---
        times_by_word = {}
        correct_by_word = {}

        if question_word_ids:
            # Normal path: we know exactly which words were in this question
            for wid in question_word_ids:
                try:
                    wid_int = int(wid)
                except (TypeError, ValueError):
                    continue

                # One exposure for this word in this matching question
                times_by_word[wid_int] = times_by_word.get(wid_int, 0) + 1

                # Count as correct only if:
                # - it ended in a correct final pair
                # - AND it was matched correctly on the first attempt
                if final_correct.get(wid_int, False) and first_attempts.get(wid_int, False):
                    correct_by_word[wid_int] = correct_by_word.get(wid_int, 0) + 1
        else:
            # Fallback if question_word_ids missing:
            # derive times from left_ids in matches
            for pair in results:
                wid = pair["left_id"]
                times_by_word[wid] = times_by_word.get(wid, 0) + 1
                if pair["is_correct"] and first_attempts.get(wid, False):
                    correct_by_word[wid] = correct_by_word.get(wid, 0) + 1

        # --- Update Word stats (match questions) ---
        word_ids = set(times_by_word.keys())
        if word_ids:
            for word in Word.objects.filter(id__in=word_ids):
                t_delta = times_by_word.get(word.id, 0)
                c_delta = correct_by_word.get(word.id, 0)

                update_fields = []
                if t_delta:
                    word.times_quizzed = F("times_quizzed") + t_delta
                    update_fields.append("times_quizzed")
                if c_delta:
                    word.correct_answers = F("correct_answers") + c_delta
                    update_fields.append("correct_answers")

                if update_fields:
                    word.save(update_fields=update_fields)

        # --- Update custom quiz score (match) ---
        # Score = how many words in this question were correctly matched
        # on the first attempt.
        if quiz_id and question_word_ids:
            state = request.session.get("custom_quiz_state")
            if state and str(state.get("quiz_id")) == str(quiz_id):
                correct_for_question = 0
                for wid in question_word_ids:
                    try:
                        wid_int = int(wid)
                    except (TypeError, ValueError):
                        continue
                    if final_correct.get(wid_int, False) and first_attempts.get(wid_int, False):
                        correct_for_question += 1

                state["score"] = state.get("score", 0) + correct_for_question
                request.session["custom_quiz_state"] = state
                request.session.modified = True

        return JsonResponse({
            "quiz_type": "match",
            "results": results,
        })

    # ---------- MULTIPLE-CHOICE ANSWER ----------
    chosen_translation = request.POST.get("chosen")
    correct_translation = request.POST.get("correct")
    word_id = request.POST.get("word_id")
    quiz_id = request.POST.get("quiz_id")   # may be empty for general quiz

    if not all([chosen_translation, correct_translation, word_id]):
        return JsonResponse({"error": "Missing data"}, status=400)

    is_correct = (chosen_translation == correct_translation)

    # Update stats for the word (works for general + custom quizzes)
    try:
        word = Word.objects.get(id=word_id)
    except Word.DoesNotExist:
        return JsonResponse({"error": "Word not found"}, status=404)

    word.times_quizzed = F('times_quizzed') + 1
    if is_correct:
        word.correct_answers = F('correct_answers') + 1
    word.save(update_fields=["times_quizzed", "correct_answers"])

    # Update score in custom quiz session state (if applicable)
    if quiz_id:
        state = request.session.get("custom_quiz_state")
        if state and str(state.get("quiz_id")) == str(quiz_id):
            if is_correct:
                state["score"] = state.get("score", 0) + 1
                request.session["custom_quiz_state"] = state
                request.session.modified = True

    return JsonResponse({"is_correct": is_correct})


def next_quiz(request):
    """
    General quiz:
      - Infinite
      - Word is chosen using priority logic in read_words()
      - Direction (orig->trans or trans->orig) is random per question
      - Can be filtered by language via ?language=<code>
      - Can return either "choice" or "match" questions
        (no two "match" questions in a row)

    Custom quiz:
      - Finite
      - Words served in random order (no priority)
      - Can also return "choice" or "match"
        (no two "match" questions in a row)
      - Score & basic state tracked in session ("custom_quiz_state")
    """
    quiz_id = request.GET.get("quiz_id")
    language = request.GET.get("language", "").strip()

    # ============================================================
    # GENERAL QUIZ (infinite, supports choice + match)
    # ============================================================
    if not quiz_id:
        base_qs = Word.objects.all()
        if language:
            base_qs = base_qs.filter(language=language)

        # If there are no words at all, bail out cleanly
        if not base_qs.exists():
            return JsonResponse({
                "finished": True,
                "score": 0,
                "total": 0,
            })

        # Track last question type for GENERAL quiz in the session
        general_state = request.session.get("general_quiz_state") or {}
        last_type = general_state.get("last_type")  # "choice" or "match"

        # Is a match question even possible? We need at least 4 available words.
        # (Use same timeout logic as read_words: only timeout <= 0 are available.)
        available_words = list(base_qs.filter(timeout__lte=0))
        match_possible = len(available_words) >= 4

        # Decide quiz type:
        # - if match is possible and last_type != "match" -> random between choice/match
        # - otherwise -> choice
        if match_possible and last_type != "match":
            quiz_type = random.choice(["choice", "match"])
        else:
            quiz_type = "choice"

        # ---------------- MATCH TYPE (general quiz) ----------------
        if quiz_type == "match":
            # Use your priority logic to pick 4 top words
            available_words.sort(key=word_priority, reverse=True)
            group_words = available_words[:4]

            # Put the first chosen word into timeout, like read_words does.
            # (We only call it once per question, to keep timeout logic consistent.)
            update_word_states(group_words[0])

            # Build left/right columns
            left_words = group_words[:]
            right_words = group_words[:]
            random.shuffle(left_words)
            random.shuffle(right_words)

            # Remember last_type
            general_state["last_type"] = "match"
            request.session["general_quiz_state"] = general_state
            request.session.modified = True

            return JsonResponse({
                "finished": False,
                "quiz_type": "match",
                "instruction": "Match each word with its correct translation.",
                "left_items": [
                    {"id": w.id, "text": w.original_word}
                    for w in left_words
                ],
                "right_items": [
                    {"id": w.id, "text": w.translation}
                    for w in right_words
                ],
                "question_word_ids": [w.id for w in group_words],
            })

        # ---------------- CHOICE TYPE (existing logic, general quiz) ----------------
        quiz_choices, correct_answer, direction = read_words(base_qs)

        if direction == "orig_to_trans":
            question_text = correct_answer.original_word
            correct_text = correct_answer.translation
            choices_text = [w.translation for w in quiz_choices]
        else:
            question_text = correct_answer.translation
            correct_text = correct_answer.original_word
            choices_text = [w.original_word for w in quiz_choices]

        # Remember last_type
        general_state["last_type"] = "choice"
        request.session["general_quiz_state"] = general_state
        request.session.modified = True

        return JsonResponse({
            "finished": False,
            "quiz_type": "choice",
            "direction": direction,
            "word": question_text,
            "correct": correct_text,
            "word_id": correct_answer.id,
            "choices": choices_text,
        })

    # ============================================================
    # CUSTOM QUIZ (random order, supports choice + match)
    # ============================================================
    quiz = get_object_or_404(CustomQuiz, pk=quiz_id)
    state = request.session.get("custom_quiz_state") or {}

    # (Re)initialize state if:
    # - no state
    # - state belongs to a different quiz
    # - state has no order (corrupted)
    if state.get("quiz_id") != quiz.id or "order" not in state:
        words_qs = list(quiz.words.order_by("original_word"))
        order = [w.id for w in words_qs]
        random.shuffle(order)

        state = {
            "quiz_id": quiz.id,
            "order": order,
            "current_index": 0,   # index of the next *word* to serve
            "score": 0,
            "total": len(order),  # total words in this custom quiz
            "last_type": None,    # track last question type: "choice" or "match"
        }

    order = state["order"]
    total = state.get("total", len(order))
    idx = state.get("current_index", 0)
    last_type = state.get("last_type")

    # If there are no words, or we've served them all -> finished
    if total == 0 or idx >= total:
        state["current_index"] = total
        request.session["custom_quiz_state"] = state
        request.session.modified = True

        return JsonResponse({
            "finished": True,
            "score": state.get("score", 0),
            "total": total,
        })

    remaining = total - idx

    # Decide quiz type:
    # - If at least 4 words remaining -> randomly "choice" or "match"
    # - If fewer than 4 remaining -> fallback to "choice"
    # - BUT: do NOT allow "match" if last_type was also "match"
    if remaining >= 4:
        if last_type == "match":
            quiz_type = "choice"
        else:
            quiz_type = random.choice(["choice", "match"])
    else:
        quiz_type = "choice"

    # Build group of word IDs for this question
    if quiz_type == "match":
        group_ids = order[idx: idx + 4]
    else:
        group_ids = order[idx: idx + 1]

    if not group_ids:
        # Safety fallback: mark finished
        state["current_index"] = total
        request.session["custom_quiz_state"] = state
        request.session.modified = True
        return JsonResponse({
            "finished": True,
            "score": state.get("score", 0),
            "total": total,
        })

    # Fetch words and keep order matching group_ids
    words = list(quiz.words.filter(pk__in=group_ids))
    id_to_word = {w.id: w for w in words}
    group_words = [id_to_word[wid] for wid in group_ids if wid in id_to_word]

    # SAFETY: if for some reason we don't have enough words for a match, fall back
    if quiz_type == "match" and len(group_words) < 2:
        quiz_type = "choice"
        group_ids = order[idx: idx + 1]
        words = list(quiz.words.filter(pk__in=group_ids))
        id_to_word = {w.id: w for w in words}
        group_words = [id_to_word[wid] for wid in group_ids if wid in id_to_word]

    # ---------- MATCH TYPE (custom quiz) ----------
    if quiz_type == "match":
        left_words = group_words[:]
        right_words = group_words[:]
        random.shuffle(left_words)
        random.shuffle(right_words)

        # Advance index by number of words in this match question
        next_idx = idx + len(group_words)
        if next_idx > total:
            next_idx = total

        state["current_index"] = next_idx
        state["last_type"] = "match"
        request.session["custom_quiz_state"] = state
        request.session.modified = True

        return JsonResponse({
            "finished": False,
            "quiz_type": "match",
            "instruction": "Match each word with its correct translation.",
            "left_items": [
                {"id": w.id, "text": w.original_word}
                for w in left_words
            ],
            "right_items": [
                {"id": w.id, "text": w.translation}
                for w in right_words
            ],
            "question_word_ids": group_ids,
        })

    # ---------- Fallback / normal multiple-choice for this question ----------
    # (Either we decided "choice", or match wasn't valid)
    main_id = group_ids[0]
    word = id_to_word[main_id]

    choices = [word]
    others = list(quiz.words.exclude(pk=word.pk))
    random.shuffle(others)
    choices.extend(others[:3])  # up to 3 distractors
    random.shuffle(choices)

    next_idx = idx + 1
    if next_idx > total:
        next_idx = total

    state["current_index"] = next_idx
    state["last_type"] = "choice"
    request.session["custom_quiz_state"] = state
    request.session.modified = True

    return JsonResponse({
        "finished": False,
        "quiz_type": "choice",
        "word": word.original_word,
        "correct": word.translation,
        "word_id": word.id,
        "choices": [c.translation for c in choices],
    })



# ============================================================
# Word list + CRUD (tab 1 in words_and_quizzes.html)
# ============================================================

def word_list(request):
    """
    Combined view that renders:
      - Word list (with live search + CRUD via AJAX)
      - Custom quizzes tab (list of CustomQuiz objects)

    Behavior:
      - If request is AJAX (X-Requested-With = XMLHttpRequest):
          returns JSON with filtered words for live search.
      - Otherwise:
          renders 'words_and_quizzes.html' with:
            - 'words': list of Word objects (filtered & ordered)
            - 'custom_quizzes': all CustomQuiz objects
            - 'query': current search string
            - 'language_choices': Word.LANGUAGE_CHOICES
            - 'selected_language': currently active language filter
    """
    query = request.GET.get('q', '').strip()
    language = request.GET.get('language', '').strip()

    # Base queryset, ordered by original_word
    qs = Word.objects.order_by('original_word')

    # Filter by language if selected
    if language:
        qs = qs.filter(language=language)

    # Convert to list so we can safely do Python-side filtering
    all_words = list(qs)

    # Text search (Unicode-aware, in Python)
    if query:
        q = query.casefold()
        words = [
            w for w in all_words
            if q in (w.original_word or "").casefold()
               or q in (w.translation or "").casefold()
        ]
    else:
        words = all_words

    # AJAX branch for live search
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        results = [
            {
                'id': w.id,
                'original_word': w.original_word,
                'translation': w.translation,
                'language': w.language,
                'language_display': w.get_language_display(),
            }
            for w in words
        ]
        return JsonResponse({'words': results})

    # Normal full-page render
    custom_quizzes = CustomQuiz.objects.all()

    return render(
        request,
        'quiz/words_and_quizzes.html',
        {
            'words': words,
            'query': query,
            'custom_quizzes': custom_quizzes,
            'language_choices': Word.LANGUAGE_CHOICES,
            'selected_language': language,
        }
    )




def edit_word(request, pk):
    """
    AJAX endpoint to edit a single Word.

    URL pattern: /word_list/<pk>/edit/

    POST:
      - 'original_word'
      - 'translation'
      - 'language'

    Returns JSON:
      - {'success': True} on successful save
      - {'success': False, 'error': '...'} if validation fails

    NOTE: If accessed via GET, returns the current values as JSON.
    """
    word = get_object_or_404(Word, pk=pk)

    if request.method == 'POST':
        original = request.POST.get('original_word', '').strip()
        translation = request.POST.get('translation', '').strip()
        language = request.POST.get('language', '').strip()

        if not (original and translation and language):
            return JsonResponse(
                {'success': False, 'error': 'All fields are required.'}
            )

        # Validate language against choices to avoid arbitrary values
        valid_languages = dict(Word.LANGUAGE_CHOICES)
        if language not in valid_languages:
            return JsonResponse(
                {'success': False, 'error': 'Invalid language.'}
            )

        word.original_word = original
        word.translation = translation
        word.language = language
        word.save()

        return JsonResponse({'success': True})

    # Optional: current values for non-POST usage
    return JsonResponse({
        'original_word': word.original_word,
        'translation': word.translation,
        'language': word.language,
    })



def delete_word(request, pk):
    """
    AJAX endpoint to delete a Word.

    URL pattern: /word_list/<pk>/delete/

    Method:
      - POST only.

    Returns JSON:
      - {'success': True} on success
      - {'success': False, 'error': '...'} on invalid method.
    """
    if request.method == 'POST':
        word = get_object_or_404(Word, pk=pk)
        word.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Invalid request'})


def add_word(request):
    """
    AJAX endpoint to add a new Word.

    URL pattern: /word_list/add/

    POST:
      - 'original_word'
      - 'translation'
      - 'language'

    Validation:
      - (original_word, language) combination must be unique
      - all fields must be non-empty
      - language must be one of Word.LANGUAGE_CHOICES

    Returns JSON:
      - {'success': True, 'word_id': <new id>, 'language': ..., 'language_display': ...}
      - {'success': False, 'error': '...'} with error message
    """
    if request.method == "POST":
        original = request.POST.get("original_word", "").strip()
        translation = request.POST.get("translation", "").strip()
        language = request.POST.get("language", "").strip()

        if not (original and translation and language):
            return JsonResponse(
                {"success": False, "error": "All fields are required."}
            )

        valid_languages = dict(Word.LANGUAGE_CHOICES)
        if language not in valid_languages:
            return JsonResponse(
                {"success": False, "error": "Invalid language."}
            )

        # Allow the same spelling in different languages:
        # e.g. "Bank" in English vs German
        exists = Word.objects.filter(
            original_word=original,
            language=language
        ).exists()

        if exists:
            return JsonResponse(
                {
                    "success": False,
                    "error": "This word already exists for this language.",
                }
            )

        word = Word.objects.create(
            original_word=original,
            translation=translation,
            language=language,
        )

        return JsonResponse({
            "success": True,
            "word_id": word.id,
            "language": word.language,
            "language_display": word.get_language_display(),
        })

    return JsonResponse({"success": False, "error": "Invalid request."})



# ============================================================
# Custom quizzes: detail/manage page + word assignment (tab 2)
# ============================================================

def custom_quiz_detail(request, pk):
    """
    Detail/manage page for a single CustomQuiz.

    URL pattern: /quiz/<pk>/

    Displays:
      - The quiz info (title, etc.)
      - All words currently in this quiz (quiz_words)
      - All words in the system (all_words) for an "Add words" modal

    Template:
      - quiz_manage_words.html
    """
    quiz = get_object_or_404(CustomQuiz, pk=pk)

    # Words that are in this quiz
    quiz_words = quiz.words.order_by('original_word')

    # Only words NOT already in this quiz
    all_words = Word.objects.exclude(
        pk__in=quiz_words.values('pk')
    ).order_by('original_word')

    context = {
        'quiz': quiz,
        'quiz_words': quiz_words,
        'all_words': all_words,
        'language_choices': Word.LANGUAGE_CHOICES,
    }
    return render(request, 'quiz/quiz_manage_words.html', context)



@require_POST
def quiz_add_words(request, pk):
    """
    AJAX endpoint to add multiple words to a CustomQuiz.

    URL pattern: /quiz/<pk>/add_words/

    POST:
      - 'word_ids[]' (list of Word ids)

    Behavior:
      - Fetches Word objects by ID and adds them to quiz.words (ManyToMany)

    Returns JSON:
      - {'success': True, 'word_count': <current number of words in quiz>}
      - {'success': False, 'error': '...'} if no words selected
    """
    quiz = get_object_or_404(CustomQuiz, pk=pk)
    # Support both 'word_ids[]' and 'word_ids' for flexibility
    word_ids = request.POST.getlist('word_ids[]') or request.POST.getlist('word_ids')

    if not word_ids:
        return JsonResponse({'success': False, 'error': 'No words selected.'})

    words = Word.objects.filter(id__in=word_ids)
    quiz.words.add(*words)

    return JsonResponse({
        'success': True,
        'word_count': quiz.words.count(),
    })


@require_POST
def quiz_remove_word(request, pk):
    """
    AJAX endpoint to remove a single word from a CustomQuiz.

    URL pattern: /quiz/<pk>/remove_word/

    POST:
      - 'word_id': id of the Word to remove from this quiz

    Returns JSON:
      - {'success': True, 'word_count': <current number of words in quiz>}
      - {'success': False, 'error': 'word_id is required.'} if missing
      - {'success': False, 'error': 'Word not in this quiz.'} if invalid
    """
    quiz = get_object_or_404(CustomQuiz, pk=pk)
    word_id = request.POST.get('word_id')

    if not word_id:
        return JsonResponse({'success': False, 'error': 'word_id is required.'})

    try:
        word = quiz.words.get(pk=word_id)
    except Word.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Word not in this quiz.'})

    quiz.words.remove(word)

    return JsonResponse({
        'success': True,
        'word_count': quiz.words.count(),
    })


@require_POST
def create_quiz(request):
    """
    AJAX endpoint to create a new CustomQuiz from the "New Quiz" modal.
    URL pattern: /quiz/create/
    """
    title = request.POST.get('title', '').strip()
    if not title:
        return JsonResponse({'success': False, 'error': 'Title is required.'})

    quiz = CustomQuiz.objects.create(title=title)

    detail_url = reverse('quiz:custom_quiz_detail', args=[quiz.pk])
    delete_url = reverse('quiz:custom_quiz_delete', args=[quiz.pk])

    return JsonResponse({
        'success': True,
        'quiz': {
            'id': quiz.pk,
            'title': quiz.title,
            'word_count': quiz.words.count(),
            'detail_url': detail_url,
            'delete_url': delete_url,   # 🔴 IMPORTANT
        }
    })


def custom_quiz_delete(request, quiz_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "POST required."}, status=400)

    try:
        quiz = CustomQuiz.objects.get(id=quiz_id)
    except CustomQuiz.DoesNotExist:
        raise Http404("Quiz not found.")

    quiz.delete()
    return JsonResponse({"success": True})


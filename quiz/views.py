from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_POST
from django.urls import reverse
from django.http import JsonResponse, Http404
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q
from django.db.models.functions import Lower
from django.contrib import messages

from .models import *
from .services import *
import json



# ============================================================
# Helper: choose base queryset depending on auth
# ============================================================

def get_base_words_queryset(request):
    """
    Returns the base queryset of words depending on authentication:

    - Unauthenticated: global pool (owner IS NULL)
    - Authenticated: only this user's words
    """
    if request.user.is_authenticated:
        return Word.objects.filter(owner=request.user)
    return Word.objects.filter(owner__isnull=True)


def get_base_quizzes_queryset(request):
    """
    For selection screen:
    - Authenticated: this user's custom quizzes
    - Unauthenticated: no custom quizzes (they can't manage them anyway)
    """
    if request.user.is_authenticated:
        return CustomQuiz.objects.filter(owner=request.user)
    return CustomQuiz.objects.none()


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

# views.py (or wherever your quiz() view is)

def quiz(request):
    quiz_id = request.GET.get("quiz_id")
    start = request.GET.get("start")
    selected_language = request.GET.get("language", "").strip() or None

    # ---------- Choose base word pool ----------
    # ✅ Core rule: ONLY use quizable words with known language in any quiz
    base_words_raw = get_base_words_queryset(request)
    base_words = Word.quizable_qs(base_words_raw)

    # ---------- Custom quizzes: per-user only ----------
    custom_quizzes = get_base_quizzes_queryset(request)

    all_word_count = base_words.count()

    # ---------- Build language list for selection screen ----------
    language_stats = (
        base_words.values("language")
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
        if not request.user.is_authenticated:
            raise Http404("Quiz not found.")

        current_quiz = get_object_or_404(
            CustomQuiz,
            pk=quiz_id,
            owner=request.user
        )

        # ✅ Only use quizable words with known language from this quiz
        quiz_words_qs = Word.quizable_qs(current_quiz.words.all()).order_by("original_word")
        words_qs = list(quiz_words_qs)

        order = [w.id for w in words_qs]
        random.shuffle(order)

        state = {
            "quiz_id": current_quiz.id,
            "order": order,
            "current_index": 1 if order else 0,
            "score": 0,
            "total": len(order),
        }
        request.session["custom_quiz_state"] = state
        request.session.modified = True

        if state["total"] > 0:
            first_word = quiz_words_qs.get(pk=order[0])

            choices = [first_word]
            others = list(quiz_words_qs.exclude(pk=first_word.pk))
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
    # ✅ base_words already restricted to quizable + known language
    if selected_language:
        filtered_words = base_words.filter(language=selected_language)
    else:
        filtered_words = base_words

    quiz_choices, correct_answer, direction = read_words(filtered_words)

    return render(request, "quiz/quiz.html", {
        "quiz_started": True,
        "current_quiz": None,
        "custom_quizzes": custom_quizzes,
        "all_word_count": all_word_count,
        "progress": None,
        "quiz_choices": quiz_choices,
        "correct_answer": correct_answer,
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

    # Update stats for the word (works for general + custom quizzes, global or per-user)
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
    Dispatch:
      - No quiz_id    -> general quiz (infinite)
      - With quiz_id  -> custom quiz (finite)
    """
    quiz_id = request.GET.get("quiz_id")
    language = request.GET.get("language", "").strip()

    if not quiz_id:
        payload = _build_general_quiz_step(request, language)
    else:
        payload = _build_custom_quiz_step(request, quiz_id)

    return JsonResponse(payload)


# ============================================================
# GENERAL QUIZ (infinite, supports choice + match)
# ============================================================

def _build_general_quiz_step(request, language_code: str) -> dict:
    """
    General quiz:
      - Infinite
      - Uses priority logic from read_words()/word_priority
      - Direction (orig->trans or trans->orig) is random per question
      - Can be filtered by language via ?language=<code>
      - Can return "choice" or "match" (no two "match" in a row)
    """
    # Use per-user words if logged in, global words otherwise
    base_qs = get_base_words_queryset(request)

    # Only quizable + known-language words
    base_qs = Word.quizable_qs(base_qs)

    if language_code:
        base_qs = base_qs.filter(language=language_code)

    # No words at all -> finished
    if not base_qs.exists():
        return {
            "finished": True,
            "score": 0,
            "total": 0,
        }

    # Track last question type for GENERAL quiz in the session
    general_state = request.session.get("general_quiz_state") or {}
    last_type = general_state.get("last_type")  # "choice" or "match"

    # Match requires at least 4 available words with timeout <= 0
    available_words = list(base_qs.filter(timeout__lte=0))
    match_possible = len(available_words) >= 4

    quiz_type = _decide_general_quiz_type(match_possible, last_type)

    # ---------- MATCH TYPE ----------
    if quiz_type == "match":
        # Priority logic: pick 4 top words
        available_words.sort(key=word_priority, reverse=True)
        group_words = available_words[:4]

        # Put the first chosen word into timeout, like read_words does
        if group_words:
            update_word_states(group_words[0])

        payload = _build_match_payload(group_words)

        general_state["last_type"] = "match"
        request.session["general_quiz_state"] = general_state
        request.session.modified = True

        return payload

    # ---------- CHOICE TYPE ----------
    quiz_choices, correct_answer, direction = read_words(base_qs)
    payload = _build_general_choice_payload(quiz_choices, correct_answer, direction)

    general_state["last_type"] = "choice"
    request.session["general_quiz_state"] = general_state
    request.session.modified = True

    return payload


def _decide_general_quiz_type(match_possible: bool, last_type: str | None) -> str:
    """
    - If match is possible and last_type != "match" -> random between choice/match
    - Otherwise -> choice
    """
    if match_possible and last_type != "match":
        return random.choice(["choice", "match"])
    return "choice"


def _build_general_choice_payload(quiz_choices, correct_answer, direction: str) -> dict:
    """
    Build JSON payload for a general multiple-choice question.
    """
    if direction == "orig_to_trans":
        question_text = correct_answer.original_word
        correct_text = correct_answer.translation
        choices_text = [w.translation for w in quiz_choices]
    else:
        question_text = correct_answer.translation
        correct_text = correct_answer.original_word
        choices_text = [w.original_word for w in quiz_choices]

    return {
        "finished": False,
        "quiz_type": "choice",
        "direction": direction,
        "word": question_text,
        "correct": correct_text,
        "word_id": correct_answer.id,
        "choices": choices_text,
    }


# ============================================================
# CUSTOM QUIZ (finite, random order, supports choice + match)
# ============================================================

def _build_custom_quiz_step(request, quiz_id: str) -> dict:
    """
    Custom quiz:
      - Finite
      - Words served in random order (no priority)
      - Can return "choice" or "match" (no two "match" in a row)
      - State stored in session["custom_quiz_state"]
    """
    if not request.user.is_authenticated:
        raise Http404("Quiz not found.")

    quiz = get_object_or_404(CustomQuiz, pk=quiz_id, owner=request.user)

    # Base queryset for this quiz: only quizable + known-language words
    quiz_words_base = Word.quizable_qs(quiz.words.all())

    state = request.session.get("custom_quiz_state") or {}

    # (Re)initialize state if:
    # - different quiz
    # - missing "order"
    if state.get("quiz_id") != quiz.id or "order" not in state:
        words_qs = list(quiz_words_base.order_by("original_word"))
        order = [w.id for w in words_qs]
        random.shuffle(order)

        state = {
            "quiz_id": quiz.id,
            "order": order,
            "current_index": 0,   # index of the next *word* to serve
            "score": state.get("score", 0),  # keep score if you like, or reset to 0
            "total": len(order),  # total words in this custom quiz
            "last_type": None,    # "choice" or "match"
        }

    order = state["order"]
    total = state.get("total", len(order))
    idx = state.get("current_index", 0)
    last_type = state.get("last_type")

    # Finished?
    if total == 0 or idx >= total:
        state["current_index"] = total
        request.session["custom_quiz_state"] = state
        request.session.modified = True
        return {
            "finished": True,
            "score": state.get("score", 0),
            "total": total,
        }

    remaining = total - idx
    quiz_type = _decide_custom_quiz_type(remaining, last_type)

    # Group IDs for this question
    if quiz_type == "match":
        group_ids = order[idx: idx + 4]
    else:
        group_ids = order[idx: idx + 1]

    if not group_ids:
        # Safety fallback: mark finished
        state["current_index"] = total
        request.session["custom_quiz_state"] = state
        request.session.modified = True
        return {
            "finished": True,
            "score": state.get("score", 0),
            "total": total,
        }

    # Fetch words and keep order matching group_ids
    words = list(quiz_words_base.filter(pk__in=group_ids))
    id_to_word = {w.id: w for w in words}
    group_words = [id_to_word[wid] for wid in group_ids if wid in id_to_word]

    # If we don't have enough words for a match, fallback to choice
    if quiz_type == "match" and len(group_words) < 2:
        quiz_type = "choice"
        group_ids = order[idx: idx + 1]
        words = list(quiz_words_base.filter(pk__in=group_ids))
        id_to_word = {w.id: w for w in words}
        group_words = [id_to_word[wid] for wid in group_ids if wid in id_to_word]

    # ---------- MATCH TYPE ----------
    if quiz_type == "match":
        payload = _build_match_payload(group_words, question_word_ids=group_ids)

        next_idx = idx + len(group_words)
        if next_idx > total:
            next_idx = total

        state["current_index"] = next_idx
        state["last_type"] = "match"
        request.session["custom_quiz_state"] = state
        request.session.modified = True

        return payload

    # ---------- CHOICE TYPE ----------
    main_id = group_ids[0]
    word = id_to_word[main_id]

    # Build choices: 1 correct + up to 3 distractors
    choices = [word]
    others = list(quiz_words_base.exclude(pk=word.pk))
    random.shuffle(others)
    choices.extend(others[:3])
    random.shuffle(choices)

    next_idx = idx + 1
    if next_idx > total:
        next_idx = total

    state["current_index"] = next_idx
    state["last_type"] = "choice"
    request.session["custom_quiz_state"] = state
    request.session.modified = True

    return {
        "finished": False,
        "quiz_type": "choice",
        "word": word.original_word,
        "correct": word.translation,
        "word_id": word.id,
        "choices": [c.translation for c in choices],
    }


def _decide_custom_quiz_type(remaining: int, last_type: str | None) -> str:
    """
    - If >= 4 remaining:
        * if last_type == "match": force "choice"
        * else random "choice" or "match"
    - If < 4 remaining: "choice"
    """
    if remaining >= 4:
        if last_type == "match":
            return "choice"
        return random.choice(["choice", "match"])
    return "choice"


# ============================================================
# Shared helpers
# ============================================================

def _build_match_payload(group_words, question_word_ids=None) -> dict:
    """
    Build JSON payload for a matching question.
    """
    left_words = group_words[:]
    right_words = group_words[:]
    random.shuffle(left_words)
    random.shuffle(right_words)

    if question_word_ids is None:
        question_word_ids = [w.id for w in group_words]

    return {
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
        "question_word_ids": question_word_ids,
    }


# ============================================================
# Word list + CRUD (tab 1 in words_and_quizzes.html)
# ============================================================

@login_required
def word_list(request):
    """
    Combined view that renders:
      - Word list (with live search + CRUD via AJAX)
      - Custom quizzes tab (list of CustomQuiz objects)
    """
    query = request.GET.get('q', '').strip()
    language = request.GET.get('language', '').strip()

    # ✅ Base queryset: ONLY this user's words (including unknown-language ones)
    qs = (
        Word.objects
        .filter(owner=request.user)
        .annotate(original_lower=Lower("original_word"))
        .order_by("original_lower")
    )

    # ✅ Filter by language if selected
    if language:
        if language == "__unknown__":
            # special filter: "unknown language"
            qs = qs.filter(Q(language__isnull=True) | Q(language=""))
        else:
            qs = qs.filter(language=language)

    # ✅ Convert to list for safe Python-side Unicode filtering
    all_words = list(qs)

    # ✅ Case-insensitive, Unicode-safe text search
    if query:
        q = query.casefold()
        words = [
            w for w in all_words
            if q in (w.original_word or "").casefold()
               or q in (w.translation or "").casefold()
        ]
    else:
        words = all_words

    # ✅ AJAX branch for live search
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        results = []
        for w in words:
            if w.language:
                language_display = w.get_language_display()
            else:
                language_display = "Unknown"

            results.append({
                'id': w.id,
                'original_word': w.original_word,
                'translation': w.translation,
                'language': w.language,
                'language_display': language_display,
                'has_unknown_language': (not w.language),
            })

        return JsonResponse({'words': results})

    # ✅ Normal full-page render: only this user's custom quizzes
    custom_quizzes = CustomQuiz.objects.filter(owner=request.user)

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


def upload_words(request):
    """
    Step 1: show upload form
    Step 2: on POST, parse file and show preview table
    """
    if request.method == "POST":
        uploaded_file = request.FILES.get("file")

        # 1) No file selected
        if not uploaded_file:
            messages.error(request, "Please choose a file to upload.")
            return redirect("quiz:upload_words")

        # 2) Empty file
        if uploaded_file.size == 0:
            messages.error(request, "The uploaded file is empty.")
            return redirect("quiz:upload_words")

        # 3) Simple extension check
        valid_extensions = [".xlsx", ".xls", ".csv"]
        _, ext = os.path.splitext(uploaded_file.name.lower())
        if ext not in valid_extensions:
            messages.error(
                request,
                "Unsupported file type. Please upload an Excel (.xlsx / .xls) "
                "or CSV file."
            )
            return redirect("quiz:upload_words")

        # 4) Parse file
        try:
            rows = parse_words_file(uploaded_file)  # 🔑

        except ValidationError as e:
            if hasattr(e, "messages"):
                for msg in e.messages:
                    messages.error(request, msg)
            else:
                messages.error(request, str(e))
            return redirect("quiz:upload_words")

        except Exception as e:
            # TEMP: show underlying error while debugging
            # (you can later replace str(e) with a generic message again)
            messages.error(
                request,
                f"Something went wrong while reading the file: {e}"
            )
            return redirect("quiz:upload_words")

        # 5) Unknown-language flag for template
        has_unknown_language = any(
            bool(row.get("unknown_language")) for row in rows
        )

        # 6) Store preview data in session for the confirm step
        request.session["import_rows"] = rows
        request.session["import_has_unknown_language"] = has_unknown_language
        request.session.modified = True

        # Show the preview table
        return render(request, "quiz/upload_preview.html", {
            "rows": rows,
            "has_unknown_language": has_unknown_language,
        })

    # GET → show upload form
    return render(request, "quiz/upload_form.html")




@login_required
@require_POST
def confirm_import(request):
    """
    Step 3: user clicked 'Import' on preview → actually create Word objects.

    - Reads parsed rows from session ("import_rows")
    - Skips rows with missing original/translation
    - Uses get_or_create to avoid UNIQUE constraint errors
    - Treats words as unique per user by (owner/user, original_word, language)
    - Sets is_quizable = False for unknown-language rows
    - Sets a flash message with the number of imported words
    """
    rows = request.session.get("import_rows") or []

    if not rows:
        messages.error(request, "No import data found. Please upload a file again.")
        return redirect("quiz:upload_words")

    created_count = 0

    for row in rows:
        original = (row.get("original_word") or "").strip()
        translation = (row.get("translation") or "").strip()

        # language from parse_words_file (already normalized to lower/"" for unknown)
        language = (row.get("language") or "").strip().lower()
        unknown_language = bool(row.get("unknown_language"))

        # Skip incomplete rows
        if not original or not translation:
            continue

        # For unknown languages we store an empty string in the DB
        if unknown_language:
            language = ""

        # --------- Build the uniqueness key (align with your unique_together) ---------
        lookup_kwargs = {
            "original_word": original,
            "language": language,
        }

        # Per-user uniqueness: adjust depending on your model field
        if hasattr(Word, "user"):
            lookup_kwargs["user"] = request.user
        elif hasattr(Word, "owner"):
            lookup_kwargs["owner"] = request.user

        # Defaults for newly created records
        defaults = {
            "translation": translation,
            # 🔑 core of Option A:
            # unknown-language words are saved but NEVER appear in quizzes
            "is_quizable": not unknown_language,
        }

        # --------- Safe create: no IntegrityError even with duplicates ---------
        word_obj, created = Word.objects.get_or_create(
            **lookup_kwargs,
            defaults=defaults,
        )

        if created:
            created_count += 1
        else:
            # Optional: update translation if you want
            # if word_obj.translation != translation:
            #     word_obj.translation = translation
            #     word_obj.save(update_fields=["translation"])
            pass

    # Clean up session
    request.session.pop("import_rows", None)
    request.session.pop("import_has_unknown_language", None)
    request.session.modified = True

    # --------- Flash message for the words page ---------
    if created_count:
        messages.success(
            request,
            f"Successfully added {created_count} new word{'s' if created_count != 1 else ''}."
        )
    else:
        messages.info(
            request,
            "No new words found — everything in the file already exists or was invalid."
        )

    return redirect("quiz:word_list")


@login_required
@require_POST
def edit_word(request, pk=None):
    """
    AJAX endpoint to edit a Word (owned by current user).

    Supports:
      - URL with pk:   /words/<pk>/edit/
      - Hidden 'id' field in POST: id=<pk>

    Expects POST:
      - original_word
      - translation
      - language ('' allowed -> unknown)
    """
    # Prefer explicit "id" from POST, fall back to pk from URL
    word_id = request.POST.get("id") or pk

    if not word_id:
        return JsonResponse(
            {"success": False, "error": "Missing word ID."},
            status=400,
        )

    word = get_object_or_404(Word, pk=word_id, owner=request.user)

    original = (request.POST.get("original_word") or "").strip()
    translation = (request.POST.get("translation") or "").strip()
    language = (request.POST.get("language") or "").strip().lower()

    if not original or not translation:
        return JsonResponse(
            {"success": False, "error": "Original word and translation are required."},
            status=400,
        )

    # Allow empty string as "unknown / not set"
    valid_codes = {code for code, _ in Word.LANGUAGE_CHOICES}
    if language and language not in valid_codes:
        return JsonResponse(
            {"success": False, "error": "Invalid language code."},
            status=400,
        )

    # ---------- Uniqueness check BEFORE saving ----------
    duplicate_exists = (
        Word.objects
        .filter(
            owner=request.user,
            original_word=original,
            language=language,
        )
        .exclude(pk=word.pk)
        .exists()
    )

    if duplicate_exists:
        return JsonResponse(
            {
                "success": False,
                "error": "You already have this word with the same language.",
            },
            status=400,
        )

    # ---------- Apply changes ----------
    word.original_word = original
    word.translation = translation
    word.language = language  # "" = unknown / not set

    # Business rule for Option A:
    # - has language  -> can be quizzed
    # - no language   -> excluded from quizzes
    word.is_quizable = bool(language)

    try:
        word.save()
    except IntegrityError:
        # Extra safety; should not trigger if duplicate check above is correct
        return JsonResponse(
            {
                "success": False,
                "error": "Could not save changes due to a duplicate word.",
            },
            status=400,
        )

    return JsonResponse(
        {
            "success": True,
            "word": {
                "id": word.id,
                "original_word": word.original_word,
                "translation": word.translation,
                "language": word.language,
                "language_display": (
                    word.get_language_display() if word.language else "Unknown"
                ),
                "is_quizable": word.is_quizable,
            },
        }
    )


@login_required
def delete_word(request, pk):
    """
    AJAX endpoint to delete a Word (owned by current user).
    """
    if request.method == 'POST':
        word = get_object_or_404(Word, pk=pk, owner=request.user)
        word.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Invalid request'})


@login_required
@require_POST
def bulk_delete_words(request):
    try:
        data = json.loads(request.body)
        ids = data.get("ids", [])

        if not ids:
            return JsonResponse({"success": False, "error": "No IDs provided"})

        Word.objects.filter(
            id__in=ids,
            owner=request.user
        ).delete()

        return JsonResponse({"success": True, "deleted_count": len(ids)})

    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})


@login_required
@require_POST
def bulk_delete_quizzes(request):
    quiz_ids = request.POST.getlist("quiz_ids[]")

    if not quiz_ids:
        return JsonResponse(
            {"success": False, "error": "No quizzes selected."}, status=400
        )

    from .models import CustomQuiz

    quizzes = CustomQuiz.objects.filter(id__in=quiz_ids, owner=request.user)

    deleted_count = quizzes.count()
    quizzes.delete()

    return JsonResponse({
        "success": True,
        "deleted": deleted_count
    })


@login_required
@require_POST
def bulk_remove_quiz_words(request, quiz_id):
    """
    Remove multiple words from a custom quiz in ONE request
    """
    word_ids = request.POST.getlist("word_ids[]")

    if not word_ids:
        return JsonResponse({"success": False, "error": "No words selected"})

    quiz = get_object_or_404(CustomQuiz, id=quiz_id, owner=request.user)

    quiz.words.remove(*word_ids)

    return JsonResponse({"success": True})



@login_required
def add_word(request):
    """
    AJAX endpoint to add a new Word for the current user.
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

        # Enforce uniqueness per user + language
        exists = Word.objects.filter(
            owner=request.user,
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
            owner=request.user,          # 👈 tie to current user
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


@login_required
def custom_quiz_detail(request, pk):
    """
    Detail/manage page for a single CustomQuiz (owned by current user).
    """
    quiz = get_object_or_404(CustomQuiz, pk=pk, owner=request.user)

    # Words that are in this quiz
    quiz_words = quiz.words.order_by('original_word')

    # Only words NOT already in this quiz, but owned by this user
    all_words = Word.objects.filter(owner=request.user).exclude(
        pk__in=quiz_words.values('pk')
    ).order_by('original_word')

    context = {
        'quiz': quiz,
        'quiz_words': quiz_words,
        'all_words': all_words,
        'language_choices': Word.LANGUAGE_CHOICES,
    }
    return render(request, 'quiz/quiz_manage_words.html', context)


@login_required
@require_POST
def quiz_add_words(request, pk):
    """
    AJAX endpoint to add multiple words to a CustomQuiz (owned by current user).

    - Only allows adding this user's words
    - Only allows words with is_quizable=True
    """
    quiz = get_object_or_404(CustomQuiz, pk=pk, owner=request.user)

    # Support both 'word_ids[]' and 'word_ids' for flexibility
    word_ids = request.POST.getlist("word_ids[]") or request.POST.getlist("word_ids")

    if not word_ids:
        return JsonResponse({"success": False, "error": "No words selected."})

    # ✅ Only allow adding this user's *quizable* words
    words = Word.objects.filter(
        id__in=word_ids,
        owner=request.user,
        is_quizable=True,   # <--- critical line
    )

    if not words.exists():
        return JsonResponse(
            {
                "success": False,
                "error": "No valid words to add (unknown-language words are excluded).",
            }
        )

    quiz.words.add(*words)

    return JsonResponse(
        {
            "success": True,
            "word_count": quiz.words.count(),
        }
    )


@login_required
@require_POST
def quiz_remove_word(request, pk):
    """
    AJAX endpoint to remove a single word from a CustomQuiz (owned by current user).
    """
    quiz = get_object_or_404(CustomQuiz, pk=pk, owner=request.user)
    word_id = request.POST.get('word_id')

    if not word_id:
        return JsonResponse({'success': False, 'error': 'word_id is required.'})

    try:
        # Ensure this word actually belongs to the user and is in the quiz
        word = quiz.words.get(pk=word_id, owner=request.user)
    except Word.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Word not in this quiz.'})

    quiz.words.remove(word)

    return JsonResponse({
        'success': True,
        'word_count': quiz.words.count(),
    })


@login_required
@require_POST
def create_quiz(request):
    """
    AJAX endpoint to create a new CustomQuiz from the "New Quiz" modal.
    """
    title = request.POST.get('title', '').strip()
    if not title:
        return JsonResponse({'success': False, 'error': 'Title is required.'})

    quiz = CustomQuiz.objects.create(
        title=title,
        owner=request.user,   # 👈 tie to current user
    )

    detail_url = reverse('quiz:custom_quiz_detail', args=[quiz.pk])
    delete_url = reverse('quiz:custom_quiz_delete', args=[quiz.pk])

    return JsonResponse({
        'success': True,
        'quiz': {
            'id': quiz.pk,
            'title': quiz.title,
            'word_count': quiz.words.count(),
            'detail_url': detail_url,
            'delete_url': delete_url,
        }
    })


@login_required
def custom_quiz_delete(request, quiz_id):
    if request.method != "POST":
        return JsonResponse({"success": False, "error": "POST required."}, status=400)

    quiz = get_object_or_404(CustomQuiz, id=quiz_id, owner=request.user)
    quiz.delete()
    return JsonResponse({"success": True})


@login_required
def quiz_candidate_words(request, pk):
    """
    AJAX endpoint: list candidate words that CAN be added to this CustomQuiz.

    - Only this user's words
    - Only is_quizable=True
    - Excludes words already in this quiz
    - Supports optional q= and language= filters (same semantics as word_list)
    """
    quiz = get_object_or_404(CustomQuiz, pk=pk, owner=request.user)

    query = (request.GET.get("q") or "").strip()
    language = (request.GET.get("language") or "").strip()

    # ✅ base: only this user's QUIZABLE words, not already in this quiz
    qs = (
        Word.objects
        .filter(owner=request.user, is_quizable=True)
        .exclude(id__in=quiz.words.values_list("id", flat=True))
        .annotate(original_lower=Lower("original_word"))
        .order_by("original_lower")
    )

    if language:
        qs = qs.filter(language=language)

    words = list(qs)

    if query:
        q = query.casefold()
        words = [
            w for w in words
            if q in (w.original_word or "").casefold()
               or q in (w.translation or "").casefold()
        ]

    data = [
        {
            "id": w.id,
            "original_word": w.original_word,
            "translation": w.translation,
            "language": w.language,
            "language_display": w.get_language_display()
                if w.language else "Unknown",
        }
        for w in words
    ]

    return JsonResponse({"words": data})
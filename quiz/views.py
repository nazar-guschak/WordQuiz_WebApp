from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_POST
from django.urls import reverse
from django.http import JsonResponse
from django.db.models import Q

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
    """
    Quiz page with two modes:

    - Selection mode (no quiz yet):
        /quiz/
        Shows only a big "Choose quiz type" UI.

    - Quiz mode (after Start clicked):
        /quiz/?start=1&quiz_id=<id or empty>
        If quiz_id is empty -> general quiz (all words, infinite).
        If quiz_id is set -> custom quiz (only that CustomQuiz, finite, with score).
    """
    quiz_id = request.GET.get("quiz_id")
    start = request.GET.get("start")  # present when user presses Start

    custom_quizzes = CustomQuiz.objects.all()
    all_word_count = Word.objects.count()

    # ---------------- SELECTION MODE (no quiz yet) ----------------
    if not start:
        return render(request, "quiz.html", {
            "quiz_started": False,
            "current_quiz": None,
            "custom_quizzes": custom_quizzes,
            "all_word_count": all_word_count,
            "progress": None,
            "quiz_choices": [],
            "correct_answer": None,
        })

    # ---------------- QUIZ MODE (user has clicked Start) ----------------
    current_quiz = None
    question_data = None
    progress = None

    if quiz_id:
        # === CUSTOM QUIZ ===
        current_quiz = get_object_or_404(CustomQuiz, pk=quiz_id)

        words_qs = list(current_quiz.words.order_by("original_word"))
        order = [w.id for w in words_qs]
        random.shuffle(order)

        state = {
            "quiz_id": current_quiz.id,
            "order": order,
            "current_index": 0,
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
            choices.extend(others[:3])  # up to 3 distractors
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
        else:
            question_data = None
            progress = {"current": 0, "total": 0, "percent": 0}

    else:
        # === GENERAL QUIZ ===
        quiz_choices, correct_answer = read_words(Word)
        question_data = {
            "word": correct_answer,
            "choices": quiz_choices,
            "correct": correct_answer,
        }

    return render(request, "quiz.html", {
        "quiz_started": True,
        "current_quiz": current_quiz,
        "custom_quizzes": custom_quizzes,
        "all_word_count": all_word_count,
        "progress": progress,
        "quiz_choices": question_data["choices"] if question_data else [],
        "correct_answer": question_data["correct"] if question_data else None,
    })


@require_POST
def check_answer(request):
    """
    Same as before, but also updates score in session for custom quizzes.
    """
    chosen_translation = request.POST.get("chosen")
    correct_translation = request.POST.get("correct")
    quiz_id = request.POST.get("quiz_id")  # may be empty for general quiz

    if chosen_translation is None or correct_translation is None:
        return JsonResponse({"error": "Missing data"}, status=400)

    is_correct = chosen_translation == correct_translation

    # Update score for custom quiz
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
    General quiz: infinite.
    Custom quiz: sequential with end + score, using session state.
    """
    quiz_id = request.GET.get("quiz_id")

    # ---------- GENERAL QUIZ ----------
    if not quiz_id:
        quiz_choices, correct_answer = read_words(Word)
        return JsonResponse({
            "finished": False,
            "word": correct_answer.original_word,
            "correct": correct_answer.translation,
            "choices": [c.translation for c in quiz_choices],
        })

    # ---------- CUSTOM QUIZ ----------
    quiz = get_object_or_404(CustomQuiz, pk=quiz_id)
    state = request.session.get("custom_quiz_state")

    if not state or state.get("quiz_id") != quiz.id:
        words_qs = list(quiz.words.order_by("original_word"))
        order = [w.id for w in words_qs]
        random.shuffle(order)
        state = {
            "quiz_id": quiz.id,
            "order": order,
            "current_index": 0,
            "score": 0,
            "total": len(order),
        }

    order = state["order"]
    idx = state["current_index"] + 1  # move to NEXT question

    if idx >= len(order):
        return JsonResponse({
            "finished": True,
            "score": state.get("score", 0),
            "total": state.get("total", 0),
        })

    state["current_index"] = idx
    request.session["custom_quiz_state"] = state
    request.session.modified = True

    word = quiz.words.get(pk=order[idx])

    choices = [word]
    others = list(quiz.words.exclude(pk=word.pk))
    random.shuffle(others)
    choices.extend(others[:3])
    random.shuffle(choices)

    current_number = idx + 1
    total = state["total"]
    progress_percent = int(100 * current_number / total) if total else 0

    return JsonResponse({
        "finished": False,
        "word": word.original_word,
        "correct": word.translation,
        "choices": [c.translation for c in choices],
        "current": current_number,
        "total": total,
        "progress_percent": progress_percent,
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
            - 'words': QuerySet of Word objects (filtered & ordered)
            - 'custom_quizzes': all CustomQuiz objects
            - 'query': current search string
    """
    query = request.GET.get('q', '').strip()

    # Always start with all words, ordered
    all_words = list(Word.objects.order_by('original_word'))

    if query:
        q = query.casefold()  # Unicode-aware lowercasing
        # Filter in Python so it's truly case-insensitive for Ukrainian, etc.
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
            }
            for w in words
        ]
        return JsonResponse({'words': results})

    # Normal full-page render
    custom_quizzes = CustomQuiz.objects.all()

    return render(
        request,
        'words_and_quizzes.html',
        {
            'words': words,  # list is fine in template
            'query': query,
            'custom_quizzes': custom_quizzes,
        }
    )


def edit_word(request, pk):
    """
    AJAX endpoint to edit a single Word.

    URL pattern: /word_list/<pk>/edit/

    POST:
      - 'original_word'
      - 'translation'

    Returns JSON:
      - {'success': True} on successful save
      - {'success': False, 'error': '...'} if validation fails

    NOTE: If accessed via GET, returns the current values as JSON
          (useful if you ever want to prefill a form via AJAX).
    """
    word = get_object_or_404(Word, pk=pk)

    if request.method == 'POST':
        original = request.POST.get('original_word', '').strip()
        translation = request.POST.get('translation', '').strip()

        if original and translation:
            word.original_word = original
            word.translation = translation
            word.save()
            return JsonResponse({'success': True})
        else:
            return JsonResponse({'success': False, 'error': 'Fields cannot be empty.'})

    # Optional: current values for non-POST usage
    return JsonResponse({'original_word': word.original_word, 'translation': word.translation})


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

    Validation:
      - original_word must be unique (no duplicates allowed)
      - both fields must be non-empty

    Returns JSON:
      - {'success': True, 'word_id': <new id>}
      - {'success': False, 'error': '...'} with error message
    """
    if request.method == "POST":
        original = request.POST.get("original_word", "").strip()
        translation = request.POST.get("translation", "").strip()

        exists = Word.objects.filter(original_word=original).exists()

        if exists:
            return JsonResponse({"success": False, "error": "This word already exists."})
        if not original or not translation:
            return JsonResponse({"success": False, "error": "Fields cannot be empty."})

        word = Word.objects.create(original_word=original, translation=translation)
        return JsonResponse({"success": True, "word_id": word.id})

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
    }
    return render(request, 'quiz_manage_words.html', context)


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

    POST:
      - 'title': title for the new quiz

    Returns JSON:
      - {'success': True,
         'quiz': {
             'id': <pk>,
             'title': <title>,
             'word_count': 0 (initially),
             'detail_url': URL to manage this quiz (custom_quiz_detail)
         }
        }
      - {'success': False, 'error': 'Title is required.'} if title is empty

    This response is used by the frontend to:
      - Append a new row to the quizzes table
      - Either close the modal or redirect to the quiz manage page
    """
    title = request.POST.get('title', '').strip()
    if not title:
        return JsonResponse({'success': False, 'error': 'Title is required.'})

    quiz = CustomQuiz.objects.create(title=title)

    detail_url = reverse('quiz:custom_quiz_detail', args=[quiz.pk])

    return JsonResponse({
        'success': True,
        'quiz': {
            'id': quiz.pk,
            'title': quiz.title,
            'word_count': quiz.words.count(),
            'detail_url': detail_url,
        }
    })

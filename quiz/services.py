from quiz.models import Word, CustomQuiz
from django.db.models import F
import random

def word_priority(word) -> float:
    times = word.times_quizzed
    correct = word.correct_answers

    familiarity = correct / max(times, 1) #calculates familiarity score
    new_word_boost = 1 if times < 3 else 0  # stronger weight early on

    score = (
            0.5 * (1 - familiarity) +  # mistakes
            0.3 * (1 / (times + 1)) +  # fewer quizzes
            0.2 * new_word_boost  # new word bonus
    )
    return score


def read_words(words_source):
    if hasattr(words_source, "all"):
        # it's a model class (Word)
        words = words_source.all()
    else:
        # it's already a queryset → use it
        words = words_source

    available_words = list(words.filter(timeout__lte=0))
    available_words.sort(key=word_priority, reverse=True)

    # Choose 4 quiz words
    correct_answer = available_words[0]

    remaining = available_words[1:]
    distractors = random.sample(remaining, 3)

    quiz_choices = [correct_answer] + distractors

    random.shuffle(quiz_choices)

    # Randomly choose direction for this question
    direction = random.choice(["orig_to_trans", "trans_to_orig"])

    update_word_states(correct_answer)
    return quiz_choices, correct_answer, direction


def update_word_states(correct_word):
    """
    Updates timeout values after a quiz round.

    1. Set timeout for the chosen word to 5
    2. Decrement timeout for all other words with timeout > 0
    """

    # 1️⃣ Put chosen word into timeout (only timeout, no stats here)
    correct_word.__class__.objects.filter(pk=correct_word.pk).update(timeout=5)

    # 2️⃣ Decrement timeout for all OTHER words currently in cooldown
    correct_word.__class__.objects.filter(timeout__gt=0).exclude(pk=correct_word.pk).update(
        timeout=F('timeout') - 1
    )


def generate_matching_quiz(words_source, count=4):
    """
    Picks up to `count` words (default 4) using the same priority logic as read_words(),
    and prepares them for a matching quiz:
      - left side: original words
      - right side: translations (shuffled)
    Also applies timeout logic via update_word_states() to the highest-priority word.
    """
    if hasattr(words_source, "all"):
        qs = words_source.all()
    else:
        qs = words_source

    available_words = list(qs.filter(timeout__lte=0))

    if not available_words:
        return [], []

    # Sort by priority (same as read_words)
    available_words.sort(key=word_priority, reverse=True)

    # Take up to `count` words
    selected = available_words[:count]

    # Apply timeout logic to the top word so your cooldown system still works
    update_word_states(selected[0])

    # We will randomize the display order for both columns
    left_words = selected[:]      # originals column
    right_words = selected[:]     # translations column

    random.shuffle(left_words)
    random.shuffle(right_words)

    return left_words, right_words


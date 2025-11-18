from quiz.models import Word, CustomQuiz
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
        words = words_source.objects.all()
    else:
        # it's already a queryset → use it
        words = words_source

    available_words = list(words.objects.filter(timeout__lte=0))
    available_words.sort(key=word_priority, reverse=True)

    # Choose 4 quiz words
    correct_answer = random.choice(available_words)
    quiz_choices = [correct_answer] + random.sample(available_words, 3)
    random.shuffle(quiz_choices)

    return quiz_choices, correct_answer




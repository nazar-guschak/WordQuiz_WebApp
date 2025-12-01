from django.db import models
from django.contrib.auth.models import User   # 👈 NEW


class Word(models.Model):
    LANGUAGE_CHOICES = [
        ("de", "German"),
        ("en", "English"),
        ("uk", "Ukrainian"),
        ("pl", "Polish"),
        ("fr", "French"),
        ("es", "Spanish"),
    ]

    # 👇 NEW: who this word belongs to
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="words",
        null=True,      # temporary so old rows are allowed
        blank=True,     # same
    )

    original_word = models.CharField(max_length=100)
    translation = models.CharField(max_length=100)

    language = models.CharField(
        max_length=5,
        choices=LANGUAGE_CHOICES,
        default="de",
    )

    times_quizzed = models.IntegerField(default=0)
    correct_answers = models.IntegerField(default=0)
    timeout = models.IntegerField(default=0)

    class Meta:
        # same user cannot add the same word+language twice
        unique_together = ("owner", "original_word", "language")

    def __str__(self):
        return self.original_word

    def full_info(self):
        return {
            "original_word": self.original_word,
            "translation": self.translation,
            "times_quizzed": self.times_quizzed,
            "correct_answers": self.correct_answers,
            "timeout": self.timeout,
        }


class CustomQuiz(models.Model):
    # 👇 NEW: quiz owner
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="custom_quizzes",
        null=True,      # temporary
        blank=True,
    )

    title = models.CharField(max_length=100)
    words = models.ManyToManyField(Word, related_name="in_quizzes")

    def __str__(self):
        return self.title

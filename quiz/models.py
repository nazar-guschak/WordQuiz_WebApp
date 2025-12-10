from django.db import models
from django.contrib.auth.models import User


from django.contrib.auth.models import User
from django.db import models


from django.contrib.auth.models import User
from django.db import models


class Word(models.Model):
    LANGUAGE_CHOICES = [
        ("de", "German"),
        ("en", "English"),
        ("uk", "Ukrainian"),
        ("pl", "Polish"),
        ("fr", "French"),
        ("es", "Spanish"),
    ]

    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="words",
        null=True,       # temporary so old rows are allowed
        blank=True,      # same
    )

    original_word = models.CharField(max_length=100)
    translation = models.CharField(max_length=100)

    # Allow blank so we can explicitly store "unknown language" as ""
    language = models.CharField(
        max_length=5,
        choices=LANGUAGE_CHOICES,
        default="de",
        blank=True,      # empty string means "unknown"
    )

    # Single source of truth for “can this word be used in quizzes?”
    is_quizable = models.BooleanField(default=True)

    times_quizzed = models.IntegerField(default=0)
    correct_answers = models.IntegerField(default=0)
    timeout = models.IntegerField(default=0)

    class Meta:
        # Same user cannot add the same word+language twice
        unique_together = ("owner", "original_word", "language")

    def __str__(self):
        return self.original_word

    def full_info(self):
        """
        Convenience dict for passing word data to templates/JS.
        """
        return {
            "original_word": self.original_word,
            "translation": self.translation,
            "times_quizzed": self.times_quizzed,
            "correct_answers": self.correct_answers,
            "timeout": self.timeout,
        }

    # ==========================
    # Helper methods / properties
    # ==========================

    @classmethod
    def valid_language_codes(cls):
        """
        Central place for the list of valid language codes.
        Used by has_unknown_language and quizable_qs.
        """
        return [code for code, _ in cls.LANGUAGE_CHOICES]

    @property
    def has_unknown_language(self) -> bool:
        """
        True if:
        - language is empty, or
        - language code is not one of the known choices.
        """
        lang = (self.language or "").strip()
        return not lang or lang not in self.valid_language_codes()

    @classmethod
    def quizable_qs(cls, qs=None):
        """
        Return a queryset of words that:
        - are marked is_quizable=True
        - have a known language code (in LANGUAGE_CHOICES)
        """
        if qs is None:
            qs = cls.objects.all()

        return qs.filter(
            is_quizable=True,
            language__in=cls.valid_language_codes(),  # excludes "" / None / weird codes
        )



class CustomQuiz(models.Model):
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

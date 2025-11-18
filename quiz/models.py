from django.db import models

# Create your models here.

class Word(models.Model):
    original_word = models.CharField(max_length=100)
    translation = models.CharField(max_length=100)
    times_quizzed = models.IntegerField(default=0)
    correct_answers = models.IntegerField(default=0)
    timeout = models.IntegerField(default=0)

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
    title = models.CharField(max_length=100)
    words = models.ManyToManyField(Word, related_name="in_quizzes")

    def __str__(self):
        return self.title


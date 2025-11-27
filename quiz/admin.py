from django.contrib import admin
from .models import Word, CustomQuiz

# Register CustomQuiz normally
admin.site.register(CustomQuiz)


# Register Word with a custom admin configuration
@admin.register(Word)
class WordAdmin(admin.ModelAdmin):
    list_display = (
        "original_word",
        "translation",
        "language",
        "times_quizzed",
        "correct_answers",
        "accuracy",
    )

    list_filter = ("language",)
    search_fields = ("original_word", "translation")

    def accuracy(self, obj):
        if obj.times_quizzed == 0:
            return "—"
        pct = (obj.correct_answers / obj.times_quizzed) * 100
        return f"{pct:.1f}%"

    accuracy.short_description = "Accuracy"

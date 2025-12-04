from django.db.models import F
import random

import os
import pandas as pd
from django.core.exceptions import ValidationError


ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"]


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


# ============================================================
# File import services (CSV + Excel)
# ============================================================


def parse_words_file(uploaded_file):
    """
    Parse an uploaded CSV or Excel file and return a list of dictionaries:
    [
        {"original_word": "...", "translation": "...", "language": "..."},
        ...
    ]

    Raises ValidationError with a user-friendly message on failure.
    """
    filename = uploaded_file.name
    ext = os.path.splitext(filename)[1].lower()

    # ---------- Validate extension ----------
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError("Unsupported file type. Upload CSV or Excel.")

    # ---------- Load into pandas ----------
    try:
        if ext == ".csv":
            # Reset pointer just in case
            uploaded_file.seek(0)

            # 1) Try default settings (often works fine)
            try:
                df = pd.read_csv(uploaded_file)
            except UnicodeDecodeError:
                # 2) Try a few common encodings (Windows / Cyrillic)
                uploaded_file.seek(0)
                for enc in ["utf-8-sig", "cp1251", "cp1252", "latin-1"]:
                    try:
                        df = pd.read_csv(uploaded_file, encoding=enc)
                        break
                    except UnicodeDecodeError:
                        uploaded_file.seek(0)
                else:
                    # If we exhausted all encodings:
                    raise ValidationError(
                        "Could not read the CSV file. Try saving it as “CSV UTF-8” or Excel (.xlsx) and upload again."
                    )
        else:
            # Excel branch
            uploaded_file.seek(0)
            df = pd.read_excel(uploaded_file)

    except ValidationError:
        # just bubble up our own ValidationError
        raise
    except Exception as e:
        # Optional: log the real error somewhere for debugging
        # print("parse_words_file error:", repr(e))
        raise ValidationError(
            "Could not read the file. Make sure it is a valid CSV/Excel file."
        )

    if df.empty:
        raise ValidationError("The file appears to be empty.")

    # ---------- Normalise column names ----------
    df = df.rename(columns={
        "word": "original_word",
        "source": "original_word",
        "original_word": "original_word",

        "translation": "translation",
        "target": "translation",

        "language": "language",
        "lang": "language",
        "lang_code": "language",
    })

    # ---------- Required columns ----------
    if "original_word" not in df.columns or "translation" not in df.columns:
        raise ValidationError(
            "File must contain 'original_word' and 'translation' columns "
            "(or equivalent names like 'word', 'target')."
        )

    # Language is optional; default to blank
    if "language" not in df.columns:
        df["language"] = ""

    # ---------- Keep only relevant columns ----------
    df = df[["original_word", "translation", "language"]]

    # ---------- Clean & normalize values ----------
    # Convert to string and trim whitespace
    for col in ["original_word", "translation", "language"]:
        df[col] = df[col].astype(str).str.strip()

    # Remove duplicate rows inside the uploaded file
    df = df.drop_duplicates(subset=["original_word", "translation", "language"])

    # Drop rows missing essential fields
    df = df[df["original_word"] != ""]
    df = df[df["translation"] != ""]

    if df.empty:
        raise ValidationError("No valid word entries found in the file.")

    # ---------- Convert to list of dictionaries ----------
    return df.to_dict(orient="records")
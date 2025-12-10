from django.db.models import F
from django.db.models import QuerySet
from django.core.exceptions import ValidationError
from .models import Word

import os
import pandas as pd
import random


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
    """
    words_source can be:
      - a QuerySet of Word
      - the Word model class itself (rarely used now)
    """

    # 1) Normalize to a QuerySet
    if isinstance(words_source, QuerySet):
        qs = words_source
    elif hasattr(words_source, "_default_manager"):  # e.g. the Word model
        qs = words_source._default_manager.all()
    else:
        raise TypeError(
            "read_words expects a Django QuerySet or a model class as words_source."
        )

    # 2) Enforce global quiz rules:
    #    - is_quizable=True
    #    - known language only (via LANGUAGE_CHOICES)
    qs = Word.quizable_qs(qs)

    # 3) Apply timeout cooldown
    qs = qs.filter(timeout__lte=0)

    # 4) Build list and ensure we have enough words
    available_words = list(qs)

    if len(available_words) < 4:
        # You can handle this more gracefully (e.g. raise, or return fewer choices),
        # but for now we'll just assume you ensure 4+ words exist in the UI.
        raise ValueError(
            f"Not enough available words to build a quiz question: got {len(available_words)}, need at least 4."
        )

    # 5) Sort by priority and choose correct + distractors
    available_words.sort(key=word_priority, reverse=True)

    correct_answer = available_words[0]
    remaining = available_words[1:]
    distractors = random.sample(remaining, 3)

    quiz_choices = [correct_answer] + distractors
    random.shuffle(quiz_choices)

    # 6) Random direction
    direction = random.choice(["orig_to_trans", "trans_to_orig"])

    # 7) Update cooldown / stats
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

    # 1) Normalize to a QuerySet
    if isinstance(words_source, QuerySet):
        qs = words_source
    elif hasattr(words_source, "_default_manager"):  # e.g. Word model class
        qs = words_source._default_manager.all()
    else:
        raise TypeError(
            "generate_matching_quiz expects a Django QuerySet or a model class as words_source."
        )

    # 2) Apply global quiz rules:
    #    - is_quizable=True
    #    - known language only
    qs = Word.quizable_qs(qs)

    # 3) Apply timeout / cooldown filter
    qs = qs.filter(timeout__lte=0)

    # 4) Build list
    available_words = list(qs)

    if not available_words:
        # Nothing to quiz on
        return [], []

    # Sort by priority (same as read_words)
    available_words.sort(key=word_priority, reverse=True)

    # Take up to `count` words (but at least 1)
    selected = available_words[:count]

    # Apply timeout logic to the top word so your cooldown system still works
    update_word_states(selected[0])

    # Prepare left/right columns
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
        {
            "index": 1,
            "original_word": "...",
            "translation": "...",
            "language": "de" or "",   # "" means unknown
            "unknown_language": True/False,
        },
        ...
    ]

    Raises ValidationError with a user-friendly message on failure.
    """
    filename = uploaded_file.name
    ext = os.path.splitext(filename)[1].lower()

    # ---------- Load into pandas ----------
    try:
        if ext == ".csv":
            uploaded_file.seek(0)
            try:
                df = pd.read_csv(uploaded_file)
            except UnicodeDecodeError:
                uploaded_file.seek(0)
                for enc in ["utf-8-sig", "cp1251", "cp1252", "latin-1"]:
                    try:
                        df = pd.read_csv(uploaded_file, encoding=enc)
                        break
                    except UnicodeDecodeError:
                        uploaded_file.seek(0)
                else:
                    raise ValidationError(
                        "Could not read the CSV file. Try saving it as “CSV UTF-8” "
                        "or Excel (.xlsx) and upload again."
                    )
        elif ext in (".xlsx", ".xls"):
            uploaded_file.seek(0)
            df = pd.read_excel(uploaded_file)
        else:
            raise ValidationError(
                "Unsupported file type. Upload CSV or Excel (.xlsx / .xls)."
            )

    except ValidationError:
        raise
    except Exception:
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

    try:
        # ---------- Keep only relevant columns ----------
        df = df[["original_word", "translation", "language"]]

        # ---------- Clean & normalize values ----------
        for col in ["original_word", "translation", "language"]:
            df[col] = df[col].astype(str).str.strip()

        df["language"] = df["language"].str.lower()

        # Optional: remove exact duplicates (same original, translation, language)
        df = df.drop_duplicates(subset=["original_word", "translation", "language"])

        # Drop rows missing essential fields
        df = df[df["original_word"] != ""]
        df = df[df["translation"] != ""]

        if df.empty:
            raise ValidationError("No valid word entries found in the file.")

        # ---------- Determine which rows have unknown language ----------
        valid_lang_codes = {code for code, _ in Word.LANGUAGE_CHOICES}

        records = df.to_dict(orient="records")

        # ---------- Smarter dedupe: by (original_word, translation), prefer known language ----------
        by_pair = {}  # key = (original, translation) -> chosen row dict

        for rec in records:
            original = (rec.get("original_word") or "").strip()
            translation = (rec.get("translation") or "").strip()
            lang = (rec.get("language") or "").strip().lower()

            key = (original, translation)

            # Is language valid?
            is_unknown = (lang == "") or (lang not in valid_lang_codes)

            existing = by_pair.get(key)

            if existing is None:
                # First time we see this pair → tentatively keep it
                by_pair[key] = {
                    "original_word": original,
                    "translation": translation,
                    "language": lang if not is_unknown else "",
                    "unknown_language": is_unknown,
                }
            else:
                # We already have this (original, translation) pair.
                # If existing has unknown language and new one has a known language,
                # replace it with the better (known-language) row.
                existing_is_unknown = existing["unknown_language"]
                if existing_is_unknown and not is_unknown:
                    by_pair[key] = {
                        "original_word": original,
                        "translation": translation,
                        "language": lang,  # known
                        "unknown_language": False,
                    }
                # Otherwise: keep the existing one (first wins or both unknown/both known)

        # ---------- Convert map to list with indexes ----------
        rows = []
        for idx, rec in enumerate(by_pair.values(), start=1):
            rows.append({
                "index": idx,
                "original_word": rec["original_word"],
                "translation": rec["translation"],
                "language": rec["language"],  # "" if unknown
                "unknown_language": rec["unknown_language"],
            })

        return rows

    except ValidationError:
        raise
    except Exception:
        # Catch anything weird in the cleaning logic and turn it into a friendly error
        raise ValidationError(
            "Could not process the file contents. Make sure it has the correct "
            "columns and no invalid data."
        )
from django.urls import path
from . import views

app_name = 'quiz'

urlpatterns = [
    path('', views.index, name='index'),
    path('quiz/', views.quiz, name='quiz'),
    path('check_answer/', views.check_answer, name='check_answer'),
    path('next_quiz/', views.next_quiz, name='next_quiz'),

    path('word_list/', views.word_list, name='word_list'),
    path('word_list/<int:pk>/edit/', views.edit_word, name='edit_word'),
    path('word_list/<int:pk>/delete/', views.delete_word, name='delete_word'),
    path("word_list/bulk_delete/", views.bulk_delete_words, name="bulk_delete_words"),
    path("word_list/add/", views.add_word, name="add_word"),

    path('quiz/<int:pk>/', views.custom_quiz_detail, name='custom_quiz_detail'),
    path('quiz/<int:pk>/add_words/', views.quiz_add_words, name='quiz_add_words'),
    path('quiz/<int:pk>/remove_word/', views.quiz_remove_word, name='quiz_remove_word'),
    path("quiz/<int:quiz_id>/bulk-remove/", views.bulk_remove_quiz_words, name="bulk_remove_quiz_words"),
    path('quiz/create/', views.create_quiz, name='create_quiz'),
    path("quiz/custom_quiz/<int:quiz_id>/delete/", views.custom_quiz_delete, name="custom_quiz_delete"),
    path("quizzes/bulk-delete/", views.bulk_delete_quizzes, name="bulk_delete_quizzes"),

    path("word_list/upload/", views.upload_words, name="upload_words"),
    path("word_list/upload/confirm/", views.confirm_import, name="confirm_import"),
]
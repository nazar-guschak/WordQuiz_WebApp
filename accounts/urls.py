from django.urls import path
from django.contrib.auth import views as auth_views
from .forms import EmailOrUsernameAuthenticationForm
from . import views

app_name = "accounts"

urlpatterns = [
    # Sign up
    path("signup/", views.signup, name="signup"),

    # Login / Logout
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),

    # Password change (for logged-in users)
    path("password_change/", auth_views.PasswordChangeView.as_view(
        template_name="accounts/password_change.html"
    ), name="password_change"),
    path("password_change/done/", auth_views.PasswordChangeDoneView.as_view(
        template_name="accounts/password_change_done.html"
    ), name="password_change_done"),

    # Password reset (forgot password)
    path("password_reset/", auth_views.PasswordResetView.as_view(
        template_name="accounts/password_reset.html"
    ), name="password_reset"),
    path("password_reset/done/", auth_views.PasswordResetDoneView.as_view(
        template_name="accounts/password_reset_done.html"
    ), name="password_reset_done"),
    path("reset/<uidb64>/<token>/", auth_views.PasswordResetConfirmView.as_view(
        template_name="accounts/password_reset_confirm.html"
    ), name="password_reset_confirm"),
    path("reset/done/", auth_views.PasswordResetCompleteView.as_view(
        template_name="accounts/password_reset_complete.html"
    ), name="password_reset_complete"),
]

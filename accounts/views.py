from django.shortcuts import render, redirect
from django.contrib.auth import login, logout, authenticate

from django.contrib import messages

from .forms import SignUpForm, LoginForm

def login_view(request):
    """
    Custom login view that accepts EITHER username OR email
    in the 'username' field.
    """
    if request.method == "POST":
        form = LoginForm(request.POST)
        if form.is_valid():
            login_value = form.cleaned_data["username"]
            password = form.cleaned_data["password"]

            user = None

            # 1) Try as username
            user = authenticate(request, username=login_value, password=password)

            # 2) If that fails, try as email
            if user is None:
                from django.contrib.auth.models import User
                try:
                    user_obj = User.objects.get(email__iexact=login_value)
                except User.DoesNotExist:
                    user_obj = None

                if user_obj is not None:
                    user = authenticate(
                        request,
                        username=user_obj.username,
                        password=password,
                    )

            if user is not None:
                login(request, user)
                return redirect("quiz:index")
            else:
                # Add a non-field error shown at the top of the form
                form.add_error(None, "Invalid email/username or password.")
    else:
        form = LoginForm()

    return render(request, "accounts/login.html", {"form": form})


def signup(request):
    if request.method == "POST":
        form = SignUpForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)  # auto-login after signup
            return redirect("quiz:index")
    else:
        form = SignUpForm()

    return render(request, "accounts/signup.html", {"form": form})


def logout_view(request):
    """
    Logs out the user and redirects to home.
    Accepts GET (link in navbar) and POST (if you ever use a form).
    """
    logout(request)
    return redirect("quiz:index")  # or "quiz:index" if you prefer

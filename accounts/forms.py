from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.models import User
from django.contrib.auth import authenticate

class LoginForm(forms.Form):
    username = forms.CharField(
        label="Email or Username",
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Email or Username",
        })
    )
    password = forms.CharField(
        label="Password",
        widget=forms.PasswordInput(attrs={
            "class": "form-control",
            "placeholder": "Password",
        })
    )


class SignUpForm(UserCreationForm):
    email = forms.EmailField(required=True)

    class Meta:
        model = User
        fields = ["username", "email", "password1", "password2"]
        labels = {
            "username": "Username",
            "email": "Email address",
            "password1": "Password",
            "password2": "Confirm password",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].widget.attrs.update({
            "class": "form-control",
            "placeholder": "Choose a username",
        })
        self.fields["email"].widget.attrs.update({
            "class": "form-control",
            "placeholder": "Your email",
        })
        self.fields["password1"].widget.attrs.update({
            "class": "form-control",
            "placeholder": "Create a password",
        })
        self.fields["password2"].widget.attrs.update({
            "class": "form-control",
            "placeholder": "Repeat password",
        })



class EmailOrUsernameAuthenticationForm(AuthenticationForm):
    username = forms.CharField(
        label="Email or Username",
        widget=forms.TextInput(attrs={'class': 'form-control'})
    )

    def clean(self):
        login_value = self.cleaned_data.get('username')
        password = self.cleaned_data.get('password')

        # Try username first
        user = authenticate(self.request, username=login_value, password=password)
        if user is not None:
            self.confirm_login_allowed(user)
            return self.cleaned_data

        # Try email
        try:
            user_obj = User.objects.get(email=login_value)
            user = authenticate(self.request, username=user_obj.username, password=password)
            if user is not None:
                self.confirm_login_allowed(user)
                return self.cleaned_data
        except User.DoesNotExist:
            pass

        # If both fail
        raise forms.ValidationError("Invalid login credentials")


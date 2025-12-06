from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth import authenticate, get_user_model

User = get_user_model()

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


class ChangeEmailForm(forms.Form):
    current_password = forms.CharField(
        label="Current password",
        widget=forms.PasswordInput(attrs={"class": "form-control"})
    )

    new_email = forms.EmailField(
        label="New email address",
        widget=forms.EmailInput(attrs={"class": "form-control"})
    )

    def __init__(self, *args, user=None, **kwargs):
        """
        We pass the logged-in user from the view so we can:
        - check their password
        - exclude their own email when checking uniqueness
        """
        self.user = user
        super().__init__(*args, **kwargs)

    def clean_current_password(self):
        pwd = self.cleaned_data.get("current_password")
        if not self.user or not self.user.check_password(pwd):
            raise forms.ValidationError("Incorrect password.")
        return pwd

    def clean_new_email(self):
        email = self.cleaned_data.get("new_email")
        # Don't block if it's the same as current email
        if email and email != self.user.email:
            if User.objects.filter(email=email).exists():
                raise forms.ValidationError("This email is already in use.")
        return email
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { Alert, Button, Field, Input } from "@/components/ui";
function RegistrationPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  useEffect(() => {
    const loadCaptcha = async () => {
      try {
        const res = await api.get("/api/v1/auth/captcha");
        setCaptchaToken(res.token);
        setCaptchaQuestion(res.question);
        setCaptchaAnswer("");
      } catch {
        setCaptchaQuestion("Failed to load CAPTCHA");
      }
    };
    loadCaptcha();
  }, []);
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!username.trim() || !email.trim() || !fullName.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const answer = parseInt(captchaAnswer, 10);
    if (Number.isNaN(answer)) {
      setError("Please answer the CAPTCHA.");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/api/v1/auth/register", {
        username: username.trim(),
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        captchaToken,
        captchaAnswer: answer
      });
      setSuccess("Registration submitted successfully! Your account is pending admin approval. You will be able to sign in once approved.");
      setUsername("");
      setEmail("");
      setFullName("");
      setPassword("");
      setConfirmPassword("");
      setCaptchaAnswer("");
    } catch (cause) {
      setError(errorMessage(cause, "Registration failed. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };
  return <div className="flex min-h-screen bg-slate-900">
      {
    /* Brand panel */
  }
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div
    className="absolute inset-0 opacity-90"
    style={{
      background: "radial-gradient(circle at 20% 20%, #1e40af 0%, transparent 55%), radial-gradient(circle at 80% 70%, #0f766e 0%, transparent 50%)"
    }}
    aria-hidden
  />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur">
            <Package className="h-6 w-6" />
          </span>
          <span className="text-xl font-semibold text-white">Stockwise</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight text-white">
            Join the team.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-blue-100/80">
            Create your account to access the inventory management system. An administrator will review
            and approve your registration before you can sign in.
          </p>
        </div>

        <p className="relative text-xs text-blue-200/50">Inventory Management System</p>
      </div>

      {
    /* Form panel */
  }
      <div className="flex w-full items-center justify-center bg-white px-6 py-12 sm:px-12 lg:w-[30rem] lg:shrink-0">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Package className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold text-slate-900">Stockwise</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Create account</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Fill in your details to request access.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
            {error ? <Alert tone="danger">
                {error}
              </Alert> : null}

            {success ? <Alert tone="success">
                {success}
              </Alert> : null}

            <Field label="Full Name" htmlFor="fullName" required>
              <Input
    id="fullName"
    name="fullName"
    autoComplete="name"
    autoFocus
    value={fullName}
    onChange={(event) => setFullName(event.target.value)}
    placeholder="John Doe"
    disabled={isSubmitting}
  />
            </Field>

            <Field label="Email" htmlFor="email" required>
              <Input
    id="email"
    name="email"
    type="email"
    autoComplete="email"
    value={email}
    onChange={(event) => setEmail(event.target.value)}
    placeholder="john@company.com"
    disabled={isSubmitting}
  />
            </Field>

            <Field label="Username" htmlFor="username" required>
              <Input
    id="username"
    name="username"
    autoComplete="username"
    value={username}
    onChange={(event) => setUsername(event.target.value)}
    placeholder="johndoe"
    disabled={isSubmitting}
  />
            </Field>

            <Field label="Password" htmlFor="password" required>
              <Input
    id="password"
    name="password"
    type="password"
    autoComplete="new-password"
    value={password}
    onChange={(event) => setPassword(event.target.value)}
    placeholder="••••••••"
    disabled={isSubmitting}
  />
            </Field>

            <Field label="Confirm Password" htmlFor="confirmPassword" required>
              <Input
    id="confirmPassword"
    name="confirmPassword"
    type="password"
    autoComplete="new-password"
    value={confirmPassword}
    onChange={(event) => setConfirmPassword(event.target.value)}
    placeholder="••••••••"
    disabled={isSubmitting}
  />
            </Field>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">CAPTCHA</label>
              <div className="flex items-center gap-3">
                <span className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-800">
                  {captchaQuestion || "Loading..."}
                </span>
              </div>
              <Input
    id="captchaAnswer"
    name="captchaAnswer"
    type="text"
    inputMode="numeric"
    value={captchaAnswer}
    onChange={(event) => setCaptchaAnswer(event.target.value)}
    placeholder="Your answer"
    disabled={isSubmitting}
    required
  />
            </div>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              {isSubmitting ? "Submitting\u2026" : "Create Account"}
            </Button>

            <p className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link to="/login" className="text-brand-600 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>;
}
export {
  RegistrationPage
};

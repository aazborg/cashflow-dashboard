import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm bg-white border border-[color:var(--border)] rounded-lg p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Anmelden</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Trag deine eingeladene E-Mail ein — du bekommst einen Login-Link.
        </p>
        <div className="mt-5">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

/**
 * Auth Route - /auth
 *
 * Shows the authentication page for login/register.
 * Users are redirected here when not authenticated.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthPage } from "@/pages/AuthPage";

export const Route = createFileRoute("/auth/")({
  component: AuthRouteComponent,
});

function AuthRouteComponent() {
  const { isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect to home if already logged in
  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate({ to: "/" });
    }
  }, [isLoading, isLoggedIn, navigate]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Don't render auth page if already logged in (will redirect)
  if (isLoggedIn) {
    return null;
  }

  return <AuthPage />;
}
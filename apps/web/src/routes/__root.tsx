/**
 * Root Route - Layout wrapper for entire app
 *
 * Contains the persistent sidebar and outlet for child routes.
 * Handles auth guard - redirects to /auth if not logged in.
 */
import { createRootRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { ChatSidebarContainer } from "@/components/chat";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const { isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();

  // Auth guard - redirect to /auth if not logged in
  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      // Check if we're already on the auth page to avoid redirect loop
      if (window.location.pathname !== "/auth") {
        navigate({ to: "/auth" });
      }
    }
  }, [isLoading, isLoggedIn, navigate]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-base">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  // If not logged in, just render the outlet (auth page)
  if (!isLoggedIn) {
    return (
      <div className="relative h-screen flex overflow-hidden bg-zinc-50">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Outlet />
        </div>
        {process.env.NODE_ENV === "development" && (
          <TanStackRouterDevtools position="bottom-right" />
        )}
      </div>
    );
  }

  // Logged in - show full app with sidebar
  return (
    <ChatProvider>
      <div className="relative h-screen flex overflow-hidden bg-zinc-50">
        {/* Persistent Sidebar */}
        <ChatSidebarContainer />

        {/* Routed Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Outlet />
        </div>

        {/* Router DevTools (only in development) */}
        {process.env.NODE_ENV === "development" && (
          <TanStackRouterDevtools position="bottom-right" />
        )}
      </div>
    </ChatProvider>
  );
}

/**
 * Root Route - Layout wrapper for entire app
 *
 * Contains the persistent sidebar and outlet for child routes.
 */
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ChatProvider } from "@/contexts/ChatContext";
import { ChatSidebarContainer } from "@/components/chat";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
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

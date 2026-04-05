/**
 * LoadingMessages - Skeleton placeholder for chat loading state
 *
 * Shown when loading a chat for the first time (no cached data).
 * Mimics the layout of actual messages for a smoother UX.
 */
export function LoadingMessages() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-[720px] mx-auto space-y-6 px-4">
        {/* User message skeleton */}
        <div className="flex flex-row-reverse gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-200 animate-pulse" />
          <div className="max-w-[80%] space-y-2">
            <div className="h-4 w-48 bg-zinc-200 rounded animate-pulse" />
            <div className="h-4 w-32 bg-zinc-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Assistant message skeleton */}
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-100 animate-pulse" />
          <div className="flex-1 max-w-[80%] space-y-2.5">
            <div className="h-4 w-full bg-zinc-100 rounded animate-pulse" />
            <div className="h-4 w-[90%] bg-zinc-100 rounded animate-pulse" />
            <div className="h-4 w-[60%] bg-zinc-100 rounded animate-pulse" />
          </div>
        </div>

        {/* Another assistant message skeleton */}
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-100 animate-pulse" />
          <div className="flex-1 max-w-[80%] space-y-2.5">
            <div className="h-4 w-[80%] bg-zinc-100 rounded animate-pulse" />
            <div className="h-4 w-[70%] bg-zinc-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

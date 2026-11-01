import { Suspense } from "react";
import { AppHeader, HeaderFallback } from "./app-header";
import { Chat } from "./chat";
import { requireUser } from "@/lib/session";

// Everything user-specific renders inside <Suspense>, so Next can serve the static shell
// instantly and stream the personalised part (Cache Components model).
export default function HomePage() {
  return (
    <>
      <Suspense fallback={<HeaderFallback />}>
        <AppHeader />
      </Suspense>
      <Suspense fallback={<div className="flex-1" />}>
        <ChatForUser />
      </Suspense>
    </>
  );
}

async function ChatForUser() {
  const user = await requireUser();
  return <Chat firstName={user.name.split(" ")[0]} />;
}

import { AuthProvider } from "@/components/AuthProvider";

// Auth-aware app shell. Everything under this route group (home, character,
// world, login, signup, start, auth, admin) is wrapped in <AuthProvider> so
// useSession() works. The route group adds NO URL segment.
//
// The marketing routes (/, /about, /privacy, /terms, /contact, /demo, /plaza)
// deliberately sit OUTSIDE this group so they never bundle @supabase/supabase-js.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

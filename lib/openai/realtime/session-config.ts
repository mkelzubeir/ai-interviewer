/**
 * Application-side entry point for the Realtime session configuration.
 *
 * The implementation lives under `supabase/functions/_shared/` because that is
 * the directory the Supabase CLI bundles for the Edge Function; re-exporting it
 * here keeps a single source of truth while leaving app imports unchanged.
 */
export {
  CLIENT_SECRET_TTL_SECONDS,
  REALTIME_CLIENT_SECRET_URL,
  buildInterviewerInstructions,
  buildRealtimeSessionRequest,
  type InterviewerContext,
  type RealtimeSessionOptions,
} from "@/supabase/functions/_shared/realtime-session";

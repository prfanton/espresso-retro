import { getSupabaseServerClient } from '@/lib/supabase/server'
import RetroBoard from '@/components/board/RetroBoard'
import type { Session } from '@/types/retro'

export default async function RetroPage(props: PageProps<'/retro/[sessionId]'>) {
  const { sessionId } = await props.params
  const supabase = await getSupabaseServerClient()

  // A first-time invitee has no auth cookie yet, so this runs as `anon`, which
  // sessions_select (authenticated only) doesn't allow. Don't 404 here: pass
  // null and let RetroBoard load the session after anonymous sign-in, and show
  // "not found" only if it's still missing then.
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  return <RetroBoard sessionId={sessionId} session={(data as Session | null) ?? null} />
}

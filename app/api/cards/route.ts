import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const MAX_CARD_LENGTH = 500

export async function POST(req: NextRequest) {
  const { session_id, column_id, content, position } = await req.json()

  if (!session_id || !column_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await getSupabaseServerClient()

  // The author is the authenticated user — never a client-supplied author_key.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const safeContent = (typeof content === 'string' ? content : '').slice(0, MAX_CARD_LENGTH)

  const { data, error } = await supabase
    .from('cards')
    .insert({
      session_id,
      column_id,
      author_key: user.id,
      content: safeContent,
      position: position ?? 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

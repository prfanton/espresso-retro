import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const MAX_TITLE_LENGTH = 80

export async function POST(req: NextRequest) {
  const { title, format } = await req.json()

  const supabase = await getSupabaseServerClient()

  // Identity is server-authoritative: the facilitator is the authenticated
  // (anonymous) user, never a value the client supplies.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const safeTitle = (typeof title === 'string' ? title.trim() : '').slice(0, MAX_TITLE_LENGTH)

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      facilitator_id: user.id,
      title: safeTitle || 'Team Retrospective',
      format: format || 'wwwdw',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

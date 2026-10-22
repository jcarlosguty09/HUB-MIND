// HUB MIND — create-user (server-side role enforcement)
// Deploy this Edge Function in Supabase after reviewing the PR.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ message: 'Método no permitido' }, 405)
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ message: 'Unauthorized' }, 401)

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller }, error: callerError } = await supabaseUser.auth.getUser()
    if (callerError || !caller) return jsonResponse({ message: 'Unauthorized' }, 401)

    const { data: organizationId, error: orgError } = await supabaseUser.rpc('current_organization_id')
    if (orgError || !organizationId) {
      return jsonResponse({ message: 'No se encontró una organización activa' }, 403)
    }

    const { data: callerMembership, error: membershipError } = await supabaseUser
      .from('organization_members')
      .select('role,is_active')
      .eq('organization_id', organizationId)
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .single()
    if (membershipError || !callerMembership) return jsonResponse({ message: 'Forbidden' }, 403)
    if (!['master_admin', 'admin', 'coach'].includes(callerMembership.role)) {
      return jsonResponse({ message: 'Forbidden' }, 403)
    }

    const { email, password, role, full_name, phone, lead_id } = await req.json()
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return jsonResponse({ message: 'Email y contraseña requeridos' }, 400)
    }
    const requestedRole = role === 'atleta' ? 'member' : (role || 'member')
    const allowedRoles = ['member', 'coach', 'sales', 'admin']
    if (!allowedRoles.includes(requestedRole)) return jsonResponse({ message: 'Rol inválido' }, 400)

    // Master admin may create privileged users; admin and coach may only create members.
    if (callerMembership.role !== 'master_admin' && requestedRole !== 'member') {
      return jsonResponse({ message: 'Solo el Admin Maestro puede crear roles administrativos' }, 403)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    let crmLead: { id: string; converted_user_id: string | null } | null = null
    if (lead_id) {
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('crm_leads')
        .select('id,organization_id,converted_user_id,full_name,email,phone')
        .eq('id', lead_id)
        .eq('organization_id', organizationId)
        .single()
      if (leadError || !lead) return jsonResponse({ message: 'Lead no encontrado' }, 404)
      if (lead.converted_user_id) {
        return jsonResponse({ message: 'Este lead ya fue convertido a miembro' }, 409)
      }
      crmLead = lead
    }

    const normalizedEmail = email.trim().toLowerCase()
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail, password, email_confirm: true,
    })
    if (createError || !createdUser.user) {
      return jsonResponse({ message: createError?.message || 'No se pudo crear el usuario' }, 400)
    }
    const userId = createdUser.user.id
    const rollbackUser = async () => {
      try { await supabaseAdmin.auth.admin.deleteUser(userId) }
      catch (rollbackError) { console.error('Rollback auth user error:', rollbackError) }
    }

    const profileData: Record<string, unknown> = {
      id: userId, updated_at: new Date().toISOString(),
    }
    if (full_name) profileData.full_name = full_name
    if (phone) profileData.phone = phone
    const { error: profileError } = await supabaseAdmin.from('profiles')
      .upsert(profileData, { onConflict: 'id' })
    if (profileError) {
      await rollbackUser()
      return jsonResponse({ message: `Error creando perfil: ${profileError.message}` }, 500)
    }

    const { error: orgMemberError } = await supabaseAdmin.from('organization_members').insert({
      organization_id: organizationId, user_id: userId, role: requestedRole, is_active: true,
    })
    if (orgMemberError) {
      await rollbackUser()
      return jsonResponse({ message: `Error asignando organización: ${orgMemberError.message}` }, 500)
    }

    if (crmLead) {
      const now = new Date().toISOString()
      const { error: convertError } = await supabaseAdmin.from('crm_leads').update({
        converted_user_id: userId, stage: 'won', updated_at: now,
      }).eq('id', crmLead.id).eq('organization_id', organizationId)
      if (convertError) {
        console.error('CRM conversion error:', convertError)
      } else {
        await supabaseAdmin.from('crm_activities').insert({
          organization_id: organizationId, lead_id: crmLead.id, type: 'stage_change',
          note: 'Lead convertido a miembro', performed_by: caller.id,
        })
        await supabaseAdmin.from('crm_tasks').update({ status: 'cancelled' })
          .eq('organization_id', organizationId).eq('lead_id', crmLead.id).eq('status', 'pending')
      }
    }

    return jsonResponse({
      id: userId, email: normalizedEmail,
      role: requestedRole === 'member' ? 'atleta' : requestedRole,
      organization_id: organizationId,
      full_name: full_name || null, phone: phone || null,
      converted_from_lead: lead_id || null,
    })
  } catch (error) {
    console.error('create-user unexpected error:', error)
    return jsonResponse({ message: error instanceof Error ? error.message : 'Error interno' }, 500)
  }
})

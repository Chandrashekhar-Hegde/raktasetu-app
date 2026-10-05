-- DPDP: a donor who withdrew consent must not be matched or pinged.
-- Same signature as 2026-07-18-hospital-donor-visibility.sql; CREATE OR REPLACE keeps grants.
CREATE OR REPLACE FUNCTION public.hospital_visible_on_call_donors(p_blood_groups text[])
 RETURNS TABLE(id uuid, blood_group text, latitude double precision, longitude double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, u.blood_group, u.latitude, u.longitude
  FROM users u
  WHERE u.role = 'donor'
    AND u.account_status = 'active'
    AND u.is_on_call = true
    AND u.consent_given = true
    AND u.deleted_at IS NULL
    AND u.blood_group = ANY (p_blood_groups)
    AND app_role() = 'hospital'
    AND app_hospital_id() IS NOT NULL;
$function$;

-- Donors who already withdrew consent before this fix go off call now.
UPDATE users SET is_on_call = false, updated_at = NOW()
WHERE role = 'donor' AND consent_given = false AND is_on_call = true;

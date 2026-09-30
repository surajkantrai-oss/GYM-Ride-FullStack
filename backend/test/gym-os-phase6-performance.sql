\set ON_ERROR_STOP on
BEGIN;
SELECT g.id gym_id,g.owner_id actor_id,p.id plan_id,p.name plan_name,p.code plan_code,p.duration_type,p.duration_value,p.price_minor,p.currency,b.id branch_id
FROM gyms g JOIN gym_os_membership_plans p ON p.gym_id=g.id JOIN gym_branches b ON b.gym_id=g.id
LIMIT 1 \gset

INSERT INTO gym_members(id,gym_id,primary_branch_id,member_code,first_name,phone,status,created_by_user_id,created_at,updated_at)
SELECT gen_random_uuid(),:'gym_id',:'branch_id','PERF-'||n,'Performance '||n,'+9188'||lpad(n::text,8,'0'),'ACTIVE',:'actor_id',now(),now() FROM generate_series(1,1000)n;
INSERT INTO gym_os_memberships(id,gym_id,member_id,membership_plan_id,status,start_date,end_date,plan_name_snapshot,plan_code_snapshot,duration_type_snapshot,duration_value_snapshot,price_minor_snapshot,currency_snapshot,branch_ids_snapshot,created_by_user_id,created_at,updated_at)
SELECT gen_random_uuid(),:'gym_id',m.id,:'plan_id','ACTIVE',current_date-60,current_date+30,:'plan_name',:'plan_code',:'duration_type',:'duration_value',:'price_minor',:'currency',ARRAY[:'branch_id']::uuid[],:'actor_id',now(),now() FROM gym_members m WHERE m.gym_id=:'gym_id' AND m.member_code LIKE 'PERF-%';
INSERT INTO gym_os_attendances(id,gym_id,member_id,membership_id,branch_id,status,check_in_at,check_out_at,check_in_method,check_out_method,recorded_by_user_id,created_at,updated_at)
SELECT gen_random_uuid(),:'gym_id',m.id,ms.id,:'branch_id','CHECKED_OUT',now()-(d||' days')::interval,now()-(d||' days')::interval+interval '1 hour','MANUAL','MANUAL',:'actor_id',now(),now() FROM gym_members m JOIN gym_os_memberships ms ON ms.member_id=m.id CROSS JOIN generate_series(0,29)d WHERE m.gym_id=:'gym_id' AND m.member_code LIKE 'PERF-%';
INSERT INTO gym_os_member_charges(id,gym_id,member_id,membership_id,type,description,amount_minor,currency,due_date,status,created_by_user_id,created_at,updated_at)
SELECT gen_random_uuid(),:'gym_id',m.id,ms.id,'MEMBERSHIP','Performance charge',:'price_minor',:'currency',current_date-10,'UNPAID',:'actor_id',now(),now() FROM gym_members m JOIN gym_os_memberships ms ON ms.member_id=m.id WHERE m.gym_id=:'gym_id' AND m.member_code LIKE 'PERF-%';

EXPLAIN (ANALYZE,BUFFERS) SELECT status,count(*) FROM gym_os_memberships WHERE gym_id=:'gym_id' GROUP BY status;
EXPLAIN (ANALYZE,BUFFERS) SELECT date_trunc('day',check_in_at AT TIME ZONE 'Asia/Kolkata'),count(*),count(DISTINCT member_id) FROM gym_os_attendances WHERE gym_id=:'gym_id' AND check_in_at>=now()-interval '30 days' GROUP BY 1;
EXPLAIN (ANALYZE,BUFFERS) SELECT extract(hour FROM check_in_at AT TIME ZONE 'Asia/Kolkata'),count(*) FROM gym_os_attendances WHERE gym_id=:'gym_id' AND check_in_at>=now()-interval '30 days' GROUP BY 1;
EXPLAIN (ANALYZE,BUFFERS) SELECT m.id FROM gym_members m JOIN gym_os_memberships ms ON ms.member_id=m.id AND ms.status='ACTIVE' LEFT JOIN gym_os_attendances a ON a.member_id=m.id WHERE m.gym_id=:'gym_id' GROUP BY m.id,ms.start_date HAVING max(a.check_in_at)<now()-interval '14 days';
EXPLAIN (ANALYZE,BUFFERS) SELECT count(*) FROM gym_os_memberships WHERE gym_id=:'gym_id' AND end_date>=current_date AND end_date<current_date+30;
EXPLAIN (ANALYZE,BUFFERS) SELECT sum(amount_minor) FROM gym_os_member_charges WHERE gym_id=:'gym_id' AND status IN ('UNPAID','PARTIALLY_PAID');
EXPLAIN (ANALYZE,BUFFERS) SELECT b.id,count(DISTINCT a.member_id) FROM gym_branches b LEFT JOIN gym_os_attendances a ON a.branch_id=b.id AND a.check_in_at>=now()-interval '30 days' WHERE b.gym_id=:'gym_id' GROUP BY b.id;
ROLLBACK;

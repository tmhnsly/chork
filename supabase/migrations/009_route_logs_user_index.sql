-- 009: Index on route_logs(user_id)
--
-- Speeds up getAllLogsForUser and any query that filters logs by user.
-- Existing indexes on route_logs cover (route_id, completed) and (gym_id);
-- there is no user-only index so a query like "all logs for user X" does
-- a sequential scan on larger gyms.

create index if not exists route_logs_user_idx on route_logs (user_id);

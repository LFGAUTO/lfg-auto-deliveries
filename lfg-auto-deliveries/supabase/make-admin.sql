-- Run AFTER you have created the admin login in Authentication -> Users
-- (email jessica@lfgauto.app). This promotes that account to admin.
-- The app displays this account generically as "Admin" (first_name below),
-- while the login itself stays jessica@lfgauto.app / username "Jessica".
update public.profiles
set role = 'admin', first_name = 'Admin', last_name = '', username = 'Jessica'
where email = 'jessica@lfgauto.app';

-- Check it worked (should show role = admin):
select username, email, role, status from public.profiles where email = 'jessica@lfgauto.app';

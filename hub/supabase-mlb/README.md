# MLB data Supabase migrations

This directory tracks migrations for the separate MLB data project. It is intentionally separate from `supabase/migrations`, which targets the primary SlipSurge application project.

Production project reference: `emllcbynioctxkbsdlwp`

Apply these migrations only to the MLB data project and in filename order. Application access to this project is server-side through the service-role client; the data tables, internal views, and privileged maintenance functions are not public client surfaces.

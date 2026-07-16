/*
  PostgreSQL's built-in function default grants EXECUTE to PUBLIC globally.
  A schema-scoped default REVOKE cannot subtract that global default, so make
  future postgres-owned functions fail closed in every schema. Migrations must
  continue to grant each intended API role explicitly.
*/

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Suma Apple a los proveedores OAuth ya soportados (Google/Microsoft, ver
-- 20260826000000_auth_onboarding). ALTER TYPE ... ADD VALUE es aditivo puro
-- - no requiere backfill ni tocar filas existentes de "oauth_accounts".
ALTER TYPE "OAuthProvider" ADD VALUE 'APPLE';

process.env.JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'test-secret-key';
process.env.USE_PG_MEM = process.env.USE_PG_MEM || 'true';
process.env.NODE_ENV = 'test';

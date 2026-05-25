module.exports = {
  postgres: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'webgis',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    max: 10,
    idleTimeoutMillis: 30000,
  },

  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'neo4j123456',
  },

  amapKey: process.env.AMAP_KEY || 'your_amap_key_here',

  server: {
    port: parseInt(process.env.PORT || '5000'),
  },
};

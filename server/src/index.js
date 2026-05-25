const express = require('express');
const cors = require('cors');
const config = require('./config');
const apiRoutes = require('./routes/api');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

app.listen(config.server.port, () => {
  console.log(`[Server] WebGIS 服务已启动: http://localhost:${config.server.port}`);
  console.log(`[Server] API 基础路径: http://localhost:${config.server.port}/api`);
});

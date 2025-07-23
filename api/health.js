import express from 'express';
const r = express.Router();
r.get('/health', (_req, res) =>
  res.json({
    status: 'ok',
    version: process.env.npm_package_version,
    uptime: process.uptime()
  })
);
export default r; 
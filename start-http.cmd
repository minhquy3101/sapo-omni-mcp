@echo off
set MCP_TRANSPORT=http
node --env-file="%~dp0.env" "%~dp0dist\index.js"

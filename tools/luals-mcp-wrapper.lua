local function escape_json(value)
  value = tostring(value or "")
  value = value:gsub("\\", "\\\\"):gsub('"', '\\"'):gsub("\n", "\\n"):gsub("\r", "\\r")
  return value
end

local repo_dir = arg[1] or ""
local entries = {}

for i = 2, #arg do
  local file, symbol, line = arg[i]:match("([^\t]*)\t([^\t]*)\t?([^\t]*)")
  if file and symbol then
    entries[#entries + 1] = {
      file = file,
      symbol = symbol,
      line = tonumber(line) or 0,
    }
  end
end

io.write('{"tool":"LuaLS MCP","status":"available","reason":"Lua wrapper executed; use vendor/lua-language-server for full language-server deployment","repoDir":"')
io.write(escape_json(repo_dir))
io.write('","entries":[')
for index, entry in ipairs(entries) do
  if index > 1 then io.write(",") end
  io.write('{"file":"')
  io.write(escape_json(entry.file))
  io.write('","symbol":"')
  io.write(escape_json(entry.symbol))
  io.write('","language":"lua","lineHint":')
  io.write(tostring(entry.line))
  io.write(',"callers":[],"callees":[],"source":"luals-mcp-wrapper"}')
end
io.write("]}")

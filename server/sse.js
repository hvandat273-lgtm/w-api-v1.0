export function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function parseSseChunk(buffer, chunkText) {
  const nextBuffer = buffer + chunkText;
  const parts = nextBuffer.split(/\r?\n\r?\n/);
  return {
    events: parts.slice(0, -1).map(parseSseEvent).filter(Boolean),
    buffer: parts.at(-1) || "",
  };
}

function parseSseEvent(raw) {
  const dataLines = [];
  let event = "message";
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  return { event, data: dataLines.join("\n") };
}

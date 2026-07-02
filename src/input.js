function parseLine(line) {
  const fields = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

export function parsePages(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const f = parseLine(line);
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = (f[i] ?? '').trim(); });
    return row;
  });
}

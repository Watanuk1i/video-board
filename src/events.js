const clients = new Set();

function subscribe(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
  res.write('retry: 3000\n\n');
}

function broadcast(type, payload) {
  const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch {
      clients.delete(res);
    }
  }
}

module.exports = { subscribe, broadcast, live: () => clients };

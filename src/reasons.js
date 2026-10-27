// Справочник «нарушений» доски позора. Ключ хранится в плашке и жалобе,
// остальное отдаётся клиенту через /api/bootstrap, чтобы подписи не разъезжались.
const REASONS = {
  troll: { label: 'Троллинг', ultimate: 'Ультимативный тролль', color: '#ff2d6f' },
  ruiner: { label: 'Мешает играть', ultimate: 'Ультимативный душный', color: '#ff5722' },
  afk: { label: 'АФК и срыв раунда', ultimate: 'Ультимативный АФК', color: '#ffb302' },
  toxic: { label: 'Токсик и оскорбления', ultimate: 'Ультимативный токсик', color: '#ff3b3b' },
  cheater: { label: 'Читы и эксплойты', ultimate: 'Ультимативный читер', color: '#a24bff' },
  sus: { label: 'Подозрительные ходы', ultimate: 'Ультимативный подозрительный', color: '#2fd0c5' },
  noob: { label: 'Играет плохо', ultimate: 'Ультимативный балласт', color: '#7ee787' },
};

const reason = (key) => REASONS[key] || REASONS.sus;

module.exports = { REASONS, reason };

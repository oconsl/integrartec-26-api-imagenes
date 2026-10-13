// Logs en JSON por stdout: el CloudWatch agent (EC2) o Lambda los mandan a
// CloudWatch Logs, donde se pueden filtrar por campo (ej. { $.level = "error" }).
const write = (level, message, extra = {}) => {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
};

export const logger = {
  info: (message, extra) => write('info', message, extra),
  warn: (message, extra) => write('warn', message, extra),
  error: (message, extra) => write('error', message, extra),
};

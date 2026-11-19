// Estatísticas de uso anônimas via GoatCounter (sem cookies, sem dados pessoais).
// O app usa rotas por hash (#/ler/GEN/1), que o GoatCounter ignora por padrão,
// então as visitas são contadas manualmente a cada troca de rota.
// Painel: https://bibliacatolica.goatcounter.com/

const ENDPOINT = 'https://bibliacatolica.goatcounter.com/count';
const SCRIPT = 'https://gc.zgo.at/count.js';

const queue = [];
let ready = false;

// Desliga a contagem automática; o próprio count.js lê esta configuração ao carregar.
window.goatcounter = { no_onload: true };

function flush() {
  if (!ready || !window.goatcounter?.count) return;
  while (queue.length) {
    try {
      window.goatcounter.count(queue.shift());
    } catch {
      /* estatística nunca deve quebrar o app */
    }
  }
}

function load() {
  if (!navigator.onLine) {
    window.addEventListener('online', load, { once: true });
    return;
  }
  const s = document.createElement('script');
  s.async = true;
  s.src = SCRIPT;
  s.dataset.goatcounter = ENDPOINT;
  s.onload = () => {
    ready = true;
    flush();
  };
  document.head.append(s);
}
load();

// Caminho normalizado da rota atual, sem dados do usuário (ex.: termos de busca).
function routePath() {
  const [path] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [name, a, b] = parts;
  switch (name) {
    case undefined:
      return '/';
    case 'ler': // agrupa por capítulo, ignorando o versículo
      return `/ler/${a || 'GEN'}/${+b || 1}`;
    case 'livros':
    case 'planos':
      return a ? `/${name}/${a}` : `/${name}`;
    default:
      return `/${name}`;
  }
}

let first = true;

/** Conta uma visualização da tela atual. */
export function trackView() {
  // Só a primeira visualização carrega a origem real (document.referrer);
  // as navegações internas seguintes não repetem essa origem.
  queue.push({ path: routePath(), title: document.title, referrer: first ? undefined : () => '' });
  if (first) {
    first = false;
    const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    trackEvent(installed ? 'abertura/app-instalado' : 'abertura/navegador');
  }
  flush();
}

/** Conta um evento (uso de um recurso), ex.: trackEvent('versiculo/copiar'). */
export function trackEvent(name) {
  queue.push({ path: name, title: name, event: true });
  flush();
}

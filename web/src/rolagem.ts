/**
 * Fade de rolagem global: qualquer elemento com data-rolavel="y" ou "x" recebe data-fade="inicio" | "fim" | "ambos"
 * conforme houver conteúdo escondido em cada ponta (o CSS desenha o degradê). Sem conteúdo extra, sem fade.
 * Novos elementos são detectados sozinhos (MutationObserver), então basta pôr o atributo no container.
 */
const vistos = new WeakSet<HTMLElement>()

function atualizar(el: HTMLElement) {
  const x = el.dataset.rolavel === 'x'
  const pos = x ? el.scrollLeft : el.scrollTop
  const total = x ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight
  const inicio = pos > 8
  const fim = total - pos > 8
  const valor = inicio && fim ? 'ambos' : inicio ? 'inicio' : fim ? 'fim' : ''
  if ((el.dataset.fade ?? '') !== valor) {
    if (valor) el.dataset.fade = valor
    else delete el.dataset.fade
  }
}

function observar(el: HTMLElement, redim: ResizeObserver) {
  if (vistos.has(el)) return
  vistos.add(el)
  el.addEventListener('scroll', () => atualizar(el), { passive: true })
  // faixa horizontal: a roda do mouse (vertical) rola para o lado enquanto houver conteúdo naquela direção;
  // nas pontas, devolve a rolagem para a página (não prende o usuário)
  if (el.dataset.rolavel === 'x') {
    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.ctrlKey) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      const indo = e.deltaY > 0
      if ((indo && el.scrollLeft >= max - 1) || (!indo && el.scrollLeft <= 0)) return
      e.preventDefault()
      el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY
    }, { passive: false })
  }
  redim.observe(el)
  Array.from(el.children).forEach((c) => redim.observe(c))
  atualizar(el)
}

export function instalarFadeDeRolagem() {
  const redim = new ResizeObserver((entradas) => {
    entradas.forEach((e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-rolavel]')
      if (el) atualizar(el)
    })
  })
  const varrer = () => document.querySelectorAll<HTMLElement>('[data-rolavel]').forEach((el) => {
    observar(el, redim)
    atualizar(el)
  })
  const mut = new MutationObserver(() => varrer())
  mut.observe(document.body, { childList: true, subtree: true })
  varrer()
  return () => { mut.disconnect(); redim.disconnect() }
}

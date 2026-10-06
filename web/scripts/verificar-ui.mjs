// Regras globais da interface (rodam antes do build):
// nenhum picker/diálogo nativo do navegador — use os componentes de src/components/ui.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROIBIDOS = [
  [/type=["'](date|time|datetime-local|month|week|color)["']/, 'picker nativo: use SeletorData (ou um componente de src/components/ui)'],
  [/<select[\s>]/, '<select> nativo: use Selecao'],
  [/<datalist[\s>]/, '<datalist> nativo: use Selecao'],
  [/window\.(prompt|confirm|alert)\s*\(/, 'diálogo nativo: use useDialogoTexto / Modal do Design System'],
]
const erros = []
function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) varrer(p)
    else if (/\.(tsx|ts)$/.test(nome)) {
      readFileSync(p, 'utf8').split('\n').forEach((linha, i) => {
        if (/^\s*(\*|\/\/|\/\*)/.test(linha)) return // comentários
        for (const [rx, msg] of PROIBIDOS) if (rx.test(linha)) erros.push(`${p}:${i + 1}  ${msg}`)
      })
    }
  }
}
varrer(fileURLToPath(new URL('../src', import.meta.url)))
if (erros.length) {
  console.error('Regras de UI violadas:\n' + erros.join('\n'))
  process.exit(1)
}
console.log('Regras de UI ok (sem pickers/diálogos nativos).')

import { createContext, useContext } from 'react'

/** nuvem = versão online (Vercel): sem arquivos de vídeo guardados, sem "abrir pasta", sem login do Instagram. */
export const AmbienteContexto = createContext({ nuvem: false })
export const useNuvem = () => useContext(AmbienteContexto).nuvem

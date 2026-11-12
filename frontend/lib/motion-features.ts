/**
 * Funciones de animación de framer-motion que se cargan después del primer pintado (`LazyMotion` en
 * `components/app-providers.tsx`; plans/plan-buenas-practicas-v0, 1.6; https://motion.dev/docs/react-reduce-bundle-size).
 *
 * `domMax` y no `domAnimation`: el menú lateral usa `layoutId` (el indicador del ítem activo), que es una animación de
 * layout y solo la trae `domMax`.
 */
import { domMax } from 'framer-motion'

export default domMax

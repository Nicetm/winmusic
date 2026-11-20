// Vite resuelve los imports de imagenes a la URL final del archivo.
declare module '*.png' {
  const src: string
  export default src
}

# winMusic

Reproductor de audio y video para Windows, hecho con Electron, React y TypeScript.

by @softkey 2027

## Descarga

El instalador está en [Releases](https://github.com/Nicetm/winmusic/releases/latest). Incluye todo lo necesario (ffmpeg, ffprobe y yt-dlp): no hay que instalar nada aparte.

El instalador no está firmado, así que Windows SmartScreen puede mostrar un aviso. Para seguir: **Más información → Ejecutar de todas formas**.

Desde la versión 1.2.0 la app se actualiza sola: al abrirse busca una versión nueva, la descarga y pregunta si reiniciar para instalarla.

## Funciones

- **Audio y video locales**: mp3, wav, ogg, flac, m4a, aac, mp4, webm, mkv, mov, avi. Los formatos que Chromium no reproduce (HEVC, MKV, etc.) se convierten al vuelo con ffmpeg.
- **YouTube**: buscador en ventana propia; las canciones se agregan a la lista y se reproducen como audio.
- **Listas**: varias listas con nombre, búsqueda, ordenar por nombre o duración, mover o copiar canciones entre listas, importar y exportar `.m3u`. Se pueden arrastrar archivos y carpetas a la ventana.
- **Ecualizador** de 10 bandas con presets, en ventana propia.
- **Visualizador** con cuatro modos (clic sobre el gráfico para cambiar) y colores arcoíris en toda la app.
- **Ahora suena**: título, artista y carátula del archivo, o la miniatura del video de YouTube.
- **Letras sincronizadas** desde [LRCLIB](https://lrclib.net), con ajuste manual de desfase por canción.
- **Ventanas acoplables**: el ecualizador y el buscador se pegan al reproductor y se mueven con él.
- **Modo mini** siempre visible, **ícono en la bandeja del sistema**, tema claro y oscuro, y fundido entre canciones.
- Recuerda la posición de las ventanas, las listas, el volumen y el ecualizador.

## Atajos

| Tecla | Acción |
|---|---|
| `Espacio` | Reproducir / pausa |
| `←` / `→` | Retroceder / adelantar 5 s |
| `↑` / `↓` | Subir / bajar volumen |
| Teclas multimedia | Play, siguiente, anterior y stop, aunque la app no tenga el foco |

## Desarrollo

Requisitos: Windows, Node.js 22 o superior.

```
npm install
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Abre la app en modo desarrollo con recarga en vivo |
| `npm run typecheck` | Revisa los tipos de TypeScript |
| `npm run build` | Genera el instalador en `release\` sin publicarlo |
| `npm run build:dir` | Genera la app sin instalador (prueba rápida) |

### Publicar una versión

Cada comando sube la versión en `package.json`, genera el instalador y lo publica en GitHub Releases, de donde lo toma el actualizador:

```
$env:GH_TOKEN = "tu_token"
npm run release:patch    # correcciones     1.2.0 -> 1.2.1
npm run release:minor    # funciones nuevas 1.2.0 -> 1.3.0
npm run release:major    # cambios grandes  1.2.0 -> 2.0.0
```

`GH_TOKEN` es un token *fine-grained* de GitHub con acceso a este repositorio y permiso **Contents: Read and write**. Para volver a publicar la versión actual sin cambiar el número, usa `npm run publish`.

## Estructura

```
electron/main/     proceso principal: ventanas, protocolo wmedia://, ffmpeg,
                   YouTube (yt-dlp), letras, listas .m3u, actualizaciones
electron/preload/  puente seguro entre la interfaz y el proceso principal
src/               interfaz en React: reproductor, ecualizador y buscador
bin/yt-dlp.exe     binario de yt-dlp incluido en el instalador
build/             íconos de la app
```

La configuración del usuario se guarda en `%APPDATA%\winmusic\winmusic-state.json`.

## Componentes de terceros

- [yt-dlp](https://github.com/yt-dlp/yt-dlp): búsqueda y streams de YouTube.
- [FFmpeg](https://ffmpeg.org), vía `ffmpeg-static` y `ffprobe-static`: conversión de formatos y lectura de etiquetas.
- [LRCLIB](https://lrclib.net): letras sincronizadas.

Reproducir contenido de YouTube fuera de su reproductor oficial va en contra de los Términos de Servicio de YouTube.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org) (solicitud en trámite; las versiones publicadas hasta ahora no están firmadas).

- Committers and reviewers: [Nicetm](https://github.com/Nicetm)
- Approvers: [Nicetm](https://github.com/Nicetm)

Los instaladores se compilan desde este repositorio con GitHub Actions ([`.github/workflows/build.yml`](.github/workflows/build.yml)).

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it, with these exceptions:

- **Actualizaciones:** al iniciar, la app consulta [GitHub Releases](https://github.com/Nicetm/winmusic/releases) de este repositorio para saber si hay una versión nueva, y actualiza yt-dlp desde [su repositorio en GitHub](https://github.com/yt-dlp/yt-dlp). Solo se descargan archivos; no se envían datos del usuario.

Funciones que se conectan a internet solo cuando el usuario las usa:

- **Búsqueda y reproducción de YouTube:** envía el texto buscado y pide el audio a YouTube. Aplica la [política de privacidad de Google](https://policies.google.com/privacy).
- **Letras:** envía a [LRCLIB](https://lrclib.net) el título, el artista y la duración de la canción que suena.
- **Carátulas de YouTube:** descarga la miniatura del video desde los servidores de YouTube.

Las listas, el ecualizador y la configuración se guardan solo en el equipo (`%APPDATA%\winmusic`).

## Licencia

[MIT](LICENSE). Los componentes de terceros (yt-dlp, FFmpeg) mantienen sus propias licencias.

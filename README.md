# Propuesta de rediseño — Arquidiócesis de Morelia

Prototipo estático (HTML/CSS/JS) de un nuevo sitio web para la Arquidiócesis de Morelia, construido con el contenido público de arquimorelia.org.

- **Diseño:** inspirado en el estilo de sitios arquidiocesanos modernos (barra utilitaria, mega-menú, hero fotográfico, buscador de parroquias, noticias en tarjetas, banda de donativos).
- **Estructura:** basada en el mapa del sitio de la Arquidiócesis de Guadalajara (Arzobispado, Directorio, Trámites, Pastoral, Documentos, Historia y Fe, Noticias).
- **Estado:** borrador. Los formularios son demostrativos; el directorio de parroquias, horarios de misa y zonas pastorales están pendientes de datos.

## Ver la propuesta
Abre `index.html` en el navegador (no requiere servidor).

## Regenerar
`_herramientas/scrape.js` descarga el contenido del sitio actual y `_herramientas/build.js` genera este sitio:

```
node _herramientas/build.js <carpeta-descarga> <carpeta-salida>
```
Requiere Node.js, ffmpeg y los paquetes `cheerio` y `docx` (solo para el scraper).

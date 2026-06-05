# GitHub Pages: despliegue de AlbumPanini

Esta guía deja la app publicada como sitio estático en GitHub Pages usando los workflows del repo.

## 1) Requisitos

- Repositorio en GitHub: `DiegoMinetti/AlbumPanini`
- Rama principal: `main`
- Workflow de CI activo: `.github/workflows/ci.yml`
- Workflow de deploy activo: `.github/workflows/deploy.yml`

## 2) Configurar GitHub Pages (una sola vez)

1. Abrí el repo en GitHub.
2. Ir a **Settings → Pages**.
3. En **Build and deployment**:
   - **Source**: `GitHub Actions`
4. Guardar.

## 3) Cómo funciona el pipeline

1. Hacés push a `main`.
2. Se ejecuta `CI` (formato, lint, typecheck, tests, build).
3. Si `CI` finaliza en `success`, se dispara `Deploy to GitHub Pages`.
4. Deploy:
   - instala dependencias
   - build con base path de Pages (`VITE_BASE_PATH`)
   - copia `dist/index.html` a `dist/404.html`
   - publica `dist/` en Pages

## 4) Publicar una versión

```bash
git checkout main
git pull
# aplicar cambios
git add .
git commit -m "chore: update app"
git push origin main
```

Luego revisar en **Actions**:

- `CI` en verde
- `Deploy to GitHub Pages` en verde

URL final:

- https://diegominetti.github.io/AlbumPanini/

## 5) Verificaciones rápidas

- La app carga en la URL final.
- Navegación interna funciona (usa hash router).
- Se descargan colecciones desde `public/collections/`.
- No hay assets rotos (CSS/JS/iconos).

## 6) Troubleshooting

### El deploy no corre

- Verificar que `CI` haya terminado en `success` en `main`.
- Verificar que **Pages Source** esté en `GitHub Actions`.

### Página en blanco o assets 404

- Confirmar que el build se hizo con `VITE_BASE_PATH` correcto.
- Revisar logs del job `Build (with repository base path)`.

### URL de Pages devuelve 404

- Revisar que el job `Deploy to GitHub Pages` haya terminado sin errores.
- Esperar 1-2 minutos (propagación inicial).

## 7) Deploy manual

También podés ejecutar deploy manual desde GitHub Actions:

1. Ir a **Actions → Deploy to GitHub Pages**.
2. Click en **Run workflow**.
3. Seleccionar rama `main` y ejecutar.

Esto sirve para re-publicar sin necesidad de nuevos commits.

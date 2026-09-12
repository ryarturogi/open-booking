# Licencia del dataset/open-booking frente a CC BY-SA del RNT

Status: resolved

## Answer

<!-- 2026-09-12, grilling vía la herramienta de preguntas -->

Licencias decididas para open-booking:

- **Código**: MIT (queda como está, `LICENSE`).
- **Dataset derivado**: **CC BY-SA 4.0** (RNT/MinCIT) + **ODbL** (OSM) — share-alike dual para los datos. Wikidata sigue CC0.
- **Repo**: MIT `LICENSE` + **`NOTICE.md`** documentando la licencia de datos (CC BY-SA + ODbL), atribución y caveat de derivado share-alike.
- **Atribución en UI** (los tres niveles):
  1. Página pública `/atribucion` — RNT (MinCIT) CC BY-SA, OSM © contribuidores ODbL, Wikidata CC0.
  2. Footer con créditos © open-data en toda página.
  3. Atribución por dato en el detalle de Accommodation: cada ContactMethod muestra su fuente y Confidence (ya decidido en domain model).
- Resultado: el dataset abierto de open-booking se publica bajo CC BY-SA + ODbL; quien lo reutilice debe licenciar su derivado igual (share-alike) y atribuir.

Pendiente de ejecutar: crear `NOTICE.md` y la página `/atribucion` cuando arranque el build de UI.
Type: grilling
Blocked by: 06

## Question

El RNT (MinCIT) se publica bajo **CC BY-SA 4.0**: permite republican los datos con atribución, pero el **derivado debe publicarse bajo la misma licencia**. open-booking es MIT. Decidir cómo se licencia el producto y su dataset.

Resolver:
- ¿MIT para el código + CC BY-SA para el dataset derivado del RNT (dual-license)? ¿Attribution requirement visible (attribution page/notice)?
- ¿Las coordenadas/contactos de OSM (ODbL) añaden otra restricción? (OSM exige share-alike en los datos también).
- Decisión final expresada como ADR: licencia del repo, del dataset, y cómo se comunica en la UI (atribución).
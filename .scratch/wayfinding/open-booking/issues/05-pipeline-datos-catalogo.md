# Pipeline de datos: catálogo desde OSM + Wikidata + registros de turismo → D1

Status: open
Type: grilling
Blocked by: 03

## Question

Decidir cómo se construye y mantiene el catálogo de open-booking con las fuentes que el research declaró viables — OSM + Wikidata como base, registros de turismo abiertos para el contacto oficial, y crawl de la web propia del alojamiento como enriquecimiento.

Resolver:
- Orden y mecanismo de ingesta: workers/colas que leen OSM/Wikidata/registros → normalizan → D1. ¿Pull periódico, push, refresh semanal?
- Cómo se cruzan fuentes para un mismo Place (coincidencia por nombre+geo) y qué fuente gana ante conflicto (confianza/verificación).
- Dónde entra el crawl de webs propias (Worker + fetch directo o Browser Rendering solo donde haga falta) y cómo se extrae teléfono/email/WhatsApp de la web.
- Qué mide el caso realista del pipeline: volumen, frecuencia, cuota de Browser Rendering dentro de los $9–13/mes estimados.
- Este ticket depende del "Domain model" (N03): sin Place/ContactMethod fijados no hay esquema D1 que llenar.
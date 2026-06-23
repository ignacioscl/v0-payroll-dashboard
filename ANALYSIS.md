# v0 Payroll Dashboard — Auditoría de queries y bugs (SRS)

**Fecha:** 2026-06-23  
**Objetivo:** Detectar errores en queries, filtros dealer/provider y desalineaciones con el PHP legacy de SRS.  
**Alcance:** Solo ecosistema SRS (`main` / `mooi` / `pro`, MariaDB, APIs `public/php/api/payroll/`).

---

## Veredicto ejecutivo

| Área | Estado | Comentario |
|------|--------|------------|
| **Issues / Punch report (interno)** | ✅ **Bien** | Tabla principal, KPIs de issues y dashboard usan scope correcto contra PHP |
| **Dealer/provider en listados TTK** | ✅ **Bien** | `appendPayrollDealerScopeParams` replica `PayrollDealerScopeService` |
| **Proxy `/api/srs`** | ✅ **Bien** | JWT, query string y métodos se reenvían correctamente |
| **Usuario externo (company-type)** | ⚠️ **Riesgo** | Race de caché al cargar `/me`; add-punch roto conceptualmente |
| **Nest KPI backend** | ⚠️ **No en prod UI** | Queries con bugs de fecha, agregación y restricción de dealer — **no afectan hoy** porque el frontend no llama a `:3020` |
| **Páginas KPI mock** | ℹ️ **Dev only** | `/kpis` usa datos falsos; no representan la BD |

**Conclusión:** Para el flujo que sí está en producción (dashboard + issues/punch report vía PHP), **la lógica de filtros y queries está bien planteada**. Hay bugs reales pero acotados: mayormente race de React Query para externos, búsqueda sin debounce en la tabla, y código muerto (`use-ttk-list`). El backend Nest tiene deuda técnica en SQL que importará cuando conecten los KPIs de negocio.

---

## 1. Lo que está correcto (tranquilidad)

### 1.1 Scope dealer / provider (frontend ↔ PHP)

La función central `frontend/lib/ttk/map-header-filters.ts` replica el PHP:

```php
// PayrollDealerScopeService::resolveTtkScope
// Interno: id_dealer = combo (sucursales), provider = getCompany()
// Externo:  id_dealer = empresa del usuario, id_dealer_provider = combo (providers)
```

| Endpoint PHP | Frontend | `scopeUser` |
|--------------|----------|-------------|
| `ttk-list.php` | `issues-data-table.tsx` | ✅ `toPayrollScopeUser(user)` |
| `ttk-issue-counts.php` | `use-ttk-issue-counts.ts` | ✅ |
| `ttk-dashboard-summary.php` | `use-ttk-dashboard-summary.ts` | ✅ |
| `ttk-today-status.php` | `use-ttk-today-status.ts` | ✅ |
| Widget ayer | `dashboard-yesterday-issues-table.tsx` | ✅ |
| `dealers.php` | `GET /api/dealers` (sesión PHP) | ✅ sin params cliente |

PHP aplica scope en servidor (`PayrollDealerScopeService::resolveTtkScope` → `TTKEmployeeFilter`). Aunque el cliente mandara params mal, el servidor re-resuelve con el usuario autenticado.

### 1.2 Queries PHP que consume v0

`ttk-list.php` y hermanos delegan en `TTKEmployeeDao` + `TTKEmployeeFilter`:

- Fechas: `DATE(tew.punch_in) >= fecha_desde` y `<= fecha_hasta` — **día completo incluido** ✅
- Dealer: `tew.id_dealer IN (...)` ✅
- Provider: `tew.id_dealer_provider = ?` ✅
- Búsqueda: `search[value]` compatible con `$_GET['search']['value']` ✅

### 1.3 Proxy y auth

- `/api/srs/[...path]` reenvía Authorization, body y query string.
- El browser **nunca** llama a `SRS_API_URL` directamente.
- SSO y cookies httpOnly alineados con `PAYROLL_SSO_SECRET` / `config.php`.

### 1.4 Docker / red (prod)

Documentado y probado en `docker_prod.md`:

- `SRS_API_URL=https://main.srssuite.com` (no `pro`, no `host.docker.internal` en cPanel)
- `FACE_RECOGNITION_URL=http://172.20.0.1:3002` + regla CSF en `172.20.0.0/16`
- `extra_hosts` cuando DNS de `main` apunta a otra máquina

---

## 2. Bugs confirmados — Frontend (impacto en prod)

### 🔴 P1 — Race de caché: scope incorrecto hasta que carga `/api/auth/me`

| Archivos | `use-ttk-issue-counts.ts`, `use-ttk-dashboard-summary.ts`, `use-ttk-today-status.ts` |
|----------|----------------------------------------------------------------------------------------|
| **Problema** | Mientras `user === null`, `scopeUser` es null → se envían params de **interno** (`id_dealer = combo`). La `queryKey` **no incluye** `isCompanyTypeCompany` ni `idDealer`. Con `staleTime` 30–60s, un usuario **externo** puede ver counts/summary de otro scope en el primer render. |
| **Quién lo nota** | Usuarios `isCompanyTypeCompany` (externo) |
| **Fix** | `enabled: ... && !meLoading && Boolean(user)` y/o añadir scope a `queryKey` |

La tabla principal (`issues-data-table`) **no tiene este bug** porque `listExtra` incluye `user` en el memo y la key lleva los params ya scoped.

---

### 🟠 P2 — Búsqueda sin debounce en la tabla de issues

| Archivo | `issues-data-table.tsx` ~291–306 |
|---------|----------------------------------|
| **Problema** | `listExtra` usa `effectiveSearch` (texto en vivo). La `queryKey` incluye `debouncedSearch` pero **los params HTTP usan el texto sin debounce** → un request por tecla. |
| **Impacto** | Performance / carga PHP; no datos incorrectos si la respuesta llega en orden |
| **Fix** | Usar `debouncedSearch` en `buildTtkListFilterExtra` |

---

### 🟠 P2 — Mutaciones no invalidan dashboard / today-status

| Archivos | `use-ttk-add-punch.ts`, `use-ttk-edit-punch.ts`, `use-ttk-delete-punch.ts`, `use-ttk-save-payment.ts` |
|----------|----------------------------------------------------------------------------------------------------------|
| **Problema** | Solo invalidan `['ttk-list']` y `['ttk-issue-counts']`. Faltan `['ttk-dashboard-summary']` y `['ttk-today-status']`. |
| **Impacto** | KPIs del home desactualizados hasta 60s tras editar punch |
| **Fix** | Invalidar esas query keys en `onSuccess` |

---

### 🟠 P2 — Add punch para usuario externo: `id_dealer` incorrecto

| Archivos | `issues/page.tsx`, `add-punch-dialog.tsx`, `ttk-add.php`, `dealers.php` |
|----------|-------------------------------------------------------------------------|
| **Problema** | Para externo, el combo muestra **providers** (`dealers.php` → `comboMode: providers`). `singleDealerId` = id del provider seleccionado. `ttk-add.php` valida `rolesRel.dealerAsigned.getId() == id_dealer` — espera **sucursal**, no provider. |
| **Impacto** | Add punch falla con *"The employee does not belong to that dealer"* para externos que tengan permiso `canAdd` |
| **Nota** | Employee search (`ttk-employees.php`) sí resuelve scope vía `resolveTtkScope` con fallback; el POST de add no |
| **Fix** | Para externo: elegir sucursal real del empleado o extender `ttk-add.php` para aceptar scope provider + resolver dealer del rol |

---

### 🟡 P3 — `use-ttk-list.ts` sin `scopeUser`

| Archivo | `hooks/use-ttk-list.ts` |
|---------|-------------------------|
| **Problema** | `buildTtkListParams(queryArgs)` sin `scopeUser` |
| **Impacto actual** | **Ninguno en prod** — `TtkWithoutGroupTable` no está montada en ninguna ruta (código muerto) |
| **Fix** | Añadir `scopeUser` antes de reutilizar el hook |

---

### 🟡 P3 — Query keys con `toISOString()` vs API con fecha local

| Archivos | Todos los `*QueryKey` helpers |
|----------|-------------------------------|
| **Problema** | Keys en UTC; params con `format(date, 'yyyy-MM-dd')` en timezone local |
| **Impacto** | Entradas de caché duplicadas en TZ lejanas; raro que sirva data incorrecta |
| **Fix** | Usar `formatDateParam` en keys |

---

### 🟡 P3 — “Hoy” / “Ayer” en browser vs servidor

| Archivos | `date-range-presets.ts`, `ttk-today-status.php` (`date('Y-m-d')`) |
|----------|-------------------------------------------------------------------|
| **Problema** | Presets en TZ del navegador; today-status en TZ del servidor PHP |
| **Impacto** | Desfase de un día para usuarios lejos del servidor |
| **Fix** | TZ de negocio fija o fecha servidor expuesta por API |

---

## 3. Limitación PHP (afecta v0 y legacy por igual)

### Multi-provider en usuario externo

`PayrollDealerScopeService::resolveTtkScope` parsea `id_dealer_provider=1,2,3` pero solo asigna:

```php
$idDealerProvider = count($providerIds) > 0 ? $providerIds[0] : 0;
```

`TTKEmployeeFilter` filtra un solo `id_dealer_provider`. Si el externo selecciona **varios providers** en el combo, **solo cuenta el primero**. Esto no es bug del dashboard: es comportamiento del scope PHP actual. Si el negocio necesita multi-provider, hay que extender `resolveTtkScope` + DAO (`IN (...)`).

---

## 4. Backend Nest — Queries SQL (no conectado al UI aún)

El frontend de producción **no llama** a `srs-backend:3020`. Las páginas `/kpis` usan `lib/kpi-mock-data.ts` (dev only). Estos bugs **no rompen prod hoy**, pero sí cuando cableen Nest.

### 4.1 Seguridad tenant — OK

- `idDealerProvider` sale del JWT (`SrsAuthContextService`), no del cliente.
- Queries parametrizadas (`?`) en `src/srs/*`.
- Sin escritura en tablas legacy desde KPI repos.

### 4.2 Bugs de query — Nest

| Severidad | Archivo / método | Problema |
|-----------|------------------|----------|
| **Alta** | Todos los KPI repos agregados (`getProductionKpis`, `getPunchKpis`, `getBillingKpis`, etc.) | Falta `RESTRICTION_DEALER_V2(id_usuario, id_dealer)` en totales. Usuarios con acceso restringido a subset de dealers ven **totales del provider completo**. Solo `getDealerProduction` y `getOffenders` lo aplican. |
| **Alta** | Controllers KPI | Sin filtro `id_dealer` / multi-dealer del header. Al conectar UI, ignorará el combo del dashboard. |
| **Media** | `ProductionKpiRepository`, `BillingKpiRepository`, `CollectionsKpiRepository`, etc. | `BETWEEN ? AND ?` con `fechaHasta` = `'YYYY-MM-DD'` trunca a medianoche → **pierde eventos del último día** en columnas `DATETIME`. PHP usa `DATE(col) <= fechaHasta`. |
| **Media** | `BillingKpiRepository.getBillingKpis` (unbilled) | `LEFT JOIN INVOICE_STATEMENT_INV_REL` sin pre-agregar → **fan-out** puede inflar `unbilledValue`. |
| **Media** | `ProductionKpiRepository` (avg approval) | Usa `i.approved_date`; PHP/KPI-QUERIES usan `IFNULL(aux.approved_date_original, i.approved_date)`. |
| **Media** | `PayrollKpiRepository` | `avgHourlyRate` promedia todos los `type_payment`; spec pide solo `type_payment = 1`. |
| **Baja** | `PayrollKpiRepository` | `overtimeCost` / `overtimePct` hardcoded `0`. |
| **Baja** | `features/user/repository/user.repository.ts` | `dateSalary` interpolado en SQL sin validar formato — riesgo si ese endpoint se expone. |

### 4.3 Ejemplo concreto — fecha fin truncada

```sql
-- Nest (problemático con DATETIME):
AND done.done_at BETWEEN '2026-04-01' AND '2026-04-30'
-- '2026-04-30' = 2026-04-30 00:00:00 → excluye casi todo el día 30

-- PHP / correcto para día completo:
AND DATE(tew.punch_in) <= '2026-04-30'
```

### 4.4 Punch KPI — lo que sí está bien

- `fecha < CURDATE()` para missing punch-out/break (no penalizar día en curso) ✅
- `TTK_CALCULATE_PAYMENT_JSON` en payroll (no recalcula a mano) ✅
- `getOffenders` usa `RESTRICTION_DEALER_V2` ✅

---

## 5. Matriz: ¿puedo confiar en esto en prod?

| Pantalla / feature | Fuente datos | ¿Queries/filtros OK? |
|--------------------|--------------|----------------------|
| Login / SSO | PHP | ✅ |
| Header dealers combo | `dealers.php` | ✅ |
| Dashboard home KPIs | `ttk-dashboard-summary.php` | ✅ (⚠️ race externo P1) |
| Today status | `ttk-today-status.php` | ✅ (⚠️ race externo P1) |
| Issues / punch report tabla | `ttk-list.php` | ✅ |
| Issue count cards | `ttk-issue-counts.php` | ✅ (⚠️ race externo P1) |
| Editar / borrar punch | `ttk-edit.php`, etc. | ✅ (stale dashboard P2) |
| Add punch (interno, 1 dealer) | `ttk-add.php` | ✅ |
| Add punch (externo) | `ttk-add.php` | ❌ id_dealer = provider |
| `/kpis`, trends, costs, etc. | Mock / dev | ℹ️ No es BD real |
| Nest `:3020` KPIs | MariaDB directo | ⚠️ Bugs §4 — no en UI |

---

## 6. Docker producción — checklist red

| Check | Comando / valor |
|-------|-----------------|
| `SRS_API_URL` | `https://main.srssuite.com` |
| Face desde container | `wget http://172.20.0.1:3002/` OK |
| PHP desde container | JSON (no HTML 406) en SSO login |
| `main.srssuite.com` en container | No debe resolver `172.17.0.1` |
| CSF | Regla INPUT `172.20.0.0/16` → `:3002` y `:3306` |
| `config.php` main + mooi | `PAYROLL_DASHBOARD_URL`, `PAYROLL_SSO_SECRET` |

### Env de referencia

**`payroll-dashboard.env` (host, no en git):**

```env
SRS_API_URL=https://main.srssuite.com
SRS_PUBLIC_URL=https://main.srssuite.com
PAYROLL_PUBLIC_URL=https://pro.srssuite.com
SRS_SSO_SECRET=<desde config.php PAYROLL_SSO_SECRET>
FACE_RECOGNITION_URL=http://172.20.0.1:3002
```

**`srs-backend.env`:**

```env
DB_HOST=<host MariaDB>
DB_PORT=3306
JWT_SECRET=<mismo que PHP JWT_AUTH>
```

---

## 7. Plan de corrección recomendado

| Prioridad | Tarea | Esfuerzo |
|-----------|-------|----------|
| **P0** | Gate `enabled` + scope en queryKey para hooks de summary/counts/today | Pequeño |
| **P1** | Debounce search en `issues-data-table` `listExtra` | Pequeño |
| **P1** | Invalidar dashboard/today-status en mutaciones | Pequeño |
| **P1** | Definir add-punch para externo (producto + PHP) | Medio |
| **P2** | Arreglar `use-ttk-list.ts` (código muerto) | Pequeño |
| **P2** | Antes de wire Nest: `RESTRICTION_DEALER_V2` + fechas `DATE()` + unbilled subquery | Medio |
| **P3** | Multi-provider en `PayrollDealerScopeService` si negocio lo pide | Medio (PHP) |

---

## 8. Archivos clave revisados

**Frontend**

- `lib/ttk/map-header-filters.ts`
- `hooks/use-ttk-*.ts`
- `components/ttk/issues-data-table.tsx`
- `app/api/srs/[...path]/route.ts`
- `app/api/dealers/route.ts`

**PHP SRS**

- `public/php/services/payroll/PayrollDealerScopeService.php`
- `public/php/api/payroll/ttk-list.php`, `ttk-dashboard-summary.php`, `ttk-add.php`, `dealers.php`
- `public/php/dao/ttk/TTKEmployeeDao.php`

**Nest (futuro)**

- `backend/src/srs/*/repository/*-kpi.repository.ts`
- `backend/src/srs/auth/srs-auth-context.service.ts`

---

*Auditoría de código estático. Validar en staging con usuario interno y externo, y comparar counts con `ttk_payroll.php` legacy para el mismo dealer/período.*

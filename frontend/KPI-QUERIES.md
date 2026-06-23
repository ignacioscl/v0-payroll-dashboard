# Business KPIs — Reference Queries

Queries reales (MySQL/MariaDB) para reemplazar el mock de `lib/kpi-mock-data.ts`
cuando se construyan los endpoints. Cada sección corresponde a un tab de
`app/(dashboard)/kpis/page.tsx`.

**Parámetros comunes**

| Parámetro | Descripción |
|---|---|
| `:fecha_desde` / `:fecha_hasta` | Rango del período seleccionado |
| `:id_dealer_provider` | Contratista logueado (CONTRATISTA, siempre filtrar) |

**Constantes de WORKFLOW** (`public/php/pojos/Workflow.php`): Waiting=5, In Process=6, Done=7, In Transit=15, Pause=16.

**Convención de fecha de completado:** usar `LOG_WO_WORKFLOW_CHANGE` (timestamp exacto del paso a Done). `INVOICE.date_last_chg_workflow` solo guarda el último cambio, sirve como fallback.

```sql
-- Subquery reutilizable: fecha en que cada WO pasó a Done (la última, por si reabren)
-- Alias usado en el resto del doc como `done`
SELECT lw.id_work_order, MAX(lw.fecha) done_at
FROM LOG_WO_WORKFLOW_CHANGE lw
WHERE lw.id_workflow = 7
GROUP BY lw.id_work_order
```

```sql
-- Subquery reutilizable: valor de una WO = suma de sus servicios
-- Alias usado como `wo_value`
SELECT isr.id_invoice, SUM(isr.price * IFNULL(isr.qty, 1)) value
FROM INVOICE_SERVICE_REL isr
GROUP BY isr.id_invoice
```

---

## 1. WO Production (`INVOICE` + `WORKFLOW`)

### 1.1 WOs Completed / Production Value

```sql
SELECT COUNT(DISTINCT i.id)                                   wo_completed,
       IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)         production_value
FROM INVOICE i
JOIN (SELECT lw.id_work_order, MAX(lw.fecha) done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw WHERE lw.id_workflow = 7
      GROUP BY lw.id_work_order) done ON done.id_work_order = i.id
LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
WHERE i.estado = 1
  AND i.id_workflow = 7
  AND i.id_dealer_provider = :id_dealer_provider
  AND done.done_at BETWEEN :fecha_desde AND :fecha_hasta;
```

Trend: misma query sobre el período anterior (`:fecha_desde - INTERVAL n DAY`).

### 1.2 Avg Cycle Time (creación → Done, en horas)

```sql
SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.fecha_alta, done.done_at)) / 60, 1) avg_cycle_hours
FROM INVOICE i
JOIN (SELECT lw.id_work_order, MAX(lw.fecha) done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw WHERE lw.id_workflow = 7
      GROUP BY lw.id_work_order) done ON done.id_work_order = i.id
WHERE i.estado = 1 AND i.id_workflow = 7
  AND i.id_dealer_provider = :id_dealer_provider
  AND done.done_at BETWEEN :fecha_desde AND :fecha_hasta;
```

### 1.3 On-Time Completion % (vs `promise_datetime`)

```sql
SELECT ROUND(100 * SUM(done.done_at <= i.promise_datetime) / COUNT(*), 1) on_time_pct
FROM INVOICE i
JOIN (SELECT lw.id_work_order, MAX(lw.fecha) done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw WHERE lw.id_workflow = 7
      GROUP BY lw.id_work_order) done ON done.id_work_order = i.id
WHERE i.estado = 1 AND i.id_workflow = 7
  AND i.promise_datetime IS NOT NULL          -- solo WOs con promesa
  AND i.id_dealer_provider = :id_dealer_provider
  AND done.done_at BETWEEN :fecha_desde AND :fecha_hasta;
```

### 1.4 Open Backlog + aging > 7 días (snapshot, sin período)

```sql
SELECT COUNT(*)                                              open_backlog,
       SUM(i.fecha_alta < NOW() - INTERVAL 7 DAY)            backlog_over_7d
FROM INVOICE i
WHERE i.estado = 1
  AND i.id_workflow IN (5, 6, 15, 16)        -- Waiting, In Process, In Transit, Pause
  AND i.id_dealer_provider = :id_dealer_provider;
```

### 1.5 Pipeline por estado (gráfico de torta)

```sql
SELECT w.descripcion status, COUNT(*) count
FROM INVOICE i
JOIN WORKFLOW w ON w.id = i.id_workflow
WHERE i.estado = 1
  AND i.id_workflow IN (5, 6, 15, 16)
  AND i.id_dealer_provider = :id_dealer_provider
GROUP BY w.id, w.descripcion
ORDER BY w.ordenamiento;
```

### 1.6 Pending Approval + demora promedio de aprobación

```sql
-- Pendientes ahora
SELECT COUNT(*) pending_approval
FROM INVOICE i
WHERE i.estado = 1 AND i.approved = 0
  AND i.id_dealer_provider = :id_dealer_provider;

-- Horas promedio hasta aprobar (aprobadas en el período)
-- INVOICE_AUX.approved_date_original preserva la primera aprobación (ver trigger INVOICE_DATE_APPROVE)
SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.fecha_alta,
             IFNULL(aux.approved_date_original, i.approved_date))) / 60, 1) avg_approval_hours
FROM INVOICE i
LEFT JOIN INVOICE_AUX aux ON aux.ID = i.id
WHERE i.estado = 1 AND i.approved = 1
  AND i.id_dealer_provider = :id_dealer_provider
  AND i.approved_date BETWEEN :fecha_desde AND :fecha_hasta;
```

### 1.7 Inspection Fail Rate

```sql
-- inspected: 1=ok, 0=fail, -1=nunca, NULL=no aplica
SELECT ROUND(100 * SUM(i.inspected = 0) / SUM(i.inspected IN (0, 1)), 1) inspection_fail_pct
FROM INVOICE i
WHERE i.estado = 1
  AND i.id_dealer_provider = :id_dealer_provider
  AND i.inspected_date BETWEEN :fecha_desde AND :fecha_hasta;
```

### 1.8 Production vs Goal por dealer (tabla)

El goal vive en `GOAL_REPORT_COLS` / lógica de `ProductionReportDao::loadDealerGoal`
(ratio `totals/goal_report`). Producción por dealer:

```sql
SELECT c.id, c.razon_social dealer,
       COUNT(DISTINCT i.id) wos,
       IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0) value
FROM INVOICE i
JOIN DEPARTMENT d   ON d.id = i.id_department
JOIN CONTRATISTA c  ON c.id = d.id_dealer
JOIN (SELECT lw.id_work_order, MAX(lw.fecha) done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw WHERE lw.id_workflow = 7
      GROUP BY lw.id_work_order) done ON done.id_work_order = i.id
LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
WHERE i.estado = 1 AND i.id_workflow = 7
  AND i.id_dealer_provider = :id_dealer_provider
  AND done.done_at BETWEEN :fecha_desde AND :fecha_hasta
GROUP BY c.id, c.razon_social
ORDER BY value DESC;
```

Serie semanal del gráfico: misma query agrupando por `YEARWEEK(done.done_at, 1)`.

---

## 2. Billing (`INVOICE_STATEMENT`)

**Valor de un statement:** sus líneas viven en `INVOICE_STATEMENT_INV_REL` (ISIR).
Si la línea tiene `amount` (genéricos / ttk) vale `IFNULL(generic_qty,1)*amount`;
si apunta a una WO (`id_invoice`), vale la suma de servicios de esa WO. Excluir
`only_timecard = 1`. Aplicar luego `discount` / `tax` del header si corresponde
(misma lógica que `binvoice_main.php`).

```sql
-- Subquery reutilizable: valor por statement. Alias usado como `sv`
SELECT r.id_statement,
       SUM(CASE
             WHEN r.amount IS NOT NULL THEN IFNULL(r.generic_qty, 1) * r.amount
             ELSE (SELECT IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)
                   FROM INVOICE_SERVICE_REL isr WHERE isr.id_invoice = r.id_invoice)
           END) value
FROM INVOICE_STATEMENT_INV_REL r
WHERE r.only_timecard = 0
GROUP BY r.id_statement
```

### 2.1 Invoiced $ / Statements Issued / Avg Invoice Value

```sql
SELECT COUNT(DISTINCT s.id)              statements_issued,
       IFNULL(SUM(sv.value), 0)          invoiced_value,
       ROUND(IFNULL(AVG(sv.value), 0))   avg_invoice_value
FROM INVOICE_STATEMENT s
JOIN ( /* subquery sv de arriba */ ) sv ON sv.id_statement = s.id
WHERE s.estado = 1
  AND s.id_dealer_provider = :id_dealer_provider
  AND s.fecha_create BETWEEN :fecha_desde AND :fecha_hasta;
```

### 2.2 Done, Not Invoiced (unbilled) — count, $ y aging

```sql
SELECT COUNT(DISTINCT i.id)                                  unbilled_wos,
       IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)        unbilled_value,
       CASE
         WHEN DATEDIFF(NOW(), done.done_at) <= 7  THEN '0-7 days'
         WHEN DATEDIFF(NOW(), done.done_at) <= 14 THEN '8-14 days'
         WHEN DATEDIFF(NOW(), done.done_at) <= 30 THEN '15-30 days'
         ELSE '31+ days'
       END bucket
FROM INVOICE i
JOIN (SELECT lw.id_work_order, MAX(lw.fecha) done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw WHERE lw.id_workflow = 7
      GROUP BY lw.id_work_order) done ON done.id_work_order = i.id
LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
LEFT JOIN INVOICE_STATEMENT_INV_REL stl ON stl.id_invoice = i.id
LEFT JOIN INVOICE_STATEMENT st ON st.id = stl.id_statement AND st.estado = 1
WHERE i.estado = 1 AND i.id_workflow = 7
  AND i.id_dealer_provider = :id_dealer_provider
  AND st.id IS NULL                       -- nunca entró a un statement activo
GROUP BY bucket;
```

Para la tabla por dealer: agregar joins `DEPARTMENT d` + `CONTRATISTA c` (como 1.8),
`GROUP BY c.id` y `MAX(DATEDIFF(NOW(), done.done_at)) oldest_days`.

### 2.3 Avg Days WO Done → Invoiced (billing lag)

```sql
SELECT ROUND(AVG(DATEDIFF(s.fecha_create, done.done_at)), 1) avg_done_to_invoiced_days
FROM INVOICE_STATEMENT s
JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id AND r.id_invoice IS NOT NULL
JOIN (SELECT lw.id_work_order, MAX(lw.fecha) done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw WHERE lw.id_workflow = 7
      GROUP BY lw.id_work_order) done ON done.id_work_order = r.id_invoice
WHERE s.estado = 1
  AND s.id_dealer_provider = :id_dealer_provider
  AND s.fecha_create BETWEEN :fecha_desde AND :fecha_hasta;
```

### 2.4 Statements Sent % / creados nunca enviados

```sql
SELECT ROUND(100 * SUM(s.sended = 1) / COUNT(*), 1) sent_pct,
       SUM(s.sended = 0)                            unsent_statements
FROM INVOICE_STATEMENT s
WHERE s.estado = 1
  AND s.id_dealer_provider = :id_dealer_provider
  AND s.fecha_create BETWEEN :fecha_desde AND :fecha_hasta;
```

---

## 3. Collections (`BILLING` + `BILLING_WO_REL`)

**Modelo de pago:** un cheque (`BILLING`, con `fecha` y `amount`) se aplica vía
`BILLING_WO_REL`: `id_statement` (statement completo) o `id_statement_inv_rel`
(línea suelta). La línea también marca `ISIR.pagado = 1` — usar `pagado` como
fuente de verdad de "línea cobrada" (es lo que usa la reconciliación).

```sql
-- Subquery reutilizable: statement 100% cobrado y fecha del último cheque
-- Alias usado como `pay`
SELECT s.id id_statement, MAX(b.fecha) paid_at
FROM INVOICE_STATEMENT s
JOIN BILLING_WO_REL bwr ON (bwr.id_statement = s.id
                            OR bwr.id_statement_inv_rel IN
                               (SELECT r.id FROM INVOICE_STATEMENT_INV_REL r WHERE r.id_statement = s.id))
JOIN BILLING b ON b.id = bwr.id_billing
WHERE NOT EXISTS (SELECT 1 FROM INVOICE_STATEMENT_INV_REL r2
                  WHERE r2.id_statement = s.id AND r2.only_timecard = 0 AND r2.pagado = 0)
GROUP BY s.id
```

### 3.1 Collected $ en el período

```sql
SELECT IFNULL(SUM(b.amount), 0) collected_value
FROM BILLING b
WHERE b.id_dealer_provider = :id_dealer_provider
  AND b.fecha BETWEEN :fecha_desde AND :fecha_hasta;
```

### 3.2 DSO — días entre statement y cobro

```sql
-- Sobre statements totalmente cobrados cuyo último cheque cae en el período.
-- Para DSO "desde el envío" usar s.last_sended en lugar de s.fecha_create.
SELECT ROUND(AVG(DATEDIFF(pay.paid_at, s.fecha_create)), 1) dso_days
FROM INVOICE_STATEMENT s
JOIN ( /* subquery pay de arriba */ ) pay ON pay.id_statement = s.id
WHERE s.estado = 1
  AND s.id_dealer_provider = :id_dealer_provider
  AND pay.paid_at BETWEEN :fecha_desde AND :fecha_hasta;
```

> Variante ponderada por monto (más fiel financieramente):
> `SUM(DATEDIFF(...) * sv.value) / SUM(sv.value)` joineando la subquery `sv` de la sección 2.

### 3.3 Outstanding AR + aging (snapshot)

```sql
SELECT CASE
         WHEN DATEDIFF(NOW(), s.fecha_create) <= 30 THEN '0-30 days'
         WHEN DATEDIFF(NOW(), s.fecha_create) <= 60 THEN '31-60 days'
         WHEN DATEDIFF(NOW(), s.fecha_create) <= 90 THEN '61-90 days'
         ELSE '90+ days'
       END bucket,
       COUNT(DISTINCT s.id) statements,
       IFNULL(SUM(CASE
                    WHEN r.amount IS NOT NULL THEN IFNULL(r.generic_qty, 1) * r.amount
                    ELSE (SELECT IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)
                          FROM INVOICE_SERVICE_REL isr WHERE isr.id_invoice = r.id_invoice)
                  END), 0) value
FROM INVOICE_STATEMENT s
JOIN INVOICE_STATEMENT_INV_REL r
     ON r.id_statement = s.id AND r.only_timecard = 0 AND r.pagado = 0   -- solo lo no cobrado
WHERE s.estado = 1
  AND s.id_dealer_provider = :id_dealer_provider
GROUP BY bucket;
```

`AR over 60 days %` = (`61-90` + `90+`) / total. `Open statements` = `COUNT(DISTINCT s.id)` sin agrupar.

### 3.4 Collection Rate

```sql
-- collected (3.1) / invoiced (2.1) del mismo período, calculado en el endpoint.
```

### 3.5 Slowest Payers (tabla)

```sql
SELECT c.razon_social dealer,
       IFNULL(SUM(CASE WHEN r.pagado = 0 THEN
                    CASE WHEN r.amount IS NOT NULL THEN IFNULL(r.generic_qty,1)*r.amount
                         ELSE (SELECT IFNULL(SUM(isr.price*IFNULL(isr.qty,1)),0)
                               FROM INVOICE_SERVICE_REL isr WHERE isr.id_invoice = r.id_invoice) END
                  END), 0)                                          outstanding,
       (SELECT ROUND(AVG(DATEDIFF(pay.paid_at, s2.fecha_create)), 1)
        FROM INVOICE_STATEMENT s2
        JOIN ( /* subquery pay */ ) pay ON pay.id_statement = s2.id
        WHERE s2.id_dealer = c.id AND s2.estado = 1
          AND pay.paid_at >= NOW() - INTERVAL 180 DAY)              avg_days_to_pay,
       MAX(CASE WHEN r.pagado = 0 THEN DATEDIFF(NOW(), s.fecha_create) END) oldest_open_days,
       COUNT(DISTINCT CASE WHEN r.pagado = 0 THEN s.id END)         open_statements
FROM INVOICE_STATEMENT s
JOIN CONTRATISTA c ON c.id = s.id_dealer
JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id AND r.only_timecard = 0
WHERE s.estado = 1
  AND s.id_dealer_provider = :id_dealer_provider
GROUP BY c.id, c.razon_social
HAVING outstanding > 0
ORDER BY avg_days_to_pay DESC;
```

---

## 4. Punch Quality (`TTK_EMPLOYEE_WORK`)

`tew.id_author` = empleado dueño de la ponchada. Excluir días en curso al medir
"missing punch-out" (`fecha < CURDATE()`).

### 4.1 Totales y error rate

```sql
SELECT COUNT(*)                                                   total_punches,
       SUM(tew.punch_out IS NULL AND tew.fecha < CURDATE())       missing_punch_out,
       SUM(tew.break_start IS NOT NULL AND tew.break_end IS NULL
           AND tew.fecha < CURDATE())                             missing_break_end,
       SUM(tew.manual_create = 1)                                 manual_punches,
       SUM(tew.fixed_at IS NOT NULL)                              admin_corrections,
       ROUND(100 * SUM( (tew.punch_out IS NULL AND tew.fecha < CURDATE())
                     OR (tew.break_start IS NOT NULL AND tew.break_end IS NULL AND tew.fecha < CURDATE())
                     OR tew.manual_create = 1
                     OR tew.fixed_at IS NOT NULL ) / COUNT(*), 1) error_rate_pct
FROM TTK_EMPLOYEE_WORK tew
WHERE tew.estado = 1
  AND tew.id_dealer_provider = :id_dealer_provider
  AND tew.fecha BETWEEN :fecha_desde AND :fecha_hasta;
```

### 4.2 Deleted Punches (audit log)

```sql
-- Ponchadas borradas: estado = 0, con su última entrada en el log
SELECT COUNT(*) deleted_punches
FROM TTK_EMPLOYEE_WORK tew
WHERE tew.estado = 0
  AND tew.id_dealer_provider = :id_dealer_provider
  AND tew.fecha BETWEEN :fecha_desde AND :fecha_hasta;

-- Detalle de quién la borró/modificó: LOG_TTK_EMPLOYEE_WORK (id_ttk, id_usuario, date_update)
```

### 4.3 Correction Delay (ponchada → fix)

```sql
SELECT ROUND(AVG(DATEDIFF(tew.fixed_at, tew.fecha)), 1) avg_correction_delay_days
FROM TTK_EMPLOYEE_WORK tew
WHERE tew.estado = 1 AND tew.fixed_at IS NOT NULL
  AND tew.id_dealer_provider = :id_dealer_provider
  AND tew.fixed_at BETWEEN :fecha_desde AND :fecha_hasta;
```

### 4.4 Reincidentes (tabla) y serie semanal

```sql
SELECT u.id, CONCAT(u.nombre, ' ', u.apellido) employee, c.razon_social dealer,
       SUM(tew.punch_out IS NULL AND tew.fecha < CURDATE())  missing_out,
       SUM(tew.manual_create = 1)                            manual,
       SUM(tew.fixed_at IS NOT NULL)                         corrected,
       SUM( (tew.punch_out IS NULL AND tew.fecha < CURDATE())
            OR tew.manual_create = 1
            OR tew.fixed_at IS NOT NULL )                    total
FROM TTK_EMPLOYEE_WORK tew
JOIN usuarios u    ON u.id = tew.id_author
JOIN CONTRATISTA c ON c.id = tew.id_dealer
WHERE tew.estado = 1
  AND tew.id_dealer_provider = :id_dealer_provider
  AND tew.fecha BETWEEN :fecha_desde AND :fecha_hasta
GROUP BY u.id, employee, dealer
HAVING total > 0
ORDER BY total DESC
LIMIT 10;
```

Serie semanal (gráfico): query 4.1 agrupada por `YEARWEEK(tew.fecha, 1)`.

---

## 5. Payroll Spend (`TTK_EMPLOYEE_WORK` + funciones SQL)

`type_payment`: hourly=1, piecework=2, salary=3, flat rate=4, daily pay=5,
holiday=6, sick day=7. **No recalcular a mano**: el sistema ya tiene las
funciones (ver `sql-spAndFn` y `TTKEmployeeDao`):

- `TTK_CALCULATE_TIME_DAY(type_payment, punch_out, punch_in, break_end, break_start, force)` → horas del día
- `TTK_EMPLOYEE_HOURS_REG(horas, payment_method)` / `TTK_EMPLOYEE_HOURS_OT(horas, payment_method)` → split regular/overtime (payment_method viene de `CONTRATISTA` del provider)
- `GET_PIECEWORK_BY_EMPL_DATERANGE_PROV(id_employee, desde, hasta, id_provider, type_payment, filter_wo_done, id_dealer)` → $ piecework / flat rate
- `TTK_CALCULATE_PAYMENT_JSON(id_ttk, additional)` / `GET_PAYMENT_AMOUNT_BY_DATE(...)` → pago total de una ponchada

### 5.1 Total Payroll, OT y horas por día (base)

```sql
SELECT tew.id, tew.id_author, tew.id_dealer, tew.type_payment, tew.hourly_rate,
       TTK_CALCULATE_TIME_DAY(tew.type_payment, tew.punch_out, tew.punch_in,
                              tew.break_end, tew.break_start, 1)            hours_day,
       TTK_CALCULATE_PAYMENT_JSON(tew.id, NULL)                             pay_total
FROM TTK_EMPLOYEE_WORK tew
WHERE tew.estado = 1
  AND tew.id_dealer_provider = :id_dealer_provider
  AND tew.fecha BETWEEN :fecha_desde AND :fecha_hasta;
```

Agregaciones en el endpoint (o como outer query):
`total_payroll = SUM(pay_total)`; horas REG/OT por semana-empleado con
`TTK_EMPLOYEE_HOURS_REG/OT(SUM(hours_day), prov.payment_method)` y
`overtime_cost = hours_ot * 1.5 * hourly_rate` (patrón exacto en
`GananciasGastosReportDao` líneas 95-98).

### 5.2 Payroll por payment type (torta)

```sql
SELECT tew.type_payment,
       SUM(TTK_CALCULATE_PAYMENT_JSON(tew.id, NULL)) value
FROM TTK_EMPLOYEE_WORK tew
WHERE tew.estado = 1
  AND tew.id_dealer_provider = :id_dealer_provider
  AND tew.fecha BETWEEN :fecha_desde AND :fecha_hasta
GROUP BY tew.type_payment;
```

### 5.3 Labor Cost by Dealer (tabla)

```sql
SELECT c.razon_social dealer,
       ROUND(SUM(TTK_CALCULATE_TIME_DAY(tew.type_payment, tew.punch_out, tew.punch_in,
                                        tew.break_end, tew.break_start, 1)), 0) hours,
       SUM(TTK_CALCULATE_PAYMENT_JSON(tew.id, NULL))                            cost
FROM TTK_EMPLOYEE_WORK tew
JOIN CONTRATISTA c ON c.id = tew.id_dealer
WHERE tew.estado = 1
  AND tew.id_dealer_provider = :id_dealer_provider
  AND tew.fecha BETWEEN :fecha_desde AND :fecha_hasta
GROUP BY c.id, c.razon_social
ORDER BY cost DESC;
```

`cost_per_wo` y `labor_pct` se cruzan en el endpoint con 1.8 (WOs y producción
por dealer del mismo período). OT hours por dealer: split REG/OT como en 5.1.

### 5.4 Ratios ejecutivos

- **Labor Cost / Revenue** = `total_payroll (5.1)` / `production_value (1.1)`
- **Cost per WO** = `total_payroll` / `wo_completed (1.1)`
- **Revenue per Employee** = `production_value` / empleados activos:

```sql
SELECT COUNT(DISTINCT tew.id_author) active_employees,
       ROUND(AVG(tew.hourly_rate), 2) avg_hourly_rate
FROM TTK_EMPLOYEE_WORK tew
WHERE tew.estado = 1 AND tew.type_payment = 1
  AND tew.id_dealer_provider = :id_dealer_provider
  AND tew.fecha BETWEEN :fecha_desde AND :fecha_hasta;
```

---

## 6. Payroll Report (`/kpis/payroll-report`)

Réplica web del XLSX de `/modulos/ttk/php/ttk_payroll_report.php`
(`ttk_export_xlsx.php`, `tipo=payroll_xls`). No requiere queries nuevas: la
fuente real es `XlsPayrollReportService::generateXlsxPayroll`, que arma
`PayrollReportPojo` por empleado (vía `TTKEmployeeReportService` /
`TTKEmployeeDao`, funciones `TTK_CALCULATE_TIME_DAY`, `TTK_EMPLOYEE_HOURS_REG/OT`,
`GET_PIECEWORK_BY_EMPL_DATERANGE_PROV`). Para el endpoint web: exponer esa misma
lista como JSON en lugar de escribir el worksheet. Campos por fila: ver
`PayrollReportRow` en `lib/payroll-report-mock-data.ts` (mapea 1:1 con
`writeRows`). Las filas rojas del XLSX (`employeePunchWithError` → "Punch
without clock out at …") se exponen como campo `punchError`.

---

## Notas de implementación

- Índices: verificar índices sobre `LOG_WO_WORKFLOW_CHANGE (id_workflow, id_work_order, fecha)`, `INVOICE_STATEMENT_INV_REL (id_statement, pagado)` y `TTK_EMPLOYEE_WORK (id_dealer_provider, fecha)` antes de exponer estos endpoints; varios son full scans hoy.
- Descuentos/tax de statements: para $ facturado exacto aplicar `discount`/`discount_type`/`tax` del header de `INVOICE_STATEMENT` (lógica de referencia en `public/modulos/billing/php/binvoice_main.php`).
- El executive summary reusa 1.1, 2.1, 3.2, 4.1 y 5.1 — no necesita queries propias.
- Mapeo de tarjetas → query: cada tarjeta de `app/(dashboard)/kpis/page.tsx` lleva el mismo nombre que el campo del tipo en `lib/kpi-mock-data.ts` (p. ej. `ProductionKpis.avgCycleHours` → query 1.2).

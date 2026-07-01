-- =============================================================================
-- KPI Collections / Billing — índices recomendados (SRS MariaDB)
-- =============================================================================
-- Contexto: queries de collections KPI filtran INVOICE_STATEMENT por
--   id_dealer_provider + id_dealer + estado, luego llaman IS_STATEMENT_BILLED
--   y GET_TOTAL_BY_STATEMENT_NOT_BILLED por fila.
--
-- EXPLAIN previo (dealer 344, provider 79): index_merge ~19k rows sin estado.
--
-- Uso:
--   1. Ejecutar sección "Diagnóstico" en staging/prod (solo lectura).
--   2. Revisar resultados.
--   3. Ejecutar sección "Índices" en ventana de bajo tráfico.
--   4. Ejecutar sección "Verificación".
--
-- Nota: CREATE INDEX IF NOT EXISTS requiere MariaDB 10.1.4+.
-- En tablas grandes puede tardar varios minutos (I/O).
-- =============================================================================


-- =============================================================================
-- 1. DIAGNÓSTICO (solo lectura)
-- =============================================================================

-- 1.1 Índices actuales
SHOW INDEX FROM INVOICE_STATEMENT;
SHOW INDEX FROM INVOICE_STATEMENT_INV_REL;
SHOW INDEX FROM BILLING_WO_REL;
SHOW INDEX FROM BILLING;

-- 1.2 EXPLAIN base (reemplazar provider/dealer si hace falta)
EXPLAIN
SELECT s.id
FROM INVOICE_STATEMENT s
JOIN CONTRATISTA c ON c.id = s.id_dealer
WHERE s.estado = 1
  AND s.id_dealer_provider = 79
  AND c.id IN (344);

-- 1.3 Cuántos statements por estado (mismo scope)
SELECT s.estado, COUNT(*) AS cnt
FROM INVOICE_STATEMENT s
WHERE s.id_dealer_provider = 79
  AND s.id_dealer = 344
GROUP BY s.estado
ORDER BY s.estado;

-- 1.4 Candidatos AR (activos) — cuántas veces se llamará la función
SELECT COUNT(*) AS active_statements
FROM INVOICE_STATEMENT s
JOIN CONTRATISTA c ON c.id = s.id_dealer
WHERE s.estado = 1
  AND s.id_dealer_provider = 79
  AND c.id IN (344);


-- =============================================================================
-- 2. ÍNDICES
-- =============================================================================
-- Ejecutar uno a uno si preferís controlar el tiempo de cada ALTER.

-- 2.1 INVOICE_STATEMENT — acota provider + dealer + activo (AR, invoiced, DSO join)
CREATE INDEX IF NOT EXISTS idx_invstmt_prov_dealer_estado
  ON INVOICE_STATEMENT (id_dealer_provider, id_dealer, estado);

-- 2.2 INVOICE_STATEMENT — invoiced KPI filtra por período del statement
CREATE INDEX IF NOT EXISTS idx_invstmt_prov_dealer_estado_period
  ON INVOICE_STATEMENT (id_dealer_provider, id_dealer, estado, fecha_desde, fecha_hasta);

-- 2.3 INVOICE_STATEMENT_INV_REL — usado por funciones de total / billing links
CREATE INDEX IF NOT EXISTS idx_isir_id_statement
  ON INVOICE_STATEMENT_INV_REL (id_statement);

CREATE INDEX IF NOT EXISTS idx_isir_id_invoice
  ON INVOICE_STATEMENT_INV_REL (id_invoice);

-- 2.4 BILLING_WO_REL — DSO y funciones de cobro
CREATE INDEX IF NOT EXISTS idx_bwr_id_statement
  ON BILLING_WO_REL (id_statement);

CREATE INDEX IF NOT EXISTS idx_bwr_id_statement_inv_rel
  ON BILLING_WO_REL (id_statement_inv_rel);

CREATE INDEX IF NOT EXISTS idx_bwr_id_billing
  ON BILLING_WO_REL (id_billing);

-- 2.5 BILLING — collected + DSO por provider y fecha
CREATE INDEX IF NOT EXISTS idx_billing_provider_estado_fecha
  ON BILLING (id_dealer_provider, estado, fecha);


-- =============================================================================
-- 3. VERIFICACIÓN (después de crear índices)
-- =============================================================================

-- 3.1 EXPLAIN debería usar idx_invstmt_prov_dealer_estado y muchas menos rows
EXPLAIN
SELECT s.id
FROM INVOICE_STATEMENT s
JOIN CONTRATISTA c ON c.id = s.id_dealer
WHERE s.estado = 1
  AND s.id_dealer_provider = 79
  AND c.id IN (344);

-- 3.2 EXPLAIN query AR completa (sin ejecutar funciones — solo el scan)
EXPLAIN
SELECT s.id
FROM INVOICE_STATEMENT s
JOIN CONTRATISTA c ON c.id = s.id_dealer
WHERE s.estado = 1
  AND s.id_dealer_provider = 79
  AND RESTRICTION_DEALER_V2(1, c.id) = 1
  AND c.id IN (344);

-- 3.3 EXPLAIN invoiced por período
EXPLAIN
SELECT s.id
FROM INVOICE_STATEMENT s
JOIN CONTRATISTA c ON c.id = s.id_dealer
WHERE s.estado = 1
  AND s.id_dealer_provider = 79
  AND c.id IN (344)
  AND s.fecha_desde >= '2026-05-01'
  AND s.fecha_hasta <= '2026-05-31';

-- 3.4 Índices creados
SHOW INDEX FROM INVOICE_STATEMENT WHERE Key_name LIKE 'idx_invstmt%';
SHOW INDEX FROM BILLING WHERE Key_name = 'idx_billing_provider_estado_fecha';


-- =============================================================================
-- 4. ROLLBACK (solo si hay que deshacer)
-- =============================================================================
-- DROP INDEX idx_invstmt_prov_dealer_estado ON INVOICE_STATEMENT;
-- DROP INDEX idx_invstmt_prov_dealer_estado_period ON INVOICE_STATEMENT;
-- DROP INDEX idx_isir_id_statement ON INVOICE_STATEMENT_INV_REL;
-- DROP INDEX idx_isir_id_invoice ON INVOICE_STATEMENT_INV_REL;
-- DROP INDEX idx_bwr_id_statement ON BILLING_WO_REL;
-- DROP INDEX idx_bwr_id_statement_inv_rel ON BILLING_WO_REL;
-- DROP INDEX idx_bwr_id_billing ON BILLING_WO_REL;
-- DROP INDEX idx_billing_provider_estado_fecha ON BILLING;

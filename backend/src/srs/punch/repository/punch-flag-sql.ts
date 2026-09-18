/**
 * Predicados SQL de los flags que NO salen de TTK_PUNCH_WITH_ERROR_V2.
 * EXISTS por PK `id_ttk` — nunca JOIN en los agregados.
 */

export const FAKE_GPS_EXISTS_SQL = `EXISTS (
  SELECT 1 FROM TTK_EMPLOYEE_WORK_EXT e
   WHERE e.id_ttk = tew.id
     AND (e.punch_in_mock_gps = 1 OR e.punch_out_mock_gps = 1
       OR e.break_start_mock_gps = 1 OR e.break_end_mock_gps = 1)
)`

export const FAKE_GPS_WITH_DATA_EXISTS_SQL = `EXISTS (
  SELECT 1 FROM TTK_EMPLOYEE_WORK_EXT e
   WHERE e.id_ttk = tew.id
     AND (e.punch_in_mock_gps IS NOT NULL OR e.punch_out_mock_gps IS NOT NULL
       OR e.break_start_mock_gps IS NOT NULL OR e.break_end_mock_gps IS NOT NULL)
)`

export const WITHOUT_SALARY_SQL = 'tew.id_payment_type IS NULL'

export const MANUAL_ACTIVE_SQL = 'tew.manual_create = 1 AND tew.estado = 1'

export const DELETED_SQL = 'tew.estado = 0'

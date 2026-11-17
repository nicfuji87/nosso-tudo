-- Saúde 07 — teste ortostático feito no relógio (deitado 2 min → em pé 3 min).
-- valor = JSON compacto: {"d": FC deitado, "p": pico em pé, "m1": FC 1 min, "m3": FC 3 min, "s": sintomas (bool)}
ALTER TABLE saude_registros DROP CONSTRAINT IF EXISTS saude_registros_tipo_check;
ALTER TABLE saude_registros ADD CONSTRAINT saude_registros_tipo_check
  CHECK (tipo IN ('checkin', 'habito', 'respiracao', 'ecg', 'malestar', 'ortostatico'));

-- 084 (PM 05-11: "lo de las minas parece que esta muy roto, ponlo algo menos roto" -> "si, subela al 5%").
-- Minas: la casa se queda el 5 % en vez del 3 %. Multiplicador tras k buenas con m minas = 0,95 x C(25,k) / C(25-m,k), tope x1000.
-- Va despues de 073. El cliente (minas.js, mult) lleva el mismo 0,95. Las partidas en curso siguen; cada casilla nueva ya paga con 0,95.
-- Ojo: 073_prueba.sql comprueba el 0,97 viejo y deja de valer tras esta.
create or replace function minas_mult(p_minas int, p_k int) returns numeric
language plpgsql immutable as $$
declare v numeric := 1; i int;
begin
  if p_k is null or p_k <= 0 then return 1; end if;
  for i in 0 .. p_k - 1 loop v := v * (25 - i)::numeric / (25 - p_minas - i); end loop;
  return least(1000, floor(0.95 * v * 100) / 100)::numeric(10,2);
end $$;

-- comprobacion: 3 minas, 2 buenas = 0,95 x 25/22 x 24/21 = 1,23 (antes 1,25); 1 mina, 1 buena = 0,98 (antes 1,01)
select minas_mult(3, 2) as tres_minas_dos_buenas, minas_mult(1, 1) as una_mina_una_buena, minas_mult(24, 1) as veinticuatro_minas_una;

-- PM, 30-10, un rato despues: cara o cruz y crash se quedan (los arregla el ayudante de los juegos). Ruleta y plinko, fuera.
grant execute on function moneda_crear(int, uuid, text), moneda_aceptar(bigint), crash_apostar(int, numeric), crash_retirar() to authenticated;
